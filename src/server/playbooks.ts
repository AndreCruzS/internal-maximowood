import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAYBOOK_COLUMNS, PLAYBOOK_COLUMNS_LEGACY } from "@/lib/playbooks";
import { selectCompat } from "@/server/compat";
export { PLAYBOOK_COLUMNS, type Playbook } from "@/lib/playbooks";

type Result<T> = { data: T | null; error: { code?: string; message: string } | null };
/** Select playbooks with the template/version columns, falling back to the older ones until migration 0019 runs. */
export const selectPlaybooks = <T>(run: (columns: string) => PromiseLike<Result<T>>) => selectCompat(run, PLAYBOOK_COLUMNS, PLAYBOOK_COLUMNS_LEGACY);

/** Can the signed-in user send playbooks to people (its team, leaders, HR, admins)? False before migration 0019. */
export async function canAssignPlaybook(supabase: SupabaseClient, playbookId: string): Promise<boolean> {
  const { data } = await supabase.rpc("can_assign_playbook", { pb: playbookId });
  return data === true;
}

/** Is the signed-in user on this department's team (a position in it or their profile department), or an admin? */
export async function canEditDepartment(supabase: SupabaseClient, department: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const [team, admin] = await Promise.all([supabase.rpc("in_department", { dept: department }), supabase.rpc("is_admin")]);
  return team.data === true || admin.data === true;
}
