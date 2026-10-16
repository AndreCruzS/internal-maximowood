import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadFeed } from "@/server/news";
import NewsList from "@/components/news/NewsList";
import { DEPARTMENTS } from "@/lib/intranet";
import { COMPANY_WIDE, PRIORITIES, type Priority } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.news.title} · GMX Group Intranet` };
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ level?: string; team?: string; filter?: string; dept?: string }> }) {
  const { level, team, filter, dept } = await searchParams;
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const feed = await loadFeed(supabase, user.id);
  // Older links: ?filter=must-read and ?dept=<id>.
  const lvl = filter === "must-read" ? "critical" : level;
  const tm = team ?? dept;
  return (
    <NewsList
      {...feed}
      priority={PRIORITIES.includes(lvl as Priority) ? (lvl as Priority) : null}
      team={tm === COMPANY_WIDE || DEPARTMENTS.some(d => d.id === tm) ? tm! : null}
    />
  );
}
