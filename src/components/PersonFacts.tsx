"use client";

import { Cake, Clock, Languages, MapPin, PartyPopper } from "lucide-react";
import { useMounted } from "@/components/CalendarView";
import { MONTHS, officeById, yearsSince } from "@/lib/intranet";

export type PersonalFields = {
  languages?: string[] | null;
  office?: string | null;
  birth_month?: number | null;
  birth_day?: number | null;
  start_date?: string | null;
};

/** "3:42 PM" in a time zone, rendered in the browser. */
export function LocalTime({ timeZone }: { timeZone: string }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return <>{new Date().toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" })}</>;
}

/** Office + local time, languages, birthday and years with the company — whatever the person filled in. */
export default function PersonFacts({ p, compact }: { p: PersonalFields; compact?: boolean }) {
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
        <p className={row}><Cake className={icon} /> {MONTHS[p.birth_month - 1]} {p.birth_day}</p>
      )}
      {years !== null && (
        <p className={row}>
          <PartyPopper className={icon} /> {years === 0 ? "Joined this year" : `${years} year${years === 1 ? "" : "s"} at GMX Group`}
        </p>
      )}
    </div>
  );
}
