import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { pushFundRequest, pushQueued, pushReceipt } from "@/server/ramp/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Sends a receipt or fund request to Ramp right after it's saved. The row is read
 * with the caller's session first, so people can only push what they can see.
 * Finance can send everything waiting with { kind: "all" }.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ status: "queued", error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" });

  const body = (await request.json().catch(() => ({}))) as { kind?: string; id?: string };
  if (body.kind === "all") {
    if ((await supabase.rpc("is_finance")).data !== true) return NextResponse.json({ error: "Finance only" }, { status: 403 });
    return NextResponse.json(await pushQueued(admin));
  }
  if (!body.id || !UUID.test(body.id) || (body.kind !== "receipt" && body.kind !== "fund")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const table = body.kind === "receipt" ? "expense_receipts" : "fund_requests";
  const { data } = await supabase.from(table).select("id").eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(body.kind === "receipt" ? await pushReceipt(admin, body.id) : await pushFundRequest(admin, body.id));
}
