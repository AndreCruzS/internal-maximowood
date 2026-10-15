import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isCompanyEmail } from "@/lib/intranet";

/**
 * Google sends people back here after they sign in. The code becomes a session,
 * and only company email domains are let in (the same list as allowed_email_domains).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/login?error=${reason}`);

  const code = searchParams.get("code");
  const supabase = await getSupabaseServer();
  if (!code || !supabase) return fail("failed");

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail("failed");

  if (!isCompanyEmail(data.user.email ?? "")) {
    await supabase.auth.signOut();
    return fail("domain");
  }
  return NextResponse.redirect(`${origin}/`);
}
