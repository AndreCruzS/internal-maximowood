import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { loadRequest, loadRequestsOverview } from "@/server/vendorRequests";
import { loadVendor } from "@/server/vendorDetail";
import type { VendorSnapshot } from "@/lib/vendorChanges";
import VendorChangeForm, { type ChangeKind } from "@/components/vendors/VendorChangeForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.vendors.page.requestChange} · GMX Group Intranet` };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Request a change to an approved vendor (?vendor=<id>&kind=change_bank|change_details), or keep
 * editing your draft / a change sent back to you (?id=<request>).
 */
export default async function VendorChangePage({ searchParams }: { searchParams: Promise<{ vendor?: string; kind?: string; id?: string }> }) {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const sp = await searchParams;

  let kind: ChangeKind;
  let vendorId: string;
  let detail: Awaited<ReturnType<typeof loadRequest>> = null;
  if (sp.id && UUID_RE.test(sp.id)) {
    detail = await loadRequest(supabase, user.id, sp.id);
    if (!detail) redirect("/vendors?tab=requests");
    const r = detail.request;
    if (r.kind !== "change_bank" && r.kind !== "change_details") redirect(`/vendors/request?id=${r.id}`);
    const editable = r.requester_person_id === detail.me && (r.status === "draft" || r.status === "needs_info");
    if (!editable || !r.vendor_id) redirect(`/vendors/requests/${r.id}`);
    kind = r.kind;
    vendorId = r.vendor_id;
  } else {
    if (!sp.vendor || !UUID_RE.test(sp.vendor)) notFound();
    kind = sp.kind === "change_bank" ? "change_bank" : "change_details";
    vendorId = sp.vendor;
  }

  const [ctx, vendor] = await Promise.all([loadRequestsOverview(supabase, user.id), loadVendor(supabase, user.id, vendorId)]);
  if (!vendor) notFound();
  if (!ctx.ready) {
    const { t } = await getDict();
    return <p className="mx-auto max-w-xl rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">{t.vendors.migrationPending}</p>;
  }
  if (!detail && vendor.vendor.status !== "approved" && vendor.vendor.status !== "suspended") redirect(`/vendors/${vendorId}`);
  const d = vendor.details;
  const current: VendorSnapshot | null = d
    ? { tax_id: d.tax_id, tax_id_type: d.tax_id_type, address: (d.address ?? {}) as Record<string, string>, contact: d.contact as Record<string, string>, website: d.website }
    : null;
  return (
    <VendorChangeForm
      ctx={ctx}
      vendor={vendor.vendor}
      current={current}
      kind={kind}
      request={detail?.request ?? null}
      files={detail?.files ?? []}
    />
  );
}
