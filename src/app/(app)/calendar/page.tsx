import CalendarView from "@/components/CalendarView";
import { getCalendarEvents } from "@/server/calendar";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Calendar · GMX Group Intranet" };

const DAY = 86_400_000;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const { month: raw } = await searchParams;
  const now = new Date();
  const month =
    typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)
      ? raw
      : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  // The visible 6-week grid, padded a day each side for time zones.
  const first = Date.UTC(y, m - 1, 1);
  const from = new Date(first - (new Date(first).getUTCDay() + 1) * DAY);
  const to = new Date(from.getTime() + 44 * DAY);
  const { events, companyConnected, failed } = await getCalendarEvents(from, to, await getLocale());
  return <CalendarView month={month} events={events} companyConnected={companyConnected} failed={failed} />;
}
