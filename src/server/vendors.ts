import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANK_COLUMNS, VENDOR_PRIVATE_COLUMNS, VENDOR_PUBLIC_COLUMNS, importKey, screenNames,
  type BankAccountMasked, type ImportRow, type SanctionsHit, type ScreeningResult, type VendorPrivate, type VendorPublic,
} from "@/lib/vendors";
import { readSanctionsMeta, sanctionsIndex, screenVendors, type SanctionsMeta } from "@/server/sanctions";

export type VendorRoles = { isAdmin: boolean; isFinance: boolean; isApprover: boolean; isPayments: boolean; isStaff: boolean };

export async function vendorRoles(supabase: SupabaseClient): Promise<VendorRoles> {
  const [admin, finance, approver, payments] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.rpc("is_finance"),
    supabase.rpc("has_duty", { d: "vendor_approver" }),
    supabase.rpc("has_duty", { d: "payments" }),
  ]);
  const r = { isAdmin: admin.data === true, isFinance: finance.data === true, isApprover: approver.data === true, isPayments: payments.data === true };
  return { ...r, isStaff: r.isAdmin || r.isFinance || r.isApprover || r.isPayments };
}

export type LatestScreening = { vendor_id: string; result: ScreeningResult; score: number; matches: SanctionsHit[]; screened_at: string };

export type VendorsData = {
  /** False until migration 0028 is applied. */
  ready: boolean;
  roles: VendorRoles;
  vendors: VendorPublic[];
  /** Vendor staff only (approvers, payments, finance, admins); empty for everyone else. */
  details: Record<string, VendorPrivate>;
  banks: Record<string, BankAccountMasked[]>;
  screenings: Record<string, LatestScreening>;
  companies: { id: string; name: string }[];
  sanctions: SanctionsMeta | null;
};

/** The Master List, read with the viewer's session: RLS decides what beyond the public list they see. */
export async function loadVendors(supabase: SupabaseClient): Promise<VendorsData> {
  const roles = await vendorRoles(supabase);
  const [list, companies] = await Promise.all([
    supabase.from("vendors_public").select(VENDOR_PUBLIC_COLUMNS).order("legal_name").limit(5000),
    supabase.from("companies").select("id, name").order("sort"),
  ]);
  const ready = !list.error;
  const base: VendorsData = {
    ready, roles,
    vendors: (list.data as VendorPublic[] | null) ?? [],
    details: {}, banks: {}, screenings: {},
    companies: (companies.data as { id: string; name: string }[] | null) ?? [],
    sanctions: null,
  };
  if (!ready || !roles.isStaff) return base;

  const [details, banks, screenings, meta] = await Promise.all([
    supabase.from("vendors").select(VENDOR_PRIVATE_COLUMNS).limit(5000),
    supabase.from("vendor_bank_accounts").select(BANK_COLUMNS).limit(10000),
    supabase.from("vendor_screenings").select("vendor_id, result, score, matches, screened_at").order("screened_at", { ascending: false }).limit(2000),
    readSanctionsMeta(supabase),
  ]);
  for (const d of (details.data as VendorPrivate[] | null) ?? []) base.details[d.id] = d;
  for (const b of (banks.data as BankAccountMasked[] | null) ?? []) (base.banks[b.vendor_id] ??= []).push(b);
  for (const s of (screenings.data as LatestScreening[] | null) ?? []) if (!base.screenings[s.vendor_id]) base.screenings[s.vendor_id] = s;
  base.sanctions = meta;
  return base;
}

export type ImportPreviewRow = {
  line: number;
  legal_name: string;
  key: string;
  state: "new" | "existing" | "duplicate" | "error";
  errors: string[];
  screening: { result: ScreeningResult | "not_run"; score: number; top: string | null };
};

async function existingKeys(admin: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await admin.from("vendors").select("import_key").in("import_key", keys.slice(i, i + 200));
    for (const r of (data as { import_key: string }[] | null) ?? []) found.add(r.import_key);
  }
  return found;
}

/** What an import would do: new / already on the list / repeated in the file / invalid, and the sanctions check. */
export async function previewImport(admin: SupabaseClient, rows: ImportRow[]): Promise<ImportPreviewRow[]> {
  const keys = rows.map(r => importKey(r));
  const [existing, index] = await Promise.all([existingKeys(admin, [...new Set(keys)]), sanctionsIndex(admin)]);
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const key = keys[i];
    const state: ImportPreviewRow["state"] = r.errors.length ? "error" : existing.has(key) ? "existing" : seen.has(key) ? "duplicate" : "new";
    seen.add(key);
    const s = index ? screenNames([r.legal_name, r.dba], index) : null;
    return {
      line: r.line, legal_name: r.legal_name, key, state, errors: r.errors,
      screening: s ? { result: s.result, score: s.score, top: s.hits[0]?.name ?? null } : { result: "not_run", score: 0, top: null },
    };
  });
}

/**
 * Imports the bank's current beneficiaries as "legacy_pending" (to be reviewed over time) and
 * screens them. Idempotent: vendors already on the list (same tax id, or same name + country) are
 * skipped. Bank accounts are stored with the last 4 digits only, inactive until reviewed.
 */
export async function importVendors(admin: SupabaseClient, rows: ImportRow[], companyIds: string[]) {
  const preview = await previewImport(admin, rows);
  const toCreate = rows.filter((_, i) => preview[i].state === "new");
  const created: { id: string; legal_name: string; dba: string }[] = [];
  for (let i = 0; i < toCreate.length; i += 200) {
    const chunk = toCreate.slice(i, i + 200);
    const { data, error } = await admin
      .from("vendors")
      .upsert(
        chunk.map(r => ({
          legal_name: r.legal_name, dba: r.dba, tax_id: r.tax_id, country: r.country, category: r.category,
          currency: r.currency, payment_terms: r.payment_terms, website: r.website, address: r.address, contact: r.contact,
          company_ids: companyIds, status: "legacy_pending", source: "import", import_key: importKey(r),
        })),
        { onConflict: "import_key", ignoreDuplicates: true },
      )
      .select("id, legal_name, dba, import_key");
    if (error) throw new Error(`Import failed: ${error.message}`);
    const byKey = new Map(chunk.map(r => [importKey(r), r]));
    const rowsCreated = (data as { id: string; legal_name: string; dba: string; import_key: string }[] | null) ?? [];
    created.push(...rowsCreated);
    const bankRows = rowsCreated
      .map(v => ({ v, bank: byKey.get(v.import_key)?.bank }))
      .filter(x => x.bank)
      .map(({ v, bank }) => ({ vendor_id: v.id, ...bank!, active: false }));
    if (bankRows.length) {
      const { error: bankError } = await admin.from("vendor_bank_accounts").insert(bankRows);
      if (bankError) throw new Error(`Saving bank details failed: ${bankError.message}`);
    }
  }
  const screening = await screenVendors(admin, created, "import");
  return {
    created: created.length,
    skipped: preview.filter(p => p.state === "existing" || p.state === "duplicate").length,
    errors: preview.filter(p => p.state === "error").length,
    screening,
  };
}
