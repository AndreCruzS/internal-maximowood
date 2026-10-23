import type { SupabaseClient } from "@supabase/supabase-js";
import { selectCompat } from "@/server/compat";
import {
  BANK_COLUMNS, VENDOR_PRIVATE_COLUMNS, VENDOR_PUBLIC_COLUMNS, VENDOR_PUBLIC_COLUMNS_V1,
  type BankAccountMasked, type SanctionsHit, type VendorPrivate, type VendorPublic,
} from "@/lib/vendors";
import { REQUEST_COLUMNS, type VendorRequestRow } from "@/lib/vendorRequests";
import type { VendorEventRow } from "@/lib/vendorChanges";
import { vendorRoles, type VendorRoles } from "@/server/vendors";

export type BankAccountDetail = BankAccountMasked & {
  verified_by: string | null; verified_at: string | null; verification_method: string; request_id: string | null; created_at: string;
};
export type VendorScreeningRow = { result: string; score: number; matches: SanctionsHit[]; list_version: string; trigger: string; screened_at: string; request_id: string | null };
export type VendorFileRow = { id: string; kind: string; file_name: string; size_bytes: number; created_at: string; request_id: string | null };
export type VendorExtra = {
  suspended_at: string | null; suspended_reason: string; last_reviewed_at: string | null; sanctions_cleared_note: string;
  address: { line1?: string; city?: string; state?: string; postal_code?: string; country?: string };
};

export type VendorDetailData = {
  roles: VendorRoles;
  me: string | null;
  vendor: VendorPublic;
  /** Vendor staff only (approvers, Payments, Finance, admins); null for everyone else. */
  details: (VendorPrivate & Partial<VendorExtra>) | null;
  banks: BankAccountDetail[];
  screenings: VendorScreeningRow[];
  files: VendorFileRow[];
  /** RLS: staff see every request for the vendor; others only their own. */
  requests: VendorRequestRow[];
  events: VendorEventRow[];
  people: Record<string, string>;
  companies: { id: string; name: string }[];
};

/** One vendor's page, read with the viewer's session (RLS decides how much they see). */
export async function loadVendor(supabase: SupabaseClient, userId: string, id: string): Promise<VendorDetailData | null> {
  const [roles, pub, me, companies] = await Promise.all([
    vendorRoles(supabase),
    selectCompat(cols => supabase.from("vendors_public").select(cols).eq("id", id).maybeSingle(), VENDOR_PUBLIC_COLUMNS, VENDOR_PUBLIC_COLUMNS_V1),
    supabase.from("people").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("companies").select("id, name").order("sort"),
  ]);
  if (!pub.data) return null;
  const vendor = pub.data as unknown as VendorPublic;
  const requests = await supabase.from("vendor_requests").select(REQUEST_COLUMNS).eq("vendor_id", id).order("created_at", { ascending: false }).limit(200);
  const reqRows = (requests.data as unknown as VendorRequestRow[] | null) ?? [];
  const base: VendorDetailData = {
    roles,
    me: (me.data as { id: string } | null)?.id ?? null,
    vendor,
    details: null, banks: [], screenings: [], files: [], events: [],
    requests: reqRows,
    people: {},
    companies: (companies.data as { id: string; name: string }[] | null) ?? [],
  };

  if (roles.isStaff) {
    const reqIds = reqRows.map(r => r.id);
    const [details, banks, screenings, filesByVendor, filesByRequest, events] = await Promise.all([
      selectCompat(
        cols => supabase.from("vendors").select(cols).eq("id", id).maybeSingle(),
        `${VENDOR_PRIVATE_COLUMNS}, address, suspended_at, suspended_reason, last_reviewed_at, sanctions_cleared_note`,
        `${VENDOR_PRIVATE_COLUMNS}, address, sanctions_cleared_note`,
      ),
      supabase.from("vendor_bank_accounts").select(`${BANK_COLUMNS}, verified_by, verified_at, verification_method, request_id, created_at`).eq("vendor_id", id).order("created_at", { ascending: false }),
      supabase.from("vendor_screenings").select("result, score, matches, list_version, trigger, screened_at, request_id").eq("vendor_id", id).order("screened_at", { ascending: false }).limit(15),
      supabase.from("vendor_files").select("id, kind, file_name, size_bytes, created_at, request_id").eq("vendor_id", id),
      reqIds.length ? supabase.from("vendor_files").select("id, kind, file_name, size_bytes, created_at, request_id").in("request_id", reqIds) : Promise.resolve({ data: [] }),
      // vendor_events comes with migration 0030; before it, no history.
      supabase.from("vendor_events").select("id, vendor_id, request_id, kind, note, details, by_person, at").eq("vendor_id", id).order("id", { ascending: false }).limit(200),
    ]);
    base.details = (details.data as unknown as VendorDetailData["details"]) ?? null;
    base.banks = (banks.data as BankAccountDetail[] | null) ?? [];
    base.screenings = (screenings.data as VendorScreeningRow[] | null) ?? [];
    const files = [...((filesByVendor.data as VendorFileRow[] | null) ?? []), ...((filesByRequest.data as VendorFileRow[] | null) ?? [])];
    base.files = [...new Map(files.map(f => [f.id, f])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    base.events = (events.data as VendorEventRow[] | null) ?? [];
  }

  const personIds = new Set<string>();
  for (const r of base.requests) for (const x of [r.requester_person_id, r.dept_confirmed_by, r.registered_by]) if (x) personIds.add(x);
  for (const b of base.banks) if (b.verified_by) personIds.add(b.verified_by);
  for (const e of base.events) if (e.by_person) personIds.add(e.by_person);
  if (personIds.size) {
    const { data } = await supabase.from("people").select("id, full_name").in("id", [...personIds]);
    base.people = Object.fromEntries(((data as { id: string; full_name: string }[] | null) ?? []).map(p => [p.id, p.full_name]));
  }
  return base;
}
