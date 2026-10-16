import type { SupabaseClient } from "@supabase/supabase-js";
import { selectCompat } from "@/server/compat";
import { NEWS_COLUMNS, NEWS_FEED_COLUMNS, type NewsItem } from "@/server/intranet";
import type { Comment, FeedPerson, Reaction } from "@/components/news/FeedPost";

/** Posts (all, or one) plus what the feed shows around them: who wrote them, reactions, comments, and what you've confirmed. */
export async function loadFeed(supabase: SupabaseClient, userId: string, onlyId?: string) {
  const news = await selectCompat(
    cols => {
      const q = supabase.from("news").select(cols);
      return onlyId ? q.eq("id", onlyId) : q.order("published_at", { ascending: false }).limit(200);
    },
    NEWS_FEED_COLUMNS,
    NEWS_COLUMNS,
  );
  const posts = (news.data as unknown as NewsItem[] | null) ?? [];
  const ids = posts.map(n => n.id);
  const none = { data: [], error: null };
  const [reads, people, positions, reactions, comments] = await Promise.all([
    supabase.from("news_reads").select("news_id").eq("user_id", userId),
    supabase.from("people").select("id, user_id, full_name, photo_url").not("user_id", "is", null),
    supabase.from("positions").select("person_id, department_id").order("sort"),
    ids.length ? supabase.from("news_reactions").select("news_id, user_id, emoji").in("news_id", ids) : Promise.resolve(none),
    // Before migration 0023 there's no comments table: commentsOn is false.
    ids.length ? supabase.from("news_comments").select("id, news_id, user_id, body, created_at").in("news_id", ids).order("created_at") : Promise.resolve(none),
  ]);
  // A person's color is their first position's department.
  const deptOf: Record<string, string | null> = {};
  for (const p of (positions.data as { person_id: string; department_id: string | null }[] | null) ?? []) if (!(p.person_id in deptOf)) deptOf[p.person_id] = p.department_id;
  const map: Record<string, FeedPerson> = {};
  for (const p of (people.data as { id: string; user_id: string; full_name: string; photo_url: string | null }[] | null) ?? []) {
    map[p.user_id] = { name: p.full_name, photo_url: p.photo_url, person_id: p.id, department_id: deptOf[p.id] ?? null };
  }
  return {
    news: posts,
    error: news.error?.message ?? null,
    confirmedIds: ((reads.data as { news_id: string }[] | null) ?? []).map(r => r.news_id),
    people: map,
    reactions: (reactions.data as Reaction[] | null) ?? [],
    comments: (comments.data as Comment[] | null) ?? [],
    commentsOn: !comments.error,
  };
}
