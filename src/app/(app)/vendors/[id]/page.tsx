import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadVendor } from "@/server/vendorDetail";
import VendorDetail from "@/components/vendors/VendorDetail";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getDict();
  const supabase = await getSupabaseServer();
  const { data } = supabase && UUID_RE.test(id) ? await supabase.from("vendors_public").select("legal_name").eq("id", id).maybeSingle() : { data: null };
  return { title: `${(data as { legal_name: string } | null)?.legal_name ?? t.vendors.title} · GMX Group Intranet` };
}

/** One vendor on the Master List: everyone sees the public card; vendor staff see bank accounts, checks, documents and history. */
export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadVendor(supabase, user.id, id);
  if (!data) notFound();
  return <VendorDetail data={data} />;
}
