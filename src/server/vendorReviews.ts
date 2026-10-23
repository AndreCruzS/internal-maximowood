import type { SupabaseClient } from "@supabase/supabase-js";
import { digestRecipients, reviewDigest, type DigestVendor } from "@/lib/vendorChanges";
import { alreadySent, emailRef, logEmail, renderEmail, sendMail, type MailResult } from "@/server/email";

type Recipient = { email: string; name: string };

/** People with a duty (vendor_approver / payments), plus duty holders listed only by email. */
async function dutyPeople(admin: SupabaseClient, duty: string): Promise<{ email: string | null; name: string }[]> {
  const { data } = await admin.from("duty_holders").select("person_id, email").eq("duty", duty);
  const rows = (data as { person_id: string | null; email: string | null }[] | null) ?? [];
  const ids = rows.map(r => r.person_id).filter(Boolean) as string[];
  const { data: people } = ids.length ? await admin.from("people").select("full_name, email").in("id", ids).eq("active", true) : { data: [] };
  return [
    ...((people as { full_name: string; email: string | null }[] | null) ?? []).map(p => ({ email: p.email, name: p.full_name })),
    ...rows.filter(r => !r.person_id && r.email).map(r => ({ email: r.email, name: r.email! })),
  ];
}

/** Everyone holding a position in Finance. */
async function financePeople(admin: SupabaseClient): Promise<{ email: string | null; name: string }[]> {
  const { data } = await admin.from("positions").select("person_id").eq("department_id", "finance");
  const ids = [...new Set(((data as { person_id: string }[] | null) ?? []).map(r => r.person_id))];
  if (!ids.length) return [];
  const { data: people } = await admin.from("people").select("full_name, email").in("id", ids).eq("active", true);
  return ((people as { full_name: string; email: string | null }[] | null) ?? []).map(p => ({ email: p.email, name: p.full_name }));
}

const day = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Nightly: approvers + Finance get one digest of the vendors whose yearly review is due within 30
 * days or overdue. Each vendor is announced once per recipient per window (due soon, then overdue),
 * so the same list doesn't arrive every night. The Master List flags them on its own (review_due).
 */
export async function sendReviewDigest(admin: SupabaseClient, origin: string, today = new Date().toISOString().slice(0, 10)) {
  const { data } = await admin.from("vendors").select("id, legal_name, status, next_review_on").eq("status", "approved").not("next_review_on", "is", null).limit(5000);
  const due = reviewDigest((data as { id: string; legal_name: string; status: string; next_review_on: string | null }[] | null) ?? [], today);
  if (!due.length) return { due: 0, sent: 0 };
  const recipients = digestRecipients([await dutyPeople(admin, "vendor_approver"), await financePeople(admin)]);
  const ref = (v: DigestVendor, to: Recipient) => emailRef("vendor_review_due", v.id, v.window, v.next_review_on, to.email);
  const results: MailResult[] = [];

  for (const to of recipients) {
    const fresh: DigestVendor[] = [];
    for (const v of due) if (!(await alreadySent(admin, "vendor_review_due", ref(v, to)))) fresh.push(v);
    if (!fresh.length) continue;
    const overdue = fresh.filter(v => v.window === "overdue").length;
    const subject = overdue
      ? `Vendor reviews: ${overdue} overdue${fresh.length > overdue ? `, ${fresh.length - overdue} due soon` : ""}`
      : `Vendor reviews due soon: ${fresh.length}`;
    const mail = renderEmail({
      title: "Vendor reviews",
      intro: "These vendors are due for their yearly review (or overdue). Open each one on the Master List and start the review; payments aren't blocked, but the vendor is flagged until it's reviewed.",
      rows: fresh.map(v => [v.legal_name, `${v.window === "overdue" ? "Overdue since" : "Due"} ${day(v.next_review_on)}`] as [string, string]),
      link: `${origin}/vendors`,
      linkLabel: "Open the Master List",
    });
    const result = await sendMail({ to: to.email, subject, ...mail });
    results.push(result);
    // One log row per vendor, so each one is announced once per window.
    for (const v of fresh) await logEmail(admin, { kind: "vendor_review_due", ref_id: ref(v, to), to_email: to.email, subject, created_by: null, ...result });
  }
  return { due: due.length, sent: results.filter(r => r.status === "sent").length, skipped: results.filter(r => r.status !== "sent").length };
}

/** A vendor was suspended: Payments (stop paying) and the other approvers hear about it right away. */
export async function notifySuspended(admin: SupabaseClient, vendorId: string, actor: { personId: string | null; userId: string; email?: string | null }, origin: string): Promise<MailResult[]> {
  const { data } = await admin.from("vendors").select("legal_name, dba, suspended_reason, suspended_at").eq("id", vendorId).maybeSingle();
  if (!data) return [];
  const v = data as { legal_name: string; dba: string; suspended_reason: string; suspended_at: string | null };
  const { data: who } = actor.personId ? await admin.from("people").select("full_name").eq("id", actor.personId).maybeSingle() : { data: null };
  const recipients = digestRecipients([await dutyPeople(admin, "payments"), await dutyPeople(admin, "vendor_approver")])
    .filter(r => r.email !== (actor.email ?? "").toLowerCase());
  const subject = `Vendor suspended — don't pay: ${v.legal_name}`;
  const mail = renderEmail({
    title: "Vendor suspended",
    intro: "This vendor was suspended on the Master List. Don't schedule payments to it until it's reactivated (reactivation needs approval).",
    rows: [
      ["Vendor", [v.legal_name, v.dba && `(${v.dba})`].filter(Boolean).join(" ")],
      ["Suspended by", (who as { full_name: string } | null)?.full_name ?? ""],
      ["Reason", v.suspended_reason],
    ],
    link: `${origin}/vendors/${vendorId}`,
    linkLabel: "Open the vendor",
  });
  const results: MailResult[] = [];
  for (const to of recipients) {
    const ref = emailRef("vendor_suspended", vendorId, v.suspended_at ?? "", to.email);
    if (await alreadySent(admin, "vendor_suspended", ref)) continue;
    const result = await sendMail({ to: to.email, subject, ...mail });
    results.push(result);
    await logEmail(admin, { kind: "vendor_suspended", ref_id: ref, to_email: to.email, subject, created_by: actor.userId, ...result });
  }
  return results;
}
