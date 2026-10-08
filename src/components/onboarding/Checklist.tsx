"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { fmt } from "@/lib/i18n/locale";
import type { OnboardingItem } from "@/server/intranet";

/** Onboarding steps with the viewer's progress; admins add or remove steps. */
export default function Checklist({ items, done }: { items: OnboardingItem[]; done: string[] }) {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [mine, setMine] = useState(new Set(done));
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState({ title: "", description: "", link: "" });
  const supabase = getSupabase();

  const toggle = async (id: string) => {
    if (!supabase) return;
    const on = mine.has(id);
    setMine(s => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
    const { error } = on
      ? await supabase.from("onboarding_progress").delete().match({ item_id: id, user_id: me.userId })
      : await supabase.from("onboarding_progress").insert({ item_id: id });
    if (error) {
      toast.error(error.message);
      setMine(new Set(done));
    } else router.refresh();
  };
  const add = async () => {
    if (!supabase || !d.title.trim()) return;
    const { error } = await supabase.from("onboarding_items").insert({ title: d.title.trim(), description: d.description.trim(), link: d.link.trim() || null, sort: items.length + 1 });
    if (error) return toast.error(error.message);
    setD({ title: "", description: "", link: "" });
    setAdding(false);
    router.refresh();
  };
  const remove = async (id: string) => {
    if (!supabase || !window.confirm(t.common.confirmDelete)) return;
    const { error } = await supabase.from("onboarding_items").delete().eq("id", id);
    if (error) toast.error(error.message);
    else router.refresh();
  };

  const count = items.filter(i => mine.has(i.id)).length;
  const pct = items.length ? Math.round((count / items.length) * 100) : 0;
  const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-gray-900">{count === items.length && items.length ? t.onboarding.allDone : fmt(t.onboarding.progress, { done: count, total: items.length })}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[#009f67] transition-all" style={{ width: `${pct}%` }} /></div>
      </div>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {items.map(i => {
          const on = mine.has(i.id);
          return (
            <li key={i.id} className="flex items-start gap-3 px-4 py-3.5">
              <button type="button" onClick={() => toggle(i.id)} aria-pressed={on} aria-label={i.title} className="mt-0.5 shrink-0">
                {on ? <CheckCircle2 className="h-5 w-5 text-[#009f67]" /> : <Circle className="h-5 w-5 text-gray-300" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`font-bold ${on ? "text-gray-400 line-through" : "text-gray-900"}`}>{i.title}</p>
                {i.description && <p className="text-sm text-gray-500">{i.description}</p>}
              </div>
              {i.link && (
                <Link href={i.link} className="shrink-0 rounded-lg border border-gray-300 px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50">{t.onboarding.open}</Link>
              )}
              {me.isAdmin && (
                <button type="button" onClick={() => remove(i.id)} aria-label={t.common.delete} className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          );
        })}
      </ul>
      {me.isAdmin && (adding ? (
        <div className="grid gap-2 rounded-xl border border-[#9fdcc5] bg-[#f7fcfa] p-4 sm:grid-cols-3">
          <input value={d.title} onChange={e => setD(x => ({ ...x, title: e.target.value }))} placeholder={t.onboarding.stepTitle} className={field} />
          <input value={d.description} onChange={e => setD(x => ({ ...x, description: e.target.value }))} placeholder={t.onboarding.description} className={field} />
          <input value={d.link} onChange={e => setD(x => ({ ...x, link: e.target.value }))} placeholder={t.onboarding.link} className={field} />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700">{t.common.cancel}</button>
            <button type="button" onClick={add} className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">{t.common.add}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline"><Plus className="h-4 w-4" /> {t.onboarding.addStep}</button>
      ))}
    </div>
  );
}
