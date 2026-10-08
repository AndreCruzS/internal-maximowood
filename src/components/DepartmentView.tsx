"use client";

import Link from "next/link";
import { Newspaper, Users } from "lucide-react";
import { COMPANIES, departmentById, toolsFor, type DepartmentId } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { deptDescription, deptName } from "@/lib/i18n/text";
import ToolLink from "@/components/ToolLink";
import ResourceList, { type LinkRow } from "@/components/resources/ResourceList";
import FaqList, { type Faq } from "@/components/help/FaqList";
import type { NewsItem } from "@/server/intranet";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-black text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

/** A department: its tools by company, documents & links, FAQs, latest news and the team. */
export default function DepartmentView({ id, links, owners, faqs, news, team }: {
  id: DepartmentId;
  links: LinkRow[];
  owners: Record<string, string>;
  faqs: Faq[];
  news: NewsItem[];
  team: { id: string; name: string; title: string; team: string | null }[];
}) {
  const { t, tag } = useI18n();
  const Icon = departmentById(id)!.icon;
  const tools = toolsFor(id);
  const byCompany = COMPANIES.map(c => ({ company: c, tools: tools.filter(x => x.company === c.id) })).filter(g => g.tools.length);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "rgba(0,159,103,0.1)" }}>
          <Icon className="h-6 w-6 text-[#00704a]" />
        </span>
        <div>
          <h1 className="text-2xl font-black text-gray-900">{deptName(t, id)}</h1>
          <p className="text-gray-500">{deptDescription(t, id)}</p>
        </div>
      </div>

      <Section title={t.department.tools}>
        {byCompany.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{t.department.noTools}</p>
        ) : (
          <div className="space-y-6">
            {byCompany.map(({ company, tools }) => (
              <div key={company.id}>
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{company.name}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map(tool => <ToolLink key={tool.href} tool={tool} variant="card" />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <Section title={t.department.documents} action={<Link href="/resources" className="text-sm font-bold text-[#00704a] hover:underline">{t.department.allResources}</Link>}>
            <ResourceList links={links} owners={owners} department={id} compact />
          </Section>
          <Section title={t.department.faq}>
            <FaqList faqs={faqs} department={id} />
          </Section>
        </div>
        <div className="space-y-8">
          <Section title={t.department.news} action={<Link href="/news" className="text-sm font-bold text-[#00704a] hover:underline">{t.common.seeAll}</Link>}>
            {news.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500"><Newspaper className="h-4 w-4" /> {t.department.noNews}</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
                {news.map(n => (
                  <li key={n.id}>
                    <Link href={`/news/${n.id}`} className="block px-4 py-3 hover:bg-gray-50">
                      <span className="block text-sm font-bold text-gray-900">{n.title}</span>
                      <span className="text-xs text-gray-500">{new Date(n.published_at).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={t.department.people} action={<Link href="/people" className="text-sm font-bold text-[#00704a] hover:underline">{t.people.orgChart}</Link>}>
            {team.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500"><Users className="h-4 w-4" /> {t.department.noPeople}</p>
            ) : (
              <ul className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                {team.map(p => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f6f0] text-xs font-black text-[#00704a]">{initials(p.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-gray-900">{p.name}</span>
                      <span className="block truncate text-xs text-gray-500">{p.title}{p.team ? ` · ${p.team}` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
