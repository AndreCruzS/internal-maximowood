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
export type Absence = { id: string; person_id: string; starts_on: string; ends_on: string; kind: string; note: string };
export type Kudo = { id: string; from_person_id: string; to_person_id: string; message: string; created_at: string };
export type OnboardingItem = { id: string; title: string; description: string; link: string | null; department_id: string | null; sort: number };

export const NEWS_COLUMNS = "id, title, body, image_url, link_url, company_id, department_id, featured, must_read, language, published_at, author_id";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the home dashboard shows, in parallel. Missing tables (before 0007) just come back empty. */
export async function loadHome(supabase: SupabaseClient, userId: string) {
  const today = new Date();
  const from = iso(new Date(today.getTime() - 86_400_000));
  const to = iso(new Date(today.getTime() + 14 * 86_400_000));
  const [news, mustRead, reads, people, absences, kudos, items, progress, celebrations] = await Promise.all([
    supabase.from("news").select(NEWS_COLUMNS).order("published_at", { ascending: false }).limit(6),
    supabase.from("news").select("id").eq("must_read", true).limit(200),
    supabase.from("news_reads").select("news_id").eq("user_id", userId),
    supabase.from("people").select("id, full_name, user_id, photo_url").eq("active", true).order("full_name"),
    supabase.from("absences").select("id, person_id, starts_on, ends_on, kind, note").gte("ends_on", from).lte("starts_on", to).order("starts_on"),
    supabase.from("kudos").select("id, from_person_id, to_person_id, message, created_at").order("created_at", { ascending: false }).limit(6),
    supabase.from("onboarding_items").select("id, title, description, link, department_id, sort").order("sort"),
    supabase.from("onboarding_progress").select("item_id").eq("user_id", userId),
    supabase.from("people").select("id, full_name, birth_month, birth_day, start_date").eq("active", true).or("birth_month.not.is.null,start_date.not.is.null"),
  ]);
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
    celebrations: (celebrations.data as { id: string; full_name: string; birth_month: number | null; birth_day: number | null; start_date: string | null }[] | null) ?? [],
  };
}

export type HomeData = Awaited<ReturnType<typeof loadHome>>;
