"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Building2, CheckCircle2, ChevronDown, ClipboardList, Eye, GraduationCap, KeyRound, LifeBuoy, Mail, MessageSquare,
  Network, Palette, Sparkles, UserRound,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { BRAND, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { PLAN_PHASES, type AttemptSummary, type NewHire, type TrainingModule, type TrainingScope } from "@/lib/onboarding";
import { Photo, colorOf, gmailLink, slackLink } from "@/components/people/shared";
import TrainingPath from "@/components/onboarding/TrainingPath";

export type HireContact = { id: string; full_name: string; title: string; photo_url: string | null; email: string | null; slack_id: string | null; department_id: string | null };

const DAY = 86_400_000;

/**
 * The new hire's onboarding page: welcome, the roadmap (accounts → welcome form → GMX → brand → department),
 * the leader's first day / week / month / quarter plan, who to ask, their accounts and the training path.
 */
export default function NewHireHome({ hire: h, firstName, contacts, path, attempts, welcomeDone, preview, trainingLinks = true }: {
  hire: NewHire;
  firstName: string;
  contacts: { manager: HireContact | null; buddy: HireContact | null; addedBy: HireContact | null };
  path: TrainingModule[];
  attempts: Record<string, AttemptSummary>;
  welcomeDone: boolean;
  /** Shown to leaders: "this is what the new hire sees". */
  preview?: boolean;
  /** Off when previewing someone else's path (their modules aren't the viewer's). */
  trainingLinks?: boolean;
}) {
  const { t, tag } = useI18n();
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  const [open, setOpen] = useState<string>("day");

  const scopeDone = (scope: TrainingScope) => {
    const mods = path.filter(m => m.scope === scope);
    return mods.length === 0 ? null : mods.every(m => attempts[m.id]?.passed);
  };
  const steps = [
    { key: "accounts", icon: KeyRound, done: h.status !== "it_setup", href: "#accounts" },
    { key: "welcome", icon: ClipboardList, done: welcomeDone, href: "/welcome" },
    { key: "gmx", icon: Sparkles, done: scopeDone("gmx"), href: "#training" },
    { key: "brand", icon: Palette, done: scopeDone("brand"), href: "#training" },
    { key: "department", icon: GraduationCap, done: scopeDone("department"), href: "#training" },
  ].filter(s => s.done !== null) as { key: keyof typeof t.roadmap.steps; icon: typeof KeyRound; done: boolean; href: string }[];
  const current = steps.findIndex(s => !s.done);

  const start = h.start_date ? new Date(`${h.start_date}T09:00:00`) : null;
  const days = start && mounted ? Math.ceil((start.getTime() - now) / DAY) : null;
  const when = start
    ? days === null ? "" : days > 1 ? fmt(t.roadmap.startsIn, { n: days }) : days === 1 ? t.roadmap.startsTomorrow : days === 0 ? t.roadmap.startsToday : fmt(t.roadmap.dayN, { n: 1 - days })
    : "";

  const tiles = [
    { href: "/brands/gmx", icon: Sparkles, label: t.roadmap.tiles.whoWeAre },
    { href: "/people", icon: Network, label: t.roadmap.tiles.orgChart },
    ...(h.department_id ? [{ href: `/departments/${h.department_id}`, icon: Building2, label: deptName(t, h.department_id) }] : []),
    ...(h.company_id && h.company_id !== "gmx" ? [{ href: `/brands/${h.company_id}`, icon: Palette, label: companyName(h.company_id as CompanyId) }] : []),
    { href: "/profile", icon: UserRound, label: t.roadmap.tiles.profile },
    { href: "/help", icon: LifeBuoy, label: t.roadmap.tiles.help },
  ];

  const people = [
    contacts.manager && { role: t.roadmap.manager, p: contacts.manager },
    contacts.buddy && { role: t.roadmap.buddy, p: contacts.buddy },
    contacts.addedBy && contacts.addedBy.id !== contacts.manager?.id && { role: t.roadmap.addedBy, p: contacts.addedBy },
  ].filter(Boolean) as { role: string; p: HireContact }[];

  return (
    <div className="space-y-8">
      {preview && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          <Eye className="h-4 w-4 shrink-0" /> {t.roadmap.previewBanner}
        </p>
      )}

      {/* Welcome */}
      <section className="relative overflow-hidden rounded-2xl p-8 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${BRAND.greenDark} 0%, ${BRAND.green} 100%)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/gmx-symbol.png" alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-72 w-72 opacity-15 brightness-0 invert" />
        <p className="relative text-xs font-bold uppercase tracking-widest text-white/80">{t.roadmap.label}</p>
        <h1 className="relative mt-2 max-w-xl text-3xl font-black leading-tight">{fmt(t.roadmap.hello, { name: firstName })}</h1>
        <p className="relative mt-2 max-w-xl text-white/90">
          {h.title}
          {h.department_id ? ` · ${deptName(t, h.department_id)}` : ""}
          {h.company_id ? ` · ${companyName(h.company_id as CompanyId)}` : ""}
        </p>
        {start && (
          <p className="relative mt-4 inline-flex flex-wrap items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-bold">
            {fmt(t.roadmap.startDate, { date: start.toLocaleDateString(tag, { weekday: "long", month: "long", day: "numeric" }) })}
            {when && <span className="rounded bg-white px-1.5 py-0.5 text-[#00704a]">{when}</span>}
          </p>
        )}
      </section>

      <nav className="grid grid-cols-3 gap-3 sm:grid-cols-6" aria-label={t.roadmap.label}>
        {tiles.map(x => (
          <Link key={x.href} href={x.href} className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm transition-all hover:border-[#009f67] hover:shadow-md">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6f6f0] text-[#00704a] group-hover:bg-[#009f67] group-hover:text-white">
              <x.icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold leading-tight text-gray-800">{x.label}</span>
          </Link>
        ))}
      </nav>

      {/* Roadmap */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-gray-900">{t.roadmap.title}</h2>
        <p className="text-sm text-gray-500">{t.roadmap.hint}</p>
        <ol className="mt-6 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => {
            const state = s.done ? "done" : i === current ? "now" : "next";
            return (
              <li key={s.key} className="relative flex flex-col items-center text-center">
                {i > 0 && <span className={`absolute right-1/2 top-6 h-1 w-full -translate-y-1/2 ${steps[i - 1].done ? "bg-[#009f67]" : "bg-gray-200"}`} aria-hidden />}
                <a href={s.href}
                  className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white shadow ${
                    state === "done" ? "bg-[#009f67] text-white" : state === "now" ? "bg-sky-500 text-white ring-4 ring-sky-100" : "bg-gray-100 text-gray-400"
                  }`}
                  aria-label={t.roadmap.steps[s.key]}>
                  {state === "done" ? <CheckCircle2 className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                </a>
                <span className="mt-2 text-[11px] font-black uppercase tracking-widest text-gray-400">{fmt(t.roadmap.stepN, { n: i + 1 })}</span>
                <span className={`px-1 text-xs font-bold leading-tight sm:text-sm ${state === "next" ? "text-gray-400" : "text-gray-900"}`}>{t.roadmap.steps[s.key]}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Plan */}
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-lg font-black text-gray-900">{t.roadmap.plan}</h2>
          {h.first_day && (
            <div className="rounded-xl border-2 border-[#009f67] bg-[#f2fbf7] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-[#00704a]">{t.prehire.firstDay}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{h.first_day}</p>
            </div>
          )}
          {PLAN_PHASES.map(phase => {
            const items = (h.plan ?? []).filter(x => x.phase === phase);
            const isOpen = open === phase;
            return (
              <div key={phase} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <button type="button" onClick={() => setOpen(isOpen ? "" : phase)} aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left font-bold text-white" style={{ background: BRAND.greenDark }}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  <span className="flex-1">{t.prehire.phases[phase]}</span>
                  <span className="text-xs font-bold text-white/70">{items.length}</span>
                </button>
                {isOpen && (
                  items.length ? (
                    <ul className="space-y-2 px-5 py-4 text-sm text-gray-800">
                      {items.map((x, i) => (
                        <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#009f67]" />{x.text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-4 text-sm text-gray-400">{t.roadmap.planEmpty}</p>
                  )
                )}
              </div>
            );
          })}
        </section>

        {/* Contacts + accounts */}
        <aside className="space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-black text-gray-900">{t.roadmap.contacts}</h2>
            <ul className="space-y-2">
              {people.map(({ role, p }) => (
                <li key={role} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <Link href={`/people/${p.id}`}><Photo person={p} size={40} color={colorOf(p.department_id)} /></Link>
                  <span className="min-w-0 flex-1">
                    <Link href={`/people/${p.id}`} className="block truncate font-bold text-gray-900 hover:underline">{p.full_name}</Link>
                    <span className="block truncate text-xs text-gray-500">{role} · {p.title}</span>
                  </span>
                  {p.slack_id && <a href={slackLink(p.slack_id)} target="_blank" rel="noopener noreferrer" aria-label="Slack" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><MessageSquare className="h-4 w-4" /></a>}
                  {p.email && <a href={gmailLink(p.email)} target="_blank" rel="noopener noreferrer" aria-label="Gmail" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Mail className="h-4 w-4" /></a>}
                </li>
              ))}
              <li>
                <Link href="/departments/it" className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-[#009f67]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600"><LifeBuoy className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-gray-900">{t.roadmap.itTeam}</span>
                    <span className="block text-xs text-gray-500">{t.roadmap.itHint}</span>
                  </span>
                </Link>
              </li>
            </ul>
          </section>

          <section id="accounts" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-black text-gray-900"><KeyRound className="h-4 w-4 text-gray-400" /> {t.training.yourAccounts}</h2>
            {h.accounts.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">{h.status === "it_setup" ? t.roadmap.accountsPending : "—"}</p>
            ) : (
              <>
                <p className="mb-2 mt-1 text-xs text-gray-500">{t.training.accountsHint}</p>
                <ul className="divide-y divide-gray-100">
                  {h.accounts.map(a => (
                    <li key={a.name} className="flex items-center gap-2 py-2 text-sm">
                      <span className="w-24 shrink-0 font-bold text-gray-900">{a.name}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600">{a.login}</span>
                      {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label={a.name} className="text-[#00704a]"><ArrowUpRight className="h-4 w-4" /></a>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>

      <div id="training" className="scroll-mt-24">
        <TrainingPath path={path} attempts={attempts} links={trainingLinks} />
      </div>
    </div>
  );
}
