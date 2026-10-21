import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseRipplingSettings } from "@/lib/rippling";
import { ripplingConnected } from "@/server/rippling/client";
import { runRipplingSync } from "@/server/rippling/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly: applies the Rippling sync once RIPPLING_API_TOKEN is set and HR switched it on. Guarded by CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  if (!ripplingConnected()) return NextResponse.json({ ok: true, skipped: "RIPPLING_API_TOKEN is not set" });
  const { data } = await admin.from("app_settings").select("value").eq("key", "rippling").maybeSingle();
  if (!parseRipplingSettings((data as { value: unknown } | null)?.value).enabled) return NextResponse.json({ ok: true, skipped: "Rippling sync is switched off" });
  const origin = new URL(request.url).origin;
  const result = await runRipplingSync(admin, { dryRun: false, trigger: "cron", startedBy: null, origin });
  return NextResponse.json({ ok: true, counts: result.counts, errors: result.errors, warnings: result.warnings });
}
