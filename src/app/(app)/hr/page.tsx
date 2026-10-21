import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadTimeOff } from "@/server/timeOff";
import HrView from "@/components/hr/HrView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.hr.title} · GMX Group Intranet` };
}

/** HR self-service: request time off, approve your team's, and the links into Rippling for pay and benefits. */
export default async function HrPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadTimeOff(supabase, user);
  return <HrView data={data} />;
}
