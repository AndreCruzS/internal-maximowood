"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { REQUIRED_TRAINING_COLUMNS, type RequiredTraining } from "@/lib/requiredTrainings";

const field = "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
const APPLIES = ["US", "BR", "all"] as const;

/** HR's list of mandatory Rippling trainings: name, description, link, who takes it, on/off. */
export default function RequiredTrainingsEditor({ initial, error }: { initial: RequiredTraining[]; error: string | null }) {
  const { t } = useI18n();
  const r = t.requiredTrainings;
  const [rows, setRows] = useState(initial);
  const [title, setTitle] = useState("");

  if (error) return <p className="mx-auto max-w-4xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p>;

  const save = async (id: string, change: Partial<RequiredTraining>) => {
    if ("link" in change && change.link && !/^https:\/\//i.test(change.link)) return toast.error(r.link);
    const { data, error: e } = await getSupabase()!.from("required_trainings").update(change).eq("id", id).select(REQUIRED_TRAINING_COLUMNS).single();
    if (e) return toast.error(e.message);
    setRows(rs => rs.map(x => (x.id === id ? (data as RequiredTraining) : x)));
    toast.success(r.saved);
  };
  const add = async () => {
    if (!title.trim()) return;
    const { data, error: e } = await getSupabase()!.from("required_trainings")
      .insert({ title: title.trim(), sort: Math.max(0, ...rows.map(x => x.sort)) + 1 }).select(REQUIRED_TRAINING_COLUMNS).single();
    if (e) return toast.error(e.message);
    setRows(rs => [...rs, data as RequiredTraining]);
    setTitle("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link href="/hr" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#00704a]"><ArrowLeft className="h-4 w-4" /> {t.hr.title}</Link>
        <h1 className="text-2xl font-black text-gray-900">{r.manageTitle}</h1>
        <p className="mt-1 text-sm text-gray-600">{r.manageHint}</p>
      </header>
      <ul className="space-y-3">
        {rows.map(x => (
          <li key={x.id} className={`space-y-2 rounded-2xl border border-gray-200 bg-white p-4 ${x.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input key={`t-${x.id}-${x.title}`} defaultValue={x.title} maxLength={120} className={`${field} flex-1 font-bold`}
                onBlur={e => e.target.value.trim() && e.target.value.trim() !== x.title && void save(x.id, { title: e.target.value.trim() })} />
              <select value={x.applies_to} onChange={e => void save(x.id, { applies_to: e.target.value as RequiredTraining["applies_to"] })} className={`${field} w-40`} aria-label={r.appliesTo}>
                {APPLIES.map(a => <option key={a} value={a}>{r.applies[a]}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <input type="checkbox" checked={x.active} onChange={e => void save(x.id, { active: e.target.checked })} /> {r.active}
              </label>
            </div>
            <input key={`d-${x.id}-${x.description}`} defaultValue={x.description} maxLength={500} className={field}
              onBlur={e => e.target.value.trim() !== x.description && void save(x.id, { description: e.target.value.trim() })} />
            <input key={`l-${x.id}-${x.link}`} defaultValue={x.link ?? ""} placeholder={`${r.link} — https://app.rippling.com/…`} className={field}
              onBlur={e => (e.target.value.trim() || null) !== x.link && void save(x.id, { link: e.target.value.trim() || null })} />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={r.newTitle} maxLength={120} className={`${field} h-9 flex-1`}
          onKeyDown={e => e.key === "Enter" && void add()} />
        <button type="button" onClick={() => void add()} disabled={!title.trim()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          <Plus className="h-4 w-4" /> {r.add}
        </button>
      </div>
    </div>
  );
}
