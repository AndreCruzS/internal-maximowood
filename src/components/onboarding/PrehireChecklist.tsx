"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { prehireChecklist, type CheckKey, type NewHire } from "@/lib/onboarding";

/** Where to fill in an item that ticks itself once it's done. */
const ANCHOR: Partial<Record<CheckKey, string>> = { buddy: "#plan", first_day: "#plan", plan: "#plan", company_email: "#it", phone: "#it", accounts: "#it" };

/** "Before you hire": what the hiring leader and IT get ready before day one, so nothing is forgotten. */
export default function PrehireChecklist({ hire: h, canTick, canTickIt }: { hire: NewHire; canTick: boolean; canTickIt: boolean }) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState<CheckKey | null>(null);
  const items = prehireChecklist(h);
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);

  const toggle = async (key: CheckKey, on: boolean) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(key);
    const next = { ...(h.checklist ?? {}) };
    if (on) next[key] = { at: new Date().toISOString(), by: me.userId };
    else delete next[key];
    const { error } = await supabase.from("new_hires").update({ checklist: next }).eq("id", h.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black text-gray-900">{t.prehire.title}</h2>
      <p className="text-sm text-gray-500">{t.prehire.hint}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#009f67] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-bold text-gray-500">{pct}%</span>
      </div>
      <ul className="mt-3 divide-y divide-gray-100">
        {items.map(i => {
          const mayTick = i.manual && (i.owner === "it" ? canTickIt : canTick);
          return (
            <li key={i.key} className="flex items-center gap-3 py-3">
              {i.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#009f67]" /> : <Circle className="h-5 w-5 shrink-0 text-gray-300" />}
              <span className="min-w-0 flex-1">
                <span className={`block font-bold ${i.done ? "text-gray-400 line-through" : "text-gray-900"}`}>{t.prehire.items[i.key]}</span>
                <span className="block text-xs text-gray-500">
                  {t.prehire.hints[i.key]}
                  {i.done && i.at ? ` · ${new Date(i.at).toLocaleDateString(tag, { month: "short", day: "numeric" })}` : ""}
                </span>
              </span>
              <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold sm:inline-block ${i.owner === "it" ? "bg-sky-100 text-sky-800" : "bg-[#e6f6f0] text-[#00704a]"}`}>
                {t.prehire.owner[i.owner]}
              </span>
              {mayTick ? (
                <button type="button" disabled={busy === i.key} onClick={() => toggle(i.key, !i.done)}
                  className="h-8 w-24 shrink-0 rounded-lg border border-gray-800 text-xs font-bold text-gray-900 hover:bg-gray-50 disabled:opacity-50">
                  {i.done ? t.prehire.undo : t.prehire.markDone}
                </button>
              ) : !i.done && ANCHOR[i.key] ? (
                <a href={ANCHOR[i.key]} className="flex h-8 w-24 shrink-0 items-center justify-center rounded-lg border border-gray-800 text-xs font-bold text-gray-900 hover:bg-gray-50">
                  {t.prehire.setUp}
                </a>
              ) : (
                <span className="w-24 shrink-0" />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
