"use client";

import { Cake, Clock, Languages, Lightbulb, MapPin, PartyPopper } from "lucide-react";
import { useMounted } from "@/components/CalendarView";
import { officeById, yearsSince } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { monthName } from "@/lib/i18n/text";

export type PersonalFields = {
  languages?: string[] | null;
  office?: string | null;
  birth_month?: number | null;
  birth_day?: number | null;
  start_date?: string | null;
  skills?: string[] | null;
};

/** "3:42 PM" in a time zone, rendered in the browser. */
export function LocalTime({ timeZone }: { timeZone: string }) {
  const mounted = useMounted();
  const { tag } = useI18n();
  if (!mounted) return null;
  return <>{new Date().toLocaleTimeString(tag, { timeZone, hour: "numeric", minute: "2-digit" })}</>;
}

/** Office + local time, languages, birthday, years with the company and "ask me about" — whatever the person filled in. */
export default function PersonFacts({ p, compact }: { p: PersonalFields; compact?: boolean }) {
  const { t, tag } = useI18n();
  const office = officeById(p.office);
  const years = p.start_date ? yearsSince(p.start_date) : null;
  const row = `flex items-center gap-2 ${compact ? "text-xs" : "text-sm"} text-gray-600`;
  const icon = "h-3.5 w-3.5 shrink-0 text-gray-400";
  return (
    <div className="space-y-1">
      {office && (
        <p className={row}>
          <MapPin className={icon} /> {office.name}
          {office.timeZone && (
            <span className="flex items-center gap-1 text-gray-400">
              · <Clock className="h-3 w-3" /> <LocalTime timeZone={office.timeZone} />
            </span>
          )}
        </p>
      )}
      {p.languages && p.languages.length > 0 && (
        <p className={row}><Languages className={icon} /> {p.languages.join(", ")}</p>
      )}
      {p.birth_month && p.birth_day && (
        <p className={row}><Cake className={icon} /> {monthName(tag, p.birth_month)} {p.birth_day}</p>
      )}
      {years !== null && (
        <p className={row}>
          <PartyPopper className={icon} /> {years === 0 ? t.facts.joinedThisYear : plural(t.facts, "years", years)}
        </p>
      )}
      {p.skills && p.skills.length > 0 && (
        <div className={`${row} items-start`}>
          <Lightbulb className={`${icon} mt-1`} />
          <span className="flex flex-wrap gap-1">
            <span className="sr-only">{t.about.askMe}:</span>
            {p.skills.map(s => <span key={s} className="rounded-full bg-[#e6f6f0] px-2 py-0.5 text-xs font-bold text-[#00704a]">{s}</span>)}
          </span>
        </div>
      )}
    </div>
  );
}
