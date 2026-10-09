import type { SupabaseClient } from "@supabase/supabase-js";
export { PLAYBOOK_COLUMNS, type Playbook } from "@/lib/playbooks";

/** Is the signed-in user on this department's team (a position in it or their profile department), or an admin? */
export async function canEditDepartment(supabase: SupabaseClient, department: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const [team, admin] = await Promise.all([supabase.rpc("in_department", { dept: department }), supabase.rpc("is_admin")]);
  return team.data === true || admin.data === true;
}
