import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { travelPolicyId } from "@/server/travel";

export const dynamic = "force-dynamic";

/** A fixed address for the Travel Policy: it's a playbook, chosen in app_settings ("travel_policy"). */
export default async function TravelPolicyPage() {
  const supabase = await getSupabaseServer();
  const id = supabase ? await travelPolicyId(supabase) : null;
  redirect(id ? `/playbooks/${id}` : "/departments/hr#playbooks");
}
