"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { FUND_FREQUENCIES, money, type FundRequest } from "@/lib/expenses";
import type { ExpensesData } from "@/server/expenses";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";
const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";

export const FUND_STYLE: Record<FundRequest["status"], string> = {
  submitted: "bg-amber-50 text-amber-800", sent: "bg-sky-50 text-sky-800", approved: "bg-[#e6f6f0] text-[#00704a]",
  rejected: "bg-red-50 text-red-700", cancelled: "bg-gray-100 text-gray-500", demo: "bg-sky-50 text-sky-800",
};

/** My cards and what's left on each limit, plus asking for more money. */
export default function FundsPanel({ data }: { data: ExpensesData }) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  const router = useRouter();
  const demo = data.ramp.mode === "demo";
  const [f, setF] = useState({ amount: "", purpose: "", vendor: "", needed_by: "", frequency: "one_time", department_id: "", details: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }));

  const submit = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const amount = Number(f.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return toast.error(x.badAmount);
    if (!f.purpose.trim()) return toast.error(x.needPurpose);
    setBusy(true);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { data: row, error } = await supabase.from("fund_requests").insert({
      requester_person_id: data.me!.id, created_by: me, amount, purpose: f.purpose.trim(), vendor: f.vendor.trim(), details: f.details.trim(),
      needed_by: f.needed_by || null, frequency: f.frequency, department_id: f.department_id || null, status: demo ? "demo" : "submitted",
    }).select("id").single();
    if (error) { setBusy(false); return toast.error(error.message); }
    let sent = false;
    if (!demo) {
      const res = await fetch("/api/expenses/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "fund", id: (row as { id: string }).id }) })
        .then(r => r.json()).catch(() => null) as { status?: string } | null;
      sent = res?.status === "sent";
    }
    setBusy(false);
    toast.success(sent ? x.fundSent : demo ? x.savedDemo : x.fundQueued);
    setF({ amount: "", purpose: "", vendor: "", needed_by: "", frequency: "one_time", department_id: "", details: "" });
    router.refresh();
  };

  const cancel = async (r: FundRequest) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("fund_requests").update({ status: "cancelled" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 font-black text-gray-900">{x.yourCards}</h2>
          {data.ramp.cards.length ? (
            <ul className="space-y-2">
              {data.ramp.cards.map(c => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#00704a] to-[#009f67] px-4 py-3 text-white">
                  <CreditCard className="h-5 w-5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.name || (c.physical ? x.physical : x.virtual)}</span>
                    <span className="text-xs text-white/80">{c.physical ? x.physical : x.virtual}{c.suspended ? ` · ${x.suspended}` : ""}</span>
                  </span>
                  {c.last4 && <span className="font-mono text-sm tracking-widest">•••• {c.last4}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">{x.noCards}</p>}
        </section>

        <section className={card}>
          <h2 className="mb-3 font-black text-gray-900">{x.yourLimits}</h2>
          {data.ramp.funds.length ? (
            <ul className="space-y-4">
              {data.ramp.funds.map(fund => {
                const pct = fund.limit ? Math.min(100, Math.round((fund.spent / fund.limit) * 100)) : 0;
                return (
                  <li key={fund.id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-gray-900">{fund.name}</span>
                      <span className="text-gray-600">
                        {fund.limit != null ? fmt(x.leftOf, { left: money(Math.max(0, fund.limit - fund.spent), fund.currency, tag), limit: money(fund.limit, fund.currency, tag) }) : money(fund.spent, fund.currency, tag)}
                      </span>
                    </div>
                    {fund.limit != null && (
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full rounded-full ${pct > 85 ? "bg-amber-500" : "bg-[#009f67]"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-gray-500">{x.noLimits}</p>}
        </section>
      </div>

      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{x.requestFunds}</h2>
        <p className="mb-4 text-sm text-gray-500">{x.requestFundsHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={f.purpose} onChange={set("purpose")} maxLength={200} placeholder={x.purpose} aria-label={x.purpose} className={`${field} h-10 sm:col-span-2`} />
          <input value={f.amount} onChange={set("amount")} inputMode="decimal" placeholder={x.amountUsd} aria-label={x.amountUsd} className={`${field} h-10`} />
          <select value={f.frequency} onChange={set("frequency")} aria-label={x.frequency} className={`${field} h-10 bg-white`}>
            {FUND_FREQUENCIES.map(v => <option key={v} value={v}>{x.frequencies[v]}</option>)}
          </select>
          <input value={f.vendor} onChange={set("vendor")} maxLength={200} placeholder={x.vendor} aria-label={x.vendor} className={`${field} h-10`} />
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <span className="shrink-0">{x.neededBy}</span>
            <input type="date" value={f.needed_by} onChange={set("needed_by")} className={`${field} h-10`} />
          </label>
          <select value={f.department_id} onChange={set("department_id")} aria-label={x.department} className={`${field} h-10 bg-white`}>
            <option value="">{x.department}</option>
            {DEPARTMENTS.map(dp => <option key={dp.id} value={dp.id}>{deptName(t, dp.id)}</option>)}
          </select>
          <textarea value={f.details} onChange={set("details")} maxLength={2000} rows={2} placeholder={x.details} aria-label={x.details} className={`${field} sm:col-span-2`} />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={submit} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {x.sendRequest}
          </button>
        </div>

        {data.fundRequests.length > 0 && (
          <ul className="mt-5 divide-y divide-gray-100 border-t border-gray-100 pt-2">
            {data.fundRequests.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-900">{r.purpose}</span>
                  <span className="text-xs text-gray-500">
                    {money(r.amount, r.currency, tag)}{r.frequency !== "one_time" ? ` · ${x.frequencies[r.frequency]}` : ""}{r.vendor ? ` · ${r.vendor}` : ""}
                  </span>
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${FUND_STYLE[r.status]}`}>{x.fundStatus[r.status]}</span>
                {(r.status === "submitted" || r.status === "demo") && (
                  <button type="button" onClick={() => cancel(r)} className="text-xs font-bold text-gray-400 hover:text-red-600">{t.common.cancel}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
