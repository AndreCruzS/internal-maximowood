"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, Mail, MessageSquare, Phone, X } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { companyName, type CompanyId } from "@/lib/intranet";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import PersonFacts from "@/components/PersonFacts";
import { Photo, colorOf, gmailLink, ringCentralLink, slackLink } from "@/components/people/shared";
import type { Person, Position } from "@/components/PeopleView";
import OrgAdmin from "@/components/people/OrgAdmin";

type Kudo = { id: string; from_person_id: string; message: string; created_at: string };

/** Monday 00:00 of the viewer's week (kudos are public for the week they're given). */
function weekStartIso() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString();
}

/** Side panel with someone's profile: contact (Gmail / Slack / RingCentral), facts, departments, kudos, manager, reports. */
export default function PersonPanel({ position: clicked, people, positions, isAdmin = false, onSelect, onClose }: {
  /** The position that was clicked (org chart) or the person's main one (directory). */
  position: Position;
  /** Admins can edit positions, managers and levels from here. */
  isAdmin?: boolean;
  people: Person[];
  positions: Position[];
  onSelect: (p: Position) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const positionById = useMemo(() => new Map(positions.map(p => [p.id, p])), [positions]);
  // The latest copy (after an admin edit refreshes the page); falls back to another of their positions if it was removed.
  const position = positionById.get(clicked.id) ?? positions.find(p => p.person_id === clicked.person_id) ?? clicked;
  const person = byId.get(position.person_id);
  const [kudos, setKudos] = useState<{ personId: string; items: Kudo[] } | null>(null);

  useEffect(() => {
    const id = person?.id;
    const supabase = getSupabase();
    if (!id || !supabase) return;
    let active = true;
    supabase
      .from("kudos")
      .select("id, from_person_id, message, created_at")
      .eq("to_person_id", id)
      .gte("created_at", weekStartIso())
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (active) setKudos({ personId: id, items: (data as Kudo[] | null) ?? [] });
      });
    return () => {
      active = false;
    };
  }, [person?.id]);

  if (!person) return null;
  const color = colorOf(position.department_id);
  const mine = positions.filter(x => x.person_id === person.id);
  const manager = position.reports_to ? positionById.get(position.reports_to) : null;
  const managerPerson = manager ? byId.get(manager.person_id) : null;
  const reports = positions.filter(x => x.reports_to === position.id);
  const weekKudos = kudos?.personId === person.id ? kudos.items : [];
  const label = (d: string | null, team: string | null) => {
    const name = deptName(t, d);
    return team && d && !name.toLowerCase().includes(team.toLowerCase()) ? `${name} · ${team}` : name;
  };

  const contact: { href: string; icon: typeof Mail; text: string; title: string }[] = [];
  if (person.email) contact.push({ href: gmailLink(person.email), icon: Mail, text: "Gmail", title: person.email });
  if (person.slack_id) contact.push({ href: slackLink(person.slack_id), icon: MessageSquare, text: "Slack", title: "Slack" });
  if (person.phone) contact.push({ href: ringCentralLink(person.phone), icon: Phone, text: "RingCentral", title: person.phone });

  const personRow = (p: Position) => {
    const pp = byId.get(p.person_id);
    if (!pp) return null;
    return (
      <button key={p.id} type="button" onClick={() => onSelect(p)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-gray-50">
        <Photo person={pp} size={32} color={colorOf(p.department_id)} />
        <span>
          <span className="block font-bold text-gray-900">{pp.full_name}</span>
          <span className="block text-xs text-gray-500">{p.title}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onClick={onClose}>
      <aside className="h-full w-full max-w-sm overflow-y-auto bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="relative px-6 pb-6 pt-8 text-white" style={{ background: color }}>
          <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded p-1 hover:bg-white/20" aria-label={t.common.close}>
            <X className="h-5 w-5" />
          </button>
          <Photo person={person} size={72} color={color} inverse />
          <p className="mt-4 text-xl font-black">
            {person.full_name}
            {person.nickname ? <span className="font-normal text-white/80"> “{person.nickname}”</span> : null}
          </p>
          <p className="text-sm text-white/90">{mine.map(x => x.title).join(" · ")}</p>
          {person.headline && <p className="mt-2 text-sm italic text-white/90">“{person.headline}”</p>}
          <Link href={`/people/${person.id}`} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold hover:bg-white/30">
            {t.me.viewProfile} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="space-y-6 p-6 text-sm">
          {contact.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {contact.map(c => (
                <a key={c.text} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" title={c.title}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-800 hover:border-[#009f67] hover:text-[#00704a]">
                  <c.icon className="h-4 w-4" /> {c.text}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">{person.user_id ? t.people.noContact : t.people.contactLater}</p>
          )}

          <PersonFacts p={person} />

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.people.departmentsLabel}</p>
            <div className="flex flex-wrap gap-1.5">
              {mine.map(x => (
                <span key={x.id} className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: colorOf(x.department_id) }}>
                  {label(x.department_id, x.team)}
                </span>
              ))}
            </div>
            {person.company_id && <p className="mt-2 text-xs text-gray-500">{companyName(person.company_id as CompanyId)}</p>}
          </div>

          {weekKudos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.people.kudos}</p>
              <ul className="space-y-2">
                {weekKudos.map(k => (
                  <li key={k.id} className="flex gap-2">
                    <Heart className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-pink-400 text-pink-400" />
                    <span>
                      <span className="text-gray-700">{k.message}</span>{" "}
                      <span className="text-xs text-gray-400">{t.kudos.from.replace("{name}", byId.get(k.from_person_id)?.full_name ?? "—")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isAdmin && <OrgAdmin person={person} people={people} positions={positions} />}

          {manager && managerPerson && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.people.reportsTo}</p>
              {personRow(manager)}
            </div>
          )}
          {reports.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{fmt(t.people.directReports, { n: reports.length })}</p>
              {reports.map(personRow)}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
