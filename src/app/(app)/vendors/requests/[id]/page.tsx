import { notFound, redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { readPayload } from "@/lib/vendorRequests";
import { loadRequest } from "@/server/vendorRequests";
import VendorRequestDetail from "@/components/vendors/VendorRequestDetail";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getDict();
  const supabase = await getSupabaseServer();
  const { data } = supabase && UUID_RE.test(id) ? await supabase.from("vendor_requests").select("payload").eq("id", id).maybeSingle() : { data: null };
  const name = data ? readPayload((data as { payload: unknown }).payload).vendor.legal_name : "";
  return { title: `${name || t.vendorRequests.tab} · GMX Group Intranet` };
}

/** A vendor request: the requester follows it; the department head, approvers and Payments act on it. */
export default async function VendorRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const data = await loadRequest(supabase, user.id, id);
  if (!data) notFound();
  return <VendorRequestDetail data={data} />;
}
