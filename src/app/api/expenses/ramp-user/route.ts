import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deactivateUser, rampConnected } from "@/server/ramp/client";
import { rampUserFor } from "@/server/ramp/push";

export const dynamic = "force-dynamic";

/** Finance: turn off someone's Ramp access (cards stop working) when they leave. */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await supabase.rpc("is_finance")).data !== true) return NextResponse.json({ error: "Finance only" }, { status: 403 });
  if (!rampConnected()) return NextResponse.json({ error: "Ramp isn't connected yet" }, { status: 503 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const { personId, action } = (await request.json().catch(() => ({}))) as { personId?: string; action?: string };
  if (action !== "deactivate" || !personId || !/^[0-9a-f-]{36}$/i.test(personId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { data } = await admin.from("people").select("id, full_name, email, ramp_user_id").eq("id", personId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const rampUser = await rampUserFor(admin, data as { id: string; full_name: string; email: string | null; ramp_user_id: string | null });
    if (!rampUser) return NextResponse.json({ error: "Not found in Ramp" }, { status: 404 });
    await deactivateUser(rampUser);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
