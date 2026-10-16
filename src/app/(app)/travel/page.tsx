import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadTravel } from "@/server/travel";
import TravelView from "@/components/travel/TravelView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.travel.title} · GMX Group Intranet` };
}

/** Travel requests: a 4-step request form, the viewer's requests, and (for Procurement) the queue. */
export default async function TravelPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadTravel(supabase, user);
  if (!data.ready) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.home.comingSoon}</p>;
  }
  return <TravelView data={data} />;
}
