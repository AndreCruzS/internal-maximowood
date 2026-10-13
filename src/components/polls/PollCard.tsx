"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { isOpen, percents, type PollResults, type PollWithVotes } from "@/lib/polls";

const DAY = 86_400_000;

/** One quick poll: vote, then see the totals (never who voted what). */
export default function PollCard({ poll: p, flat }: { poll: PollWithVotes; flat?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  const [mine, setMine] = useState<number[] | null>(p.mine);
  const [pick, setPick] = useState<number[]>(p.mine ?? []);
  const [results, setResults] = useState<PollResults>(p.results);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = !mounted || isOpen(p, now);
  const showResults = (mine && !changing) || !open;
  const pct = percents(results);
  const daysLeft = p.closes_at && mounted ? Math.ceil((new Date(p.closes_at).getTime() - now) / DAY) : null;

  const toggle = (i: number) => setPick(cur => (p.multiple ? (cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i]) : [i]));

  const vote = async () => {
    const supabase = getSupabase();
    if (!supabase || !pick.length) return;
    setBusy(true);
    const { error } = await supabase.rpc("vote_poll", { poll: p.id, choices: pick });
    if (error) { setBusy(false); return toast.error(error.message); }
    const { data } = await supabase.rpc("poll_results", { poll: p.id });
    setBusy(false);
    if (data) setResults(data as PollResults);
    setMine(pick);
    setChanging(false);
    toast.success(t.poll.thanks);
    router.refresh();
  };

  return (
    <div className={flat ? "" : "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"}>
      <div className="flex items-center justify-between gap-2 bg-[#0d2b22] px-4 py-2.5 text-xs font-bold text-white">
        <span>{plural(t.poll, "votes", results.voters)}</span>
        <span className="text-white/80">
          {!open ? t.poll.closed : daysLeft !== null ? (daysLeft <= 1 ? t.poll.lastDay : fmt(t.poll.daysLeft, { n: daysLeft })) : t.poll.noEnd}
        </span>
      </div>
      <div className="p-4">
        <p className="font-bold text-gray-900">{p.question}</p>
        {p.multiple && !showResults && <p className="text-xs text-gray-400">{t.training.selectAll}</p>}
        {showResults ? (
          <ul className="mt-3 space-y-2.5">
            {p.options.map((o, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={`flex items-center gap-1.5 ${mine?.includes(i) ? "font-bold text-gray-900" : "text-gray-700"}`}>
                    {mine?.includes(i) && <CheckCircle2 className="h-3.5 w-3.5 text-[#009f67]" />} {o}
                  </span>
                  <span className="text-xs font-bold text-gray-500">{pct[i]}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#009f67] transition-all" style={{ width: `${pct[i]}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 space-y-1.5" role={p.multiple ? "group" : "radiogroup"} aria-label={p.question}>
            {p.options.map((o, i) => {
              const on = pick.includes(i);
              return (
                <button key={i} type="button" role={p.multiple ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(i)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-200 hover:bg-gray-50"}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 ${p.multiple ? "rounded" : "rounded-full"} ${on ? "border-[#009f67] bg-[#009f67]" : "border-gray-300"}`}>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="text-gray-800">{o}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          {showResults && open && (
            <button type="button" onClick={() => setChanging(true)} className="text-sm font-bold text-[#00704a] hover:underline">{t.poll.change}</button>
          )}
          {!showResults && (
            <>
              {changing && (
                <button type="button" onClick={() => { setChanging(false); setPick(mine ?? []); }} className="h-9 rounded-lg px-3 text-sm font-bold text-gray-500">{t.common.cancel}</button>
              )}
              <button type="button" onClick={vote} disabled={busy || !pick.length} className="flex h-9 items-center gap-2 rounded-lg bg-gray-900 px-5 text-sm font-bold text-white disabled:opacity-40">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.poll.vote}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
