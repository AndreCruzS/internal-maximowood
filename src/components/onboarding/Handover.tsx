"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { HANDOVER_KEYS, handoverLines, type Handover, type HandoverRow } from "@/lib/handover";

export type PersonOption = { id: string; full_name: string };

const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";

/** The handover questions: what they handle, key accounts, what stays open, what gets delivered, who takes over. */
export function HandoverForm({ row, name, mine, people }: { row: HandoverRow; name: string; mine: boolean; people: PersonOption[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [answers, setAnswers] = useState<Handover>(row.handover ?? {});
  const [successor, setSuccessor] = useState(row.successor_id ?? "");
  const [busy, setBusy] = useState(false);
  const q = t.handover.questions;

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("save_handover", { offboarding: row.id, answers, successor: successor || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.handover.saved);
    router.refresh();
  };

  return (
    <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex gap-3">
        <ClipboardList className="mt-0.5 h-6 w-6 shrink-0 text-[#00704a]" />
        <div>
          <h2 className="text-lg font-black text-gray-900">{mine ? t.handover.titleMine : fmt(t.handover.title, { name })}</h2>
          <p className="text-sm text-gray-500">{mine ? t.handover.introMine : fmt(t.handover.intro, { name })}</p>
        </div>
      </div>
      {HANDOVER_KEYS.map(k => (
        <label key={k} className="block">
          <span className="block text-sm font-bold text-gray-900">{mine ? q[k].mine : q[k].other}</span>
          <span className="mb-1.5 block text-xs text-gray-500">{q[k].hint}</span>
          <textarea rows={4} maxLength={4000} value={answers[k] ?? ""} onChange={e => setAnswers(a => ({ ...a, [k]: e.target.value }))} className={field} />
        </label>
      ))}
      <label className="block">
        <span className="block text-sm font-bold text-gray-900">{mine ? t.handover.successorMine : t.handover.successor}</span>
        <span className="mb-1.5 block text-xs text-gray-500">{t.handover.successorHint}</span>
        <select value={successor} onChange={e => setSuccessor(e.target.value)} className={`${field} h-10 bg-white sm:max-w-sm`}>
          <option value="">{t.handover.notDecided}</option>
          {people.filter(p => p.id !== row.person_id).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </label>
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.handover.save}
        </button>
      </div>
    </section>
  );
}

/** Read-only answers, for the offboarding list and the successor. */
export function HandoverSummary({ row, names }: { row: HandoverRow; names: Record<string, string> }) {
  const { t } = useI18n();
  const q = t.handover.questions;
  const successor = row.successor_id ? names[row.successor_id] : null;
  return (
    <div className="space-y-3 text-sm">
      {HANDOVER_KEYS.map(k => {
        const items = handoverLines(row.handover?.[k]);
        return (
          <div key={k}>
            <p className="font-bold text-gray-700">{q[k].other}</p>
            {items.length ? (
              <ul className="ml-5 list-disc text-gray-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
            ) : (
              <p className="text-gray-400">—</p>
            )}
          </div>
        );
      })}
      <p className="flex items-center gap-1.5 font-bold text-gray-700">
        <UserRoundCheck className="h-4 w-4 text-[#00704a]" /> {t.handover.successor}:{" "}
        {successor && row.successor_id ? (
          <Link href={`/people/${row.successor_id}`} className="text-[#00704a] hover:underline">{successor}</Link>
        ) : (
          <span className="font-normal text-gray-500">{t.handover.notDecided}</span>
        )}
      </p>
    </div>
  );
}
