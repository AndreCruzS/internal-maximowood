"use client";

import { getSupabase } from "@/lib/supabase/client";
import { MAX_RECEIPT_BYTES, RECEIPTS_BUCKET, RECEIPT_TYPES, receiptPath } from "@/lib/expenses";

export type ReceiptInput = {
  kind: "card" | "reimbursement";
  /** Card holder (card) or yourself (reimbursement). */
  ownerPersonId: string;
  file: File;
  transactionId?: string | null;
  merchant?: string;
  amount?: number | null;
  spentOn?: string | null;
  memo?: string;
  /** Answering a colleague's "can you send the receipt?". */
  requestId?: string | null;
  /** Sample data: saved, never sent to Ramp. */
  demo: boolean;
};

export type ReceiptResult = { status: "sent" | "queued" | "failed" | "demo"; error?: string };

export const fileProblem = (f: File) =>
  f.size > MAX_RECEIPT_BYTES ? "tooBig" : f.type && !RECEIPT_TYPES.includes(f.type) ? "badType" : null;

/** Uploads the file to the private receipts bucket, records it, answers the request, and sends it to Ramp. */
export async function submitReceipt(r: ReceiptInput): Promise<ReceiptResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Signed out");
  const id = crypto.randomUUID();
  const path = receiptPath(user.id, r.file.name, id);

  const up = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, r.file, { contentType: r.file.type || undefined });
  if (up.error) throw new Error(up.error.message);

  const { error } = await supabase.from("expense_receipts").insert({
    id,
    kind: r.kind,
    owner_person_id: r.ownerPersonId,
    uploaded_by: user.id,
    transaction_id: r.transactionId || null,
    merchant: (r.merchant ?? "").trim(),
    amount: r.amount ?? null,
    spent_on: r.spentOn || null,
    memo: (r.memo ?? "").trim(),
    file_path: path,
    file_name: r.file.name.slice(0, 200),
    status: r.demo ? "demo" : "queued",
  });
  if (error) {
    await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (r.requestId) {
    const answered = await supabase.rpc("answer_receipt_request", { request: r.requestId, receipt: id });
    if (answered.error) throw new Error(answered.error.message);
  }
  if (r.demo) return { status: "demo" };

  const res = await fetch("/api/expenses/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "receipt", id }),
  }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as ReceiptResult | null;
  return json?.status === "sent" || json?.status === "failed" ? json : { status: "queued" };
}
