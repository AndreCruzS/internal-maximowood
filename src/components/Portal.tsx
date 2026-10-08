"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, LifeBuoy, Newspaper, Star } from "lucide-react";
import { BRAND, DEPARTMENTS, TOOLS, toolsFor } from "@/lib/intranet";
import ToolLink from "@/components/ToolLink";
import StarButton from "@/components/StarButton";
import { EventChip, eventDay, formatWhen, useMounted } from "@/components/CalendarView";
import { CelebrationsList, NewJoinersList } from "@/components/Celebrations";
import WhosOut from "@/components/home/WhosOut";
import Kudos from "@/components/home/Kudos";
import { MustReadBanner, OnboardingCard } from "@/components/home/HomeBanners";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { deptName } from "@/lib/i18n/text";
import type { CalendarEvent } from "@/server/calendar";
import type { HomeData } from "@/server/intranet";

// Greeting depends on the viewer's clock; the server (UTC) renders a neutral one.
const noSubscribe = () => () => {};
function useHour() {
  return useSyncExternalStore(noSubscribe, () => new Date().getHours(), () => -1);
}

export function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-black text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-400">
      {icon}
      {text}
    </div>
  );
}

function UpcomingEvents({ events }: { events: CalendarEvent[] }) {
  const mounted = useMounted();
  const { t, tag } = useI18n();
  if (!mounted) return <div className="h-32" />;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const next = events.filter(e => eventDay(e) >= today).slice(0, 5);
  if (next.length === 0) return <EmptyState icon={<CalendarDays className="h-6 w-6" />} text={t.home.nothingUpcoming} />;
  return (
    <ul className="space-y-2.5">
      {next.map(e => {
        const [, m, day] = eventDay(e).split("-").map(Number);
        return (
          <li key={e.id} className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-200 leading-none">
              <span className="text-[10px] font-bold uppercase text-gray-500">{new Date(2000, m - 1, 1).toLocaleDateString(tag, { month: "short" })}</span>
              <span className="text-lg font-black text-gray-900">{day}</span>
            </span>
            <span className="min-w-0 flex-1">
              <EventChip e={e} />
              <span className="mt-0.5 block truncate text-xs text-gray-500">{formatWhen(e, tag, t.calendar.allDay)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Quick links: the viewer's ⭐ shortcuts, or the default pinned tools until they pick their own. */
function QuickLinks() {
  const { t } = useI18n();
  const me = useMe();
  if (me.loaded && me.shortcuts.length > 0) {
    return (
      <div className="-mx-2">
        {me.shortcuts.map(s => (
          <Link
            key={s.id}
            href={s.href}
            {...(s.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{s.title}</span>
            <StarButton title={s.title} href={s.href} external={s.external} />
            {s.external ? <ArrowUpRight className="h-4 w-4 text-gray-300" /> : <ChevronRight className="h-4 w-4 text-gray-300" />}
          </Link>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="-mx-2">
        {TOOLS.filter(x => x.pinned).map(x => (
          <ToolLink key={x.href} tool={x} />
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-400">{t.home.shortcutsHint}</p>
    </>
  );
}

/** GMX intranet home. */
export default function Portal({ name, events, home }: { name: string; isAdmin: boolean; events: CalendarEvent[]; home: HomeData }) {
  const { t, tag } = useI18n();
  const me = useMe();
  const hour = useHour();
  const greeting = hour < 0 ? t.home.welcome : hour < 12 ? t.home.morning : hour < 18 ? t.home.afternoon : t.home.evening;
  const displayName = me.name || name;
  const firstName = displayName.split("@")[0].split(/[ .]/)[0];
  const first = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "";
  const featured = home.news.find(n => n.featured) ?? null;
  const recent = home.news.filter(n => n.id !== featured?.id).slice(0, 4);
  const doneItems = home.onboarding.items.filter(i => home.onboarding.done.includes(i.id)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900">
          {greeting}
          {first ? `, ${first}` : ""}
        </h1>
        <p className="text-gray-500">{t.home.welcomeTo}</p>
      </div>

      <MustReadBanner count={home.unreadMustRead} />
      <OnboardingCard total={home.onboarding.items.length} done={doneItems} />

      {/* Featured + Quick links */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section
          className="relative overflow-hidden rounded-xl p-8 text-white shadow-sm lg:col-span-2"
          style={{ background: `linear-gradient(135deg, ${BRAND.greenDark} 0%, ${BRAND.green} 100%)` }}
        >
          {featured?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featured.image_url} alt="" aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-2/5 object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent,black_40%)] md:block" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/gmx-symbol.png" alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-72 w-72 opacity-15 brightness-0 invert" />
          )}
          <p className="relative text-xs font-bold uppercase tracking-widest text-white/80">{featured ? t.news.featured : t.home.heroLabel}</p>
          <h2 className="relative mt-2 max-w-md text-3xl font-black leading-tight">{featured ? featured.title : t.home.heroTitle}</h2>
          <p className="relative mt-3 line-clamp-3 max-w-md text-white/85">{featured ? featured.body : t.home.heroText}</p>
          {featured ? (
            <Link href={`/news/${featured.id}`} className="relative mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#00704a] hover:bg-white/90">
              {t.home.readMore} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <a href="#departments" className="relative mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#00704a] hover:bg-white/90">
              {t.home.explore} <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </section>

        <Panel title={me.shortcuts.length ? t.home.myShortcuts : t.home.quickLinks}>
          <QuickLinks />
        </Panel>
      </div>

      {/* News + Events */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.home.recentNews} action={<Link href="/news" className="text-sm font-bold text-[#00704a] hover:underline">{t.common.seeAll}</Link>}>
          {recent.length === 0 && !featured ? (
            <EmptyState icon={<Newspaper className="h-6 w-6" />} text={t.home.noNews} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {(recent.length ? recent : featured ? [featured] : []).map(n => (
                <li key={n.id}>
                  <Link href={`/news/${n.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    {n.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.image_url} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-[#e6f6f0]"><Newspaper className="h-5 w-5 text-[#00704a]" /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-gray-900">{n.title}</span>
                      <span className="block text-xs text-gray-500">
                        {new Date(n.published_at).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" })}
                        {n.department_id ? ` · ${deptName(t, n.department_id)}` : ""}
                        {n.must_read && <span className="ml-1.5 rounded bg-amber-100 px-1 font-bold text-amber-800">{t.news.mustRead}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t.home.upcomingEvents} action={<Link href="/calendar" className="text-sm font-bold text-[#00704a] hover:underline">{t.common.seeAll}</Link>}>
          <UpcomingEvents events={events} />
        </Panel>
      </div>

      {/* People moments */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title={t.absences.title}>
          <WhosOut absences={home.absences} people={home.people} />
        </Panel>
        <Panel title={t.home.celebrations} action={<Link href="/people" className="text-sm font-bold text-[#00704a] hover:underline">{t.nav.people}</Link>}>
          <CelebrationsList people={home.celebrations} />
        </Panel>
        <Panel title={t.home.newJoiners}>
          <NewJoinersList people={home.celebrations} />
        </Panel>
      </div>

      <Panel title={t.kudos.title}>
        <Kudos kudos={home.kudos} people={home.people} />
      </Panel>

      {/* Departments */}
      <section id="departments" className="scroll-mt-24">
        <h2 className="mb-3 font-black text-gray-900">{t.home.departments}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEPARTMENTS.map(d => {
            const Icon = d.icon;
            const count = toolsFor(d.id).length;
            return (
              <Link
                key={d.id}
                href={`/departments/${d.id}`}
                className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#009f67] hover:shadow-md"
              >
                <Icon className="h-5 w-5 text-[#00704a]" />
                <p className="mt-3 font-bold text-gray-900">{deptName(t, d.id)}</p>
                <p className="text-xs text-gray-500">{count ? plural(t.home, "tools", count) : t.department.allResources}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Help */}
      <section className="flex flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "rgba(0,159,103,0.1)" }}>
          <LifeBuoy className="h-5 w-5 text-[#00704a]" />
        </span>
        <div className="flex-1">
          <p className="font-bold text-gray-900">{t.home.helpTitle}</p>
          <p className="text-sm text-gray-500">{t.home.helpText}</p>
        </div>
        <Link href="/help" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50">
          {t.home.getHelp}
        </Link>
      </section>
    </div>
  );
}
