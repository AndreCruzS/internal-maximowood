"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ClipboardList, FileText, ImagePlus, ListChecks, Loader2, Plus, ShieldCheck, Trash2, Video, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { COMPANIES } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import {
  ALL_BLOCKS, MAX_IMAGE_BYTES, PLAYBOOK_BUCKET, PLAYBOOK_KINDS, PLAYBOOK_TEMPLATES, SECTION_KEYS, TEMPLATE_SPEC, activeBlocks,
  type BlockKey, type Playbook, type PlaybookDefinition, type PlaybookKind, type PlaybookResource, type PlaybookRole,
  type PlaybookStep, type PlaybookTemplate, type SectionKey,
} from "@/lib/playbooks";
import { QualityList } from "@/components/playbooks/Quality";
import { useSignedUrls } from "@/components/playbooks/useSignedUrls";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const area = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";
const card = "space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm";
const isUrl = (u: string) => /^https?:\/\//i.test(u);

const TEMPLATE_ICON: Record<PlaybookTemplate | "blank", LucideIcon> = {
  blank: FileText, sop_detailed: ClipboardList, sop_simple: ListChecks, policy: ShieldCheck, video: Video,
};

/**
 * Create or edit a playbook: pick a template (new only), then type, brand, category, owner, review date,
 * purpose, template sections, roles, steps, definitions, video and resources. The score updates as you type.
 */
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
    department_only: playbook?.visibility === "department",
    language: playbook?.language ?? "",
  });
  const [steps, setSteps] = useState<PlaybookStep[]>(playbook?.steps?.length ? playbook.steps : [{ title: "", body: "" }]);
  const [picked, setPicked] = useState(Boolean(playbook));
  const [template, setTemplate] = useState<PlaybookTemplate | null>(playbook?.template ?? null);
  const [blocks, setBlocks] = useState<BlockKey[]>(playbook ? activeBlocks(playbook) : []);
  const [sections, setSections] = useState<Partial<Record<SectionKey, string>>>(playbook?.sections ?? {});
  const [roles, setRoles] = useState<PlaybookRole[]>(playbook?.roles ?? []);
  const [definitions, setDefinitions] = useState<PlaybookDefinition[]>(playbook?.definitions ?? []);
  const [resources, setResources] = useState<PlaybookResource[]>(playbook?.resources ?? []);
  const [videoUrl, setVideoUrl] = useState(playbook?.video_url ?? "");
  const [reconfirm, setReconfirm] = useState(false);
  const s = t.sop;
  const names = Object.fromEntries(people.map(p => [p.id, p.full_name]));
  const on = (b: BlockKey) => blocks.includes(b);
  const addBlock = (b: BlockKey) => {
    setBlocks(x => ALL_BLOCKS.filter(k => k === b || x.includes(k)));
    if (b === "roles" && !roles.length) setRoles([{ role: "", people: [], responsibility: "" }]);
    if (b === "definitions" && !definitions.length) setDefinitions([{ term: "", definition: "" }]);
    if (b === "resources" && !resources.length) setResources([{ label: "", url: "" }]);
  };
  const removeBlock = (b: BlockKey) => setBlocks(x => x.filter(k => k !== b));

  /** Start from a template: its type, sections and empty rows to fill. */
  const pick = (tpl: PlaybookTemplate | null) => {
    setTemplate(tpl);
    setPicked(true);
    if (!tpl) return;
    const spec = TEMPLATE_SPEC[tpl];
    set({ kind: spec.kind, ack_required: spec.ack });
    setBlocks(spec.blocks);
    setSteps(spec.steps ? Array.from({ length: spec.steps }, () => ({ title: "", body: "" })) : []);
    if (spec.blocks.includes("roles")) setRoles([{ role: "", people: [], responsibility: "" }, { role: "", people: [], responsibility: "" }]);
    if (spec.blocks.includes("definitions")) setDefinitions([{ term: "", definition: "" }]);
    if (spec.blocks.includes("resources")) setResources([{ label: "", url: "" }]);
  };
  const [uploading, setUploading] = useState<number | null>(null);
  const urls = useSignedUrls(steps.flatMap(s => s.images ?? []));
  const set = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));

  /** Upload images to "<department>/<random>.<ext>" and attach them to step i. */
  const addImages = async (i: number, files: File[]) => {
    const supabase = getSupabase();
    const images = files.filter(f => f.type.startsWith("image/"));
    if (!supabase || images.length === 0) return;
    if (images.some(f => f.size > MAX_IMAGE_BYTES)) return toast.error(t.playbooks.imageTooBig);
    setUploading(i);
    const paths: string[] = [];
    for (const f of images) {
      const ext = (f.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
      const path = `${department}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(PLAYBOOK_BUCKET).upload(path, f, { contentType: f.type });
      if (error) {
        toast.error(error.message);
        break;
      }
      paths.push(path);
    }
    setUploading(null);
    if (paths.length) setSteps(s => s.map((x, j) => (j === i ? { ...x, images: [...(x.images ?? []), ...paths] } : x)));
  };
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
    const video = on("video") ? videoUrl.trim() : "";
    const links = on("resources") ? resources.map(r => ({ label: r.label.trim(), url: r.url.trim() })).filter(r => r.url) : [];
    if ((video && !isUrl(video)) || links.some(r => !isUrl(r.url))) return toast.error(s.badUrl);
    const row = {
      department_id: department,
      kind: d.kind,
      title: d.title.trim(),
      summary: d.summary.trim(),
      category: d.category.trim(),
      company_id: d.company_id || null,
      body: d.body.trim(),
      steps: steps
        .map(s => ({ title: s.title.trim(), body: s.body.trim(), ...(s.images?.length ? { images: s.images } : {}) }))
        .filter(s => s.title || s.body || s.images?.length),
      link_url: link || null,
      owner_person_id: d.owner_person_id || null,
      review_by: d.review_by || null,
      status: d.status,
      ack_required: d.ack_required,
      ...(d.department_only || playbook?.visibility ? { visibility: d.department_only ? "department" : "everyone" } : {}),
      language: d.language || null,
      updated_by: me.userId,
      template,
      sections: Object.fromEntries(SECTION_KEYS.filter(k => on(k) && sections[k]?.trim()).map(k => [k, sections[k]!.trim()])),
      roles: on("roles") ? roles.map(r => ({ role: r.role.trim(), people: r.people, responsibility: r.responsibility.trim() })).filter(r => r.role || r.people.length || r.responsibility) : [],
      definitions: on("definitions") ? definitions.map(x => ({ term: x.term.trim(), definition: x.definition.trim() })).filter(x => x.term || x.definition) : [],
      resources: links,
      video_url: video || null,
      // A significant change: confirmations of earlier versions stop counting (the trigger caps this at the new version).
      ...(playbook && reconfirm ? { ack_version: (playbook.version ?? 1) + 1 } : {}),
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

  const backHref = playbook ? `/playbooks/${playbook.id}` : `/departments/${department}#playbooks`;

  if (!picked) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={backHref} className="text-sm font-bold text-[#00704a] hover:underline">{fmt(t.playbooks.back, { dept: deptName(t, department) })}</Link>
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.playbooks.newPlaybook} · {deptName(t, department)}</h1>
          <p className="mt-1 text-sm text-gray-500">{s.chooseHint}</p>
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">{s.chooseTemplate}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([...PLAYBOOK_TEMPLATES, "blank"] as const).map(tpl => {
            const Icon = TEMPLATE_ICON[tpl];
            return (
              <button key={tpl} type="button" onClick={() => pick(tpl === "blank" ? null : tpl)}
                className="flex items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white p-4 text-left shadow-sm hover:border-[#009f67] hover:bg-[#f2fbf7]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6f6f0]"><Icon className="h-5 w-5 text-[#00704a]" /></span>
                <span>
                  <span className="block font-black text-gray-900">{s.templates[tpl]}</span>
                  <span className="mt-0.5 block text-sm text-gray-500">{s.templateHints[tpl]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /** A text section from the template (scope, escalation…). */
  const textBlock = (k: SectionKey) =>
    on(k) && (
      <section key={k} className={card}>
        <BlockHeader title={s.blocks[k]} hint={s.blockHints[k]} onRemove={() => removeBlock(k)} removeLabel={s.removeSection} />
        <textarea rows={3} value={sections[k] ?? ""} onChange={e => setSections(x => ({ ...x, [k]: e.target.value }))} aria-label={s.blocks[k]} className={area} />
      </section>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={backHref} className="text-sm font-bold text-[#00704a] hover:underline">
        {fmt(t.playbooks.back, { dept: playbook ? playbook.title : deptName(t, department) })}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black text-gray-900">{playbook ? t.common.edit : t.playbooks.newPlaybook} · {deptName(t, department)}</h1>
        {template && <span className="rounded-full bg-[#e6f6f0] px-3 py-1 text-xs font-bold text-[#00704a]">{s.templates[template]}</span>}
      </div>

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

      <section className={card}>
        <label className={label} htmlFor="pb-body">{template === "policy" ? s.policyPurpose : template || blocks.length ? s.purpose : t.playbooks.body}</label>
        <textarea id="pb-body" rows={5} value={d.body} onChange={e => set({ body: e.target.value })} placeholder={template ? s.purposeHint : undefined} className={area} />
      </section>

      {on("video") && (
        <section className={card}>
          <BlockHeader title={s.blocks.video} hint={s.blockHints.video} onRemove={() => removeBlock("video")} removeLabel={s.removeSection} />
          <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label={s.videoUrl} className={field} />
        </section>
      )}
      {textBlock("scope")}
      {textBlock("prerequisites")}
      {on("roles") && (
        <section className={card}>
          <BlockHeader title={s.blocks.roles} hint={s.blockHints.roles} onRemove={() => removeBlock("roles")} removeLabel={s.removeSection} />
          {roles.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <input value={r.role} onChange={e => setRoles(x => x.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} placeholder={s.role} aria-label={s.role} maxLength={120} className={field} />
              <div className="space-y-1.5">
                {r.people.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.people.map(id => (
                      <span key={id} className="flex items-center gap-1 rounded-full bg-[#e6f6f0] py-0.5 pl-2 pr-1 text-xs font-bold text-[#00704a]">
                        {names[id] ?? s.unknown}
                        <button type="button" onClick={() => setRoles(x => x.map((y, j) => (j === i ? { ...y, people: y.people.filter(z => z !== id) } : y)))} aria-label={s.removeRow} className="rounded-full p-0.5 hover:bg-white"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <select value="" onChange={e => { const id = e.target.value; if (id) setRoles(x => x.map((y, j) => (j === i && !y.people.includes(id) ? { ...y, people: [...y.people, id] } : y))); }} aria-label={s.addPerson} className={field}>
                  <option value="">{s.addPerson}</option>
                  {people.filter(p => !r.people.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => setRoles(x => x.filter((_, j) => j !== i))} aria-label={s.removeRow} className="self-start rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              <textarea rows={2} value={r.responsibility} onChange={e => setRoles(x => x.map((y, j) => (j === i ? { ...y, responsibility: e.target.value } : y)))} placeholder={s.responsibility} aria-label={s.responsibility} className={`${area} sm:col-span-3`} />
            </div>
          ))}
          <button type="button" onClick={() => setRoles(x => [...x, { role: "", people: [], responsibility: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
            <Plus className="h-4 w-4" /> {s.addRole}
          </button>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">{template === "policy" ? s.policyElements : template || blocks.length ? s.procedure : t.playbooks.stepsLabel}</p>
          <p className="mt-1 text-[11px] text-gray-400">{t.playbooks.imageHint}</p>
        </div>
        {steps.map((s, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-gray-200 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#009f67] text-sm font-black text-white">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <input value={s.title} onChange={e => setStep(i, { title: e.target.value })} placeholder={t.playbooks.stepTitle} aria-label={fmt(t.playbooks.step, { n: i + 1 })} className={field} />
              <textarea
                rows={2}
                value={s.body}
                onChange={e => setStep(i, { body: e.target.value })}
                onPaste={e => {
                  const files = [...e.clipboardData.files];
                  if (files.some(f => f.type.startsWith("image/"))) {
                    e.preventDefault();
                    addImages(i, files);
                  }
                }}
                placeholder={t.playbooks.stepBody}
                className={area}
              />
              {(s.images?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {s.images!.map(path => (
                    <span key={path} className="relative">
                      {urls[path] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urls[path]} alt={fmt(t.playbooks.imageAlt, { n: i + 1 })} className="h-24 w-auto rounded-lg border border-gray-200 object-cover" />
                      ) : (
                        <span className="flex h-24 w-32 items-center justify-center rounded-lg border border-gray-200 bg-gray-50"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></span>
                      )}
                      <button
                        type="button"
                        onClick={() => setStep(i, { images: s.images!.filter(x => x !== path) })}
                        aria-label={t.playbooks.removeImage}
                        className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-gray-500 shadow ring-1 ring-gray-200 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#00704a] hover:underline">
                {uploading === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {uploading === i ? t.playbooks.uploading : t.playbooks.addImage}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  disabled={uploading !== null}
                  onChange={e => {
                    addImages(i, [...(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
              </label>
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

      {textBlock("escalation")}
      {textBlock("controls")}
      {textBlock("completion")}
      {on("definitions") && (
        <section className={card}>
          <BlockHeader title={s.blocks.definitions} hint={s.blockHints.definitions} onRemove={() => removeBlock("definitions")} removeLabel={s.removeSection} />
          {definitions.map((x, i) => (
            <div key={i} className="flex gap-2">
              <input value={x.term} onChange={e => setDefinitions(v => v.map((y, j) => (j === i ? { ...y, term: e.target.value } : y)))} placeholder={s.term} aria-label={s.term} maxLength={120} className={`${field} w-1/3`} />
              <input value={x.definition} onChange={e => setDefinitions(v => v.map((y, j) => (j === i ? { ...y, definition: e.target.value } : y)))} placeholder={s.definition} aria-label={s.definition} maxLength={600} className={field} />
              <button type="button" onClick={() => setDefinitions(v => v.filter((_, j) => j !== i))} aria-label={s.removeRow} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setDefinitions(v => [...v, { term: "", definition: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
            <Plus className="h-4 w-4" /> {s.addTerm}
          </button>
        </section>
      )}
      {on("resources") && (
        <section className={card}>
          <BlockHeader title={s.blocks.resources} hint={s.blockHints.resources} onRemove={() => removeBlock("resources")} removeLabel={s.removeSection} />
          {resources.map((x, i) => (
            <div key={i} className="flex gap-2">
              <input value={x.label} onChange={e => setResources(v => v.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} placeholder={s.resourceLabel} aria-label={s.resourceLabel} maxLength={120} className={`${field} w-1/3`} />
              <input type="url" value={x.url} onChange={e => setResources(v => v.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} placeholder={s.resourceUrl} aria-label={s.resourceUrl} className={field} />
              <button type="button" onClick={() => setResources(v => v.filter((_, j) => j !== i))} aria-label={s.removeRow} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setResources(v => [...v, { label: "", url: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
            <Plus className="h-4 w-4" /> {s.addResource}
          </button>
        </section>
      )}

      {ALL_BLOCKS.some(b => !on(b)) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-500">{s.addSection}:</span>
          {ALL_BLOCKS.filter(b => !on(b)).map(b => (
            <button key={b} type="button" onClick={() => addBlock(b)} className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs font-bold text-gray-600 hover:border-[#009f67] hover:text-[#00704a]">
              <Plus className="h-3 w-3" /> {s.blocks[b]}
            </button>
          ))}
        </div>
      )}

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
        {playbook && d.ack_required && playbook.status === "published" && (
          <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
            <input type="checkbox" checked={reconfirm} onChange={e => setReconfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-600" />
            <span><b>{s.reconfirm}</b><span className="block text-xs">{s.reconfirmHint}</span></span>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700 sm:col-span-2">
          <input type="checkbox" checked={d.department_only} onChange={e => set({ department_only: e.target.checked })} className="h-4 w-4 accent-[#009f67]" />
          {fmt(t.playbooks.departmentOnly, { dept: deptName(t, department) })}
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

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <QualityList p={{ ...d, steps, template, sections: Object.fromEntries(SECTION_KEYS.filter(on).map(k => [k, sections[k] ?? ""])), roles: on("roles") ? roles : [], resources: on("resources") ? resources.filter(r => r.url.trim()) : [], video_url: on("video") ? videoUrl.trim() : null, link_url: d.link_url.trim() || null, owner_person_id: d.owner_person_id || null, review_by: d.review_by || null }} />
      </section>

      <div className="flex justify-end gap-2">
        <Link href={backHref} className="flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">
          {t.common.cancel}
        </Link>
        <button type="button" onClick={save} disabled={busy || uploading !== null} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.playbooks.save}
        </button>
      </div>
    </div>
  );
}

function BlockHeader({ title, hint, onRemove, removeLabel }: { title: string; hint: string; onRemove: () => void; removeLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">{title}</p>
        <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
      </div>
      <button type="button" onClick={onRemove} aria-label={`${removeLabel}: ${title}`} title={removeLabel} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"><X className="h-4 w-4" /></button>
    </div>
  );
}
