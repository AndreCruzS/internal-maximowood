/**
 * Intranet calendar: national public holidays (United States, Brazil) from
 * Google's public holiday calendars, plus the company's own Google Calendar
 * through its private iCal address (COMPANY_CALENDAR_ICS_URL — one or more
 * URLs separated by spaces or commas). No Google credentials needed.
 */

export type CalendarSource = "us" | "br" | "company";
export type CalendarLocale = "en" | "es" | "pt";

export type CalendarEvent = {
  id: string;
  title: string;
  /** All-day: "YYYY-MM-DD". Timed: ISO 8601 UTC. */
  start: string;
  end: string | null;
  allDay: boolean;
  location: string;
  source: CalendarSource;
};

const HOLIDAY_FEEDS: Record<"us" | "br", string> = { us: "usa", br: "brazilian" };
const FEED_LANG: Record<CalendarLocale, string> = { en: "en", es: "es", pt: "pt-br" };
const REVALIDATE_SECONDS = 6 * 60 * 60;

const holidayUrl = (country: "us" | "br", locale: CalendarLocale) =>
  `https://calendar.google.com/calendar/ical/${FEED_LANG[locale]}.${HOLIDAY_FEEDS[country]}%23holiday%40group.v.calendar.google.com/public/basic.ics`;

// ── ICS parsing ──────────────────────────────────────────────────────────────
type RawEvent = Record<string, { value: string; params: Record<string, string> }[]>;

/** Unfold lines and split VEVENT blocks into property maps. */
export function parseIcs(text: string): RawEvent[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const [name, ...paramParts] = line.slice(0, colon).split(";");
      const params = Object.fromEntries(paramParts.map(p => p.split("=") as [string, string]));
      (cur[name.toUpperCase()] ??= []).push({ value: line.slice(colon + 1), params });
    }
  }
  return events;
}

const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
const first = (e: RawEvent, k: string) => e[k]?.[0];

/** ICS date/time → { allDay, date } (date in UTC; floating/TZID times treated as UTC-ish wall time). */
function icsDate(prop: { value: string; params: Record<string, string> } | undefined): { allDay: boolean; date: Date } | null {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || prop.params.VALUE === "DATE") return { allDay: true, date: new Date(Date.UTC(+y, +mo - 1, +d)) };
  if (z) return { allDay: false, date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) };
  // TZID / floating: interpret in that zone via Intl offset.
  return { allDay: false, date: zonedToUtc(+y, +mo - 1, +d, +h, +mi, +s, prop.params.TZID) };
}

function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz?: string): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, mi, s));
  if (!tz) return guess;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(guess);
    const get = (t: string) => +(parts.find(p => p.type === t)?.value ?? 0);
    const asZone = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return new Date(guess.getTime() - (asZone - guess.getTime()));
  } catch {
    return guess;
  }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Occurrence start times for an event within [from, to), expanding simple RRULEs. */
function occurrences(e: RawEvent, start: Date, from: Date, to: Date): Date[] {
  const rule = first(e, "RRULE")?.value;
  if (!rule) return start >= new Date(from.getTime() - DAY) && start < to ? [start] : [];
  const r = Object.fromEntries(rule.split(";").map(p => p.split("=") as [string, string]));
  const interval = Math.max(1, +(r.INTERVAL ?? 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? icsDate({ value: r.UNTIL, params: {} })?.date ?? to : to;
  const end = until < to ? new Date(until.getTime() + 1) : to;
  const exdates = new Set((e.EXDATE ?? []).flatMap(x => x.value.split(",").map(v => icsDate({ value: v, params: x.params })?.date.getTime())));
  const byDay = r.BYDAY ? r.BYDAY.split(",").map(x => WEEKDAYS.indexOf(x.slice(-2))) : null;
  const out: Date[] = [];
  let n = 0;
  const push = (d: Date) => {
    n++;
    if (d >= from && d < to && !exdates.has(d.getTime())) out.push(d);
  };
  const MAX_STEPS = 5000;
  if (r.FREQ === "WEEKLY") {
    const days = byDay?.length ? byDay : [start.getUTCDay()];
    const weekStart = new Date(start.getTime() - start.getUTCDay() * DAY);
    for (let w = 0, steps = 0; n < count && steps < MAX_STEPS; w += interval, steps++) {
      for (const wd of [...days].sort()) {
        const d = new Date(weekStart.getTime() + (w * 7 + wd) * DAY);
        if (d < start) continue;
        if (d >= end || n >= count) return out;
        push(d);
      }
    }
    return out;
  }
  for (let i = 0, steps = 0; n < count && steps < MAX_STEPS; i += interval, steps++) {
    const d = new Date(start);
    if (r.FREQ === "DAILY") d.setUTCDate(d.getUTCDate() + i);
    else if (r.FREQ === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + i);
    else if (r.FREQ === "YEARLY") d.setUTCFullYear(d.getUTCFullYear() + i);
    else return start >= from && start < to ? [start] : [];
    if (d >= end) break;
    push(d);
  }
  return out;
}

function toEvents(raw: RawEvent[], source: CalendarSource, from: Date, to: Date, keep?: (e: RawEvent) => boolean): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of raw) {
    if (keep && !keep(e)) continue;
    if (first(e, "STATUS")?.value === "CANCELLED") continue;
    const s = icsDate(first(e, "DTSTART"));
    if (!s) continue;
    const en = icsDate(first(e, "DTEND"));
    const duration = en ? en.date.getTime() - s.date.getTime() : s.allDay ? DAY : 0;
    const uid = first(e, "UID")?.value ?? Math.random().toString(36);
    for (const occ of occurrences(e, s.date, from, to)) {
      const endDate = duration ? new Date(occ.getTime() + duration) : null;
      out.push({
        id: `${source}:${uid}:${occ.getTime()}`,
        title: unescape(first(e, "SUMMARY")?.value ?? "(No title)"),
        start: s.allDay ? ymd(occ) : occ.toISOString(),
        end: endDate ? (s.allDay ? ymd(endDate) : endDate.toISOString()) : null,
        allDay: s.allDay,
        location: unescape(first(e, "LOCATION")?.value ?? ""),
        source,
      });
    }
  }
  return out;
}

async function fetchIcs(url: string): Promise<RawEvent[]> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`Calendar feed ${res.status}`);
  return parseIcs(await res.text());
}

/** National public holidays only (Google marks observances like DST separately). */
async function holidays(country: "us" | "br", locale: CalendarLocale, from: Date, to: Date): Promise<CalendarEvent[]> {
  // Classify with the English feed ("Public holiday" vs "Observance"), name with the viewer's language.
  const [en, local] = await Promise.all([
    fetchIcs(holidayUrl(country, "en")),
    locale === "en" ? Promise.resolve(null) : fetchIcs(holidayUrl(country, locale)).catch(() => null),
  ]);
  const isNational = (e: RawEvent) => unescape(first(e, "DESCRIPTION")?.value ?? "").trim() === "Public holiday";
  const nationalUids = new Set(en.filter(isNational).map(e => first(e, "UID")?.value));
  const source = local ?? en;
  return toEvents(source, country, from, to, e => nationalUids.has(first(e, "UID")?.value));
}

export function companyCalendarUrls(): string[] {
  return (process.env.COMPANY_CALENDAR_ICS_URL ?? "").split(/[\s,]+/).map(s => s.trim()).filter(s => /^https:\/\//.test(s));
}

export type CalendarResult = { events: CalendarEvent[]; companyConnected: boolean; failed: CalendarSource[] };

/** Events overlapping [from, to), sorted by start. Feeds that fail are reported, not fatal. */
export async function getCalendarEvents(from: Date, to: Date, locale: CalendarLocale = "en"): Promise<CalendarResult> {
  const companyUrls = companyCalendarUrls();
  const jobs: { source: CalendarSource; run: () => Promise<CalendarEvent[]> }[] = [
    { source: "us", run: () => holidays("us", locale, from, to) },
    { source: "br", run: () => holidays("br", locale, from, to) },
    ...companyUrls.map(url => ({ source: "company" as const, run: async () => toEvents(await fetchIcs(url), "company", from, to) })),
  ];
  const settled = await Promise.allSettled(jobs.map(j => j.run()));
  const events: CalendarEvent[] = [];
  const failed = new Set<CalendarSource>();
  settled.forEach((r, i) => (r.status === "fulfilled" ? events.push(...r.value) : failed.add(jobs[i].source)));
  events.sort((a, b) => a.start.localeCompare(b.start) || a.source.localeCompare(b.source));
  return { events, companyConnected: companyUrls.length > 0, failed: [...failed] };
}

/** From yesterday (time-zone slack) through the next `days` days. */
export function getUpcomingEvents(days = 60, locale: CalendarLocale = "en"): Promise<CalendarResult> {
  const from = new Date(Date.now() - 86_400_000);
  return getCalendarEvents(from, new Date(from.getTime() + days * 86_400_000), locale);
}
