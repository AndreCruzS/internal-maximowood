import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getDict } from "@/lib/i18n/server";
import { loadAccessPage } from "@/server/access";
import AccessView from "@/components/hr/AccessView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.access.title} · GMX Group Intranet` };
}

/** HR and admins: who can sign in (W2 + Brazil team), the W2 list import and each person's HR fields. */
export default async function AccessPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data: hr } = await supabase.rpc("is_hr_editor");
  if (hr !== true) redirect("/hr");
  const admin = getSupabaseAdmin();
  const data = admin ? await loadAccessPage(admin) : { ready: false as const, error: "SUPABASE_SERVICE_ROLE_KEY is not configured" };
  return <AccessView initial={data} />;
}
