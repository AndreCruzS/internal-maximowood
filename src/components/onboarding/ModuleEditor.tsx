"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { COMPANIES, DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { CONTENT_KINDS, type ContentKind, type TrainingModule, type TrainingScope } from "@/lib/onboarding";

export type EditorQuestion = { question: string; options: string[]; multiple: boolean; correct: number[]; explanation: string };

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const area = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** Create or edit a training module: where it sits in the path, the presentation, and its quiz. */
export default function ModuleEditor({ module, questions: initial }: { module: TrainingModule | null; questions: EditorQuestion[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    scope: (module?.scope ?? "gmx") as TrainingScope,
    company_id: module?.company_id ?? "",
    department_id: module?.department_id ?? "",
    title: module?.title ?? "",
    summary: module?.summary ?? "",
    content_kind: (module?.content_kind ?? "slides") as ContentKind,
    content_url: module?.content_url ?? "",
    body: module?.body ?? "",
    pass_mark: module?.pass_mark ?? 80,
    sort: module?.sort ?? 0,
    published: module?.published ?? false,
  });
  const [qs, setQs] = useState<EditorQuestion[]>(initial);
  const set = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const setQ = (i: number, patch: Partial<EditorQuestion>) => setQs(x => x.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const toggleCorrect = (i: number, o: number) =>
    setQs(x => x.map((q, j) => (j !== i ? q : { ...q, correct: q.multiple ? (q.correct.includes(o) ? q.correct.filter(c => c !== o) : [...q.correct, o]) : [o] })));

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!d.title.trim()) return toast.error(t.playbooks.titleRequired);
    const clean = qs.map(q => ({ ...q, question: q.question.trim(), options: q.options.map(o => o.trim()) }));
    if (clean.some(q => !q.question || q.options.filter(Boolean).length < 2 || q.correct.length === 0 || q.options.some(o => !o))) return toast.error(t.training.needCorrect);
    setBusy(true);
    const row = {
      scope: d.scope,
      company_id: d.scope === "brand" ? d.company_id || null : null,
      department_id: d.scope === "department" ? d.department_id || null : null,
      title: d.title.trim(),
      summary: d.summary.trim(),
      content_kind: d.content_kind,
      content_url: d.content_url.trim() || null,
      body: d.body.trim(),
      pass_mark: Math.max(0, Math.min(100, Number(d.pass_mark) || 0)),
      sort: Number(d.sort) || 0,
      published: d.published,
    };
    const fail = (m: string) => {
      setBusy(false);
      toast.error(m);
    };
    const res = module
      ? await supabase.from("training_modules").update(row).eq("id", module.id).select("id").single()
      : await supabase.from("training_modules").insert(row).select("id").single();
    if (res.error) return fail(res.error.message);
    const id = res.data.id as string;
    // Replace the quiz (attempts keep their scores).
    const del = await supabase.from("training_questions").delete().eq("module_id", id);
    if (del.error) return fail(del.error.message);
    if (clean.length) {
      const ins = await supabase
        .from("training_questions")
        .insert(clean.map((q, i) => ({ module_id: id, question: q.question, options: q.options, multiple: q.multiple, sort: i + 1 })))
        .select("id, sort");
      if (ins.error) return fail(ins.error.message);
      const ids = new Map((ins.data as { id: string; sort: number }[]).map(r => [r.sort, r.id]));
      const ans = await supabase
        .from("training_answers")
        .insert(clean.map((q, i) => ({ question_id: ids.get(i + 1), correct: [...q.correct].sort((a, b) => a - b), explanation: q.explanation.trim() })));
      if (ans.error) return fail(ans.error.message);
    }
    setBusy(false);
    toast.success(t.training.saved);
    router.push("/onboarding/courses");
    router.refresh();
  };

  const remove = async () => {
    const supabase = getSupabase();
    if (!supabase || !module || !window.confirm(t.training.deleteConfirm)) return;
    const { error } = await supabase.from("training_modules").delete().eq("id", module.id);
    if (error) return toast.error(error.message);
    router.push("/onboarding/courses");
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/onboarding/courses" className="text-sm font-bold text-[#00704a] hover:underline">← {t.training.editor}</Link>
      <h1 className="text-2xl font-black text-gray-900">{module ? module.title : t.training.newModule}</h1>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className={label}>{t.hires.department} / {t.hires.brand}</span>
          <div className="flex flex-wrap gap-2">
            {(["gmx", "brand", "department"] as const).map(s => (
              <button key={s} type="button" onClick={() => set({ scope: s })} aria-pressed={d.scope === s}
                className={`rounded-full border px-3 py-1 text-sm font-bold ${d.scope === s ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 text-gray-600"}`}>
                {t.training.scope[s]}
              </button>
            ))}
          </div>
        </div>
        {d.scope === "brand" && (
          <div>
            <label className={label} htmlFor="m-brand">{t.training.forBrand}</label>
            <select id="m-brand" value={d.company_id} onChange={e => set({ company_id: e.target.value })} className={field}>
              <option value="">—</option>
              {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {d.scope === "department" && (
          <div>
            <label className={label} htmlFor="m-dept">{t.training.forDepartment}</label>
            <select id="m-dept" value={d.department_id} onChange={e => set({ department_id: e.target.value })} className={field}>
              <option value="">—</option>
              {DEPARTMENTS.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={label} htmlFor="m-sort">{t.training.order}</label>
          <input id="m-sort" type="number" value={d.sort} onChange={e => set({ sort: Number(e.target.value) })} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="m-title">{t.training.title}</label>
          <input id="m-title" value={d.title} onChange={e => set({ title: e.target.value })} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="m-sum">{t.training.summary}</label>
          <input id="m-sum" value={d.summary} onChange={e => set({ summary: e.target.value })} className={field} />
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="m-kind">{t.training.contentKind}</label>
          <select id="m-kind" value={d.content_kind} onChange={e => set({ content_kind: e.target.value as ContentKind })} className={field}>
            {CONTENT_KINDS.map(k => <option key={k} value={k}>{t.training.kinds[k]}</option>)}
          </select>
        </div>
        {d.content_kind !== "text" && d.content_kind !== "resources" && (
          <div className="sm:col-span-2">
            <label className={label} htmlFor="m-url">{t.training.contentUrl}</label>
            <input id="m-url" value={d.content_url} onChange={e => set({ content_url: e.target.value })} placeholder="https://docs.google.com/presentation/d/…" className={field} />
            <p className="mt-1 text-[11px] text-gray-400">{t.training.contentUrlHint}</p>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={label} htmlFor="m-body">{t.training.body}</label>
          <textarea id="m-body" rows={6} value={d.body} onChange={e => set({ body: e.target.value })} className={area} />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">{t.training.questions}</p>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {fmt(t.training.passMark, { n: "" }).replace(/\s*%$/, "")}
            <input type="number" min={0} max={100} value={d.pass_mark} onChange={e => set({ pass_mark: Number(e.target.value) })} className="h-9 w-20 rounded-lg border border-gray-300 px-2 text-sm" aria-label={t.training.passMark} />%
          </label>
        </div>
        <p className="text-[11px] text-gray-400">{t.training.markCorrect}</p>
        {qs.map((q, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-gray-200 p-4">
            <div className="flex gap-2">
              <input value={q.question} onChange={e => setQ(i, { question: e.target.value })} placeholder={`${t.training.question} ${i + 1}`} aria-label={`${t.training.question} ${i + 1}`} className={field} />
              <button type="button" onClick={() => setQs(x => x.filter((_, j) => j !== i))} aria-label={t.common.delete} className="h-10 rounded-lg px-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
            {q.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <button type="button" onClick={() => toggleCorrect(i, oi)} aria-pressed={q.correct.includes(oi)} aria-label={t.training.correct} className="shrink-0">
                  {q.correct.includes(oi) ? <CheckCircle2 className="h-5 w-5 text-[#009f67]" /> : <Circle className="h-5 w-5 text-gray-300" />}
                </button>
                <input value={o} onChange={e => setQ(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} placeholder={fmt(t.training.option, { n: oi + 1 })} className={field} />
                {q.options.length > 2 && (
                  <button type="button" aria-label={t.common.delete}
                    onClick={() => setQ(i, { options: q.options.filter((_, k) => k !== oi), correct: q.correct.filter(c => c !== oi).map(c => (c > oi ? c - 1 : c)) })}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-4">
              {q.options.length < 8 && (
                <button type="button" onClick={() => setQ(i, { options: [...q.options, ""] })} className="text-xs font-bold text-[#00704a] hover:underline">+ {t.training.addOption}</button>
              )}
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={q.multiple} onChange={e => setQ(i, { multiple: e.target.checked, correct: e.target.checked ? q.correct : q.correct.slice(0, 1) })} className="accent-[#009f67]" />
                {t.training.multiple}
              </label>
            </div>
            <input value={q.explanation} onChange={e => setQ(i, { explanation: e.target.value })} placeholder={t.training.explanation} aria-label={t.training.explanation} className={field} />
          </div>
        ))}
        <button type="button" onClick={() => setQs(x => [...x, { question: "", options: ["", ""], multiple: false, correct: [], explanation: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
          <Plus className="h-4 w-4" /> {t.training.addQuestion}
        </button>
      </section>

      <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
        <input type="checkbox" checked={d.published} onChange={e => set({ published: e.target.checked })} className="h-4 w-4 accent-[#009f67]" />
        {t.training.published}
      </label>

      <div className="flex flex-wrap justify-between gap-2">
        {module ? <button type="button" onClick={remove} className="text-sm font-bold text-red-600 hover:underline">{t.training.deleteModule}</button> : <span />}
        <div className="flex gap-2">
          <Link href="/onboarding/courses" className="flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">{t.common.cancel}</Link>
          <button type="button" onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.training.save}
          </button>
        </div>
      </div>
    </div>
  );
}
