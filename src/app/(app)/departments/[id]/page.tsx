import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DEPARTMENTS, departmentById } from "@/lib/intranet";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { deptName } from "@/lib/i18n/text";
import { loadLinks } from "@/server/links";
import { NEWS_COLUMNS, type NewsItem } from "@/server/intranet";
import DepartmentView from "@/components/DepartmentView";
import type { Faq } from "@/components/help/FaqList";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return DEPARTMENTS.map(d => ({ id: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getDict();
  return { title: departmentById(id) ? `${deptName(t, id)} · GMX Group Intranet` : "GMX Group Intranet" };
}

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dept = departmentById(id);
  if (!dept) notFound();
  const supabase = await getSupabaseServer();
  if (!supabase) notFound();
  const [{ links, owners }, faqs, news, positions] = await Promise.all([
    loadLinks(supabase, id),
    supabase.from("faqs").select("id, department_id, question, answer, language, sort").eq("department_id", id),
    supabase.from("news").select(NEWS_COLUMNS).eq("department_id", id).order("published_at", { ascending: false }).limit(4),
    supabase.from("positions").select("id, title, team, people(id, full_name)").eq("department_id", id).order("sort"),
  ]);
  type Pos = { id: string; title: string; team: string | null; people: { id: string; full_name: string } | null };
  return (
    <DepartmentView
      id={dept.id}
      links={links}
      owners={owners}
      faqs={(faqs.data as Faq[] | null) ?? []}
      news={(news.data as NewsItem[] | null) ?? []}
      team={((positions.data as unknown as Pos[] | null) ?? []).filter(p => p.people).map(p => ({ id: p.id, name: p.people!.full_name, title: p.title, team: p.team }))}
    />
  );
}
