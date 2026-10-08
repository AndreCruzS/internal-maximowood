import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NEWS_COLUMNS, type NewsItem } from "@/server/intranet";
import NewsDetail from "@/components/news/NewsDetail";

export const dynamic = "force-dynamic";

export default async function NewsPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data: post } = await supabase.from("news").select(NEWS_COLUMNS).eq("id", id).maybeSingle();
  if (!post) notFound();
  const [reads, reactions, people] = await Promise.all([
    supabase.from("news_reads").select("user_id, read_at").eq("news_id", id).order("read_at"),
    supabase.from("news_reactions").select("user_id, emoji").eq("news_id", id),
    supabase.from("people").select("user_id, full_name").not("user_id", "is", null),
  ]);
  return (
    <NewsDetail
      post={post as NewsItem}
      me={user.id}
      reads={(reads.data as { user_id: string; read_at: string }[] | null) ?? []}
      reactions={(reactions.data as { user_id: string; emoji: string }[] | null) ?? []}
      names={Object.fromEntries(((people.data as { user_id: string; full_name: string }[] | null) ?? []).map(p => [p.user_id, p.full_name]))}
    />
  );
}
