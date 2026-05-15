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
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
}

export interface GroupedInventory {
  items: InventoryItem[];
  species: string[];
  categories: string[];
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
    const profile = row.profile ?? "";
    const size = (row.nominal_size ?? "").trim() || sizeFromDescription(row.description);
    const productKey = `${row.species}||${profile}||${size}`;

    let product = productMap.get(productKey);
    if (!product) {
      product = {
        specie: row.species,
        category: row.category,
        profile,
        size,
        branches: [],
        totalLF: 0,
      };
      productMap.set(productKey, product);
    }

    let branch = product.branches.find(b => b.branch === row.branch_name);
    if (!branch) {
      branch = { branch: row.branch_name, totalLF: 0, lengths: [] };
      product.branches.push(branch);
    }

    // LF shown to the user is the *buyable* LF (lf_per_piece × pieces_available),
    // not the view's lf_available which is on-hand-based and double-counts
    // committed stock. Keeps pieces × length = LF self-consistent.
    const buyableLf = row.lf_per_piece > 0 ? row.lf_per_piece * row.pieces_available : 0;

    branch.lengths.push({
      lengthFt: row.lf_per_piece > 0 ? row.lf_per_piece : null,
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
    a.profile.localeCompare(b.profile) ||
    a.size.localeCompare(b.size)
  );

  const species = Array.from(new Set(items.map(i => i.specie))).sort();
  const categories = Array.from(categorySet).sort();
  const profiles = Array.from(new Set(items.map(i => i.profile).filter(Boolean))).sort();
  const sizes = Array.from(new Set(items.map(i => i.size).filter(Boolean))).sort();
  const branches = Array.from(branchSet).sort();
  const lastUpdated = maxUpdated === null ? null : new Date(maxUpdated);

  return { items, species, categories, profiles, sizes, branches, lastUpdated };
}

const SELECT_COLS =
  "branch_name,species,category,nominal_size,profile,description,lf_per_piece,pieces_available,lf_available,last_updated";
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
