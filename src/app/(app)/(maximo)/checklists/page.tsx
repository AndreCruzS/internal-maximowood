import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import ChecklistList from "@/components/checklist/ChecklistList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales checklists · GMX Group Intranet" };

/** Checklists sales sends logistics once a customer approves a quote. */
export default async function ChecklistsPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login");
  return <ChecklistList isAdmin={isAdminUser(user)} myId={user.id} />;
}
