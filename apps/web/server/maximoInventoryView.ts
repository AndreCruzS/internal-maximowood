/**
 * Read-only client for the Maximo inventory view (Supabase / PostgREST).
 * Spec: docs/superpowers/specs/2026-05-15-maximo-inventory-passthrough-design.md
 * Handoff: f:\SKYLEV\GMX\CODEBASE 2026 GMX\ODBC\docs\operations\handoff\maximo-inventory-api.md
 */

import { ENV } from "./_core/env.js";

export interface MaximoRow {
  branch_name: string;
  species: string;
  category: string; // "Hardwoods" | "Thermowood" | "Accoya"
  nominal_size: string | null;
  profile: string | null;
  description: string | null;
  lf_per_piece: number;
  pieces_available: number;
  lf_available: number;
  last_updated: string; // ISO timestamptz
  // Curated-dictionary columns (GMX `Base SKUs`). Null/absent for unmapped SKUs.
  specie?: string | null; // GMX dictionary column (singular is the actual column name; distinct from raw `species`)
  model?: string | null;
  profile_finish?: string | null;
  size?: string | null;
  length_ft?: number | null;
  lf?: number | null;
  is_unmapped?: boolean | null;
}

/**
 * Tile SKUs (CMTILE2424, IPETILE2424, IPEBTILE2424, etc.) come back from the
 * view with an empty `nominal_size` — the size is only in the description
 * field. Pull e.g. "24x24" out of "Ipe Tiles 24\" x 24\"" so tile variants
 * don't all collapse into one un-named group.
 */
export function sizeFromDescription(description: string | null): string {
  if (!description) return "";
  const m = description.match(/(\d+(?:[\/.]\d+)?)\s*["']?\s*[xX×]\s*(\d+(?:[\/.]\d+)?)\s*["']?/);
  return m ? `${m[1]}x${m[2]}` : "";
}

/**
 * Fallback length-in-feet parser. Spruce's `LFBFLength` is empty for ~16 SKUs
 * in the live view (mostly Cumaru/IPE beams like CM6816S "Cumaru 6x8x16'"),
 * so the view returns lf_per_piece=0 even though the description clearly
 * encodes the length. Pull the "Nft" pattern out of the description so LF
 * math works for those rows.
 *
 * Matches `x16'` or `x12.5'` (ASCII foot mark). Deliberately does NOT match
 * `24"` (tile width in inches), so true tile SKUs continue to return 0.
 */
export function lengthFromDescription(description: string | null): number {
  if (!description) return 0;
  const m = description.match(/x\s*(\d+(?:\.\d+)?)\s*['′]/);
  return m ? parseFloat(m[1]) : 0;
}

export interface LengthEntry {
  lengthFt: number | null;
  pieces: number | null;
  stockLf: number;
}

export interface BranchStock {
  branch: string;
  totalLF: number;
  lengths: LengthEntry[];
}

export interface InventoryItem {
  specie: string;
  category: string;
  model: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
  isUnmapped: boolean;
}

export interface GroupedInventory {
  items: InventoryItem[];
  species: string[];
  categories: string[];
  models: string[];
  profiles: string[];
  sizes: string[];
  branches: string[];
  lastUpdated: Date | null;
}

export function groupMaximoRows(rows: MaximoRow[]): GroupedInventory {
  const productMap = new Map<string, InventoryItem>();
  const branchSet = new Set<string>();
  const categorySet = new Set<string>();
  let maxUpdated: number | null = null;

  for (const row of rows) {
    const isUnmapped = row.is_unmapped === true;

    // Resolve each grouping/display field: prefer the curated dictionary
    // column, fall back to the raw view column (and the legacy description
    // parsers) for SKUs not yet in the dictionary so nothing disappears.
    const specie = (row.specie ?? "").trim() || row.species;
    const model = (row.model ?? "").trim();
    const profile = (row.profile_finish ?? "").trim() || (row.profile ?? "");
    const size =
      (row.size ?? "").trim() ||
      (row.nominal_size ?? "").trim() ||
      sizeFromDescription(row.description);

    // Per-piece length: dictionary `length_ft`, else Spruce's `lf_per_piece`,
    // else parsed from the description (beams whose LFBFLength is empty).
    // length_ft <= 0 is treated as absent (nonsensical for real lumber; tiles use 0/null).
    const lengthFt =
      row.length_ft != null && row.length_ft > 0
        ? row.length_ft
        : row.lf_per_piece > 0
        ? row.lf_per_piece
        : lengthFromDescription(row.description) || null;

    // Buyable LF: the view's pre-computed `lf` (available net of committed;
    // tiles = pieces) when present, else compute it from the resolved length.
    const buyableLf =
      row.lf != null
        ? row.lf
        : lengthFt != null
        ? lengthFt * row.pieces_available
        : 0;

    const productKey = `${specie}||${model}||${profile}||${size}`;

    let product = productMap.get(productKey);
    if (!product) {
      product = {
        specie,
        category: row.category,
        model,
        profile,
        size,
        branches: [],
        totalLF: 0,
        isUnmapped,
      };
      productMap.set(productKey, product);
    } else if (isUnmapped) {
      product.isUnmapped = true; // any unmapped contributor flags the product
    }

    let branch = product.branches.find(b => b.branch === row.branch_name);
    if (!branch) {
      branch = { branch: row.branch_name, totalLF: 0, lengths: [] };
      product.branches.push(branch);
    }

    branch.lengths.push({
      lengthFt,
      pieces: row.pieces_available,
      stockLf: buyableLf,
    });

    branch.totalLF += buyableLf;
    product.totalLF += buyableLf;
    branchSet.add(row.branch_name);
    if (row.category) categorySet.add(row.category);

    const t = Date.parse(row.last_updated);
    if (!Number.isNaN(t) && (maxUpdated === null || t > maxUpdated)) {
      maxUpdated = t;
    }
  }

  const items = Array.from(productMap.values()).sort((a, b) =>
    a.specie.localeCompare(b.specie) ||
    a.model.localeCompare(b.model) ||
    a.profile.localeCompare(b.profile) ||
    a.size.localeCompare(b.size)
  );

  const species = Array.from(new Set(items.map(i => i.specie))).sort();
  const categories = Array.from(categorySet).sort();
  const models = Array.from(new Set(items.map(i => i.model).filter(Boolean))).sort();
  const profiles = Array.from(new Set(items.map(i => i.profile).filter(Boolean))).sort();
  const sizes = Array.from(new Set(items.map(i => i.size).filter(Boolean))).sort();
  const branches = Array.from(branchSet).sort();
  const lastUpdated = maxUpdated === null ? null : new Date(maxUpdated);

  return { items, species, categories, models, profiles, sizes, branches, lastUpdated };
}

const SELECT_COLS =
  "branch_name,species,category,nominal_size,profile,description,lf_per_piece,pieces_available,lf_available,last_updated,specie,model,profile_finish,size,length_ft,lf,is_unmapped";
const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // hard ceiling: 20k rows; view is ~1.4k today, plenty of headroom

export async function fetchMaximoInventory(): Promise<MaximoRow[]> {
  const base = ENV.supabaseInventoryUrl.replace(/\/$/, "");
  const apikey = ENV.supabaseInventoryApikey;
  const jwt = ENV.maximoReaderJwt;

  if (!base || !apikey || !jwt) {
    throw new Error(
      "Maximo inventory env vars missing: set SUPABASE_INVENTORY_URL, SUPABASE_INVENTORY_APIKEY, MAXIMO_READER_JWT"
    );
  }

  // PostgREST caps responses at its db-max-rows (1000 by default on this project)
  // and ignores `limit` above the cap. Page with Range until exhausted, sorted by
  // a stable key so each page is a deterministic slice (no row drops or dupes
  // between pages even when the underlying view refreshes mid-pagination).
  const all: MaximoRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const qs = new URLSearchParams({
      select: SELECT_COLS,
      // Drop fully-committed SKUs at the source — anything with 0 buyable
      // pieces is noise for an inventory page (you can't sell it). The view
      // already filters out non-positive on-hand, this further narrows to
      // what's actually sellable today.
      pieces_available: "gt.0",
      order: "branch_id.asc,sku.asc",
    }).toString();

    const res = await fetch(`${base}/rest/v1/maximo_inventory_view?${qs}`, {
      headers: {
        apikey,
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        "Range-Unit": "items",
        Range: `${from}-${to}`,
      },
    });

    if (!res.ok && res.status !== 206) {
      const body = await res.text().catch(() => "");
      throw new Error(`Maximo inventory view ${res.status}: ${body}`);
    }

    const chunk = (await res.json()) as MaximoRow[];
    all.push(...chunk);

    // Done when the server returned fewer rows than the page size.
    if (chunk.length < PAGE_SIZE) break;
  }

  return all;
}
