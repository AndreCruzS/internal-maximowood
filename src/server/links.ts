import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinkRow } from "@/components/resources/ResourceList";

export const LINK_COLUMNS = "id, title, url, description, kind, language, company_id, department_id, visibility, pinned, sort, owner_id, reviewed_at";

/** Links (RLS hides department-only ones from other departments) and their owners' names. */
export async function loadLinks(supabase: SupabaseClient, department?: string) {
  let q = supabase.from("links").select(LINK_COLUMNS);
  if (department) q = q.eq("department_id", department);
  const [links, people] = await Promise.all([q, supabase.from("people").select("user_id, full_name").not("user_id", "is", null)]);
  return {
    links: (links.data as LinkRow[] | null) ?? [],
    owners: Object.fromEntries(((people.data as { user_id: string; full_name: string }[] | null) ?? []).map(p => [p.user_id, p.full_name])),
  };
}
