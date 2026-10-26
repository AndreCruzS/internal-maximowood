import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyChecklist, type Checklist, type ChecklistData } from "@/lib/checklist";

/** Sales checklists (migration 0032). Read and written like quotes: see src/server/quotesAccess.ts. */

export type ChecklistRow = {
  id: string;
  user_id: string;
  quote_id: string | null;
  title: string;
  status: string;
  data?: unknown;
  header?: unknown;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CHECKLIST_COLUMNS = "id, user_id, quote_id, title, status, data, sent_at, created_at, updated_at";
/** For lists: everything but the form itself (photos can be large), plus the header for the total. */
export const CHECKLIST_LIST_COLUMNS = "id, user_id, quote_id, title, status, header:data->header, sent_at, created_at, updated_at";

export function rowToChecklist(row: ChecklistRow): Checklist {
  const base = emptyChecklist();
  const raw = (row.data && typeof row.data === "object" ? row.data : {}) as Partial<ChecklistData>;
  const header = (row.header && typeof row.header === "object" ? row.header : raw.header) as Record<string, string> | undefined;
  return {
    id: row.id,
    ownerId: row.user_id,
    quoteId: row.quote_id,
    title: row.title,
    status: row.status === "sent" ? "sent" : "draft",
    data: {
      header: header ?? {},
      profiles: Array.isArray(raw.profiles) ? raw.profiles : row.data ? base.profiles : [],
      sections: { ...base.sections, ...(raw.sections ?? {}) },
    },
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type PersonOption = { name: string; email: string | null; logistics: boolean };

/** Everyone in the org chart for the owner / backup pickers, Logistics people first. */
export async function checklistPeople(db: SupabaseClient): Promise<PersonOption[]> {
  const [{ data: people }, { data: positions }] = await Promise.all([
    db.from("people").select("id, full_name, email").eq("active", true).order("full_name"),
    db.from("positions").select("person_id").eq("department_id", "logistics"),
  ]);
  const logistics = new Set(((positions as { person_id: string }[] | null) ?? []).map(p => p.person_id));
  return ((people as { id: string; full_name: string; email: string | null }[] | null) ?? [])
    .map(p => ({ name: p.full_name, email: p.email, logistics: logistics.has(p.id) }))
    .sort((a, b) => Number(b.logistics) - Number(a.logistics) || a.name.localeCompare(b.name));
}
