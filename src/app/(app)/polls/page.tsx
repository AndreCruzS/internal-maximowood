import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadPolls } from "@/server/polls";
import PollsView from "@/components/polls/PollsView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.poll.title} · GMX Group Intranet` };
}

/** All quick polls; leaders and admins create, close and delete them. */
export default async function PollsPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [polls, canCreate, admin] = await Promise.all([loadPolls(supabase, user.id), supabase.rpc("can_create_polls"), supabase.rpc("is_admin")]);
  return <PollsView polls={polls} canCreate={canCreate.data === true} isAdmin={admin.data === true} userId={user.id} />;
}
