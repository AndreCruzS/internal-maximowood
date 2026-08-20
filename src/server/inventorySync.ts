/**
 * inventorySync.ts — parity port of the legacy nightly sync.
 *
 * Fetches inventory data from the Maximo Inventory API (maximo_inventory_view,
 * André's Supabase project) and rewrites the app's own `inventory` table,
 * logging each run to `inventorySyncLog`.
 *
 * Legacy: MySQL/TiDB via Drizzle, cron via setTimeout in the Express process.
 * Here: the app's own Supabase (PostgREST + service role key), triggered by
 * Vercel Cron via /api/cron/inventory-sync.
 *
 * NOTE: nothing in the app reads these tables today (the Inventory tab reads
 * the view live) — the sync is kept for parity with the Manus deployment.
 */

// ── Source rows (same column list the legacy sync selected) ───────────────────
interface SupabaseInventoryRow {
  species: string | null;
  specie: string | null;
  profile: string | null;
  model: string | null;
  nominal_size: string | null;
  subgroup: string | null;
  branch_name: string | null;
  lf_available: number | null;
  lf_per_piece: number | null;
  pieces_available: number | null;
  last_updated: string | null;
}

async function fetchSupabaseInventory(): Promise<SupabaseInventoryRow[]> {
  const baseUrl = process.env.SUPABASE_INVENTORY_URL ?? "";
  const apiKey = process.env.SUPABASE_INVENTORY_ANON_KEY ?? "";
  const jwt = process.env.SUPABASE_INVENTORY_JWT ?? "";

  if (!baseUrl || !apiKey || !jwt) {
    throw new Error("Missing Supabase inventory credentials (URL / ANON_KEY / JWT)");
  }

  const PAGE = 1000;
  let offset = 0;
  const allRows: SupabaseInventoryRow[] = [];

  while (true) {
    const url =
      `${baseUrl.replace(/\/$/, "")}/rest/v1/maximo_inventory_view` +
      `?select=species,specie,profile,model,nominal_size,subgroup,branch_name,lf_available,lf_per_piece,pieces_available,last_updated` +
      `&pieces_available=gt.0` +
      `&order=species.asc,branch_name.asc` +
      `&limit=${PAGE}&offset=${offset}`;

    const res = await fetch(url, {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
    }

    const page: SupabaseInventoryRow[] = await res.json();
    allRows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  return allRows;
}

// ── App's own Supabase (destination) via PostgREST ────────────────────────────

function appDb(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("Missing app Supabase credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { url, key };
}

async function rest(path: string, init: RequestInit): Promise<Response> {
  const { url, key } = appDb();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${init.method} ${path}: ${res.status} ${await res.text()}`);
  }
  return res;
}

// ── Main sync function ─────────────────────────────────────────────────────────

export async function syncInventoryFromSupabase(): Promise<{ rowsUpserted: number }> {
  const startedAt = new Date();
  let rowsUpserted = 0;

  try {
    const rows = await fetchSupabaseInventory();

    if (!rows.length) {
      throw new Error("Supabase returned 0 rows — aborting sync to avoid wiping local data");
    }

    // Clear existing inventory and replace with fresh data
    await rest("inventory?id=gte.0", { method: "DELETE" });

    const now = new Date().toISOString();
    const toInsert = rows.map(r => {
      const stockLf = Math.round(Number(r.lf_available ?? 0));
      const primaryLength = r.lf_per_piece != null ? Math.round(Number(r.lf_per_piece)) : null;
      return {
        branchName: r.branch_name ?? "",
        species: r.species ?? r.specie ?? "",
        nominalSize: r.nominal_size ?? null,
        profile: r.model ?? r.profile ?? null,
        lengthFt: primaryLength,
        pieces: r.pieces_available != null ? Math.round(Number(r.pieces_available)) : null,
        stockLf,
        lastSyncedAt: now,
      };
    });

    // Insert in batches of 200 to avoid payload size limits
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await rest("inventory", { method: "POST", body: JSON.stringify(toInsert.slice(i, i + BATCH)) });
    }

    rowsUpserted = toInsert.length;

    await rest("inventorySyncLog", {
      method: "POST",
      body: JSON.stringify({ syncedAt: now, rowsUpserted, status: "success" }),
    });

    console.log(`[InventorySync] ✅ Synced ${rowsUpserted} rows at ${now}`);
    return { rowsUpserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[InventorySync] ❌ Error: ${msg}`);

    try {
      await rest("inventorySyncLog", {
        method: "POST",
        body: JSON.stringify({
          syncedAt: startedAt.toISOString(),
          rowsUpserted: 0,
          status: "error",
          errorMessage: msg,
        }),
      });
    } catch {
      // Logging failure must not mask the original error.
    }

    throw err;
  }
}
