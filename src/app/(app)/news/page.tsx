import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { NEWS_COLUMNS, type NewsItem } from "@/server/intranet";
import NewsList from "@/components/news/NewsList";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.news.title} · GMX Group Intranet` };
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [news, reads, people] = await Promise.all([
    supabase.from("news").select(NEWS_COLUMNS).order("published_at", { ascending: false }).limit(200),
    supabase.from("news_reads").select("news_id").eq("user_id", user.id),
    supabase.from("people").select("user_id, full_name").not("user_id", "is", null),
  ]);
  return (
    <NewsList
      news={(news.data as NewsItem[] | null) ?? []}
      readIds={((reads.data as { news_id: string }[] | null) ?? []).map(r => r.news_id)}
      authors={Object.fromEntries(((people.data as { user_id: string; full_name: string }[] | null) ?? []).map(p => [p.user_id, p.full_name]))}
      mustReadOnly={filter === "must-read"}
      error={news.error?.message ?? null}
    />
  );
}
