"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { fmt } from "@/lib/i18n/locale";
import { isOpen, type PollWithVotes } from "@/lib/polls";
import PollCard from "@/components/polls/PollCard";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const DURATIONS = [7, 14, 30, 0];

function NewPoll({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return toast.error(t.poll.needOptions);
    setBusy(true);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("polls").insert({
      question: question.trim(), options: opts, multiple, created_by: me,
      closes_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.poll.created);
    onDone();
    router.refresh();
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[#9fdcc5] bg-[#f7fcfa] p-5">
      <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={300} placeholder={t.poll.question} aria-label={t.poll.question} className={field} />
      {options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <input value={o} onChange={e => setOptions(x => x.map((y, j) => (j === i ? e.target.value : y)))} placeholder={fmt(t.training.option, { n: i + 1 })} aria-label={fmt(t.training.option, { n: i + 1 })} className={field} />
          {options.length > 2 && (
            <button type="button" onClick={() => setOptions(x => x.filter((_, j) => j !== i))} aria-label={t.common.delete} className="h-10 rounded-lg px-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {options.length < 8 && (
        <button type="button" onClick={() => setOptions(x => [...x, ""])} className="flex items-center gap-1 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {t.training.addOption}</button>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 font-bold text-gray-700">
          <input type="checkbox" checked={multiple} onChange={e => setMultiple(e.target.checked)} className="h-4 w-4 accent-[#009f67]" /> {t.poll.multiple}
        </label>
        <label className="flex items-center gap-2 font-bold text-gray-700">
          {t.poll.duration}
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
            {DURATIONS.map(d => <option key={d} value={d}>{d ? fmt(t.poll.days, { n: d }) : t.poll.noEnd}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500">{t.poll.privacy}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700">{t.common.cancel}</button>
        <button type="button" onClick={create} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.poll.publish}
        </button>
      </div>
    </section>
  );
}

export default function PollsView({ polls, canCreate, isAdmin, userId }: { polls: PollWithVotes[]; canCreate: boolean; isAdmin: boolean; userId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const mounted = useMounted();
  const [adding, setAdding] = useState(false);
  const [now] = useState(() => Date.now());

  const close = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("polls").update({ closes_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else router.refresh();
  };
  const remove = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(t.poll.deleteConfirm)) return;
    const { error } = await supabase.from("polls").delete().eq("id", id);
    if (error) toast.error(error.message);
    else router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.poll.title}</h1>
          <p className="text-gray-500">{t.poll.subtitle}</p>
        </div>
        {canCreate && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> {t.poll.new}
          </button>
        )}
      </div>
      {adding && <NewPoll onDone={() => setAdding(false)} />}
      {polls.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">{t.poll.empty}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {polls.map(p => (
            <li key={p.id} className="space-y-1.5">
              <PollCard poll={p} />
              {(isAdmin || p.created_by === userId) && (
                <div className="flex justify-end gap-3 text-xs font-bold">
                  {mounted && isOpen(p, now) && (
                    <button type="button" onClick={() => close(p.id)} className="flex items-center gap-1 text-gray-500 hover:text-gray-900"><Lock className="h-3.5 w-3.5" /> {t.poll.close}</button>
                  )}
                  <button type="button" onClick={() => remove(p.id)} className="flex items-center gap-1 text-red-600 hover:underline"><Trash2 className="h-3.5 w-3.5" /> {t.common.delete}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
