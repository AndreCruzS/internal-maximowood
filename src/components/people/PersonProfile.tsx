"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, Heart, Linkedin, Mail, MessageSquare, Pencil, Phone, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { coverOf } from "@/lib/profile";
import PersonFacts from "@/components/PersonFacts";
import OffboardPanel, { type OpenOffboarding } from "@/components/onboarding/OffboardPanel";
import { Photo, colorOf, gmailLink, ringCentralLink, slackLink } from "@/components/people/shared";
import type { Person, Position } from "@/components/PeopleView";

export type ProfileKudo = { id: string; from_person_id: string; message: string; created_at: string; category: string | null; gif?: string | null };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

const Chips = ({ items, className }: { items: string[]; className: string }) => (
  <ul className="flex flex-wrap gap-1.5">
    {items.map(x => <li key={x} className={`rounded-full px-3 py-1 text-sm font-bold ${className}`}>{x}</li>)}
  </ul>
);

/** A person's full profile: cover, photo, headline, contact, about, ask me about, interests, team and kudos. */
export default function PersonProfile({ person: p, positions, people, kudos, isMe, offboard = null }: {
  person: Person;
  positions: Position[];
  people: Pick<Person, "id" | "full_name" | "photo_url">[];
  kudos: ProfileKudo[];
  isMe: boolean;
  /** Set for leaders, HR and admins viewing someone else. */
  offboard?: { open: OpenOffboarding } | null;
}) {
  const { t, tag } = useI18n();
  const byId = useMemo(() => new Map(people.map(x => [x.id, x])), [people]);
  const positionById = useMemo(() => new Map(positions.map(x => [x.id, x])), [positions]);
  const mine = positions.filter(x => x.person_id === p.id);
  const main = mine[0];
  const color = colorOf(main?.department_id ?? null);
  const managerPos = main?.reports_to ? positionById.get(main.reports_to) : null;
  const manager = managerPos ? byId.get(managerPos.person_id) : null;
  const reports = positions.filter(x => mine.some(m => m.id === x.reports_to) && x.person_id !== p.id);
  const brands = [...new Set([p.company_id, ...(p.companies ?? [])].filter(Boolean) as string[])];

  const contact: { href: string; icon: typeof Mail; text: string }[] = [];
  if (p.email) contact.push({ href: gmailLink(p.email), icon: Mail, text: "Gmail" });
  if (p.slack_id) contact.push({ href: slackLink(p.slack_id), icon: MessageSquare, text: "Slack" });
  if (p.phone) contact.push({ href: ringCentralLink(p.phone), icon: Phone, text: "RingCentral" });
  if (p.linkedin) contact.push({ href: p.linkedin, icon: Linkedin, text: "LinkedIn" });

  const personRow = (pos: Position) => {
    const pp = byId.get(pos.person_id);
    if (!pp) return null;
    return (
      <Link key={pos.id} href={`/people/${pp.id}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-gray-50">
        <Photo person={pp} size={36} color={colorOf(pos.department_id)} />
        <span className="min-w-0">
          <span className="block truncate font-bold text-gray-900">{pp.full_name}</span>
          <span className="block truncate text-xs text-gray-500">{pos.title}</span>
        </span>
      </Link>
    );
  };

  const empty = !p.bio && !(p.skills ?? []).length && !(p.interests ?? []).length && !p.fun_fact;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm font-bold text-[#00704a] hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t.nav.people}
      </Link>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="relative h-36 sm:h-44" style={{ background: coverOf(p.cover) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gmx-symbol.png" alt="" aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-56 w-56 opacity-15 brightness-0 invert" />
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-3">
            <Photo person={p} size={112} color={color} />
            {isMe && (
              <Link href="/profile" className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-800 hover:bg-gray-50">
                <Pencil className="h-4 w-4" /> {t.me.edit}
              </Link>
            )}
          </div>
          <h1 className="mt-4 text-2xl font-black text-gray-900">
            {p.full_name}
            {p.nickname ? <span className="font-normal text-gray-500"> “{p.nickname}”</span> : null}
            {p.pronouns ? <span className="ml-2 align-middle text-sm font-bold text-gray-400">({p.pronouns})</span> : null}
          </h1>
          <p className="text-gray-600">{mine.map(x => x.title).join(" · ")}</p>
          {p.headline && <p className="mt-2 text-lg text-gray-800">{p.headline}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mine.map(x => (
              <Link key={x.id} href={`/departments/${x.department_id}`} className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: colorOf(x.department_id) }}>
                {deptName(t, x.department_id)}
              </Link>
            ))}
            {brands.map(b => (
              <Link key={b} href={`/brands/${b}`} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-bold" style={{ color: companyInk(b) }}>
                {companyName(b as CompanyId)}
              </Link>
            ))}
          </div>
          {contact.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {contact.map(c => (
                <a key={c.text} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-800 hover:border-[#009f67] hover:text-[#00704a]">
                  <c.icon className="h-4 w-4" /> {c.text}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {empty ? (
            <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
              {isMe ? (
                <>
                  {t.me.emptyMine}{" "}
                  <Link href="/profile" className="font-bold text-[#00704a] hover:underline">{t.me.edit}</Link>
                </>
              ) : (
                fmt(t.me.emptyOther, { name: p.full_name.split(" ")[0] })
              )}
            </section>
          ) : (
            <>
              {p.bio && (
                <Card title={t.me.about}>
                  <p className="whitespace-pre-line text-[15px] leading-7 text-gray-800">{p.bio}</p>
                </Card>
              )}
              {(p.skills ?? []).length > 0 && (
                <Card title={t.me.askMe}>
                  <Chips items={p.skills ?? []} className="bg-[#e6f6f0] text-[#00704a]" />
                </Card>
              )}
              {(p.interests ?? []).length > 0 && (
                <Card title={t.me.interests}>
                  <Chips items={p.interests ?? []} className="bg-sky-50 text-sky-800" />
                </Card>
              )}
              {p.fun_fact && (
                <Card title={t.me.funFact}>
                  <p className="flex gap-2 text-gray-800"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> {p.fun_fact}</p>
                </Card>
              )}
            </>
          )}

          {kudos.length > 0 && (
            <Card title={t.people.kudos}>
              <ul className="space-y-3">
                {kudos.map(k => (
                  <li key={k.id} className="flex gap-2 text-sm">
                    <Heart className="mt-0.5 h-4 w-4 shrink-0 fill-pink-400 text-pink-400" />
                    <span>
                      <span className="text-gray-800">{k.message}</span>{" "}
                      {k.gif && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/kudos/${k.gif}.gif`} alt={t.kudos.gifAlt} width={80} height={80} className="my-1 block rounded-lg" />
                      )}
                      <span className="text-xs text-gray-400">
                        {t.kudos.from.replace("{name}", byId.get(k.from_person_id)?.full_name ?? "—")} · {new Date(k.created_at).toLocaleDateString(tag, { month: "short", day: "numeric" })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card title={t.me.details}>
            <div className="text-sm"><PersonFacts p={p} /></div>
          </Card>
          {(manager || reports.length > 0) && (
            <Card title={t.me.team}>
              {manager && managerPos && (
                <>
                  <p className="mb-1 text-xs font-bold text-gray-500">{t.people.reportsTo}</p>
                  {personRow(managerPos)}
                </>
              )}
              {reports.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-xs font-bold text-gray-500">{fmt(t.people.directReports, { n: reports.length })}</p>
                  {reports.map(personRow)}
                </>
              )}
              <Link href={`/people?person=${p.id}`} className="mt-3 block text-sm font-bold text-[#00704a] hover:underline">{t.me.inOrgChart}</Link>
            </Card>
          )}
        </aside>
      </div>

      {offboard && <OffboardPanel personId={p.id} name={p.full_name} open={offboard.open} />}
    </div>
  );
}
