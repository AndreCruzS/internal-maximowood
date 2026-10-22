import type { SupabaseClient } from "@supabase/supabase-js";
import { SanctionsIndex, parseAlt, parseSdn, screenNames, type SanctionsEntry, type ScreeningResult } from "@/lib/vendors";

/**
 * OFAC sanctions screening for the Vendor Master List.
 *
 * Source: the US Treasury OFAC Sanctions List Service (public, no key) — the SDN list and its
 * aliases. The legacy https://www.treasury.gov/ofac/downloads/sdn.csv URLs redirect to the same
 * files. Refreshed nightly into sanctions_entries; every vendor is re-screened after a refresh.
 * Server only (service role).
 */
export const OFAC_SDN_URL = process.env.OFAC_SDN_URL || "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV";
export const OFAC_ALT_URL = process.env.OFAC_ALT_URL || "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV";

export type SanctionsMeta = { version: string | null; entries: number; refreshed_at: string | null };

async function download(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`OFAC download failed (${res.status}) for ${url}`);
  const text = await res.text();
  if (text.length < 1000) throw new Error(`OFAC download looks empty for ${url}`);
  return text;
}

export async function readSanctionsMeta(db: SupabaseClient): Promise<SanctionsMeta> {
  const { data } = await db.from("app_settings").select("value").eq("key", "sanctions").maybeSingle();
  const v = ((data as { value?: Partial<SanctionsMeta> } | null)?.value ?? {}) as Partial<SanctionsMeta>;
  return { version: v.version ?? null, entries: Number(v.entries) || 0, refreshed_at: v.refreshed_at ?? null };
}

/** Downloads the SDN list + aliases and replaces sanctions_entries. */
export async function refreshSanctions(admin: SupabaseClient): Promise<SanctionsMeta> {
  const [sdnText, altText] = await Promise.all([download(OFAC_SDN_URL), download(OFAC_ALT_URL)]);
  const version = new Date().toISOString();
  const sdn = parseSdn(sdnText, version);
  if (sdn.length < 1000) throw new Error(`OFAC SDN list looks incomplete (${sdn.length} names)`);
  const alt = parseAlt(altText, version, new Map(sdn.map(e => [e.ent_num, e])));
  const rows = [...sdn, ...alt].map(e => ({ ...e, updated_at: version }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("sanctions_entries").upsert(rows.slice(i, i + 1000), { onConflict: "id" });
    if (error) throw new Error(`Saving the OFAC list failed: ${error.message}`);
  }
  // Names OFAC removed since the last refresh.
  const { error: delError } = await admin.from("sanctions_entries").delete().neq("list_version", version);
  if (delError) throw new Error(`Cleaning the OFAC list failed: ${delError.message}`);
  const meta: SanctionsMeta = { version, entries: rows.length, refreshed_at: version };
  await admin.from("app_settings").upsert({ key: "sanctions", value: meta, updated_at: version });
  cache = null;
  return meta;
}

let cache: { version: string; index: SanctionsIndex } | null = null;

/** The screening index, cached per list version (one load per server instance and refresh). */
export async function sanctionsIndex(admin: SupabaseClient): Promise<SanctionsIndex | null> {
  const meta = await readSanctionsMeta(admin);
  if (!meta.version) return null;
  if (cache?.version === meta.version) return cache.index;
  const entries: SanctionsEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("sanctions_entries")
      .select("id, ent_num, name, name_type, sdn_type, programs, norm")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Loading the OFAC list failed: ${error.message}`);
    entries.push(...((data as SanctionsEntry[] | null) ?? []));
    if (!data || data.length < 1000) break;
  }
  cache = { version: meta.version, index: new SanctionsIndex(entries, meta.version) };
  return cache.index;
}

type VendorNames = { id: string; legal_name: string; dba: string; sanctions_status?: string };

/**
 * Screens vendors and saves the result on the vendor (and a screening row when it isn't clear or
 * when it changed). A vendor approvers marked as a false positive stays so unless a new, stronger
 * hit appears (phase B records which entry was cleared).
 */
export async function screenVendors(
  admin: SupabaseClient,
  vendors: VendorNames[],
  trigger: "import" | "nightly" | "manual",
): Promise<{ screened: number; flagged: number; byResult: Record<ScreeningResult, number> }> {
  const index = await sanctionsIndex(admin);
  const byResult: Record<ScreeningResult, number> = { clear: 0, possible_match: 0, match: 0 };
  if (!index) return { screened: 0, flagged: 0, byResult };
  const now = new Date().toISOString();
  const screenings: Record<string, unknown>[] = [];
  for (const v of vendors) {
    const r = screenNames([v.legal_name, v.dba], index);
    byResult[r.result]++;
    const keepCleared = v.sanctions_status === "false_positive" && r.result !== "clear";
    const status = keepCleared ? "false_positive" : r.result;
    if (r.result !== "clear" || (v.sanctions_status && v.sanctions_status !== "not_run" && v.sanctions_status !== status)) {
      screenings.push({
        vendor_id: v.id, screened_name: v.legal_name, result: r.result, score: r.score, matches: r.hits,
        list_version: index.version, trigger, screened_at: now,
      });
    }
    await admin.from("vendors").update({ sanctions_status: status, sanctions_score: r.score, sanctions_checked_at: now }).eq("id", v.id);
  }
  for (let i = 0; i < screenings.length; i += 500) await admin.from("vendor_screenings").insert(screenings.slice(i, i + 500));
  return { screened: vendors.length, flagged: byResult.match + byResult.possible_match, byResult };
}

/** Re-screens every vendor (after the nightly refresh, or on demand). */
export async function rescreenAll(admin: SupabaseClient, trigger: "nightly" | "manual") {
  const vendors: VendorNames[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await admin.from("vendors").select("id, legal_name, dba, sanctions_status").order("id").range(from, from + 999);
    vendors.push(...((data as VendorNames[] | null) ?? []));
    if (!data || data.length < 1000) break;
  }
  return screenVendors(admin, vendors, trigger);
}
