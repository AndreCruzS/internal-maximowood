import type { SupabaseClient } from "@supabase/supabase-js";

/** Owner choices (the department's team first, then everyone) and the categories already used there. */
export async function loadEditorData(supabase: SupabaseClient, department: string) {
  const [people, team, cats] = await Promise.all([
    supabase.from("people").select("id, full_name").eq("active", true).order("full_name"),
    supabase.from("positions").select("person_id").eq("department_id", department),
    supabase.from("playbooks").select("category").eq("department_id", department),
  ]);
  const inTeam = new Set(((team.data as { person_id: string }[] | null) ?? []).map(p => p.person_id));
  const all = (people.data as { id: string; full_name: string }[] | null) ?? [];
  return {
    people: [...all.filter(p => inTeam.has(p.id)), ...all.filter(p => !inTeam.has(p.id))],
    categories: [...new Set(((cats.data as { category: string }[] | null) ?? []).map(c => c.category.trim()).filter(Boolean))].sort(),
  };
}
