"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { COMPANIES } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { PLAYBOOK_KINDS, type Playbook, type PlaybookKind, type PlaybookStep } from "@/lib/playbooks";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const area = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/** Create or edit a playbook: type, brand, category, owner, review date, intro text and ordered steps. */
export default function PlaybookEditor({ department, playbook, people, categories }: {
  department: string;
  playbook: Playbook | null;
  /** Owner choices: the department's team first. */
  people: { id: string; full_name: string }[];
  /** Categories already used in this department, for suggestions. */
  categories: string[];
}) {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    kind: (playbook?.kind ?? "sop") as PlaybookKind,
    title: playbook?.title ?? "",
    summary: playbook?.summary ?? "",
    category: playbook?.category ?? "",
    company_id: playbook?.company_id ?? "",
    body: playbook?.body ?? "",
    link_url: playbook?.link_url ?? "",
    owner_person_id: playbook?.owner_person_id ?? me.personId ?? "",
    review_by: playbook?.review_by ?? "",
    status: playbook?.status ?? "published",
    ack_required: playbook?.ack_required ?? false,
    language: playbook?.language ?? "",
  });
  const [steps, setSteps] = useState<PlaybookStep[]>(playbook?.steps?.length ? playbook.steps : [{ title: "", body: "" }]);
  const set = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const setStep = (i: number, patch: Partial<PlaybookStep>) => setSteps(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) =>
    setSteps(s => {
      const j = i + by;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!d.title.trim()) return toast.error(t.playbooks.titleRequired);
    const link = d.link_url.trim();
    if (link && !/^https?:\/\//i.test(link)) return toast.error(t.playbooks.linkHint);
    const row = {
      department_id: department,
      kind: d.kind,
      title: d.title.trim(),
      summary: d.summary.trim(),
      category: d.category.trim(),
      company_id: d.company_id || null,
      body: d.body.trim(),
      steps: steps.map(s => ({ title: s.title.trim(), body: s.body.trim() })).filter(s => s.title || s.body),
      link_url: link || null,
      owner_person_id: d.owner_person_id || null,
      review_by: d.review_by || null,
      status: d.status,
      ack_required: d.ack_required,
      language: d.language || null,
      updated_by: me.userId,
    };
    setBusy(true);
    const res = playbook
      ? await supabase.from("playbooks").update(row).eq("id", playbook.id).select("id").single()
      : await supabase.from("playbooks").insert({ ...row, created_by: me.userId }).select("id").single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(t.playbooks.saved);
    router.push(`/playbooks/${res.data.id}`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={playbook ? `/playbooks/${playbook.id}` : `/departments/${department}#playbooks`} className="text-sm font-bold text-[#00704a] hover:underline">
        {fmt(t.playbooks.back, { dept: playbook ? playbook.title : deptName(t, department) })}
      </Link>
      <h1 className="text-2xl font-black text-gray-900">{playbook ? t.common.edit : t.playbooks.newPlaybook} · {deptName(t, department)}</h1>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <span className={label}>{t.playbooks.kind}</span>
          <div className="flex flex-wrap gap-2">
            {PLAYBOOK_KINDS.map(k => (
              <button key={k} type="button" onClick={() => set({ kind: k, ack_required: k === "policy" ? true : d.ack_required })} aria-pressed={d.kind === k}
                className={`rounded-full border px-3 py-1 text-sm font-bold ${d.kind === k ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {t.playbooks.kinds[k]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label} htmlFor="pb-title">{t.playbooks.title}</label>
          <input id="pb-title" value={d.title} onChange={e => set({ title: e.target.value })} maxLength={200} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="pb-summary">{t.playbooks.summary}</label>
          <input id="pb-summary" value={d.summary} onChange={e => set({ summary: e.target.value })} maxLength={300} className={field} />
          <p className="mt-1 text-[11px] text-gray-400">{t.playbooks.summaryHint}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="pb-cat">{t.playbooks.category}</label>
            <input id="pb-cat" list="pb-cats" value={d.category} onChange={e => set({ category: e.target.value })} placeholder={t.playbooks.categoryPlaceholder} className={field} />
            <datalist id="pb-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className={label} htmlFor="pb-brand">{t.playbooks.brand}</label>
            <select id="pb-brand" value={d.company_id} onChange={e => set({ company_id: e.target.value })} className={field}>
              <option value="">{t.department.allBrands}</option>
              {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="pb-owner">{t.playbooks.owner}</label>
            <select id="pb-owner" value={d.owner_person_id} onChange={e => set({ owner_person_id: e.target.value })} className={field}>
              <option value="">—</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className={label} htmlFor="pb-body">{t.playbooks.body}</label>
        <textarea id="pb-body" rows={5} value={d.body} onChange={e => set({ body: e.target.value })} className={area} />
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">{t.playbooks.stepsLabel}</p>
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-gray-200 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#009f67] text-sm font-black text-white">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <input value={s.title} onChange={e => setStep(i, { title: e.target.value })} placeholder={t.playbooks.stepTitle} aria-label={fmt(t.playbooks.step, { n: i + 1 })} className={field} />
              <textarea rows={2} value={s.body} onChange={e => setStep(i, { body: e.target.value })} placeholder={t.playbooks.stepBody} className={area} />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t.playbooks.moveUp} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={t.playbooks.moveDown} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => setSteps(x => x.filter((_, j) => j !== i))} aria-label={t.playbooks.removeStep} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setSteps(x => [...x, { title: "", body: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
          <Plus className="h-4 w-4" /> {t.playbooks.addStep}
        </button>
      </section>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="pb-link">{t.playbooks.link}</label>
          <input id="pb-link" type="url" value={d.link_url} onChange={e => set({ link_url: e.target.value })} placeholder="https://docs.google.com/…" className={field} />
          <p className="mt-1 text-[11px] text-gray-400">{t.playbooks.linkHint}</p>
        </div>
        <div>
          <label className={label} htmlFor="pb-review">{t.playbooks.reviewDate}</label>
          <input id="pb-review" type="date" value={d.review_by} onChange={e => set({ review_by: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="pb-lang">{t.playbooks.language}</label>
          <select id="pb-lang" value={d.language} onChange={e => set({ language: e.target.value })} className={field}>
            <option value="">—</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 sm:col-span-2">
          <input type="checkbox" checked={d.ack_required} onChange={e => set({ ack_required: e.target.checked })} className="h-4 w-4 accent-[#009f67]" />
          {t.playbooks.ackRequired}
        </label>
        <div className="sm:col-span-2">
          <span className={label}>{t.playbooks.status}</span>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            {(["published", "draft"] as const).map(s => (
              <label key={s} className="flex items-center gap-2">
                <input type="radio" name="pb-status" checked={d.status === s} onChange={() => set({ status: s })} className="accent-[#009f67]" />
                {s === "published" ? t.playbooks.publish : t.playbooks.saveDraft}
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Link href={playbook ? `/playbooks/${playbook.id}` : `/departments/${department}#playbooks`} className="flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">
          {t.common.cancel}
        </Link>
        <button type="button" onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.playbooks.save}
        </button>
      </div>
    </div>
  );
}
