"use client";

import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useMounted } from "@/components/CalendarView";
import { fmt } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/dictionaries";
import { clock, nextHoliday, type HolidayCalendar, type OfficeHoliday } from "@/lib/holidays";

/** "USA · GMX Office · next holiday — Thanksgiving Day · Nov 26 · Closed · In 41 days" (days in the office's time zone). */
export default function NextHoliday({ calendar, holidays, link = true }: { calendar: HolidayCalendar; holidays: OfficeHoliday[]; link?: boolean }) {
  const { t, tag } = useI18n();
  const h = t.holidays;
  const mounted = useMounted();
  if (!mounted) return null;
  const next = nextHoliday(calendar, holidays);
  if (!next) return null;
  const { holiday, days } = next;
  const when = new Date(`${holiday.day}T12:00:00`).toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const status = holiday.kind === "closed" ? h.closed : fmt(h.hours, { opens: clock(holiday.opens!, tag), closes: clock(holiday.closes!, tag) });
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-sky-200 border-l-4 border-l-sky-500 bg-sky-50 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-sky-800">{h.calendars[calendar]} · {h.nextHoliday}</p>
        <p className="mt-0.5 text-lg font-black text-gray-900">{holiday.name}</p>
        <p className="text-xs text-gray-600">{when} · {status}{holiday.note ? ` · ${holiday.note}` : ""}</p>
        {link && <Link href={`/holidays?calendar=${calendar}`} className="mt-1 inline-block text-xs font-bold text-sky-800 hover:underline">{h.viewAll} →</Link>}
      </div>
      <p className="font-mono text-xl font-bold text-sky-800">{days === 0 ? h.today : plural(h, "inDays", days)}</p>
    </div>
  );
}
