import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { selectCompat } from "@/server/compat";
import { NEWS_COLUMNS, NEWS_FEED_COLUMNS, type NewsItem } from "@/server/intranet";
import NewsEditor from "@/components/news/NewsEditor";

export const dynamic = "force-dynamic";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data } = supabase
    ? await selectCompat(cols => supabase.from("news").select(cols).eq("id", id).maybeSingle(), NEWS_FEED_COLUMNS, NEWS_COLUMNS)
    : { data: null };
  if (!data) notFound();
  return <NewsEditor post={data as unknown as NewsItem} />;
}
