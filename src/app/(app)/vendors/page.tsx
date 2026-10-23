import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadVendors } from "@/server/vendors";
import { loadRequestsOverview } from "@/server/vendorRequests";
import VendorsView, { type VendorsTab } from "@/components/vendors/VendorsView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.vendors.title} · GMX Group Intranet` };
}

/**
 * Vendor Master List (Finance): everyone sees the approved list; approvers, Payments and Finance
 * see details and masked bank data; Finance / admins import the bank's vendors and run the
 * OFAC sanctions check.
 */
export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadVendors(supabase);
  if (!data.ready) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.vendors.migrationPending}</p>;
  }
  const { tab: raw } = await searchParams;
  const manage = data.roles.isFinance || data.roles.isAdmin;
  const tab: VendorsTab = (raw === "import" || raw === "sanctions") && manage ? raw : raw === "requests" ? "requests" : "list";
  const requests = tab === "requests" ? await loadRequestsOverview(supabase, user.id) : null;
  return <VendorsView data={data} tab={tab} requests={requests} />;
}
