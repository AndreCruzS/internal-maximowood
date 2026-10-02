import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Used by the nav to label the Profile link.
export async function GET() {
  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.json({ isAdmin: false, email: null, name: null });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json({
    isAdmin: isAdminUser(user),
    email: user?.email ?? null,
    name: (user?.user_metadata?.name as string | undefined) ?? null,
  });
}
