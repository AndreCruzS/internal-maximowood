import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NEWS_COLUMNS, type NewsItem } from "@/server/intranet";
import NewsEditor from "@/components/news/NewsEditor";

export const dynamic = "force-dynamic";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data } = supabase ? await supabase.from("news").select(NEWS_COLUMNS).eq("id", id).maybeSingle() : { data: null };
  if (!data) notFound();
  return <NewsEditor post={data as NewsItem} />;
}
