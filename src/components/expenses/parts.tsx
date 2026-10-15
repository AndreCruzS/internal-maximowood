"use client";

import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { RECEIPTS_BUCKET, type ExpenseReceipt } from "@/lib/expenses";

export function StatusChip({ status }: { status: ExpenseReceipt["status"] }) {
  const { t } = useI18n();
  const s = t.expenses.status;
  const style = { sent: "bg-[#e6f6f0] text-[#00704a]", queued: "bg-amber-50 text-amber-800", failed: "bg-red-50 text-red-700", demo: "bg-sky-50 text-sky-800" }[status];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{s[status]}</span>;
}

/** Opens a private receipt with a short-lived link. */
export async function openReceipt(path: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 120);
  if (error || !data) return toast.error(error?.message ?? "Couldn't open the receipt");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

/** Ramp has ~20 reimbursement states; people need four. */
export function reimbState(state: string, s: { paid: string; approved: string; pending: string; rejected: string; draft: string }) {
  if (/REIMBURSED|EXPORT_SUCCESSFUL|PUSH_PAYMENT_INITIATED/.test(state)) return s.paid;
  if (/REJECTED|CANCELED|DELETED|FAILED/.test(state)) return s.rejected;
  if (/DRAFT|INIT/.test(state)) return s.draft;
  if (/APPROVED|AWAITING|EXPORT|PROCESSING/.test(state)) return s.approved;
  return s.pending;
}
