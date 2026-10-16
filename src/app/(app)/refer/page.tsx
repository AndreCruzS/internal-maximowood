import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadReferrals } from "@/server/referrals";
import ReferView from "@/components/referrals/ReferView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.refer.title} · GMX Group Intranet` };
}

/** Employee referrals: the program, the form, the viewer's referrals and (for Recruiting) every referral and the open roles. */
export default async function ReferPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadReferrals(supabase, user);
  if (!data.ready) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.home.comingSoon}</p>;
  }
  return <ReferView data={data} />;
}
