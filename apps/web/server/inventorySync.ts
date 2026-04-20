/**
 * inventorySync.ts
 * Fetches inventory data from André's Supabase view and upserts into local DB.
 * Called by the nightly cron and the manual sync tRPC mutation.
 */

import { getDb } from "./db";
import { inventory, inventorySyncLog } from "../drizzle/schema";
import { ENV } from "./_core/env";

// ── Supabase response type ────────────────────────────────────────────────────
interface SupabaseInventoryRow {
  branch_name: string;
  species: string;
  nominal_size: string | null;
  profile: string | null;
  length: number | null;
  pieces: number | null;
  stock_lf: number;
}

// ── Fetch all rows from André's view ─────────────────────────────────────────
async function fetchSupabaseInventory(): Promise<SupabaseInventoryRow[]> {
  const url = `${ENV.supabaseInventoryUrl}/rest/v1/maximo_inventory_view?select=branch_name,species,nominal_size,profile,length,pieces,stock_lf&limit=5000`;
  const res = await fetch(url, {
    headers: {
      apikey: ENV.supabaseInventoryAnonKey,
      Authorization: `Bearer ${ENV.supabaseInventoryAnonKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<SupabaseInventoryRow[]>;
}

// ── Main sync function ────────────────────────────────────────────────────────
export async function syncInventoryFromSupabase(): Promise<{ rowsUpserted: number }> {
  const startedAt = new Date();
  let rowsUpserted = 0;

  try {
    const rows = await fetchSupabaseInventory();

    if (!rows.length) {
      throw new Error("Supabase returned 0 rows — aborting sync to avoid wiping local data");
    }

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Clear existing inventory and replace with fresh data
    await db.delete(inventory);

    // Insert all rows
    const now = new Date();
    const toInsert = rows.map((r) => ({
      branchName: r.branch_name ?? "",
      species: r.species ?? "",
      nominalSize: r.nominal_size ?? null,
      profile: r.profile ?? null,
      lengthFt: r.length != null ? Math.round(Number(r.length)) : null,
      pieces: r.pieces != null ? Math.round(Number(r.pieces)) : null,
      stockLf: Math.round(Number(r.stock_lf) || 0),
      lastSyncedAt: now,
    }));

    // Insert in batches of 200 to avoid query size limits
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await db.insert(inventory).values(toInsert.slice(i, i + BATCH));
    }

    rowsUpserted = toInsert.length;

    // Log success
    await db.insert(inventorySyncLog).values({
      syncedAt: now,
      rowsUpserted,
      status: "success",
    });

    console.log(`[InventorySync] ✅ Synced ${rowsUpserted} rows at ${now.toISOString()}`);
    return { rowsUpserted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[InventorySync] ❌ Error: ${msg}`);

    // Log failure
    const dbForLog = await getDb();
    if (dbForLog) await dbForLog.insert(inventorySyncLog).values({
      syncedAt: startedAt,
      rowsUpserted: 0,
      status: "error",
      errorMessage: msg,
    });

    throw err;
  }
}

// ── Cron scheduler ───────────────────────────────────────────────────────────
// Runs every day at 6:00 AM EST (11:00 UTC)
let cronStarted = false;

export function startInventorySyncCron() {
  if (cronStarted) return;
  cronStarted = true;

  const MS_PER_MINUTE = 60 * 1000;
  const MS_PER_HOUR = 60 * MS_PER_MINUTE;

  function scheduleNext() {
    const now = new Date();
    // Target: 11:00 UTC daily (6 AM EST / 7 AM EDT)
    const next = new Date(now);
    next.setUTCHours(11, 0, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    console.log(`[InventorySync] Next sync scheduled at ${next.toISOString()} (in ${Math.round(delay / MS_PER_MINUTE)} min)`);

    setTimeout(async () => {
      try {
        await syncInventoryFromSupabase();
      } catch {
        // Error already logged inside syncInventoryFromSupabase
      }
      scheduleNext(); // Schedule the next day
    }, delay);
  }

  scheduleNext();
}
