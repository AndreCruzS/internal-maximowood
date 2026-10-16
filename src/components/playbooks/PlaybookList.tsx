"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, FileText, ListChecks, Scale, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { QualityChip } from "@/components/playbooks/Quality";
import { companyColor, companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { PLAYBOOK_KINDS, reviewOverdue, type Playbook, type PlaybookKind } from "@/lib/playbooks";

export const KIND_ICON: Record<PlaybookKind, LucideIcon> = {
  sop: ListChecks,
  policy: ShieldCheck,
  rule: Scale,
  checklist: ClipboardCheck,
  guide: BookOpen,
};

const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Playbooks by type (tabs) and category, plus the department's linked documents (`children`). */
export default function PlaybookList({ playbooks, peopleNames, canEdit, department, children }: {
  playbooks: Playbook[];
  /** For the "Assignments" link (the department page). */
  department?: string;
  peopleNames: Record<string, string>;
  canEdit: boolean;
  /** The documents & links list, shown under "Documents". */
  children: React.ReactNode;
}) {
  const { t, tag } = useI18n();
  const mounted = useMounted();
  const [tab, setTab] = useState<"all" | PlaybookKind | "documents">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return playbooks.filter(p => {
      if (tab !== "all" && tab !== "documents" && p.kind !== tab) return false;
      const hay = [
        p.title, p.summary, p.category, p.body, ...p.steps.map(s => `${s.title} ${s.body}`), ...Object.values(p.sections ?? {}),
        ...(p.roles ?? []).map(r => `${r.role} ${r.responsibility} ${r.people.map(id => peopleNames[id] ?? "").join(" ")}`),
        ...(p.definitions ?? []).map(d => `${d.term} ${d.definition}`), ...(p.resources ?? []).map(r => r.label),
      ].join(" ").toLowerCase();
      return terms.every(x => hay.includes(x));
    });
  }, [playbooks, tab, q, peopleNames]);

  const groups = useMemo(() => {
    const m = new Map<string, Playbook[]>();
    for (const p of filtered) {
      const key = p.category.trim() || t.playbooks.uncategorized;
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === t.playbooks.uncategorized ? 1 : b === t.playbooks.uncategorized ? -1 : a.localeCompare(b)));
  }, [filtered, t]);

  const count = (k: PlaybookKind) => playbooks.filter(p => p.kind === k).length;
  const today = mounted ? localYmd() : "";
  const tabs: [typeof tab, string, number | null][] = [
    ["all", t.common.all, playbooks.length],
    ...PLAYBOOK_KINDS.map(k => [k, t.playbooks.kindsPlural[k], count(k)] as [PlaybookKind, string, number]).filter(([, , n]) => n > 0),
    ["documents", t.playbooks.documents, null],
  ];

  const card = (p: Playbook) => {
    const Icon = KIND_ICON[p.kind];
    const color = companyColor(p.company_id);
    const ink = companyInk(p.company_id);
    return (
      <li key={p.id}>
        <Link
          href={`/playbooks/${p.id}`}
          className="flex h-full gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md"
          style={{ borderLeft: `4px solid ${color}` }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
            <Icon className="h-4 w-4" style={{ color: ink }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 uppercase text-gray-600">{t.playbooks.kinds[p.kind]}</span>
              {p.company_id && <span style={{ color: ink }}>{companyName(p.company_id as CompanyId)}</span>}
              {p.status === "draft" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{t.playbooks.draft}</span>}
              {today && reviewOverdue(p.review_by, today) && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">{t.playbooks.reviewDue}</span>}
              {canEdit && <span className="ml-auto"><QualityChip p={p} compact /></span>}
            </span>
            <span className="mt-1 block font-bold text-gray-900">{p.title}</span>
            {p.summary && <span className="block text-sm text-gray-500">{p.summary}</span>}
            <span className="mt-1.5 block text-xs text-gray-400">
              {p.steps.length > 0 && `${plural(t.playbooks, "steps", p.steps.length)} · `}
              {p.owner_person_id && peopleNames[p.owner_person_id] ? `${t.playbooks.owner}: ${peopleNames[p.owner_person_id]} · ` : ""}
              {fmt(t.playbooks.updated, { date: new Date(p.updated_at).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" }) })}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-bold">
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === id ? "bg-[#009f67] text-white" : "text-gray-500 hover:text-gray-900"}`}
            >
              {id === "documents" && <FileText className="h-3.5 w-3.5" />}
              {label}
              {n !== null && <span className={`text-xs ${tab === id ? "text-white/80" : "text-gray-400"}`}>{n}</span>}
            </button>
          ))}
        </div>
        {tab !== "documents" && playbooks.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.playbooks.search} className="h-9 w-56 rounded-lg border border-gray-300 bg-white pl-8 pr-2 text-sm outline-none focus:border-[#009f67]" />
          </div>
        )}
        {canEdit && department && playbooks.some(p => p.status === "published") && (
          <Link href={`/playbooks/assignments?dept=${department}`} className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 hover:border-[#009f67] hover:text-[#00704a]">
            <ClipboardCheck className="h-4 w-4" /> {t.sop.assignments}
          </Link>
        )}
      </div>

      {tab !== "documents" &&
        (filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">
            {q ? t.common.noMatches : canEdit ? t.playbooks.emptyTeam : t.playbooks.empty}
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map(([category, items]) => (
              <div key={category}>
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{category}</p>
                <ul className="grid gap-3 md:grid-cols-2">{items.map(card)}</ul>
              </div>
            ))}
          </div>
        ))}

      {(tab === "all" || tab === "documents") && (
        <div>
          {tab === "all" && <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.playbooks.documents}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
