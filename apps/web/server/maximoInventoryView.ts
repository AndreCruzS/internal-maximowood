/**
 * Read-only client for the Maximo inventory view (Supabase / PostgREST).
 * Spec: docs/superpowers/specs/2026-05-15-maximo-inventory-passthrough-design.md
 * Handoff: f:\SKYLEV\GMX\CODEBASE 2026 GMX\ODBC\docs\operations\handoff\maximo-inventory-api.md
 */

export interface MaximoRow {
  branch_name: string;
  species: string;
  nominal_size: string | null;
  profile: string | null;
  lf_per_piece: number;
  pieces_available: number;
  lf_available: number;
  last_updated: string; // ISO timestamptz
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
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
}

export interface GroupedInventory {
  items: InventoryItem[];
  species: string[];
  branches: string[];
  lastUpdated: Date | null;
}

export function groupMaximoRows(rows: MaximoRow[]): GroupedInventory {
  const productMap = new Map<string, InventoryItem>();
  const branchSet = new Set<string>();
  let maxUpdated: number | null = null;

  for (const row of rows) {
    const profile = row.profile ?? "";
    const size = row.nominal_size ?? "";
    const productKey = `${row.species}||${profile}||${size}`;

    let product = productMap.get(productKey);
    if (!product) {
      product = {
        specie: row.species,
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

    branch.lengths.push({
      lengthFt: row.lf_per_piece > 0 ? row.lf_per_piece : null,
      pieces: row.pieces_available,
      stockLf: row.lf_available,
    });

    branch.totalLF += row.lf_available;
    product.totalLF += row.lf_available;
    branchSet.add(row.branch_name);

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
  const branches = Array.from(branchSet).sort();
  const lastUpdated = maxUpdated === null ? null : new Date(maxUpdated);

  return { items, species, branches, lastUpdated };
}

export async function fetchMaximoInventory(): Promise<MaximoRow[]> {
  const base = process.env.SUPABASE_INVENTORY_URL ?? "";
  const apikey = process.env.SUPABASE_INVENTORY_APIKEY ?? "";
  const jwt = process.env.MAXIMO_READER_JWT ?? "";

  if (!base || !apikey || !jwt) {
    throw new Error(
      "Maximo inventory env vars missing: set SUPABASE_INVENTORY_URL, SUPABASE_INVENTORY_APIKEY, MAXIMO_READER_JWT"
    );
  }

  const qs = new URLSearchParams({
    select: "branch_name,species,nominal_size,profile,lf_per_piece,pieces_available,lf_available,last_updated",
    limit: "2000",
  }).toString();

  const res = await fetch(`${base}/rest/v1/maximo_inventory_view?${qs}`, {
    headers: {
      apikey,
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Maximo inventory view ${res.status}: ${body}`);
  }

  return (await res.json()) as MaximoRow[];
}
