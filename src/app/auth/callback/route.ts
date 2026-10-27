import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isCompanyEmail } from "@/lib/intranet";
import { checkAccess } from "@/server/access";

/**
 * Google sends people back here after they sign in. The code becomes a session,
 * and only company email domains are let in (the same list as allowed_email_domains) —
 * and, once HR switches the access check on, only W2 / Brazil-team people (0033).
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
  if (!(await checkAccess(data.user)).ok) {
    await supabase.auth.signOut();
    return fail("access");
  }
  return NextResponse.redirect(`${origin}/`);
}
