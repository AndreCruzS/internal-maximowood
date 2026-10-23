import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyVendorRequest, screenRequest } from "@/server/vendorRequests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * { action: "review", vendorId }: Finance / approvers start the review of a vendor that's already at
 * the bank (imported as "to review") or due for its yearly review. Screened, then sent to approvers.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; vendorId?: string };
  if (body.action !== "review" || !body.vendorId || !UUID_RE.test(body.vendorId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data, error } = await supabase.rpc("start_legacy_review", { vendor: body.vendorId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const id = String(data);
  const s = await screenRequest(admin, id);
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  await notifyVendorRequest(admin, id, "review_started", { personId: (me as { id: string } | null)?.id ?? null, userId: user.id }, request.nextUrl.origin).catch(() => []);
  return NextResponse.json({ id, warning: "error" in s ? s.error : null });
}
