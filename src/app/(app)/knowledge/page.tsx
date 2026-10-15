import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadKnowledge } from "@/server/knowledge";
import KnowledgeView from "@/components/knowledge/KnowledgeView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.knowledge.title} · GMX Group Intranet` };
}

/** Knowledge: request a session, pills, who to ask, upcoming PKs, videos, studies and industry insights. */
export default async function KnowledgePage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadKnowledge(supabase);
  return <KnowledgeView data={data} userId={user.id} />;
}
