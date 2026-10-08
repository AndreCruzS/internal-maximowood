"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { DEPARTMENTS } from "@/lib/intranet";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";

export type Faq = { id: string; department_id: string | null; question: string; answer: string; language: string | null; sort: number };

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";

function FaqForm({ faq, department, onDone }: { faq: Partial<Faq> | null; department?: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [d, setD] = useState({
    question: faq?.question ?? "", answer: faq?.answer ?? "", language: faq?.language ?? locale,
    department_id: faq?.department_id ?? department ?? (me.isAdmin ? "" : me.departmentId ?? ""),
  });
  const depts = me.isAdmin ? DEPARTMENTS : DEPARTMENTS.filter(x => x.id === me.departmentId);
  const save = async () => {
    const supabase = getSupabase();
    if (!supabase || !d.question.trim()) return;
    const row = { question: d.question.trim(), answer: d.answer.trim(), language: d.language || null, department_id: d.department_id || (me.isAdmin ? null : me.departmentId) };
    const { error } = faq?.id ? await supabase.from("faqs").update(row).eq("id", faq.id) : await supabase.from("faqs").insert(row);
    if (error) return toast.error(error.message);
    toast.success(t.common.saved);
    onDone();
    router.refresh();
  };
  return (
    <div className="space-y-2 rounded-xl border border-[#9fdcc5] bg-[#f7fcfa] p-4">
      <input value={d.question} onChange={e => setD(x => ({ ...x, question: e.target.value }))} placeholder={t.faq.question} className={field} aria-label={t.faq.question} />
      <textarea value={d.answer} onChange={e => setD(x => ({ ...x, answer: e.target.value }))} placeholder={t.faq.answer} rows={4} className="w-full rounded-lg border border-gray-300 p-2.5 text-sm outline-none focus:border-[#009f67]" aria-label={t.faq.answer} />
      <div className="flex flex-wrap items-center gap-2">
        {!department && (
          <select value={d.department_id} onChange={e => setD(x => ({ ...x, department_id: e.target.value }))} className={`${field} w-auto`} aria-label={t.faq.department}>
            {me.isAdmin && <option value="">{t.faq.general}</option>}
            {depts.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
          </select>
        )}
        <select value={d.language} onChange={e => setD(x => ({ ...x, language: e.target.value }))} className={`${field} w-auto`} aria-label={t.faq.language}>
          {LOCALES.map(l => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
        </select>
        <span className="flex-1" />
        <button type="button" onClick={onDone} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700">{t.common.cancel}</button>
        <button type="button" onClick={save} className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">{t.common.save}</button>
      </div>
    </div>
  );
}

/** Questions & answers (accordion). On a department page pass `department`; the Help page groups all of them. */
export default function FaqList({ faqs, department, searchable }: { faqs: Faq[]; department?: string; searchable?: boolean }) {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Faq> | "new" | null>(null);

  const groups = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = faqs
      .filter(f => terms.every(term => `${f.question} ${f.answer}`.toLowerCase().includes(term)))
      .sort((a, b) => a.sort - b.sort || a.question.localeCompare(b.question));
    if (department) return [{ id: department, items: hits }];
    const keys = [null, ...DEPARTMENTS.map(d => d.id)];
    return keys.map(k => ({ id: k, items: hits.filter(f => f.department_id === k) })).filter(g => g.items.length);
  }, [faqs, q, department]);

  const canAdd = department ? me.canManage(department) : me.isAdmin || me.role === "leader";
  const remove = async (f: Faq) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(t.common.confirmDelete)) return;
    const { error } = await supabase.from("faqs").delete().eq("id", f.id);
    if (error) toast.error(error.message);
    else router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.faq.search} className="h-9 w-72 rounded-lg border border-gray-300 bg-white pl-8 pr-2 text-sm" aria-label={t.faq.search} />
          </div>
        )}
        {canAdd && editing === null && (
          <button type="button" onClick={() => setEditing("new")} className={`flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline ${searchable ? "ml-auto" : ""}`}>
            <Plus className="h-4 w-4" /> {t.faq.add}
          </button>
        )}
      </div>
      {editing !== null && <FaqForm faq={editing === "new" ? null : editing} department={department} onDone={() => setEditing(null)} />}
      {groups.length === 0 || groups.every(g => !g.items.length) ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{t.faq.empty}</p>
      ) : (
        groups.map(g => (
          <section key={g.id ?? "general"}>
            {!department && <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{g.id ? deptName(t, g.id) : t.faq.general}</h2>}
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {g.items.map(f => (
                <li key={f.id}>
                  <div className="flex items-center">
                    <button type="button" onClick={() => setOpen(o => (o === f.id ? null : f.id))} aria-expanded={open === f.id} className="flex flex-1 items-center gap-3 px-4 py-3 text-left">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open === f.id ? "" : "-rotate-90"}`} />
                      <span className="font-bold text-gray-900">{f.question}</span>
                      {f.language && <span className="rounded bg-gray-100 px-1.5 text-[10px] font-bold uppercase text-gray-500">{f.language}</span>}
                    </button>
                    {me.canManage(f.department_id) && (
                      <span className="flex pr-2">
                        <button type="button" onClick={() => setEditing(f)} aria-label={t.common.edit} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => remove(f)} aria-label={t.common.delete} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    )}
                  </div>
                  {open === f.id && <p className="whitespace-pre-line px-11 pb-4 text-sm leading-6 text-gray-700">{f.answer}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
