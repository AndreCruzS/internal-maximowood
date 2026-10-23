import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadRequest, loadRequestsOverview } from "@/server/vendorRequests";
import VendorRequestForm from "@/components/vendors/VendorRequestForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.vendorRequests.form.title} · GMX Group Intranet` };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Request a vendor (anyone signed in), or keep editing your draft / a request sent back to you. */
export default async function VendorRequestPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { id } = await searchParams;
  if (id && UUID_RE.test(id)) {
    const detail = await loadRequest(supabase, user.id, id);
    if (!detail) redirect("/vendors?tab=requests");
    if (detail.request.kind === "change_bank" || detail.request.kind === "change_details") redirect(`/vendors/change?id=${id}`);
    const editable = detail.request.requester_person_id === detail.me && (detail.request.status === "draft" || detail.request.status === "needs_info");
    if (!editable) redirect(`/vendors/requests/${id}`);
    return <VendorRequestForm ctx={detail} request={detail.request} files={detail.files} />;
  }
  const ctx = await loadRequestsOverview(supabase, user.id);
  if (!ctx.ready) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.vendors.migrationPending}</p>;
  }
  return <VendorRequestForm ctx={ctx} request={null} files={[]} />;
}
