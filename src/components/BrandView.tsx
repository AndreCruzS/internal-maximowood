"use client";

import Link from "next/link";
import { toast } from "sonner";
import { AppWindow, ArrowUpRight, AtSign, Clock, Copy, Globe, Link2, MapPin, Megaphone, Newspaper, Palette, Phone, Presentation, Rocket, Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import { DEPARTMENTS, type CompanyId } from "@/lib/intranet";
import { KIND_ICON as LINK_ICON, type LinkRow } from "@/components/resources/ResourceList";
import { KIND_ICON as PLAYBOOK_ICON } from "@/components/playbooks/PlaybookList";
import type { Playbook } from "@/lib/playbooks";
import type { NewsItem } from "@/server/intranet";

export type BrandLink = {
  id: string;
  kind: "website" | "landing" | "social" | "phone" | "email" | "address" | "hours" | "other";
  platform: string | null;
  label: string;
  value: string;
  sort: number;
};

const SOCIAL_NAMES: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube",
  tiktok: "TikTok", pinterest: "Pinterest", x: "X", whatsapp: "WhatsApp",
};

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "") + new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
};

function LinkList({ links }: { links: BrandLink[] }) {
  return (
    <ul className="divide-y divide-gray-100">
      {links.map(l => (
        <li key={l.id}>
          <a href={l.value} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-gray-900 group-hover:text-[#00704a]">
                {l.kind === "social" ? SOCIAL_NAMES[l.platform ?? ""] ?? l.label : l.label}
              </span>
              <span className="block truncate text-xs text-gray-400">{host(l.value)}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export type BrandPerson = { id: string; full_name: string; photo_url: string | null; positions: { title: string; department_id: string | null; sort: number }[] };
export type BrandTool = { name: string; description: string; href: string; department: string; external: boolean };

function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-black text-gray-900">
        <span className="text-gray-400">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-5 text-sm text-gray-500">{children}</p>
);

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

function Card({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty?: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 font-black text-gray-900">
        <span className="text-[#00704a]">{icon}</span>
        {title}
      </h2>
      {empty ? <p className="py-2 text-sm text-gray-400">{t.brands.nothingYet}</p> : children}
    </section>
  );
}

/**
 * A brand hub. Brand kit, materials, tools, playbooks, news and team fill
 * themselves from what departments tag with this brand; only the tagline and
 * channels & contact are kept by hand.
 */
export default function BrandView({ brand, page, links, docs, tools, playbooks, news, people, error }: {
  brand: { id: CompanyId; name: string; color: string };
  page: { tagline: string; about: string } | null;
  links: BrandLink[];
  docs: LinkRow[];
  tools: BrandTool[];
  playbooks: Playbook[];
  news: NewsItem[];
  people: BrandPerson[];
  error: string | null;
}) {
  const { t, tag } = useI18n();
  const color = brand.color;
  const of = (...kinds: BrandLink["kind"][]) => links.filter(l => kinds.includes(l.kind));
  const CONTACT_ORDER = ["email", "phone", "address", "hours"];
  const contact = of("phone", "email", "address", "hours").sort(
    (a, b) => CONTACT_ORDER.indexOf(a.kind) - CONTACT_ORDER.indexOf(b.kind) || a.sort - b.sort,
  );
  const icon = { phone: Phone, email: AtSign, address: MapPin, hours: Clock } as const;
  const kit = docs.filter(d => d.kind === "brand_kit");
  const materials = docs.filter(d => d.kind !== "brand_kit");
  const dLabel = (d: string | null) => (d ? deptName(t, d) : t.brands.groupWide);

  // Tools and playbooks, grouped by the department that owns them.
  const byDept = DEPARTMENTS.map(d => ({
    id: d.id,
    tools: tools.filter(x => x.department === d.id),
    playbooks: playbooks.filter(p => p.department_id === d.id),
  })).filter(g => g.tools.length || g.playbooks.length);

  // People who list this brand, grouped by the department of their main position.
  const teamGroups = new Map<string, BrandPerson[]>();
  for (const p of people) {
    const main = [...(p.positions ?? [])].sort((a, b) => a.sort - b.sort)[0];
    const key = main?.department_id ?? "";
    teamGroups.set(key, [...(teamGroups.get(key) ?? []), p]);
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(fmt(t.brands.copied, { value }));
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };

  const docRow = (l: LinkRow) => {
    const Icon = LINK_ICON[l.kind] ?? Link2;
    return (
      <li key={l.id}>
        <a href={l.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1a` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-gray-900 group-hover:text-[#00704a]">{l.title}</span>
            <span className="block truncate text-xs text-gray-400">
              {t.resources.kinds[l.kind as keyof typeof t.resources.kinds] ?? l.kind} · {fmt(t.brands.from, { dept: dLabel(l.department_id) })}
              {l.description ? ` · ${l.description}` : ""}
            </span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500" />
        </a>
      </li>
    );
  };

  const nav = [
    ["kit", t.brands.kit],
    ["materials", t.brands.materials],
    ["departments", t.brands.acrossDepartments],
    ["news", t.brands.latestNews],
    ["channels", t.brands.channels],
    ["team", t.brands.team],
  ] as const;

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" style={{ borderTop: `6px solid ${color}` }}>
        <div className="p-6">
          <p className="text-xs font-black uppercase tracking-widest" style={{ color }}>{t.brands.brand}</p>
          <h1 className="text-3xl font-black text-gray-900">{brand.name}</h1>
          {page?.tagline && <p className="mt-1 text-lg text-gray-600">{page.tagline}</p>}
          {page?.about && <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-gray-700">{page.about}</p>}
          <p className="mt-4 text-xs text-gray-400">{fmt(t.brands.autoHint, { brand: brand.name })}</p>
        </div>
        <nav aria-label={t.department.jump} className="flex flex-wrap gap-x-5 gap-y-1 border-t border-gray-100 bg-gray-50 px-6 py-2.5 text-sm font-bold text-gray-500">
          {nav.map(([anchor, label]) => (
            <a key={anchor} href={`#${anchor}`} className="hover:text-[#00704a]">{label}</a>
          ))}
        </nav>
      </header>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fmt(t.common.couldntLoad, { error })}</p>}

      <Section id="kit" title={t.brands.kit} icon={<Palette className="h-5 w-5" />}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-widest text-gray-400">{t.brands.colors}</p>
            <button type="button" onClick={() => copy(color)} className="group flex w-full items-center gap-3 text-left" aria-label={`${t.brands.copy} ${color}`}>
              <span className="h-14 w-14 shrink-0 rounded-xl shadow-inner" style={{ background: color }} />
              <span>
                <span className="block font-mono text-sm font-bold text-gray-900">{color.toUpperCase()}</span>
                <span className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-[#00704a]"><Copy className="h-3 w-3" /> {t.brands.copy}</span>
              </span>
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-2 shadow-sm lg:col-span-2">
            {kit.length ? <ul className="divide-y divide-gray-100">{kit.map(docRow)}</ul> : <p className="py-3 text-sm text-gray-500">{t.brands.kitEmpty}</p>}
          </div>
        </div>
      </Section>

      <Section id="materials" title={t.brands.materials} icon={<Presentation className="h-5 w-5" />}>
        {materials.length ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-2 shadow-sm">
            <ul className="divide-y divide-gray-100">{materials.map(docRow)}</ul>
          </div>
        ) : (
          <Empty>{t.brands.materialsEmpty}</Empty>
        )}
      </Section>

      <Section id="departments" title={t.brands.acrossDepartments} icon={<AppWindow className="h-5 w-5" />}>
        {byDept.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {byDept.map(g => (
              <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <Link href={`/departments/${g.id}`} className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-400 hover:text-[#00704a]">{deptName(t, g.id)} →</Link>
                <ul className="space-y-1">
                  {g.tools.map(x => {
                    const text = t.tools[x.href] ?? { name: x.name, description: x.description };
                    return (
                      <li key={x.href}>
                        <a href={x.href} {...(x.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-gray-50">
                          <AppWindow className="h-4 w-4 shrink-0" style={{ color }} />
                          <span className="min-w-0 truncate text-sm font-bold text-gray-900">{text.name}</span>
                          {x.external && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
                        </a>
                      </li>
                    );
                  })}
                  {g.playbooks.map(p => {
                    const Icon = PLAYBOOK_ICON[p.kind];
                    return (
                      <li key={p.id}>
                        <Link href={`/playbooks/${p.id}`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-gray-50">
                          <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                          <span className="min-w-0 truncate text-sm font-bold text-gray-900">{p.title}</span>
                          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">{t.playbooks.kinds[p.kind]}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t.brands.acrossEmpty}</Empty>
        )}
      </Section>

      <Section id="news" title={t.brands.latestNews} icon={<Newspaper className="h-5 w-5" />}>
        {news.length ? (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
            {news.map(n => (
              <li key={n.id}>
                <Link href={`/news/${n.id}`} className="block px-5 py-3 hover:bg-gray-50">
                  <span className="block text-sm font-bold text-gray-900">{n.title}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(n.published_at).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" })}
                    {n.department_id ? ` · ${deptName(t, n.department_id)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t.department.noNews}</Empty>
        )}
      </Section>

      <Section id="channels" title={t.brands.channels} icon={<Globe className="h-5 w-5" />}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={t.brands.websites} icon={<Globe className="h-4 w-4" />} empty={!of("website").length}>
            <LinkList links={of("website")} />
          </Card>
          <Card title={t.brands.landing} icon={<Rocket className="h-4 w-4" />} empty={!of("landing").length}>
            <LinkList links={of("landing")} />
          </Card>
          <Card title={t.brands.social} icon={<Megaphone className="h-4 w-4" />} empty={!of("social").length}>
            <LinkList links={of("social")} />
          </Card>
          <Card title={t.brands.contact} icon={<Phone className="h-4 w-4" />} empty={!contact.length}>
            <ul className="divide-y divide-gray-100">
              {contact.map(l => {
                const Icon = icon[l.kind as keyof typeof icon];
                const href = l.kind === "phone" ? `tel:${l.value.replace(/[^\d+]/g, "")}` : l.kind === "email" ? `mailto:${l.value}` : null;
                return (
                  <li key={l.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <span className="w-36 shrink-0 font-bold text-gray-700">{l.label}</span>
                    {href ? (
                      <a href={href} className="text-gray-900 hover:text-[#00704a] hover:underline">{l.value}</a>
                    ) : (
                      <span className="text-gray-900">{l.value}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          {of("other").length > 0 && (
            <Card title={t.brands.other} icon={<Link2 className="h-4 w-4" />}>
              <LinkList links={of("other")} />
            </Card>
          )}
        </div>
      </Section>

      <Section id="team" title={t.brands.team} icon={<Users className="h-5 w-5" />}>
        {people.length ? (
          <div className="space-y-4">
            {[...teamGroups.entries()].map(([dept, members]) => (
              <div key={dept || "none"}>
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{dept ? deptName(t, dept) : t.brands.groupWide}</p>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {members.map(p => {
                    const main = [...(p.positions ?? [])].sort((a, b) => a.sort - b.sort)[0];
                    return (
                      <li key={p.id}>
                        <Link href={`/people?person=${p.id}`} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md">
                          {p.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: color }}>{initials(p.full_name)}</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-gray-900">{p.full_name}</span>
                            {main && <span className="block truncate text-xs text-gray-500">{main.title}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t.brands.teamEmpty}</Empty>
        )}
      </Section>
    </div>
  );
}
