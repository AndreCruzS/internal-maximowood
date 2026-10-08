import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import Checklist from "@/components/onboarding/Checklist";
import type { OnboardingItem } from "@/server/intranet";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.onboarding.title} · GMX Group Intranet` };
}

export default async function OnboardingPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const [{ t }, items, progress] = await Promise.all([
    getDict(),
    supabase.from("onboarding_items").select("id, title, description, link, department_id, sort").order("sort"),
    supabase.from("onboarding_progress").select("item_id").eq("user_id", user.id),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">{t.onboarding.title}</h1>
        <p className="text-gray-500">{t.onboarding.subtitle}</p>
      </div>
      <Checklist
        items={(items.data as OnboardingItem[] | null) ?? []}
        done={((progress.data as { item_id: string }[] | null) ?? []).map(p => p.item_id)}
      />
    </div>
  );
}
