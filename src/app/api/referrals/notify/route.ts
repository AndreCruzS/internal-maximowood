import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { REFERRAL_COLUMNS, roleLabel, type OpenRole, type Referral } from "@/lib/referrals";
import { alreadySent, emailRef, logEmail, renderEmail, sendMail } from "@/server/email";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { submitted: "Submitted", in_review: "In review", interviewing: "Interviewing", hired: "Hired", not_selected: "Not selected" };

/** "submitted" → Recruiting (RECRUITING_EMAIL); "status" → the referrer. Once each; read with the caller's session. */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; event?: "submitted" | "status" };
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id) || (body.event !== "submitted" && body.event !== "status")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { data } = await supabase.from("referrals").select(REFERRAL_COLUMNS).eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = data as Referral;
  const kind = body.event === "submitted" ? "referral_submitted" : "referral_status";
  const ref = body.event === "submitted" ? r.id : emailRef(r.id, r.status);
  const admin = getSupabaseAdmin();
  if (admin && (await alreadySent(admin, kind, ref))) return NextResponse.json({ status: "sent", already: true });

  const role = r.role_id ? ((await supabase.from("open_roles").select("title, company_label, location").eq("id", r.role_id).maybeSingle()).data as Pick<OpenRole, "title" | "company_label" | "location"> | null) : null;
  const referrer = r.referrer_person_id ? ((await supabase.from("people").select("full_name, email").eq("id", r.referrer_person_id).maybeSingle()).data as { full_name: string; email: string | null } | null) : null;
  const link = `${request.nextUrl.origin}/refer`;

  let to: string | null;
  let subject: string;
  let mail: { text: string; html: string };
  if (body.event === "submitted") {
    if (r.referrer_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    to = process.env.RECRUITING_EMAIL || null;
    subject = `New referral: ${r.candidate_name}${role ? ` for ${role.title}` : ""}`;
    mail = renderEmail({
      title: "New candidate referral",
      intro: "A colleague referred a candidate. The resume is in the intranet (only Recruiting can open it).",
      rows: [["Candidate", r.candidate_name], ["Email", r.candidate_email], ["Role", role ? roleLabel(role) : ""], ["Referred by", referrer?.full_name ?? ""], ["Note", r.note]],
      link, linkLabel: "Open referrals",
    });
  } else {
    to = referrer?.email ?? null;
    subject = `Your referral of ${r.candidate_name}: ${STATUS[r.status] ?? r.status}`;
    mail = renderEmail({
      title: "Referral update",
      intro: `Recruiting updated your referral of ${r.candidate_name}.`,
      rows: [["Role", role ? roleLabel(role) : ""], ["Status", STATUS[r.status] ?? r.status], ["Bonus eligible on", r.bonus_eligible_on ?? ""]],
      link, linkLabel: "Open my referrals",
    });
  }
  const result = to ? await sendMail({ to, subject, ...mail }) : { status: "skipped" as const, error: body.event === "submitted" ? "RECRUITING_EMAIL isn't set" : "No email for the referrer" };
  if (admin) await logEmail(admin, { kind, ref_id: ref, to_email: to ?? "", subject, created_by: user.id, ...result });
  return NextResponse.json(result);
}
