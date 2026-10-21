import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseRipplingSettings } from "@/lib/rippling";
import { ripplingConnected } from "@/server/rippling/client";
import { runRipplingSync } from "@/server/rippling/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** HR and admins: preview ({ dryRun: true }) or run ("Sync now") the Rippling sync. */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: hr } = await supabase.rpc("is_hr_editor");
  if (hr !== true) return NextResponse.json({ error: "Only HR and admins can run the Rippling sync" }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  const dryRun = body.dryRun !== false;
  if (!dryRun) {
    if (!ripplingConnected()) return NextResponse.json({ error: "Rippling isn't connected yet: this is sample data, so it can only be previewed." }, { status: 400 });
    const { data } = await supabase.from("app_settings").select("value").eq("key", "rippling").maybeSingle();
    if (!parseRipplingSettings((data as { value: unknown } | null)?.value).enabled) return NextResponse.json({ error: "Switch the Rippling sync on first." }, { status: 400 });
  }
  try {
    const result = await runRipplingSync(admin, { dryRun, trigger: "manual", startedBy: user.id, origin: request.nextUrl.origin });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[rippling-sync]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "The sync failed" }, { status: 502 });
  }
}
