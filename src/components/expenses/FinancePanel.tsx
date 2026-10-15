"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleSlash, FileText, Loader2, PlugZap, RefreshCw, UserX, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { money, type FundRequest } from "@/lib/expenses";
import { StatusChip, openReceipt } from "@/components/expenses/parts";
import { FUND_STYLE } from "@/components/expenses/FundsPanel";
import type { ExpensesData } from "@/server/expenses";

const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";

/** Finance: Ramp connection, receipts waiting, fund requests and people leaving. */
export default function FinancePanel({ data, names }: { data: ExpensesData; names: Record<string, string> }) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  const fin = data.finance!;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const sendAll = async () => {
    setBusy("all");
    const res = await fetch("/api/expenses/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "all" }) })
      .then(r => r.json()).catch(() => null) as { receipts?: number; funds?: number; connected?: boolean; error?: string } | null;
    setBusy(null);
    if (!res || res.error) return toast.error(res?.error ?? x.notConnected);
    toast.success(res.connected ? fmt(x.sentAll, { receipts: res.receipts ?? 0, funds: res.funds ?? 0 }) : x.notConnected);
    router.refresh();
  };

  const decide = async (r: FundRequest, status: "approved" | "rejected") => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("fund_requests").update({ status, decided_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  const deactivate = async (personId: string) => {
    if (!window.confirm(fmt(x.deactivateConfirm, { name: names[personId] ?? "" }))) return;
    setBusy(personId);
    const res = await fetch("/api/expenses/ramp-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId, action: "deactivate" }) })
      .then(async r => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) })).catch(() => ({ ok: false })) as { ok: boolean; error?: string };
    setBusy(null);
    if (!res.ok) return toast.error(res.error ?? x.notConnected);
    toast.success(x.deactivated);
  };

  const checks: [string, boolean][] = [
    [x.checkApi, data.connected],
    [x.checkLinked, fin.linkedPeople > 0],
  ];

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="mb-3 flex items-center gap-2 font-black text-gray-900"><PlugZap className="h-5 w-5 text-[#00704a]" /> {x.connection}</h2>
        <ul className="space-y-1.5 text-sm">
          {checks.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-2">
              {ok ? <CheckCircle2 className="h-4 w-4 text-[#009f67]" /> : <CircleSlash className="h-4 w-4 text-gray-400" />}
              <span className={ok ? "text-gray-900" : "text-gray-500"}>{label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-gray-500">{data.connected ? fmt(x.linkedPeople, { n: fin.linkedPeople }) : x.connectHint}</p>
      </section>

      <section className={card}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-black text-gray-900">{fmt(x.queueTitle, { n: fin.queue.length })}</h2>
          <button type="button" onClick={sendAll} disabled={busy === "all" || !fin.queue.length}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:border-[#009f67] disabled:opacity-50">
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {x.sendNow}
          </button>
        </div>
        {fin.queue.length ? (
          <ul className="divide-y divide-gray-100">
            {fin.queue.map(r => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <button type="button" onClick={() => openReceipt(r.file_path)} aria-label={x.view} className="text-gray-400 hover:text-[#00704a]"><FileText className="h-5 w-5" /></button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-gray-900">{r.merchant || r.file_name}{r.amount != null ? ` · ${money(r.amount, r.currency, tag)}` : ""}</span>
                  <span className="block text-xs text-gray-500">
                    {r.kind === "reimbursement" ? x.reimbursement : fmt(x.cardOf, { name: names[r.owner_person_id] ?? "—" })}
                    {r.uploader_person_id && r.uploader_person_id !== r.owner_person_id ? ` · ${fmt(x.sentBy, { name: names[r.uploader_person_id] ?? "—" })}` : ""}
                  </span>
                  {r.error && <span className="block text-xs text-red-600">{r.error}</span>}
                </span>
                <StatusChip status={r.status} />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">{x.queueEmpty}</p>}
      </section>

      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{x.fundRequests}</h2>
        <p className="mb-3 text-sm text-gray-500">{x.fundRequestsHint}</p>
        {fin.funds.length ? (
          <ul className="divide-y divide-gray-100">
            {fin.funds.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-900">{r.purpose} · {money(r.amount, r.currency, tag)}</span>
                  <span className="text-xs text-gray-500">
                    {names[r.requester_person_id] ?? "—"}{r.vendor ? ` · ${r.vendor}` : ""}{r.frequency !== "one_time" ? ` · ${x.frequencies[r.frequency]}` : ""}
                    {r.needed_by ? ` · ${fmt(x.byDate, { date: new Date(`${r.needed_by}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric" }) })}` : ""}
                  </span>
                  {r.details && <span className="block text-xs text-gray-600">{r.details}</span>}
                  {r.error && <span className="block text-xs text-red-600">{r.error}</span>}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${FUND_STYLE[r.status]}`}>{x.fundStatus[r.status]}</span>
                {/* Without the Ramp flow (or for the sample data), Finance decides here. */}
                {r.status !== "sent" && (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => decide(r, "approved")} aria-label={x.approve} className="rounded-lg p-1.5 text-[#00704a] hover:bg-[#e6f6f0]"><CheckCircle2 className="h-5 w-5" /></button>
                    <button type="button" onClick={() => decide(r, "rejected")} aria-label={x.reject} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"><XCircle className="h-5 w-5" /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">{x.noFundRequests}</p>}
      </section>

      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{x.leaving}</h2>
        <p className="mb-3 text-sm text-gray-500">{x.leavingHint}</p>
        {fin.leaving.length ? (
          <ul className="divide-y divide-gray-100">
            {fin.leaving.map(o => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Link href={`/people/${o.person_id}`} className="min-w-0 flex-1 font-bold text-gray-900 hover:underline">{names[o.person_id] ?? "—"}</Link>
                <span className="text-gray-500">{fmt(t.offboarding.lastDayOn, { date: new Date(`${o.last_day}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric" }) })}</span>
                <button type="button" onClick={() => deactivate(o.person_id)} disabled={!data.connected || busy === o.person_id}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                  {busy === o.person_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} {x.deactivate}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-500">{x.nobodyLeaving}</p>}
      </section>
    </div>
  );
}
