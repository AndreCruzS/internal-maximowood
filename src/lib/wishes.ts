/**
 * Birthday / work-anniversary wishes (migration 0027). Pure helpers: when a celebration is
 * open for wishes, and which wishes belong to it.
 */

export type Occasion = "birthday" | "anniversary";

export type Wish = {
  id: string;
  to_person_id: string;
  from_person_id: string;
  occasion: Occasion;
  occasion_year: number;
  message: string;
  created_at: string;
};

export const WISH_COLUMNS = "id, to_person_id, from_person_id, occasion, occasion_year, message, created_at";
export const WISH_MAX = 500;
/** Late wishes are welcome for a week after the day. */
export const WISH_LATE_DAYS = 7;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * This year's celebration day, if wishes are open: from the day itself until WISH_LATE_DAYS
 * after it (in the viewer's local time). Feb 29 birthdays are celebrated on Feb 28 in other years.
 */
export function wishWindow(month: number | null, day: number | null, now: Date): { year: number; date: string } | null {
  if (!month || !day) return null;
  const year = now.getFullYear();
  const lastDay = new Date(year, month, 0).getDate();
  const date = new Date(year, month - 1, Math.min(day, lastDay));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  return diff >= 0 && diff <= WISH_LATE_DAYS ? { year, date: ymd(date) } : null;
}

/** Anniversary month/day from a start date (YYYY-MM-DD), only from the first full year. */
export function anniversaryDay(startDate: string | null, now: Date): { month: number; day: number } | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) return null;
  if (Number(startDate.slice(0, 4)) >= now.getFullYear()) return null;
  return { month: Number(startDate.slice(5, 7)), day: Number(startDate.slice(8, 10)) };
}

export const wishesFor = (wishes: Wish[], personId: string, occasion: Occasion, year: number) =>
  wishes
    .filter(w => w.to_person_id === personId && w.occasion === occasion && w.occasion_year === year)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

export const cleanWish = (message: string) => message.replace(/\s+\n/g, "\n").trim().slice(0, WISH_MAX);
