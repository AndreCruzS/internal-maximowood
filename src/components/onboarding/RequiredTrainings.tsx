"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Circle, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import type { RequiredTraining, TrainingCompletion } from "@/lib/requiredTrainings";

/**
 * Mandatory trainings taken in Rippling (0035): what's required, a link into Rippling, and who's
 * done. HR can tick one off (or undo) until Rippling reports completions itself.
 */
export default function RequiredTrainings({ required, done, personId, canMark = false }: {
  required: RequiredTraining[];
  done: TrainingCompletion[];
  personId: string;
  canMark?: boolean;
}) {
  const { t, tag } = useI18n();
  const r = t.requiredTrainings;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!required.length) return null;

  const mark = async (trainingId: string, on: boolean) => {
    setBusy(trainingId);
    const db = getSupabase()!.from("training_completions");
    const { error } = on
      ? await db.upsert({ person_id: personId, training_id: trainingId, source: "hr" }, { onConflict: "person_id,training_id" })
      : await db.delete().eq("person_id", personId).eq("training_id", trainingId);
    setBusy(null);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <section id="required" className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-black text-gray-900"><ShieldCheck className="h-5 w-5 text-[#00704a]" /> {r.title}</h2>
      <p className="text-sm text-gray-500">{r.hint}</p>
      <ul className="mt-4 divide-y divide-gray-100">
        {required.map(x => {
          const d = done.find(c => c.training_id === x.id);
          return (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
              {d ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#009f67]" /> : <Circle className="h-5 w-5 shrink-0 text-gray-300" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900">{x.title}</p>
                <p className="text-xs text-gray-500">
                  {d
                    ? fmt(d.source === "rippling" ? r.doneRippling : r.doneHr, { date: new Date(`${d.completed_on}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" }) })
                    : x.description || r.todo}
                </p>
              </div>
              {!d && (
                <a href={x.link || "https://app.rippling.com/"} target="_blank" rel="noreferrer"
                  className="flex h-8 items-center gap-1 rounded-lg bg-[#009f67] px-3 text-xs font-bold text-white hover:bg-[#00875a]">
                  {r.open} <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
              {canMark && (d?.source ?? "hr") === "hr" && (
                <button type="button" disabled={busy !== null} onClick={() => void mark(x.id, !d)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {busy === x.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {d ? r.undo : r.markDone}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
