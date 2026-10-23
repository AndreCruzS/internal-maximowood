import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Emails from the intranet, sent through Google Workspace from no-reply@gmxgroup.com.
 * SMTP_USER / SMTP_PASS = that mailbox and its Google app password (Vercel secrets).
 * Without them nothing is sent and the attempt is logged as "skipped".
 */
export const IT_EMAIL = process.env.IT_NOTIFY_EMAIL || "brian.sheldon@lumberplus.com";
const FROM = process.env.EMAIL_FROM || "GMX Intranet <no-reply@gmxgroup.com>";

export type MailResult = { status: "sent" | "failed" | "skipped"; error?: string };

export async function sendMail(mail: { to: string; subject: string; text: string; html: string; replyTo?: string }): Promise<MailResult> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { status: "skipped", error: "Email isn't set up yet (SMTP_USER / SMTP_PASS)" };
  try {
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    await transport.sendMail({ from: FROM, ...mail });
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export type EmailKind =
  | "new_hire" | "offboarding" | "travel_submitted" | "travel_status" | "referral_submitted" | "referral_status"
  | "time_off_request" | "time_off_decision"
  | "vendor_submitted" | "vendor_approval" | "vendor_decision" | "vendor_registered"
  | "vendor_review_due" | "vendor_suspended";

/** A stable uuid for "this email about this thing" (e.g. a request + its new status), so it's only sent once. */
export function emailRef(...parts: string[]): string {
  const h = createHash("sha1").update(parts.join(":")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** True when this email already went out (so a retry or double click doesn't send it twice). */
export async function alreadySent(admin: SupabaseClient, kind: EmailKind, refId: string) {
  const { data } = await admin.from("email_log").select("id").eq("kind", kind).eq("ref_id", refId).eq("status", "sent").limit(1);
  return (data ?? []).length > 0;
}

export async function logEmail(admin: SupabaseClient, row: { kind: EmailKind; ref_id: string; to_email: string; subject: string; created_by: string | null } & MailResult) {
  await admin.from("email_log").insert({ ...row, error: row.error ?? null });
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain email: a heading, a short line, a table of details and a button to the intranet page. */
export function renderEmail({ title, intro, rows, link, linkLabel }: { title: string; intro: string; rows: [string, string][]; link: string; linkLabel: string }) {
  const shown = rows.filter(([, v]) => v && v.trim());
  const text = [title, "", intro, "", ...shown.map(([k, v]) => `${k}: ${v}`), "", `${linkLabel}: ${link}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f4;font-family:Lato,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
<div style="background:#009f67;color:#fff;padding:18px 24px;font-size:18px;font-weight:800">${esc(title)}</div>
<div style="padding:20px 24px">
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${esc(intro)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${shown
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-weight:700;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;white-space:pre-line">${esc(v)}</td></tr>`)
    .join("")}</table>
<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#009f67;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px">${esc(linkLabel)}</a></p>
</div>
<div style="padding:12px 24px;border-top:1px solid #f0f0f0;font-size:12px;color:#9ca3af">Sent automatically by the GMX Group Intranet. Passwords are never sent through the intranet.</div>
</div></body></html>`;
  return { text, html };
}
