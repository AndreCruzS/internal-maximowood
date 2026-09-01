import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Used by the nav to decide whether to show the Admin tab.
export async function GET() {
  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.json({ isAdmin: false, email: null });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json({ isAdmin: isAdminUser(user), email: user?.email ?? null });
}
