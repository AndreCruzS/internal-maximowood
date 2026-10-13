import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { HIRE_COLUMNS, type NewHire } from "@/lib/onboarding";
import { companyName, DEPARTMENTS, type CompanyId } from "@/lib/intranet";
import { IT_EMAIL, alreadySent, logEmail, renderEmail, sendMail, type EmailKind } from "@/server/email";

export const dynamic = "force-dynamic";

const dept = (id: string | null) => (id ? DEPARTMENTS.find(d => d.id === id)?.name ?? id : "");
const brand = (id: string | null) => (id ? companyName(id as CompanyId) : "");
const day = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
const yesNo = (b: boolean) => (b ? "Yes" : "No");

/**
 * Emails IT about a new hire or an offboarding, once. The row is read with the
 * caller's own session, so they can only trigger emails for records they can see.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { kind?: EmailKind; id?: string };
  if ((body.kind !== "new_hire" && body.kind !== "offboarding") || !body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const origin = request.nextUrl.origin;
  const admin = getSupabaseAdmin();
  if (admin && (await alreadySent(admin, body.kind, body.id))) return NextResponse.json({ status: "sent", already: true });

  const nameOf = async (personId: string | null) =>
    personId ? ((await supabase.from("people").select("full_name").eq("id", personId).maybeSingle()).data as { full_name: string } | null)?.full_name ?? "" : "";
  const requester = ((await supabase.from("people").select("full_name").eq("user_id", user.id).maybeSingle()).data as { full_name: string } | null)?.full_name || user.email || "";

  let subject: string;
  let mail: { text: string; html: string };
  if (body.kind === "new_hire") {
    const { data } = await supabase.from("new_hires").select(HIRE_COLUMNS).eq("id", body.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const h = data as NewHire;
    subject = `New hire: ${h.full_name}${h.start_date ? ` — starts ${day(h.start_date)}` : ""}`;
    mail = renderEmail({
      title: `New hire: ${h.full_name}`,
      intro: "Please set up this person's accounts and send their credentials to their personal email, then invite them to the shared drive folder. Mark the accounts ready in the intranet when you're done.",
      rows: [
        ["Name", h.full_name],
        ["Position", h.title],
        ["Department", dept(h.department_id)],
        ["Brand", brand(h.company_id)],
        ["Start date", day(h.start_date)],
        ["Reports to", await nameOf(h.reports_to)],
        ["Personal email", `${h.personal_email} (send the credentials here)`],
        ["Company email", yesNo(h.needs_email)],
        ["RingCentral number", h.needs_phone ? `Yes${h.phone_area_code ? ` — area code ${h.phone_area_code}` : ""}` : "No"],
        ["Department access", [h.department_id, ...h.access_departments].filter(Boolean).map(d => dept(d)).join(", ")],
        ["Notes", h.notes],
        ["Added by", requester],
      ],
      link: `${origin}/onboarding/hires/${h.id}`,
      linkLabel: "Open in the intranet",
    });
  } else {
    const { data } = await supabase.from("offboardings").select("id, person_id, last_day, notes").eq("id", body.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const o = data as { id: string; person_id: string; last_day: string; notes: string };
    const p = (await supabase.from("people").select("full_name, email, phone, company_id, positions(title, department_id, sort)").eq("id", o.person_id).maybeSingle()).data as
      | { full_name: string; email: string | null; phone: string | null; company_id: string | null; positions: { title: string; department_id: string | null; sort: number }[] }
      | null;
    const positions = [...(p?.positions ?? [])].sort((a, b) => a.sort - b.sort);
    subject = `Offboard: ${p?.full_name ?? "employee"} — last day ${day(o.last_day)}`;
    mail = renderEmail({
      title: `Offboard: ${p?.full_name ?? "employee"}`,
      intro: "Please offboard this person: turn off their accounts and access on your side. Mark it done in the intranet when you're finished — that removes them from People and the org chart.",
      rows: [
        ["Name", p?.full_name ?? ""],
        ["Position", positions.map(x => x.title).join(", ")],
        ["Department", [...new Set(positions.map(x => dept(x.department_id)))].filter(Boolean).join(", ")],
        ["Brand", brand(p?.company_id ?? null)],
        ["Company email", p?.email ?? ""],
        ["RingCentral number", p?.phone ?? ""],
        ["Last day", day(o.last_day)],
        ["Notes", o.notes],
        ["Requested by", requester],
      ],
      link: `${origin}/onboarding?tab=offboarding`,
      linkLabel: "Open in the intranet",
    });
  }

  const result = await sendMail({ to: IT_EMAIL, subject, ...mail, replyTo: user.email ?? undefined });
  if (admin) await logEmail(admin, { kind: body.kind, ref_id: body.id, to_email: IT_EMAIL, subject, created_by: user.id, ...result });
  if (result.status === "failed") console.error("[notify]", body.kind, result.error);
  return NextResponse.json({ status: result.status });
}
