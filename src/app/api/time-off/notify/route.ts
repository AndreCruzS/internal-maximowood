import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TIME_OFF_COLUMNS, workdays, type TimeOffRow } from "@/lib/timeOff";
import { alreadySent, emailRef, logEmail, renderEmail, sendMail, type MailResult } from "@/server/email";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { vacation: "Vacation", sick: "Sick", travel: "Travel", ooo: "Out of office", holiday: "Holiday" };
const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

type Person = { id: string; full_name: string; email: string | null; user_id: string | null };

/**
 * Emails about a time-off request, once each:
 *   "requested" → the person's managers (org chart), or HR when they have none; sent by the person.
 *   "decided"   → the person, with the decision; sent by whoever decided.
 * Read with the caller's session, so RLS decides what they can see.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string; event?: "requested" | "decided" };
  if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id) || (body.event !== "requested" && body.event !== "decided")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { data } = await supabase.from("absences").select(TIME_OFF_COLUMNS).eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const a = data as unknown as TimeOffRow;

  const { data: meRow } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  const myId = (meRow as { id: string } | null)?.id ?? null;
  const people = async (ids: string[]) => {
    if (!ids.length) return [] as Person[];
    const { data: ps } = await supabase.from("people").select("id, full_name, email, user_id").in("id", ids);
    return (ps as Person[] | null) ?? [];
  };
  const [person] = await people([a.person_id]);
  const link = `${request.nextUrl.origin}/hr`;
  const days = workdays(a.starts_on, a.ends_on);
  const rows: [string, string][] = [
    ["Who", person?.full_name ?? ""],
    ["Type", KIND[a.kind] ?? a.kind],
    ["Dates", a.starts_on === a.ends_on ? day(a.starts_on) : `${day(a.starts_on)} – ${day(a.ends_on)}`],
    ["Workdays", String(days)],
    ["Note", a.note],
  ];
  const admin = getSupabaseAdmin();
  const results: MailResult[] = [];

  if (body.event === "requested") {
    if (a.person_id !== myId || a.status !== "pending") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { data: bossIds } = await supabase.rpc("managers_of", { p: a.person_id });
    let to = await people(((bossIds as string[] | null) ?? []).filter(id => id !== a.person_id));
    if (!to.length) {
      // No manager in the org chart: HR decides.
      const { data: hr } = await supabase.from("positions").select("person_id").eq("department_id", "hr");
      to = await people([...new Set(((hr as { person_id: string }[] | null) ?? []).map(r => r.person_id))].filter(id => id !== a.person_id));
    }
    const subject = `Time off request: ${person?.full_name ?? "a colleague"} — ${KIND[a.kind] ?? a.kind}, ${days} workday${days === 1 ? "" : "s"}`;
    const mail = renderEmail({
      title: "Time off to approve",
      intro: `${person?.full_name ?? "A colleague"} asked for time off. Approve or decline it in the intranet.`,
      rows, link, linkLabel: "Review the request",
    });
    for (const p of to) {
      const ref = emailRef(a.id, a.starts_on, a.ends_on, a.kind, p.id);
      if (admin && (await alreadySent(admin, "time_off_request", ref))) continue;
      const result: MailResult = p.email ? await sendMail({ to: p.email, subject, ...mail }) : { status: "skipped", error: "No email" };
      results.push(result);
      if (admin) await logEmail(admin, { kind: "time_off_request", ref_id: ref, to_email: p.email ?? "", subject, created_by: user.id, ...result });
    }
    if (!to.length) results.push({ status: "skipped", error: "No manager or HR to notify" });
  } else {
    if (!myId || a.decided_by !== myId || (a.status !== "approved" && a.status !== "declined")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ref = emailRef(a.id, a.status, a.decided_at ?? "");
    if (admin && (await alreadySent(admin, "time_off_decision", ref))) return NextResponse.json({ status: "sent", already: true });
    const [decider] = await people([myId]);
    const approved = a.status === "approved";
    const subject = `Your time off was ${approved ? "approved" : "declined"} — ${day(a.starts_on)}`;
    const mail = renderEmail({
      title: `Time off ${approved ? "approved" : "declined"}`,
      intro: `${decider?.full_name ?? "Your manager"} ${approved ? "approved" : "declined"} your time off.`,
      rows: [...rows.slice(1), ["Comment", a.decision_note]],
      link, linkLabel: "Open my time off",
    });
    const result: MailResult = person?.email ? await sendMail({ to: person.email, subject, ...mail }) : { status: "skipped", error: "No email for the person" };
    results.push(result);
    if (admin) await logEmail(admin, { kind: "time_off_decision", ref_id: ref, to_email: person?.email ?? "", subject, created_by: user.id, ...result });
  }
  return NextResponse.json({ results });
}
