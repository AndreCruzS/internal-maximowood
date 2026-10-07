"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent, CalendarSource } from "@/server/calendar";

export const SOURCE_LABEL: Record<CalendarSource, string> = { us: "🇺🇸 US holiday", br: "🇧🇷 Brazil holiday", company: "Company" };
const SOURCE_STYLE: Record<CalendarSource, string> = {
  us: "bg-blue-50 text-blue-800 border-blue-200",
  br: "bg-amber-50 text-amber-900 border-amber-200",
  company: "bg-[#e6f6f0] text-[#00704a] border-[#9fdcc5]",
};
const FLAG: Record<CalendarSource, string> = { us: "🇺🇸", br: "🇧🇷", company: "" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local "YYYY-MM-DD" of an event's start (all-day dates are already local dates). */
export const eventDay = (e: CalendarEvent) => (e.allDay ? e.start : localYmd(new Date(e.start)));
const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function formatWhen(e: CalendarEvent): string {
  if (e.allDay) {
    const [y, m, d] = e.start.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · All day";
  }
  const s = new Date(e.start);
  const date = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${t(s)}${e.end ? ` – ${t(new Date(e.end))}` : ""}`;
}

export function EventChip({ e }: { e: CalendarEvent }) {
  return (
    <p className={`truncate rounded border px-1.5 py-0.5 text-[11px] font-bold ${SOURCE_STYLE[e.source]}`} title={`${e.title} — ${SOURCE_LABEL[e.source]}`}>
      {FLAG[e.source] && <span className="mr-1">{FLAG[e.source]}</span>}
      {e.title}
    </p>
  );
}

// Dates and times show in the viewer's time zone, so render only in the browser.
const noSubscribe = () => () => {};
export const useMounted = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/** A month grid (Sunday-first, 6 weeks) plus the month's events as a list. */
export default function CalendarView({ month, events, companyConnected, failed }: {
  /** "YYYY-MM" */
  month: string;
  events: CalendarEvent[];
  companyConnected: boolean;
  failed: CalendarSource[];
}) {
  const mounted = useMounted();
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const gridStart = new Date(y, m - 1, 1 - firstDay.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = eventDay(e);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const today = localYmd(new Date());
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    return `/calendar?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthEvents = events.filter(e => eventDay(e).startsWith(month));

  if (!mounted) return <div className="h-96 animate-pulse rounded-xl bg-white" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-gray-900">
          {firstDay.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h1>
        <div className="flex items-center gap-2">
          <Link href={shift(-1)} className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link href="/calendar" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold hover:bg-gray-50">
            Today
          </Link>
          <Link href={shift(1)} className="rounded-lg border border-gray-300 bg-white p-2 hover:bg-gray-50" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(["company", "us", "br"] as const).map(s => (
          <span key={s} className={`rounded-full border px-2.5 py-1 font-bold ${SOURCE_STYLE[s]}`}>{SOURCE_LABEL[s]}</span>
        ))}
        {!companyConnected && <span className="py-1 text-gray-500">Company calendar not connected yet.</span>}
        {failed.length > 0 && (
          <span className="py-1 text-red-700">Couldn&apos;t load: {failed.map(f => SOURCE_LABEL[f]).join(", ")}.</span>
        )}
      </div>

      {/* Month grid (hidden on phones; the list below covers them) */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-bold uppercase tracking-wider text-gray-500">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(d => {
            const k = localYmd(d);
            const inMonth = d.getMonth() === m - 1;
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} className={`min-h-28 border-b border-r border-gray-100 p-1.5 ${inMonth ? "" : "bg-gray-50/60"}`}>
                <p
                  className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    k === today ? "bg-[#009f67] text-white" : inMonth ? "text-gray-700" : "text-gray-300"
                  }`}
                >
                  {d.getDate()}
                </p>
                <div className="space-y-1">
                  {list.slice(0, 3).map(e => (
                    <EventChip key={e.id} e={e} />
                  ))}
                  {list.length > 3 && <p className="text-[11px] font-bold text-gray-500">+{list.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-black text-gray-900">This month</h2>
        {monthEvents.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {monthEvents.map(e => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="w-44 shrink-0 text-gray-500">{formatWhen(e)}</span>
                <span className="flex-1 font-bold text-gray-900">
                  {FLAG[e.source] && <span className="mr-1.5">{FLAG[e.source]}</span>}
                  {e.title}
                </span>
                {e.location && <span className="text-xs text-gray-400">{e.location}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
