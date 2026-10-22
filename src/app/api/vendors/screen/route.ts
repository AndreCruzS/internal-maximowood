import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { refreshSanctions, rescreenAll } from "@/server/sanctions";
import { vendorRoles } from "@/server/vendors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Finance / admins: { action: "refresh" } downloads the OFAC list again and re-screens every vendor;
 * { action: "rescreen" } re-screens against the list already loaded.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roles = await vendorRoles(supabase);
  if (!roles.isFinance && !roles.isAdmin) return NextResponse.json({ error: "Finance or admins only" }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "refresh") {
      const sanctions = await refreshSanctions(admin);
      return NextResponse.json({ sanctions, screening: await rescreenAll(admin, "manual") });
    }
    if (body.action === "rescreen") return NextResponse.json({ screening: await rescreenAll(admin, "manual") });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
