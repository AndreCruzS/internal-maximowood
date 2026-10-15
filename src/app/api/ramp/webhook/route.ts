import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyRampSignature, type RampEvent } from "@/server/ramp/webhook";

export const dynamic = "force-dynamic";

/**
 * Ramp webhooks (set up with the URL https://intranet.gmxgroup.com/api/ramp/webhook).
 * Every event is checked against RAMP_WEBHOOK_SECRET and stored once in ramp_events.
 * Receipts added in Ramp itself mark the intranet's copy as sent.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let event: RampEvent;
  try {
    event = JSON.parse(raw) as RampEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  // Subscription set-up: Ramp sends a challenge before there is a secret to sign with.
  if (event.type === "webhooks.verification" || (event.challenge && !event.id)) {
    console.info("[ramp] webhook verification challenge received — submit it to /developer/v1/webhooks/{id}/verify");
    return NextResponse.json({ challenge: event.challenge ?? null });
  }
  if (!verifyRampSignature(raw, request.headers.get("x-ramp-signature"), process.env.RAMP_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { error } = await admin.from("ramp_events").insert({ id: event.id, type: event.type, object_id: event.object?.id ?? null, payload: event });
  // Same event id again = a retry we already have.
  if (error && error.code !== "23505") return NextResponse.json({ error: "Couldn't store the event" }, { status: 500 });
  if (error) return NextResponse.json({ ok: true, duplicate: true });

  if (event.type === "transactions.receipt_added" && event.object?.id) {
    await admin.from("expense_receipts").update({ status: "sent", error: null, sent_at: new Date().toISOString() })
      .eq("transaction_id", event.object.id).in("status", ["queued", "failed"]);
  }
  await admin.from("ramp_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
  return NextResponse.json({ ok: true });
}
