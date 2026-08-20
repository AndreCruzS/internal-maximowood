import { NextResponse } from "next/server";
import { syncInventoryFromSupabase } from "@/server/inventorySync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Nightly inventory sync (parity with the legacy 11:00 UTC cron).
// Triggered by Vercel Cron (see vercel.json); guarded by CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncInventoryFromSupabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
