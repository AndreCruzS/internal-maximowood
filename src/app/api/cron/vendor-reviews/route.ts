import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendReviewDigest } from "@/server/vendorReviews";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Nightly: approvers + Finance get a digest of vendors whose yearly review is due within 30 days or
// overdue (each vendor once per window). Guarded by CRON_SECRET.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  try {
    return NextResponse.json({ ok: true, ...(await sendReviewDigest(admin, origin)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
