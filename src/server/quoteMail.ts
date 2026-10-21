import nodemailer from "nodemailer";

/**
 * The quote email, sent through Google Workspace SMTP.
 *
 * Who it's from:
 *   - QUOTE_SEND_AS_REP=1 (once the Workspace SMTP relay is on): FROM THE REP'S OWN ADDRESS.
 *   - Otherwise (today): from the SMTP account itself, shown as "<Rep> – Maximo"
 *     <no-reply@…>, because Gmail replaces any other sender with that account anyway.
 *   Either way replies go to the rep (Reply-To), and the rep is CC'd.
 *
 * Same settings as the intranet's mailer (src/server/email.ts there): SMTP_USER /
 * SMTP_PASS (+ SMTP_HOST, default smtp.gmail.com; SMTP_PORT, default 465). For the
 * From to be the rep, the SMTP account must be allowed to send as each rep: either
 * the Workspace SMTP relay (smtp-relay.gmail.com, "any address in my domains") or a
 * "Send mail as" alias per rep. Without SMTP_USER / SMTP_PASS nothing is sent and the
 * result is "skipped".
 */

export type MailResult = { status: "sent" | "failed" | "skipped"; error?: string };

export type QuoteMail = {
  from: { email: string; name: string };
  to: string;
  cc: string[];
  subject: string;
  /** What the rep wrote, as plain text. */
  message: string;
  attachment: { filename: string; content: Buffer };
};

export const smtpConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

/** True once the Workspace SMTP relay lets the app send as any address in our domains. */
export const sendsAsRep = () => process.env.QUOTE_SEND_AS_REP === "1";

const EMAILISH = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** The From of a quote email: the rep, or (until the relay is on) the SMTP account under the rep's name. */
export function quoteSender(rep: { email: string; name: string }): { email: string; name: string } {
  if (sendsAsRep()) return rep;
  const account = [process.env.QUOTE_FROM_ADDRESS, process.env.SMTP_USER].find(a => a && EMAILISH.test(a.trim()))?.trim() || "no-reply@gmxgroup.com";
  return { email: account, name: `${rep.name || rep.email} – Maximo` };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The rep's message as simple HTML: paragraphs and line breaks, nothing else. */
export function messageHtml(message: string): string {
  const paragraphs = message.trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`);
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${paragraphs.join("")}</body></html>`;
}

/** Strips CR/LF so header values can't inject extra headers. */
const header = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export async function sendQuoteMail(mail: QuoteMail): Promise<MailResult> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return { status: "skipped", error: "Email isn't set up yet (SMTP_USER / SMTP_PASS)" };
  const port = Number(process.env.SMTP_PORT) || 465;
  try {
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, auth: { user, pass } });
    const sender = quoteSender(mail.from);
    await transport.sendMail({
      from: { name: header(sender.name), address: sender.email },
      replyTo: mail.from.email,
      to: mail.to,
      cc: mail.cc,
      subject: header(mail.subject),
      text: mail.message,
      html: messageHtml(mail.message),
      attachments: [{ filename: mail.attachment.filename, content: mail.attachment.content, contentType: "application/pdf" }],
    });
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
