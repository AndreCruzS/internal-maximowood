"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight, BadgeCheck, FileSpreadsheet, FileText, FileType, Film, Folder, Globe, Link2, Pencil, Plus, Presentation, Search,
  SquarePen, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import StarButton from "@/components/StarButton";
import { COMPANIES, DEPARTMENTS, companyName, type CompanyId } from "@/lib/intranet";
import { LOCALES, LOCALE_NAMES, fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";

export type LinkRow = {
  id: string;
  title: string;
  url: string;
  description: string;
  kind: string;
  language: string | null;
  company_id: string | null;
  department_id: string | null;
  visibility: "everyone" | "department";
  pinned: boolean;
  sort: number;
  owner_id: string | null;
  reviewed_at: string | null;
};

export const LINK_KINDS = ["web_app", "doc", "sheet", "slides", "pdf", "folder", "form", "video", "other"] as const;
const KIND_ICON: Record<string, typeof Globe> = {
  web_app: Globe, doc: FileText, sheet: FileSpreadsheet, slides: Presentation, pdf: FileType, folder: Folder, form: SquarePen, video: Film, other: Link2,
};

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

function LinkForm({ link, defaultDept, onDone }: { link: Partial<LinkRow> | null; defaultDept: string | null; onDone: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    title: link?.title ?? "", url: link?.url ?? "", description: link?.description ?? "", kind: link?.kind ?? "doc",
    language: link?.language ?? "", company_id: link?.company_id ?? "", department_id: link?.department_id ?? defaultDept ?? (me.isAdmin ? "" : me.departmentId ?? ""),
    visibility: link?.visibility ?? "everyone",
  });
  const set = (p: Partial<typeof d>) => setD(x => ({ ...x, ...p }));
  const depts = me.isAdmin ? DEPARTMENTS : DEPARTMENTS.filter(x => x.id === me.departmentId);

  const save = async () => {
    const supabase = getSupabase();
    if (!supabase || !d.title.trim() || !/^https?:\/\//i.test(d.url.trim())) return toast.error(`${t.resources.formTitle} + ${t.resources.url} (https://…)`);
    setBusy(true);
    const row = {
      title: d.title.trim(), url: d.url.trim(), description: d.description.trim(), kind: d.kind, language: d.language || null,
      company_id: d.company_id || null, department_id: d.department_id || (me.isAdmin ? null : me.departmentId),
      visibility: d.department_id ? d.visibility : "everyone",
    };
    const { error } = link?.id
      ? await supabase.from("links").update(row).eq("id", link.id)
      : await supabase.from("links").insert({ ...row, owner_id: me.userId, reviewed_at: new Date().toISOString().slice(0, 10) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.common.saved);
    onDone();
    router.refresh();
  };

  return (
    <div className="grid gap-3 rounded-xl border border-[#9fdcc5] bg-[#f7fcfa] p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-1"><label className={label}>{t.resources.formTitle}</label><input value={d.title} onChange={e => set({ title: e.target.value })} className={field} /></div>
      <div className="sm:col-span-2"><label className={label}>{t.resources.url}</label><input value={d.url} onChange={e => set({ url: e.target.value })} placeholder="https://drive.google.com/…" className={field} /></div>
      <div className="sm:col-span-2 lg:col-span-3"><label className={label}>{t.resources.description}</label><input value={d.description} onChange={e => set({ description: e.target.value })} className={field} /></div>
      <div><label className={label}>{t.resources.kind}</label>
        <select value={d.kind} onChange={e => set({ kind: e.target.value })} className={field}>{LINK_KINDS.map(k => <option key={k} value={k}>{t.resources.kinds[k]}</option>)}</select></div>
      <div><label className={label}>{t.resources.language}</label>
        <select value={d.language} onChange={e => set({ language: e.target.value })} className={field}><option value="">—</option>{LOCALES.map(l => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}</select></div>
      <div><label className={label}>{t.resources.company}</label>
        <select value={d.company_id} onChange={e => set({ company_id: e.target.value })} className={field}><option value="">{t.resources.allCompanies}</option>{COMPANIES.filter(c => c.id !== "gmx").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className={label}>{t.resources.department}</label>
        <select value={d.department_id} onChange={e => set({ department_id: e.target.value })} className={field}>{me.isAdmin && <option value="">{t.resources.allDepartments}</option>}{depts.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}</select></div>
      <div><label className={label}>{t.resources.visibility}</label>
        <select value={d.visibility} disabled={!d.department_id} onChange={e => set({ visibility: e.target.value as LinkRow["visibility"] })} className={field}>
          <option value="everyone">{t.resources.everyone}</option><option value="department">{t.resources.departmentOnly}</option></select></div>
      <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-1">
        <button type="button" onClick={onDone} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700">{t.common.cancel}</button>
        <button type="button" onClick={save} disabled={busy} className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">{t.common.save}</button>
      </div>
    </div>
  );
}

/** The official documents & links registry; filters, ⭐ shortcuts, and editing for admins / department leaders. */
export default function ResourceList({ links, owners, department, compact }: {
  links: LinkRow[];
  owners: Record<string, string>;
  /** Fixed to one department (department pages); otherwise filterable. */
  department?: string;
  compact?: boolean;
}) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState(department ?? "all");
  const [kind, setKind] = useState("all");
  const [company, setCompany] = useState("all");
  const [editing, setEditing] = useState<Partial<LinkRow> | null | "new">(null);

  const list = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return links
      .filter(l => dept === "all" || l.department_id === dept)
      .filter(l => kind === "all" || l.kind === kind)
      .filter(l => company === "all" || l.company_id === company || !l.company_id)
      .filter(l => terms.every(term => `${l.title} ${l.description}`.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sort - b.sort || a.title.localeCompare(b.title));
  }, [links, q, dept, kind, company]);

  const canAdd = me.isAdmin || me.role === "leader";
  const select = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm";
  const reviewed = async (l: LinkRow) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("links").update({ reviewed_at: new Date().toISOString().slice(0, 10) }).eq("id", l.id);
    if (error) toast.error(error.message);
    else router.refresh();
  };
  const remove = async (l: LinkRow) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(t.common.confirmDelete)) return;
    const { error } = await supabase.from("links").delete().eq("id", l.id);
    if (error) toast.error(error.message);
    else router.refresh();
  };

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.common.search} className={`${select} w-56 pl-8`} aria-label={t.common.search} />
          </div>
          {!department && (
            <select value={dept} onChange={e => setDept(e.target.value)} className={select} aria-label={t.resources.department}>
              <option value="all">{t.resources.allDepartments}</option>
              {DEPARTMENTS.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
            </select>
          )}
          <select value={kind} onChange={e => setKind(e.target.value)} className={select} aria-label={t.resources.kind}>
            <option value="all">{t.resources.allTypes}</option>
            {LINK_KINDS.map(k => <option key={k} value={k}>{t.resources.kinds[k]}</option>)}
          </select>
          <select value={company} onChange={e => setCompany(e.target.value)} className={select} aria-label={t.resources.company}>
            <option value="all">{t.common.all}</option>
            {COMPANIES.filter(c => c.id !== "gmx").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {canAdd && editing === null && (
            <button type="button" onClick={() => setEditing("new")} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" /> {t.resources.add}
            </button>
          )}
        </div>
      )}
      {compact && canAdd && (me.canManage(department) || me.isAdmin) && editing === null && (
        <button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
          <Plus className="h-4 w-4" /> {t.resources.add}
        </button>
      )}
      {editing !== null && <LinkForm link={editing === "new" ? null : editing} defaultDept={department ?? null} onDone={() => setEditing(null)} />}

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{t.resources.empty}</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {list.map(l => {
            const Icon = KIND_ICON[l.kind] ?? Link2;
            const manage = me.canManage(l.department_id);
            return (
              <li key={l.id} className="group flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e6f6f0]"><Icon className="h-4 w-4 text-[#00704a]" /></span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-bold text-gray-900 group-hover:text-[#00704a]">
                    <span className="truncate">{l.title}</span> <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                  </span>
                  {l.description && <span className="block truncate text-sm text-gray-500">{l.description}</span>}
                  <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold text-gray-500">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">{t.resources.kinds[l.kind as keyof typeof t.resources.kinds] ?? l.kind}</span>
                    {l.department_id && !department && <span className="rounded bg-gray-100 px-1.5 py-0.5">{deptName(t, l.department_id)}</span>}
                    {l.company_id && <span className="rounded bg-gray-100 px-1.5 py-0.5">{companyName(l.company_id as CompanyId)}</span>}
                    {l.language && <span className="rounded bg-gray-100 px-1.5 py-0.5 uppercase">{l.language}</span>}
                    {l.visibility === "department" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{t.resources.departmentOnly}</span>}
                    {l.reviewed_at && <span className="flex items-center gap-1 text-gray-400"><BadgeCheck className="h-3 w-3" /> {fmt(t.resources.reviewed, { date: new Date(`${l.reviewed_at}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" }) })}</span>}
                    {l.owner_id && owners[l.owner_id] && <span className="text-gray-400">{fmt(t.resources.owner, { name: owners[l.owner_id] })}</span>}
                  </span>
                </a>
                <span className="flex shrink-0 items-center gap-0.5">
                  <StarButton title={l.title} href={l.url} external />
                  {manage && (
                    <>
                      <button type="button" onClick={() => reviewed(l)} title={t.resources.markReviewed} aria-label={t.resources.markReviewed} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-[#00704a]"><BadgeCheck className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditing(l)} aria-label={t.common.edit} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => remove(l)} aria-label={t.common.delete} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
