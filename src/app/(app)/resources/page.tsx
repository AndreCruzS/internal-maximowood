import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadLinks } from "@/server/links";
import ResourceList from "@/components/resources/ResourceList";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.resources.title} · GMX Group Intranet` };
}

export default async function ResourcesPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) redirect("/login");
  const [{ t }, { links, owners }] = await Promise.all([getDict(), loadLinks(supabase)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">{t.resources.title}</h1>
        <p className="text-gray-500">{t.resources.subtitle}</p>
      </div>
      <ResourceList links={links} owners={owners} />
    </div>
  );
}
