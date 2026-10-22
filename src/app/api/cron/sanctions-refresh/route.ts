import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { refreshSanctions, rescreenAll } from "@/server/sanctions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly: refresh the OFAC SDN list and re-screen every vendor. Guarded by CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  try {
    const sanctions = await refreshSanctions(admin);
    return NextResponse.json({ ok: true, sanctions, screening: await rescreenAll(admin, "nightly") });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
