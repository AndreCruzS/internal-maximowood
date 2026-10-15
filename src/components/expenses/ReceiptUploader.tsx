"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, CreditCard, FileUp, Loader2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { money, needsReceipt, type RampTxn } from "@/lib/expenses";
import { fileProblem, submitReceipt } from "@/components/expenses/submitReceipt";
import type { PersonPick } from "@/server/expenses";

export type Whose = "mine" | "other" | "reimbursement";
type Purchase = Pick<RampTxn, "id" | "merchant" | "amount" | "currency" | "at" | "cardLast4">;

const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";

/**
 * One form for every receipt: my card, a colleague's card I used, or money I paid
 * myself. Pick the purchase it belongs to when we know it; Ramp matches the rest.
 */
export default function ReceiptUploader({
  meId, people, myTxns, demo, preset, onDone,
}: {
  meId: string;
  people: PersonPick[];
  myTxns: RampTxn[];
  demo: boolean;
  /** Opened from a to-do: the card, purchase and request are already known. */
  preset?: { whose: Whose; ownerPersonId?: string; purchase?: Purchase; requestId?: string; ownerName?: string };
  onDone?: () => void;
}) {
  const { t, tag } = useI18n();
  const x = t.expenses;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [whose, setWhose] = useState<Whose>(preset?.whose ?? "mine");
  const [owner, setOwner] = useState(preset?.ownerPersonId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [purchaseId, setPurchaseId] = useState(preset?.purchase?.id ?? "");
  const [theirs, setTheirs] = useState<Purchase[] | null>(null);
  const [d, setD] = useState({ merchant: "", amount: "", spentOn: "", memo: "" });
  const [busy, setBusy] = useState(false);
  const locked = Boolean(preset?.purchase);

  // Someone else's card: load that card's purchases still missing a receipt.
  useEffect(() => {
    if (whose !== "other" || !owner || locked) return;
    let live = true;
    fetch(`/api/expenses/card-purchases?person=${owner}`)
      .then(r => r.json())
      .then((j: { purchases?: Purchase[] }) => { if (live) setTheirs(j.purchases ?? []); })
      .catch(() => { if (live) setTheirs([]); });
    return () => { live = false; };
  }, [whose, owner, locked]);

  const purchases: Purchase[] = locked ? [preset!.purchase!] : whose === "mine" ? myTxns.filter(needsReceipt) : whose === "other" ? theirs ?? [] : [];
  const date = (iso: string) => new Date(iso).toLocaleDateString(tag, { month: "short", day: "numeric" });

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = fileProblem(f);
    if (problem) return toast.error(x[problem]);
    setFile(f);
  };

  const send = async () => {
    if (!file) return toast.error(x.needFile);
    const ownerId = whose === "other" ? owner : meId;
    if (!ownerId) return toast.error(x.needOwner);
    const amount = d.amount.trim() ? Number(d.amount.replace(",", ".")) : null;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) return toast.error(x.badAmount);
    setBusy(true);
    try {
      const res = await submitReceipt({
        kind: whose === "reimbursement" ? "reimbursement" : "card",
        ownerPersonId: ownerId,
        file,
        transactionId: purchaseId || null,
        merchant: d.merchant,
        amount,
        spentOn: d.spentOn || null,
        memo: d.memo,
        requestId: preset?.requestId ?? null,
        demo,
      });
      if (res.status === "failed") toast.error(fmt(x.failed, { error: res.error ?? "" }));
      else toast.success(res.status === "sent" ? x.sentToRamp : res.status === "demo" ? x.savedDemo : x.queued);
      setFile(null);
      setPurchaseId("");
      setD({ merchant: "", amount: "", spentOn: "", memo: "" });
      onDone?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const choices: { id: Whose; icon: typeof CreditCard; label: string; hint: string }[] = [
    { id: "mine", icon: CreditCard, label: x.whoseMine, hint: x.whoseMineHint },
    { id: "other", icon: Users, label: x.whoseOther, hint: x.whoseOtherHint },
    { id: "reimbursement", icon: Wallet, label: x.whoseReimb, hint: x.whoseReimbHint },
  ];

  return (
    <div className="space-y-5">
      {!preset && (
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={x.whose}>
          {choices.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={whose === c.id}
              onClick={() => { setWhose(c.id); setPurchaseId(""); }}
              className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left ${whose === c.id ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <c.icon className={`mt-0.5 h-5 w-5 shrink-0 ${whose === c.id ? "text-[#00704a]" : "text-gray-400"}`} />
              <span>
                <span className="block text-sm font-bold text-gray-900">{c.label}</span>
                <span className="block text-xs text-gray-500">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {preset?.purchase && (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <b>{preset.purchase.merchant}</b> · {money(preset.purchase.amount, preset.purchase.currency, tag)} · {date(preset.purchase.at)}
          {preset.ownerName ? <span className="text-gray-500"> · {fmt(x.onCardOf, { name: preset.ownerName })}</span> : null}
        </p>
      )}

      {whose === "other" && !preset && (
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-gray-900">{x.whoseCard}</span>
          <select value={owner} onChange={e => { setOwner(e.target.value); setTheirs(null); setPurchaseId(""); }} className={`${field} h-10 bg-white sm:max-w-sm`}>
            <option value="">{t.common.choose}</option>
            {people.filter(p => p.id !== meId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </label>
      )}

      {/* The file: tap to take a photo on a phone, or drop a PDF / image. */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center ${file ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-300 bg-white"}`}>
        {file ? (
          <>
            <CheckCircle2 className="h-8 w-8 text-[#009f67]" />
            <p className="max-w-full truncate text-sm font-bold text-gray-900">{file.name}</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-bold text-[#00704a] hover:underline">{x.changeFile}</button>
          </>
        ) : (
          <>
            <FileUp className="h-8 w-8 text-gray-400" />
            <p className="text-sm text-gray-600">{x.dropHere}</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white hover:bg-[#00704a]">
              <Camera className="h-4 w-4" /> {x.takePhoto}
            </button>
            <p className="text-xs text-gray-400">{x.fileHint}</p>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
          onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {!locked && whose !== "reimbursement" && (whose === "mine" || owner) && (
        <div>
          <p className="mb-1 text-sm font-bold text-gray-900">{x.whichPurchase}</p>
          {whose === "other" && theirs === null ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}</p>
          ) : purchases.length ? (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {purchases.map(p => (
                <li key={p.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${purchaseId === p.id ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200 hover:bg-gray-50"}`}>
                    <input type="radio" name="purchase" checked={purchaseId === p.id} onChange={() => setPurchaseId(p.id)} className="accent-[#009f67]" />
                    <span className="min-w-0 flex-1 truncate font-bold text-gray-900">{p.merchant}</span>
                    <span className="text-gray-500">{date(p.at)}{p.cardLast4 ? ` · •${p.cardLast4}` : ""}</span>
                    <span className="font-bold text-gray-900">{money(p.amount, p.currency, tag)}</span>
                  </label>
                </li>
              ))}
              <li>
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${purchaseId === "" ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input type="radio" name="purchase" checked={purchaseId === ""} onChange={() => setPurchaseId("")} className="accent-[#009f67]" />
                  <span className="text-gray-600">{x.notListed}</span>
                </label>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-gray-500">{x.noPurchases}</p>
          )}
        </div>
      )}

      {/* Details: optional on a known purchase; they help Ramp match the rest. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {!purchaseId && (
          <>
            <input value={d.merchant} onChange={e => setD(v => ({ ...v, merchant: e.target.value }))} maxLength={200} placeholder={x.merchant} aria-label={x.merchant} className={`${field} h-10`} />
            <input value={d.amount} onChange={e => setD(v => ({ ...v, amount: e.target.value }))} inputMode="decimal" placeholder={x.amount} aria-label={x.amount} className={`${field} h-10`} />
            <input type="date" value={d.spentOn} onChange={e => setD(v => ({ ...v, spentOn: e.target.value }))} aria-label={x.date} className={`${field} h-10`} />
          </>
        )}
        <input value={d.memo} onChange={e => setD(v => ({ ...v, memo: e.target.value }))} maxLength={1000} placeholder={x.memoPlaceholder} aria-label={x.memo}
          className={`${field} h-10 ${purchaseId ? "sm:col-span-3" : "sm:col-span-3"}`} />
      </div>

      <div className="flex items-center justify-end gap-3">
        {whose === "other" && <p className="mr-auto text-xs text-gray-500">{x.otherNote}</p>}
        <button type="button" onClick={send} disabled={busy || !file} className="flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-6 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {whose === "reimbursement" ? x.submitReimb : x.submitReceipt}
        </button>
      </div>
    </div>
  );
}
