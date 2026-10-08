import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import FaqList, { type Faq } from "@/components/help/FaqList";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.faq.title} · GMX Group Intranet` };
}

export default async function HelpPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) redirect("/login");
  const [{ t }, { data }] = await Promise.all([getDict(), supabase.from("faqs").select("id, department_id, question, answer, language, sort")]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">{t.faq.title}</h1>
        <p className="text-gray-500">{t.faq.subtitle}</p>
      </div>
      <FaqList faqs={(data as Faq[] | null) ?? []} searchable />
    </div>
  );
}
