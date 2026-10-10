import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { onboardingPermissions } from "@/server/onboarding";
import NewHireForm from "@/components/onboarding/NewHireForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a new employee · GMX Group Intranet" };

export default async function NewHirePage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  if (!(await onboardingPermissions(supabase)).canAddHires) redirect("/onboarding");
  const { data } = await supabase.from("people").select("id, full_name, positions(title, sort)").eq("active", true).order("full_name");
  type Row = { id: string; full_name: string; positions: { title: string; sort: number }[] };
  const managers = ((data as unknown as Row[] | null) ?? []).map(p => ({
    id: p.id,
    label: `${p.full_name}${p.positions?.length ? ` — ${[...p.positions].sort((a, b) => a.sort - b.sort)[0].title}` : ""}`,
  }));
  return <NewHireForm managers={managers} />;
}
