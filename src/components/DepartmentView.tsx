"use client";

import { useState } from "react";
import Link from "next/link";
import { AppWindow, Network, Users } from "lucide-react";
import { COMPANIES, companyColor, departmentById, toolsFor, type CompanyId, type DepartmentId, type Tool } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { deptDescription, deptName } from "@/lib/i18n/text";
import ToolLink from "@/components/ToolLink";
import ResourceList, { type LinkRow } from "@/components/resources/ResourceList";
import FaqList, { type Faq } from "@/components/help/FaqList";
import PlaybookList from "@/components/playbooks/PlaybookList";
import type { Playbook } from "@/lib/playbooks";

export type TeamMember = { personId: string; name: string; photo: string | null; titles: string[]; team: string | null };

function Section({ id, title, action, children }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

/** Team-added web apps (links of kind "web_app") shown as tool cards. */
const linkTool = (l: LinkRow, department: DepartmentId): Tool => ({
  name: l.title,
  description: l.description,
  icon: AppWindow,
  href: l.url,
  department,
  company: (l.company_id ?? "gmx") as CompanyId,
  external: true,
});

/**
 * A department, Whale-style: Tools (color-coded by brand), Playbooks & documents
 * (SOPs, policies, rules, checklists, guides + linked docs), FAQs, and the team.
 * One brand filter at the top applies to all of it; group-wide items always show.
 */
export default function DepartmentView({ id, links, owners, faqs, playbooks, peopleNames, team, canEdit }: {
  id: DepartmentId;
  links: LinkRow[];
  owners: Record<string, string>;
  faqs: Faq[];
  playbooks: Playbook[];
  peopleNames: Record<string, string>;
  team: TeamMember[];
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const Icon = departmentById(id)!.icon;
  const [brand, setBrand] = useState<string>("all");
  const forBrand = (company: string | null) => brand === "all" || !company || company === brand;

  // GMX Group tools are group-wide, so they show under every brand.
  const tools = [...toolsFor(id), ...links.filter(l => l.kind === "web_app").map(l => linkTool(l, id))].filter(x => forBrand(x.company === "gmx" ? null : x.company));
  const docs = links.filter(l => l.kind !== "web_app" && forBrand(l.company_id));
  const books = playbooks.filter(p => forBrand(p.company_id));

  // Brands that actually have something on this page (plus the current choice).
  const brands = COMPANIES.filter(
    c =>
      c.id === brand ||
      toolsFor(id).some(x => x.company === c.id) ||
      links.some(l => l.company_id === c.id) ||
      playbooks.some(p => p.company_id === c.id),
  );

  const nav = [
    ["tools", t.department.tools],
    ["playbooks", t.department.playbooks],
    ["faq", t.department.faq],
    ["people", t.department.people],
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "rgba(0,159,103,0.1)" }}>
          <Icon className="h-6 w-6 text-[#00704a]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-gray-900">{deptName(t, id)}</h1>
          <p className="text-gray-500">{deptDescription(t, id)}</p>
        </div>
      </div>

      <div className="sticky top-16 z-20 -mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-200 bg-[#F7F8F7]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <nav aria-label={t.department.jump} className="flex gap-4 text-sm font-bold text-gray-500">
          {nav.map(([anchor, label]) => (
            <a key={anchor} href={`#${anchor}`} className="hover:text-[#00704a]">{label}</a>
          ))}
        </nav>
        {brands.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.department.brandFilter}>
            <button
              type="button"
              onClick={() => setBrand("all")}
              aria-pressed={brand === "all"}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${brand === "all" ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-600"}`}
            >
              {t.department.allBrands}
            </button>
            {brands.map(c => {
              const on = brand === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBrand(on ? "all" : c.id)}
                  aria-pressed={on}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
                  style={on ? { background: c.color, borderColor: c.color, color: "#fff" } : { borderColor: `${c.color}66`, color: c.color, background: "#fff" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : c.color }} /> {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Section id="tools" title={t.department.tools}>
        {tools.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{t.department.noTools}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map(tool => <ToolLink key={tool.href} tool={tool} variant="card" />)}
          </div>
        )}
      </Section>

      <Section
        id="playbooks"
        title={t.department.playbooks}
        action={canEdit && (
          <Link href={`/playbooks/new?dept=${id}`} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white">
            + {t.playbooks.newPlaybook}
          </Link>
        )}
      >
        <PlaybookList playbooks={books} peopleNames={peopleNames} canEdit={canEdit}>
          <ResourceList links={docs} owners={owners} department={id} compact />
        </PlaybookList>
      </Section>

      <Section id="faq" title={t.department.faq}>
        <FaqList faqs={faqs} department={id} />
      </Section>

      <Section
        id="people"
        title={t.department.people}
        action={
          <Link href={`/people?dept=${id}`} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
            <Network className="h-4 w-4" /> {t.department.openOrgChart}
          </Link>
        }
      >
        {team.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500"><Users className="h-4 w-4" /> {t.department.noPeople}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {team.map(p => (
              <li key={p.personId}>
                <Link href={`/people?person=${p.personId}`} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: companyColor(null) }}>{initials(p.name)}</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-gray-900">{p.name}</span>
                    <span className="block truncate text-xs text-gray-500">{p.titles.join(" · ")}{p.team ? ` · ${p.team}` : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
