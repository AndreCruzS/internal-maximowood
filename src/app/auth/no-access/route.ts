import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Signs out someone the access check refuses and shows the login page's "contact HR" message. */
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/login?error=access`);
}
