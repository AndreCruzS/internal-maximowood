"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard, ExternalLink, FileText, HandCoins, Inbox, Loader2, Receipt, Send, Upload, UserRoundPlus, Wallet, X,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { money, needsReceipt, type ExpenseReceipt, type RampTxn, type ReceiptRequest } from "@/lib/expenses";
import ReceiptUploader, { type Whose } from "@/components/expenses/ReceiptUploader";
import { StatusChip, openReceipt, reimbState } from "@/components/expenses/parts";
import FundsPanel from "@/components/expenses/FundsPanel";
import FinancePanel from "@/components/expenses/FinancePanel";
import type { ExpensesData } from "@/server/expenses";

export type ExpensesTab = "todo" | "upload" | "reimbursements" | "funds" | "finance";
const card = "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm";

type Preset = { whose: Whose; ownerPersonId?: string; purchase?: Pick<RampTxn, "id" | "merchant" | "amount" | "currency" | "at" | "cardLast4">; requestId?: string; ownerName?: string };

/** Expenses, the easy way into Ramp: receipts, shared cards, reimbursements, limits and fund requests. */
export default function ExpensesView({ data, tab }: { data: ExpensesData; tab: ExpensesTab }) {
  const { t } = useI18n();
  const x = t.expenses;
  const [modal, setModal] = useState<Preset | null>(null);
  const names = useMemo(() => Object.fromEntries(data.people.map(p => [p.id, p.full_name])), [data.people]);
  const demo = data.ramp.mode === "demo";
  const me = data.me;

  const tabs: { id: ExpensesTab; label: string; icon: typeof Inbox }[] = [
    { id: "todo", label: x.tabs.todo, icon: Inbox },
    { id: "upload", label: x.tabs.upload, icon: Upload },
    { id: "reimbursements", label: x.tabs.reimbursements, icon: Wallet },
    { id: "funds", label: x.tabs.funds, icon: CreditCard },
    ...(data.isFinance ? [{ id: "finance" as const, label: x.tabs.finance, icon: HandCoins }] : []),
  ];

  if (!me) return <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">{x.noPerson}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900">{x.title}</h1>
          <p className="text-gray-500">{x.subtitle}</p>
        </div>
        <a href="https://app.ramp.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-[#00704a]">
          {x.openRamp} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {demo && (
        <p className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {x.demoBanner}
        </p>
      )}
      {data.ramp.mode === "unlinked" && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{x.unlinked}</p>}
      {data.ramp.mode === "error" && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{fmt(x.rampError, { error: data.ramp.error ?? "" })}</p>}

      <nav className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" aria-label={x.title}>
        {tabs.map(tb => (
          <Link key={tb.id} href={`/expenses?tab=${tb.id}`} aria-current={tab === tb.id ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${tab === tb.id ? "bg-white text-[#00704a] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
            <tb.icon className="h-4 w-4" /> {tb.label}
          </Link>
        ))}
      </nav>

      {tab === "todo" && <Todo data={data} names={names} open={setModal} />}
      {tab === "upload" && (
        <section className={card}>
          <ReceiptUploader meId={me.id} people={data.people} myTxns={data.ramp.txns} demo={demo} />
        </section>
      )}
      {tab === "reimbursements" && <Reimbursements data={data} />}
      {tab === "funds" && <FundsPanel data={data} />}
      {tab === "finance" && data.isFinance && data.finance && <FinancePanel data={data} names={names} />}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setModal(null)}>
          <div role="dialog" aria-modal className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900">{modal.whose === "reimbursement" ? x.submitReimb : x.addReceipt}</h2>
              <button type="button" onClick={() => setModal(null)} aria-label={t.common.close} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <ReceiptUploader meId={me.id} people={data.people} myTxns={data.ramp.txns} demo={demo} preset={modal} onDone={() => setModal(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── To do ───────────────────────────────────────────────────────────────────
function Todo({ data, names, open }: { data: ExpensesData; names: Record<string, string>; open: (p: Preset) => void }) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  const date = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric" }) : "");
  const handled = new Set([
    ...data.receipts.filter(r => r.transaction_id).map(r => r.transaction_id!),
  ]);
  const asked = new Map(data.myRequests.filter(r => r.status === "open" && r.transaction_id).map(r => [r.transaction_id!, r]));
  const missing = data.ramp.txns.filter(tx => needsReceipt(tx) && !handled.has(tx.id));
  const nothing = !missing.length && !data.askedOfMe.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Receipt} label={x.statMissing} value={missing.length} warn={missing.length > 0} />
        <Stat icon={UserRoundPlus} label={x.statAsked} value={data.askedOfMe.length} warn={data.askedOfMe.length > 0} />
        <Stat icon={Clock} label={x.statWaiting} value={data.receipts.filter(r => r.status === "queued").length} />
      </div>

      {nothing && (
        <section className={`${card} flex items-center gap-3`}>
          <CheckCircle2 className="h-8 w-8 shrink-0 text-[#009f67]" />
          <div>
            <p className="font-black text-gray-900">{x.allDone}</p>
            <p className="text-sm text-gray-500">{x.allDoneHint}</p>
          </div>
        </section>
      )}

      {data.askedOfMe.length > 0 && (
        <section className={card}>
          <h2 className="mb-1 font-black text-gray-900">{x.askedOfYou}</h2>
          <p className="mb-3 text-sm text-gray-500">{x.askedOfYouHint}</p>
          <ul className="divide-y divide-gray-100">
            {data.askedOfMe.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <b className="text-gray-900">{r.merchant || x.aPurchase}</b> · {money(r.amount, r.currency, tag)} {r.spent_on ? `· ${date(r.spent_on)}` : ""}
                  <span className="block text-gray-500">{fmt(x.cardOf, { name: names[r.owner_person_id] ?? "—" })}{r.note ? ` — “${r.note}”` : ""}</span>
                </span>
                <button type="button" onClick={() => open({
                  whose: "other", ownerPersonId: r.owner_person_id, requestId: r.id, ownerName: names[r.owner_person_id],
                  purchase: r.transaction_id ? { id: r.transaction_id, merchant: r.merchant, amount: r.amount ?? 0, currency: r.currency, at: r.spent_on ?? r.created_at, cardLast4: null } : undefined,
                })} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white hover:bg-[#00704a]">
                  <Upload className="h-4 w-4" /> {x.sendReceipt}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className={card}>
          <h2 className="mb-1 font-black text-gray-900">{x.missingTitle}</h2>
          <p className="mb-3 text-sm text-gray-500">{x.missingHint}</p>
          <ul className="divide-y divide-gray-100">
            {missing.map(tx => (
              <MissingRow key={tx.id} tx={tx} asked={asked.get(tx.id)} names={names} data={data} open={open} />
            ))}
          </ul>
        </section>
      )}

      <RecentReceipts receipts={data.receipts} names={names} meId={data.me!.id} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Receipt; label: string; value: number; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${warn ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
      <Icon className={`h-6 w-6 ${warn ? "text-amber-600" : "text-gray-400"}`} />
      <span>
        <span className="block text-2xl font-black leading-none text-gray-900">{value}</span>
        <span className="text-xs font-bold text-gray-500">{label}</span>
      </span>
    </div>
  );
}

/** A purchase on my card without a receipt: add it, or ask whoever used the card. */
function MissingRow({ tx, asked, names, data, open }: { tx: RampTxn; asked?: ReceiptRequest; names: Record<string, string>; data: ExpensesData; open: (p: Preset) => void }) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    const supabase = getSupabase();
    if (!supabase || !who) return;
    setBusy(true);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("receipt_requests").insert({
      transaction_id: tx.id, is_demo: data.ramp.mode === "demo", owner_person_id: data.me!.id, asked_person_id: who,
      merchant: tx.merchant, amount: tx.amount, currency: tx.currency, spent_on: tx.at.slice(0, 10), note: note.trim(), created_by: me,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(fmt(x.askedSent, { name: names[who] ?? "" }));
    setAsking(false);
    router.refresh();
  };
  const cancel = async () => {
    const supabase = getSupabase();
    if (!supabase || !asked) return;
    const { error } = await supabase.from("receipt_requests").update({ status: "cancelled" }).eq("id", asked.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-sm">
          <b className="text-gray-900">{tx.merchant}</b> · {money(tx.amount, tx.currency, tag)}
          <span className="block text-gray-500">
            {new Date(tx.at).toLocaleDateString(tag, { month: "short", day: "numeric" })}{tx.cardLast4 ? ` · •${tx.cardLast4}` : ""}{tx.category ? ` · ${tx.category}` : ""}
          </span>
        </span>
        {asked ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-bold text-sky-800">{fmt(x.waitingOn, { name: names[asked.asked_person_id] ?? "—" })}</span>
            <button type="button" onClick={cancel} className="text-xs font-bold text-gray-400 hover:text-red-600">{t.common.cancel}</button>
          </span>
        ) : (
          <>
            <button type="button" onClick={() => setAsking(a => !a)} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:border-[#009f67] hover:text-[#00704a]">
              <UserRoundPlus className="h-4 w-4" /> {x.someoneElse}
            </button>
            <button type="button" onClick={() => open({ whose: "mine", purchase: tx })} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white hover:bg-[#00704a]">
              <Upload className="h-4 w-4" /> {x.addReceipt}
            </button>
          </>
        )}
      </div>
      {asking && !asked && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3">
          <select value={who} onChange={e => setWho(e.target.value)} aria-label={x.whoUsedIt} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
            <option value="">{x.whoUsedIt}</option>
            {data.people.filter(p => p.id !== data.me!.id).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={x.askNote} className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm" />
          <button type="button" onClick={ask} disabled={busy || !who} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {x.ask}
          </button>
        </div>
      )}
    </li>
  );
}

function RecentReceipts({ receipts, names, meId }: { receipts: ExpenseReceipt[]; names: Record<string, string>; meId: string }) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  if (!receipts.length) return null;
  return (
    <section className={card}>
      <h2 className="mb-3 font-black text-gray-900">{x.recent}</h2>
      <ul className="divide-y divide-gray-100">
        {receipts.slice(0, 15).map(r => {
          const forOther = r.owner_person_id !== meId;
          const byOther = r.uploader_person_id && r.uploader_person_id !== meId;
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <button type="button" onClick={() => openReceipt(r.file_path)} aria-label={x.view} className="text-gray-400 hover:text-[#00704a]"><FileText className="h-5 w-5" /></button>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-gray-900">{r.merchant || r.file_name || x.aReceipt}{r.amount != null ? ` · ${money(r.amount, r.currency, tag)}` : ""}</span>
                <span className="block text-xs text-gray-500">
                  {r.kind === "reimbursement" ? x.reimbursement : forOther ? fmt(x.cardOf, { name: names[r.owner_person_id] ?? "—" }) : x.yourCard}
                  {byOther ? ` · ${fmt(x.sentBy, { name: names[r.uploader_person_id!] ?? "—" })}` : ""}
                  {" · "}{new Date(r.created_at).toLocaleDateString(tag, { month: "short", day: "numeric" })}
                  {r.status === "failed" && r.error ? <span className="block text-red-600">{r.error}</span> : null}
                </span>
              </span>
              <StatusChip status={r.status} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Reimbursements ──────────────────────────────────────────────────────────
function Reimbursements({ data }: { data: ExpensesData }) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  const local = data.receipts.filter(r => r.kind === "reimbursement" && r.status !== "sent");
  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="mb-1 font-black text-gray-900">{x.newReimb}</h2>
        <p className="mb-4 text-sm text-gray-500">{x.newReimbHint}</p>
        <ReceiptUploader meId={data.me!.id} people={data.people} myTxns={[]} demo={data.ramp.mode === "demo"} preset={{ whose: "reimbursement" }} />
      </section>
      <section className={card}>
        <h2 className="mb-3 font-black text-gray-900">{x.yourReimbs}</h2>
        {!data.ramp.reimbursements.length && !local.length ? (
          <p className="text-sm text-gray-500">{x.noReimbs}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {local.map(r => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold text-gray-900">{r.merchant || r.file_name}</span>
                <span className="text-gray-500">{money(r.amount, r.currency, tag)}</span>
                <StatusChip status={r.status} />
              </li>
            ))}
            {data.ramp.reimbursements.map(r => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-gray-900">{r.merchant || x.reimbursement}</span>
                  <span className="text-xs text-gray-500">{r.date ? new Date(`${r.date}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric" }) : ""}</span>
                </span>
                <span className="font-bold text-gray-900">{money(r.amount, r.currency, tag)}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">{reimbState(r.state, x.reimbStates)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
