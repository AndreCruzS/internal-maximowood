"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { PLAN_PHASES, type NewHire, type PlanItem, type PlanPhase } from "@/lib/onboarding";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** The leader's welcome plan: onboarding buddy, first-day details and the first day / week / month / quarter the new hire sees. */
export default function WelcomePlan({ hire: h, people, names, canEdit }: {
  hire: NewHire;
  people: { id: string; full_name: string }[];
  names: Record<string, string>;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [buddy, setBuddy] = useState(h.buddy_id ?? "");
  const [firstDay, setFirstDay] = useState(h.first_day ?? "");
  const [plan, setPlan] = useState<PlanItem[]>(h.plan ?? []);
  const [busy, setBusy] = useState(false);

  const suggest = () => setPlan(PLAN_PHASES.flatMap(phase => t.prehire.template[phase].map(text => ({ phase, text }))));
  const edit = (i: number, text: string) => setPlan(p => p.map((x, j) => (j === i ? { ...x, text } : x)));
  const add = (phase: PlanPhase) => setPlan(p => [...p, { phase, text: "" }]);

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase
      .from("new_hires")
      .update({ buddy_id: buddy || null, first_day: firstDay.trim(), plan: plan.map(x => ({ ...x, text: x.text.trim() })).filter(x => x.text) })
      .eq("id", h.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.hires.savedIt);
    router.refresh();
  };

  if (!canEdit) {
    return (
      <section id="plan" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="font-black text-gray-900">{t.prehire.planTitle}</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div><dt className="inline font-bold text-gray-500">{t.prehire.buddy}: </dt><dd className="inline">{h.buddy_id ? names[h.buddy_id] ?? "—" : "—"}</dd></div>
          <div><dt className="inline font-bold text-gray-500">{t.prehire.firstDay}: </dt><dd className="inline whitespace-pre-line">{h.first_day || "—"}</dd></div>
        </dl>
      </section>
    );
  }

  return (
    <section id="plan" className="scroll-mt-24 space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="font-black text-gray-900">{t.prehire.planTitle}</h2>
        <p className="text-sm text-gray-500">{t.prehire.planHint}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="plan-buddy">{t.prehire.buddy}</label>
          <select id="plan-buddy" value={buddy} onChange={e => setBuddy(e.target.value)} className={field}>
            <option value="">{t.prehire.chooseBuddy}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">{t.prehire.buddyHint}</p>
        </div>
        <div>
          <label className={label} htmlFor="plan-first">{t.prehire.firstDay}</label>
          <textarea id="plan-first" rows={3} value={firstDay} onChange={e => setFirstDay(e.target.value)} placeholder={t.prehire.firstDayPlaceholder}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={label}>{t.prehire.roadmap}</span>
          {plan.length === 0 && (
            <button type="button" onClick={suggest} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
              <Sparkles className="h-4 w-4" /> {t.prehire.useTemplate}
            </button>
          )}
        </div>
        {PLAN_PHASES.map(phase => (
          <div key={phase} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-sm font-black text-gray-900">{t.prehire.phases[phase]}</p>
            <div className="space-y-1.5">
              {plan.map((x, i) =>
                x.phase === phase ? (
                  <div key={i} className="flex gap-2">
                    <input value={x.text} onChange={e => edit(i, e.target.value)} aria-label={t.prehire.phases[phase]} className={field} />
                    <button type="button" onClick={() => setPlan(p => p.filter((_, j) => j !== i))} aria-label={t.common.delete} className="h-10 rounded-lg px-2 text-red-600 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null,
              )}
            </div>
            <button type="button" onClick={() => add(phase)} className="mt-2 flex items-center gap-1 text-xs font-bold text-[#00704a] hover:underline">
              <Plus className="h-3.5 w-3.5" /> {t.prehire.addItem}
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.prehire.savePlan}
        </button>
      </div>
    </section>
  );
}
