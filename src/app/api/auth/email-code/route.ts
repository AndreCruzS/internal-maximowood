import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { codeThrottle, normalizeEmail, usesEmailCode } from "@/lib/emailCode";
import { emailRef, logEmail, renderEmail, sendMail } from "@/server/email";

export const dynamic = "force-dynamic";

/**
 * Emails a one-time sign-in code to a gflumber.com address (not on Google Workspace).
 * The code comes from Supabase (generateLink, which also creates the login the first time)
 * and goes out through the intranet's own mailbox, so the shared project's email settings
 * stay untouched. The code itself is never logged.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  if (!usesEmailCode(email)) return NextResponse.json({ error: "not_code_domain" }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "send_failed" }, { status: 503 });

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent } = await admin.from("email_log").select("created_at").eq("kind", "login_code").eq("to_email", email).gte("created_at", since);
  const throttle = codeThrottle(((recent as { created_at: string }[] | null) ?? []).map(r => r.created_at), new Date());
  if (!throttle.ok) return NextResponse.json({ error: "too_soon", retryAfter: throttle.retryAfter }, { status: 429 });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    console.error("[email-code] generateLink failed:", error?.message);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  const subject = `Your GMX Intranet sign-in code: ${code}`;
  const mail = renderEmail({
    title: "Your sign-in code",
    intro: "Type this code on the GMX Group Intranet sign-in page. It works once. If you didn't ask for it, you can ignore this email.",
    rows: [["Code", code], ["Email", email]],
    link: `${request.nextUrl.origin}/login?email=${encodeURIComponent(email)}`,
    linkLabel: "Open the intranet",
  });
  const result = await sendMail({ to: email, subject, ...mail });
  await logEmail(admin, {
    kind: "login_code", ref_id: emailRef("login_code", email, String(Date.now())), to_email: email,
    subject: "Your GMX Intranet sign-in code", created_by: null, ...result,
  });
  if (result.status !== "sent") {
    console.error("[email-code] send failed:", result.status, result.error);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
