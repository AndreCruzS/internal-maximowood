import { loadPolls } from "@/server/polls";
import { selectCompat } from "@/server/compat";
import { HOLIDAY_COLUMNS, calendarFor, type OfficeHoliday } from "@/lib/holidays";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NewsItem = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  link_url: string | null;
  company_id: string | null;
  department_id: string | null;
  featured: boolean;
  must_read: boolean;
  language: string | null;
  published_at: string;
  author_id: string | null;
};
export type PersonLite = { id: string; full_name: string; user_id: string | null; photo_url: string | null };
export type Absence = { id: string; person_id: string; starts_on: string; ends_on: string; kind: string; note: string; covered_by: string[] | null };
export type Kudo = { id: string; from_person_id: string; to_person_id: string; message: string; created_at: string; category: string | null; gif?: string | null };
export type OnboardingItem = { id: string; title: string; description: string; link: string | null; department_id: string | null; sort: number };

export const NEWS_COLUMNS = "id, title, body, image_url, link_url, company_id, department_id, featured, must_read, language, published_at, author_id";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type PlaybookTodo = { playbook_id: string; title: string; kind: string; due_on: string | null; note: string; since: string; reason: "assigned" | "reconfirm" };

/** Everything the home dashboard shows, in parallel. Missing tables (before 0007) just come back empty. */
export async function loadHome(supabase: SupabaseClient, userId: string) {
  const today = new Date();
  const from = iso(new Date(today.getTime() - 86_400_000));
  const to = iso(new Date(today.getTime() + 14 * 86_400_000));
  // Kudos are public for the week they're given (the client trims to the viewer's week).
  const kudosSince = new Date(today.getTime() - 8 * 86_400_000).toISOString();
  const [news, mustRead, reads, people, absences, kudos, items, progress, celebrations, mine, isIt, itQueue, polls, canPoll, handovers, receiptAsks, todos, holidays] = await Promise.all([
    supabase.from("news").select(NEWS_COLUMNS).order("published_at", { ascending: false }).limit(6),
    supabase.from("news").select("id").eq("must_read", true).limit(200),
    supabase.from("news_reads").select("news_id").eq("user_id", userId),
    supabase.from("people").select("id, full_name, user_id, photo_url").eq("active", true).order("full_name"),
    supabase.from("absences").select("id, person_id, starts_on, ends_on, kind, note, covered_by").gte("ends_on", from).lte("starts_on", to).order("starts_on"),
    selectCompat(
      cols => supabase.from("kudos").select(cols).gte("created_at", kudosSince).order("created_at", { ascending: false }).limit(50),
      "id, from_person_id, to_person_id, message, created_at, category, gif",
      "id, from_person_id, to_person_id, message, created_at, category",
    ),
    supabase.from("onboarding_items").select("id, title, description, link, department_id, sort").order("sort"),
    supabase.from("onboarding_progress").select("item_id").eq("user_id", userId),
    supabase.from("people").select("id, full_name, birth_month, birth_day, start_date").eq("active", true).or("birth_month.not.is.null,start_date.not.is.null"),
    supabase.from("people").select("id, start_date, start_year, office, live_country").eq("user_id", userId).maybeSingle(),
    supabase.rpc("is_it"),
    supabase.from("new_hires").select("id", { count: "exact", head: true }).eq("status", "it_setup"),
    loadPolls(supabase, userId, { openOnly: true, limit: 1 }),
    supabase.rpc("can_create_polls"),
    supabase.rpc("my_handovers"), // errors (→ no banner) until migration 0017
    supabase.from("receipt_requests").select("asked_person_id").eq("status", "open").limit(200), // 0018
    supabase.rpc("my_playbook_todos"), // 0019
    supabase.from("office_holidays").select(HOLIDAY_COLUMNS).gte("day", from).order("day").limit(200), // 0021
  ]);
  // New employee = started in the last 90 days (or, with only a year, this year).
  const me = mine.data as { id: string; start_date: string | null; start_year: number | null; office: string | null; live_country: string | null } | null;
  const isNewEmployee = me?.start_date
    ? Date.now() - new Date(`${me.start_date}T12:00:00`).getTime() <= 90 * 86_400_000
    : me?.start_year === today.getFullYear();
  const readIds = new Set(((reads.data as { news_id: string }[] | null) ?? []).map(r => r.news_id));
  return {
    news: (news.data as NewsItem[] | null) ?? [],
    unreadMustRead: ((mustRead.data as { id: string }[] | null) ?? []).filter(n => !readIds.has(n.id)).length,
    people: (people.data as PersonLite[] | null) ?? [],
    absences: (absences.data as Absence[] | null) ?? [],
    kudos: (kudos.data as Kudo[] | null) ?? [],
    onboarding: {
      items: (items.data as OnboardingItem[] | null) ?? [],
      done: ((progress.data as { item_id: string }[] | null) ?? []).map(p => p.item_id),
    },
    isNewEmployee,
    /** New hires waiting for IT (only counted for the IT team and admins). */
    itQueue: isIt.data === true ? itQueue.count ?? 0 : 0,
    poll: polls[0] ?? null,
    canCreatePolls: canPoll.data === true,
    /** The viewer's own open offboarding: they're asked to fill their handover. */
    /** Colleagues waiting on the viewer for a receipt from their card. */
    receiptAsks: ((receiptAsks.data as { asked_person_id: string }[] | null) ?? []).filter(r => r.asked_person_id === me?.id).length,
    handoverDue: ((handovers.data as { id: string; last_day: string; mine: boolean; handover_at: string | null }[] | null) ?? []).find(h => h.mine) ?? null,
    /** Playbooks sent to the viewer to read, and must-reads changed since they confirmed. */
    playbookTodos: (todos.data as PlaybookTodo[] | null) ?? [],
    /** Upcoming company holidays (all calendars) and the viewer's own calendar. */
    holidays: (holidays.data as OfficeHoliday[] | null) ?? [],
    holidayCalendar: calendarFor(me?.office, me?.live_country),
    celebrations: (celebrations.data as { id: string; full_name: string; birth_month: number | null; birth_day: number | null; start_date: string | null }[] | null) ?? [],
  };
}

export type HomeData = Awaited<ReturnType<typeof loadHome>>;
