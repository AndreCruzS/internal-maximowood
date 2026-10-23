import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { REGISTRATION_METHODS, stage } from "@/lib/vendorRequests";
import { notifyVendorRequest, screenRequest } from "@/server/vendorRequests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

type Body =
  | { action: "submit" }
  | { action: "confirm"; decision: "confirm" | "reject" | "needs_info"; note?: string }
  | { action: "approve"; decision: "approve" | "reject" | "needs_info"; comment?: string; ack?: boolean; falsePositiveNote?: string }
  | { action: "register"; method?: string };

/**
 * Moves a vendor request forward. Every rule (who may do what, segregation of duties, the sanctions
 * gate) is enforced by the database functions, called with the caller's own session; this route
 * adds the OFAC screening (service role) on submit and right before each approval, and the emails.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  // Only someone who can see the request can act on it.
  const { data: visible } = await supabase.from("vendor_requests").select("id").eq("id", id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: me } = await supabase.from("people").select("id").eq("user_id", user.id).maybeSingle();
  const actor = { personId: (me as { id: string } | null)?.id ?? null, userId: user.id };

  const body = (await request.json().catch(() => ({}))) as Partial<Body> & Record<string, unknown>;
  let event: "submitted" | "confirmed" | "approved" | "registered";
  let rpc: { error: { message: string } | null };
  let warning: string | null = null;

  switch (body.action) {
    case "submit": {
      rpc = await supabase.rpc("submit_vendor_request", { target: id });
      if (!rpc.error) {
        const s = await screenRequest(admin, id);
        if ("error" in s) warning = s.error;
      }
      event = "submitted";
      break;
    }
    case "confirm": {
      const decision = body.decision;
      if (decision !== "confirm" && decision !== "reject" && decision !== "needs_info") return NextResponse.json({ error: "Bad request" }, { status: 400 });
      rpc = await supabase.rpc("confirm_vendor_request", { target: id, decision, note: str(body.note, 2000) });
      event = "confirmed";
      break;
    }
    case "approve": {
      const decision = body.decision;
      if (decision !== "approve" && decision !== "reject" && decision !== "needs_info") return NextResponse.json({ error: "Bad request" }, { status: 400 });
      if (decision === "approve") {
        // Re-screen against the latest OFAC list right before approving.
        const s = await screenRequest(admin, id);
        if ("error" in s) return NextResponse.json({ error: s.error }, { status: 409 });
      }
      rpc = await supabase.rpc("approve_vendor_request", {
        target: id, decision, comment: str(body.comment, 2000), ack: body.ack === true, false_positive_note: str(body.falsePositiveNote, 2000),
      });
      event = "approved";
      break;
    }
    case "register": {
      const method = (REGISTRATION_METHODS as readonly string[]).includes(String(body.method)) ? String(body.method) : "other";
      rpc = await supabase.rpc("register_vendor", { target: id, method });
      event = "registered";
      break;
    }
    default:
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 400 });

  const emails = await notifyVendorRequest(admin, id, event, actor, request.nextUrl.origin).catch(() => []);
  const { data: now } = await supabase.from("vendor_requests").select("kind, status, registered_at, screening_status").eq("id", id).maybeSingle();
  const row = now as { kind: string; status: string; registered_at: string | null; screening_status: string } | null;
  return NextResponse.json({
    stage: row ? stage(row as Parameters<typeof stage>[0]) : null,
    screening: row?.screening_status ?? null,
    warning,
    emails: emails.map(e => e.status),
  });
}
