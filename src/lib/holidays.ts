/** Company holidays and opening hours by office (migration 0021). */
export const HOLIDAY_CALENDARS = ["gmx-us", "lumberplus-us", "br", "curitiba"] as const;
export type HolidayCalendar = (typeof HOLIDAY_CALENDARS)[number];
export type OfficeHoliday = { id: string; calendar: HolidayCalendar; day: string; name: string; kind: "closed" | "reduced"; opens: string | null; closes: string | null; note: string };
export const HOLIDAY_COLUMNS = "id, calendar, day, name, kind, opens, closes, note";

export const CALENDAR_TZ: Record<HolidayCalendar, string> = {
  "gmx-us": "America/New_York",
  "lumberplus-us": "America/New_York",
  br: "America/Sao_Paulo",
  curitiba: "America/Sao_Paulo",
};
export const CALENDAR_COUNTRY: Record<HolidayCalendar, "US" | "BR"> = { "gmx-us": "US", "lumberplus-us": "US", br: "BR", curitiba: "BR" };

/**
 * The calendar someone sees first: HR's choice for them (0033), else the Brazil calendar for the
 * Brazil team (0034), else from their office (remote: their country).
 */
export function calendarFor(office: string | null | undefined, liveCountry?: string | null, override?: string | null, workCountry?: string | null): HolidayCalendar {
  if (override && (HOLIDAY_CALENDARS as readonly string[]).includes(override)) return override as HolidayCalendar;
  if (workCountry === "BR") return "br";
  if (office === "curitiba") return "curitiba";
  if (office?.startsWith("lumberplus")) return "lumberplus-us";
  if (office === "aventura") return "gmx-us";
  return liveCountry === "BR" ? "br" : "gmx-us";
}

/** Which calendars someone can open: the Brazil team and HR see them all, the US team only its own. */
export const visibleCalendars = (own: HolidayCalendar, opts: { brazilTeam: boolean; hrEditor: boolean }): HolidayCalendar[] =>
  opts.brazilTeam || opts.hrEditor ? [...HOLIDAY_CALENDARS] : [own];

/** Rows that apply to a calendar: Curitiba also closes on Brazil's national holidays (the city row wins on the same day). */
export function holidaysFor(cal: HolidayCalendar, rows: OfficeHoliday[]): OfficeHoliday[] {
  const own = rows.filter(r => r.calendar === cal);
  if (cal !== "curitiba") return own.sort((a, b) => a.day.localeCompare(b.day));
  const days = new Set(own.map(r => r.day));
  return [...own, ...rows.filter(r => r.calendar === "br" && !days.has(r.day))].sort((a, b) => a.day.localeCompare(b.day));
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export const todayIn = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** The next holiday on or after today, with how many days away it is. */
export function nextHoliday(cal: HolidayCalendar, rows: OfficeHoliday[], now = new Date()): { holiday: OfficeHoliday; days: number } | null {
  const today = todayIn(CALENDAR_TZ[cal], now);
  const next = holidaysFor(cal, rows).find(r => r.day >= today);
  if (!next) return null;
  return { holiday: next, days: Math.round((Date.parse(`${next.day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000) };
}

/** "08:00:00" → "8:00 AM" in the viewer's locale. */
export const clock = (t: string, tag: string) => {
  const [h, m] = t.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
};
