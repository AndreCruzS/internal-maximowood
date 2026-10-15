import type { SupabaseClient } from "@supabase/supabase-js";
import { KNOWLEDGE_COLUMNS, REQUEST_COLUMNS, type Expert, type KnowledgeItem, type KnowledgeRequest } from "@/lib/knowledge";

/** Everything the Knowledge page shows. Empty lists before migration 0017. */
export async function loadKnowledge(supabase: SupabaseClient) {
  const [items, requests, people, canEdit, admin] = await Promise.all([
    supabase.from("knowledge_items").select(KNOWLEDGE_COLUMNS).order("created_at", { ascending: false }).limit(300),
    supabase.from("knowledge_requests").select(REQUEST_COLUMNS).order("created_at", { ascending: false }).limit(100),
    supabase.from("people").select("id, full_name, photo_url, skills, user_id").eq("active", true).order("full_name"),
    supabase.rpc("can_edit_knowledge"),
    supabase.rpc("is_admin"),
  ]);
  const list = (people.data as (Expert & { user_id: string | null })[] | null) ?? [];
  return {
    items: (items.data as KnowledgeItem[] | null) ?? [],
    requests: (requests.data as KnowledgeRequest[] | null) ?? [],
    people: list.map(p => ({ id: p.id, full_name: p.full_name, photo_url: p.photo_url, skills: p.skills })),
    /** auth user id → name, for "requested by" and "added by". */
    userNames: Object.fromEntries(list.filter(p => p.user_id).map(p => [p.user_id!, p.full_name])),
    canEdit: canEdit.data === true,
    isAdmin: admin.data === true,
  };
}

export type KnowledgeData = Awaited<ReturnType<typeof loadKnowledge>>;
