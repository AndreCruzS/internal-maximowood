import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { loadFeed } from "@/server/news";
import NewsDetail from "@/components/news/NewsDetail";

export const dynamic = "force-dynamic";

export default async function NewsPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [feed, reads] = await Promise.all([
    loadFeed(supabase, user.id, id),
    supabase.from("news_reads").select("user_id, read_at").eq("news_id", id).order("read_at"),
  ]);
  const post = feed.news[0];
  if (!post) notFound();
  return (
    <NewsDetail
      post={post}
      people={feed.people}
      confirmed={feed.confirmedIds.includes(id)}
      reactions={feed.reactions}
      comments={feed.comments}
      commentsOn={feed.commentsOn}
      reads={(reads.data as { user_id: string; read_at: string }[] | null) ?? []}
    />
  );
}
