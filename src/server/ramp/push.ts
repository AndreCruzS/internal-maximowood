import type { SupabaseClient } from "@supabase/supabase-js";
import { RECEIPTS_BUCKET, rampMemo } from "@/lib/expenses";
import { isDemoId } from "@/server/ramp/demo";
import { RampError, addMemo, createFundRequest, findUserByEmail, rampConnected, reimbursementFromReceipt, uploadReceipt } from "@/server/ramp/client";

type Person = { id: string; full_name: string; email: string | null; ramp_user_id: string | null };

/** The person's Ramp user id: saved on people.ramp_user_id, or found by company email (and saved). */
export async function rampUserFor(admin: SupabaseClient, person: Person): Promise<string | null> {
  if (person.ramp_user_id) return person.ramp_user_id;
  if (!person.email || !rampConnected()) return null;
  const user = await findUserByEmail(person.email);
  if (!user) return null;
  await admin.from("people").update({ ramp_user_id: user.id }).eq("id", person.id);
  return user.id;
}

const PERSON = "id, full_name, email, ramp_user_id";
const MAX_ATTEMPTS = 5;

/**
 * Sends one receipt to Ramp: on the card purchase (or for Ramp to match to the card
 * holder), or as a new reimbursement. Without the Ramp API it stays queued.
 */
export async function pushReceipt(admin: SupabaseClient, id: string): Promise<{ status: string; error?: string }> {
  const { data } = await admin.from("expense_receipts").select("*").eq("id", id).maybeSingle();
  const r = data as {
    id: string; kind: "card" | "reimbursement"; owner_person_id: string; uploader_person_id: string | null; transaction_id: string | null;
    memo: string; file_path: string; file_name: string; status: string; attempts: number; idempotency_key: string;
  } | null;
  if (!r) return { status: "missing" };
  if (r.status === "sent" || r.status === "demo") return { status: r.status };
  if (!rampConnected()) return { status: "queued" };
  if (isDemoId(r.transaction_id)) {
    await admin.from("expense_receipts").update({ status: "demo" }).eq("id", r.id);
    return { status: "demo" };
  }

  const fail = async (error: string) => {
    await admin.from("expense_receipts").update({ status: "failed", error, attempts: r.attempts + 1 }).eq("id", r.id);
    return { status: "failed", error };
  };
  try {
    const ids = [r.owner_person_id, r.uploader_person_id].filter(Boolean) as string[];
    const { data: people } = await admin.from("people").select(PERSON).in("id", ids);
    const byId = new Map(((people as Person[] | null) ?? []).map(p => [p.id, p]));
    const owner = byId.get(r.owner_person_id);
    if (!owner) return fail("The card holder isn't in People any more");
    const rampUser = await rampUserFor(admin, owner);
    if (!rampUser) return fail(`${owner.full_name} wasn't found in Ramp (no Ramp user with ${owner.email ?? "their email"})`);

    const file = await admin.storage.from(RECEIPTS_BUCKET).download(r.file_path);
    if (file.error || !file.data) return fail("The receipt file couldn't be read");
    const upload = { file: file.data, fileName: r.file_name || r.file_path.split("/").pop()!, idempotencyKey: r.idempotency_key };

    let rampId: string;
    if (r.kind === "reimbursement") {
      rampId = (await reimbursementFromReceipt({ ...upload, userId: rampUser })).id;
    } else {
      rampId = (await uploadReceipt({ ...upload, userId: rampUser, transactionId: r.transaction_id })).id;
      const uploader = r.uploader_person_id ? byId.get(r.uploader_person_id) : null;
      const memo = rampMemo(r.memo, uploader?.full_name ?? null, owner.full_name);
      // A memo needs a purchase to sit on; without one, Ramp matches the receipt itself.
      if (memo && r.transaction_id) await addMemo(r.transaction_id, memo).catch(() => {});
    }
    await admin.from("expense_receipts")
      .update({ status: "sent", ramp_id: rampId, error: null, attempts: r.attempts + 1, sent_at: new Date().toISOString() })
      .eq("id", r.id);
    return { status: "sent" };
  } catch (e) {
    return fail(e instanceof RampError || e instanceof Error ? e.message : String(e));
  }
}

/** Sends a fund request into Ramp's approval flow. */
export async function pushFundRequest(admin: SupabaseClient, id: string): Promise<{ status: string; error?: string }> {
  const { data } = await admin.from("fund_requests").select("*").eq("id", id).maybeSingle();
  const f = data as {
    id: string; requester_person_id: string; amount: number; currency: string; purpose: string; vendor: string;
    needed_by: string | null; frequency: string; status: string;
  } | null;
  if (!f) return { status: "missing" };
  if (f.status !== "submitted" || !rampConnected() || !process.env.RAMP_FUND_PROGRAM_ID) return { status: f.status };
  try {
    const { data: p } = await admin.from("people").select(PERSON).eq("id", f.requester_person_id).maybeSingle();
    const rampUser = p ? await rampUserFor(admin, p as Person) : null;
    if (!rampUser) throw new Error("The requester wasn't found in Ramp");
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: f.currency }).format(f.amount);
    const res = await createFundRequest({
      ownerId: rampUser,
      name: [f.purpose, amount, f.frequency !== "one_time" ? f.frequency : "", f.vendor].filter(Boolean).join(" · ").slice(0, 200),
      currency: f.currency,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: f.needed_by,
    });
    await admin.from("fund_requests").update({ status: "sent", ramp_id: res.id, error: null }).eq("id", f.id);
    return { status: "sent" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await admin.from("fund_requests").update({ error }).eq("id", f.id);
    return { status: "submitted", error };
  }
}

/** The nightly job and Finance's "Send now": everything still waiting for Ramp. */
export async function pushQueued(admin: SupabaseClient) {
  if (!rampConnected()) return { receipts: 0, funds: 0, connected: false };
  const [{ data: receipts }, { data: funds }] = await Promise.all([
    admin.from("expense_receipts").select("id").in("status", ["queued", "failed"]).lt("attempts", MAX_ATTEMPTS).limit(50),
    admin.from("fund_requests").select("id").eq("status", "submitted").is("ramp_id", null).limit(50),
  ]);
  let r = 0;
  let f = 0;
  for (const x of (receipts as { id: string }[] | null) ?? []) if ((await pushReceipt(admin, x.id)).status === "sent") r++;
  for (const x of (funds as { id: string }[] | null) ?? []) if ((await pushFundRequest(admin, x.id)).status === "sent") f++;
  return { receipts: r, funds: f, connected: true };
}
