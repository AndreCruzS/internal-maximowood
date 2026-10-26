import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { cleanCode, isCodeShape, normalizeEmail, usesEmailCode } from "@/lib/emailCode";
import { isCompanyEmail } from "@/lib/intranet";

export const dynamic = "force-dynamic";

/** Checks an emailed sign-in code; on success the session cookies are set on this response. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; code?: string };
  const email = normalizeEmail(body.email ?? "");
  const code = cleanCode(body.code ?? "");
  if (!usesEmailCode(email) || !isCodeShape(code)) return NextResponse.json({ error: "wrong_code" }, { status: 400 });

  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "failed" }, { status: 503 });

  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session || !data.user) return NextResponse.json({ error: "wrong_code" }, { status: 401 });
  if (!isCompanyEmail(data.user.email ?? "")) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "not_code_domain" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
