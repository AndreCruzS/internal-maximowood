import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyVendorRequest, screenRequest } from "@/server/vendorRequests";
import { notifySuspended } from "@/server/vendorReviews";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * From a vendor's page (rules enforced by the database functions, called with the caller's session):
 *   { action: "review", vendorId, reason? } — Finance / approvers start the review of a vendor that's
 *     already at the bank, due for its yearly review, or (with a reason) suspended → reactivation.
 *     Screened, then sent to the approvers.
 *   { action: "suspend", vendorId, reason } — an approver suspends the vendor; Payments and the
 *     approvers are told right away.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; vendorId?: string; reason?: unknown };
  if ((body.action !== "review" && body.action !== "suspend") || !body.vendorId || !UUID_RE.test(body.vendorId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  const actor = { personId: (me as { id: string } | null)?.id ?? null, userId: user.id, email: user.email ?? null };
  const reason = str(body.reason, 2000);

  if (body.action === "suspend") {
    const { error } = await supabase.rpc("suspend_vendor", { vendor: body.vendorId, reason });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const emails = await notifySuspended(admin, body.vendorId, actor, request.nextUrl.origin).catch(() => []);
    return NextResponse.json({ status: "suspended", emails: emails.map(e => e.status) });
  }

  // start_vendor_review comes with migration 0030; before it, the phase-B function (no reason).
  let res = await supabase.rpc("start_vendor_review", { vendor: body.vendorId, reason });
  if (res.error && /start_vendor_review/.test(res.error.message)) res = await supabase.rpc("start_legacy_review", { vendor: body.vendorId });
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  const id = String(res.data);
  const s = await screenRequest(admin, id);
  await notifyVendorRequest(admin, id, "review_started", actor, request.nextUrl.origin).catch(() => []);
  return NextResponse.json({ id, warning: "error" in s ? s.error : null });
}
