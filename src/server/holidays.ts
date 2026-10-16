import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HOLIDAY_COLUMNS, calendarFor, type HolidayCalendar, type OfficeHoliday } from "@/lib/holidays";

export type HolidayPerson = { id: string; full_name: string; photo_url: string | null; company_id: string | null; country: "US" | "BR" | null; departments: string[] };
export type HolidayAbsence = { id: string; person_id: string; starts_on: string; ends_on: string; kind: string; note: string; covered_by: string[] };
export type HolidaysData = {
  ready: boolean;
  holidays: OfficeHoliday[];
  defaultCalendar: HolidayCalendar;
  month: string; // YYYY-MM
  absences: HolidayAbsence[];
  people: HolidayPerson[];
  canEdit: boolean;
  myPersonId: string | null;
};

const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
};

/** Office holidays (all calendars), the month's absences with who's out, and the people filters need. */
export async function loadHolidays(supabase: SupabaseClient, user: User, month: string): Promise<HolidaysData> {
  const { from, to } = monthBounds(month);
  const [holidays, absences, people, editor] = await Promise.all([
    supabase.from("office_holidays").select(HOLIDAY_COLUMNS).order("day"),
    supabase.from("absences").select("id, person_id, starts_on, ends_on, kind, note, covered_by").lte("starts_on", to).gte("ends_on", from).order("starts_on"),
    supabase.from("people").select("id, full_name, photo_url, company_id, office, live_country, user_id, positions(department_id)").eq("active", true).order("full_name"),
    supabase.rpc("is_hr_editor"),
  ]);
  type Row = { id: string; full_name: string; photo_url: string | null; company_id: string | null; office: string | null; live_country: string | null; user_id: string | null; positions: { department_id: string | null }[] };
  const rows = (people.data as Row[] | null) ?? [];
  const me = rows.find(p => p.user_id === user.id) ?? null;
  const country = (p: Row) => (p.live_country === "BR" || p.live_country === "US" ? p.live_country : p.office === "curitiba" ? "BR" : p.office ? "US" : null);
  return {
    ready: !holidays.error,
    holidays: (holidays.data as OfficeHoliday[] | null) ?? [],
    defaultCalendar: calendarFor(me?.office, me?.live_country),
    month,
    absences: (absences.data as HolidayAbsence[] | null) ?? [],
    people: rows.map(p => ({
      id: p.id, full_name: p.full_name, photo_url: p.photo_url, company_id: p.company_id, country: country(p),
      departments: [...new Set(p.positions.map(x => x.department_id).filter(Boolean) as string[])],
    })),
    canEdit: editor.data === true,
    myPersonId: me?.id ?? null,
  };
}
