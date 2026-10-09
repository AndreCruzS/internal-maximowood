import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { departmentById } from "@/lib/intranet";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { canEditDepartment } from "@/server/playbooks";
import { loadEditorData } from "@/server/playbookEditor";
import PlaybookEditor from "@/components/playbooks/PlaybookEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "New playbook · GMX Group Intranet" };

export default async function NewPlaybookPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const { dept } = await searchParams;
  if (!dept || !departmentById(dept)) notFound();
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  if (!(await canEditDepartment(supabase, dept, isAdminUser(user)))) {
    const { t } = await getDict();
    return <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-6 text-sm text-gray-500">{fmt(t.playbooks.onlyTeam, { dept: deptName(t, dept) })}</p>;
  }
  const { people, categories } = await loadEditorData(supabase, dept);
  return <PlaybookEditor department={dept} playbook={null} people={people} categories={categories} />;
}
