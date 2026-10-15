/** Expenses (migration 0018) and the shapes the intranet uses for Ramp data. */

export type RampTxn = {
  id: string;
  /** In the currency's major unit (dollars). */
  amount: number;
  currency: string;
  merchant: string;
  /** ISO date-time the purchase was made. */
  at: string;
  state: string;
  cardId: string | null;
  cardLast4: string | null;
  holderUserId: string | null;
  holderName: string;
  receiptCount: number;
  memo: string;
  category: string;
};

export type RampCard = {
  id: string;
  name: string;
  last4: string | null;
  physical: boolean;
  holderUserId: string | null;
  suspended: boolean;
};

export type RampFund = {
  id: string;
  name: string;
  /** Spent so far and the limit, in dollars; null when Ramp has no limit set. */
  spent: number;
  limit: number | null;
  currency: string;
};

export type RampReimbursement = {
  id: string;
  amount: number | null;
  currency: string;
  merchant: string;
  date: string | null;
  state: string;
  type: string;
};

export type ExpenseReceipt = {
  id: string;
  kind: "card" | "reimbursement";
  owner_person_id: string;
  uploader_person_id: string | null;
  uploaded_by: string | null;
  transaction_id: string | null;
  merchant: string;
  amount: number | null;
  currency: string;
  spent_on: string | null;
  memo: string;
  file_path: string;
  file_name: string;
  status: "queued" | "sent" | "failed" | "demo";
  error: string | null;
  created_at: string;
  sent_at: string | null;
};
export const RECEIPT_COLUMNS =
  "id, kind, owner_person_id, uploader_person_id, uploaded_by, transaction_id, merchant, amount, currency, spent_on, memo, file_path, file_name, status, error, created_at, sent_at";

export type ReceiptRequest = {
  id: string;
  transaction_id: string | null;
  is_demo: boolean;
  owner_person_id: string;
  asked_person_id: string;
  merchant: string;
  amount: number | null;
  currency: string;
  spent_on: string | null;
  note: string;
  status: "open" | "done" | "cancelled";
  receipt_id: string | null;
  created_at: string;
};
export const REQUEST_COLUMNS =
  "id, transaction_id, is_demo, owner_person_id, asked_person_id, merchant, amount, currency, spent_on, note, status, receipt_id, created_at";

export const FUND_FREQUENCIES = ["one_time", "monthly", "yearly"] as const;
export type FundRequest = {
  id: string;
  requester_person_id: string;
  amount: number;
  currency: string;
  purpose: string;
  details: string;
  vendor: string;
  needed_by: string | null;
  frequency: (typeof FUND_FREQUENCIES)[number];
  department_id: string | null;
  status: "submitted" | "sent" | "approved" | "rejected" | "cancelled" | "demo";
  error: string | null;
  created_at: string;
};
export const FUND_COLUMNS =
  "id, requester_person_id, amount, currency, purpose, details, vendor, needed_by, frequency, department_id, status, error, created_at";

export const RECEIPTS_BUCKET = "receipts";
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Card purchases that still need a receipt: settled or pending, not declined, none attached. */
export const needsReceipt = (t: RampTxn) => t.receiptCount === 0 && !["DECLINED", "ERROR"].includes(t.state);

/** Formats an amount; amounts are already in dollars (or the currency's major unit). */
export const money = (amount: number | null, currency = "USD", tag = "en-US") =>
  amount == null ? "—" : new Intl.NumberFormat(tag, { style: "currency", currency }).format(amount);

/**
 * The memo sent to Ramp with a receipt. When someone else used the card, Finance
 * sees who actually made the purchase.
 */
export function rampMemo(memo: string, uploaderName: string | null, ownerName: string | null) {
  const text = memo.trim();
  if (!uploaderName || !ownerName || uploaderName === ownerName) return text;
  const by = `Purchased by ${uploaderName} (receipt sent via the GMX intranet)`;
  return text ? `${text} — ${by}` : by;
}

/** A safe storage name for an upload: <auth uid>/<uuid>.<ext>. */
export function receiptPath(userId: string, fileName: string, id: string) {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  return `${userId}/${id}.${ext}`;
}
