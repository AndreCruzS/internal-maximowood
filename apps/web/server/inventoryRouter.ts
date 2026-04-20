import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { inventory, inventorySyncLog } from "../drizzle/schema";
import { syncInventoryFromSupabase } from "./inventorySync";
import { desc } from "drizzle-orm";

// ── Public types ──────────────────────────────────────────────────────────────

// Per-length entry within a branch
export type LengthEntry = {
  lengthFt: number | null;
  pieces: number | null;
  stockLf: number;
};

// Per-branch breakdown for a given product
export type BranchStock = {
  branch: string;
  totalLF: number;
  lengths: LengthEntry[];
};

// Aggregated product entry across all branches
export type InventoryItem = {
  specie: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
};

// ── Router ────────────────────────────────────────────────────────────────────
export const inventoryRouter = router({
  // Returns all inventory items grouped by product, read from local DB
  getAll: publicProcedure.query(async () => {
    const db = await getDb();

    // If DB is unavailable or empty, fall back to Google Sheet
    if (!db) {
      return { items: [], species: [], branches: [], lastUpdated: null, source: "none" as const };
    }

    const rows = await db.select().from(inventory);

    if (rows.length === 0) {
      // DB is empty — trigger a sync and return empty for now
      syncInventoryFromSupabase().catch(console.error);
      return { items: [], species: [], branches: [], lastUpdated: null, source: "syncing" as const };
    }

    // Group rows into InventoryItem[]
    const productMap = new Map<string, InventoryItem>();

    for (const row of rows) {
      const productKey = `${row.species}||${row.profile ?? ""}||${row.nominalSize ?? ""}`;

      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          specie: row.species,
          profile: row.profile ?? "",
          size: row.nominalSize ?? "",
          branches: [],
          totalLF: 0,
        });
      }

      const product = productMap.get(productKey)!;

      let branch = product.branches.find(b => b.branch === row.branchName);
      if (!branch) {
        branch = { branch: row.branchName, totalLF: 0, lengths: [] };
        product.branches.push(branch);
      }

      // Add length entry if we have length data
      branch.lengths.push({
        lengthFt: row.lengthFt ?? null,
        pieces: row.pieces ?? null,
        stockLf: row.stockLf,
      });

      branch.totalLF += row.stockLf;
      product.totalLF += row.stockLf;
    }

    const items = Array.from(productMap.values()).sort((a, b) =>
      a.specie.localeCompare(b.specie) ||
      a.profile.localeCompare(b.profile) ||
      a.size.localeCompare(b.size)
    );

    const species = Array.from(new Set(items.map(i => i.specie))).sort();
    const branches = Array.from(new Set(rows.map(r => r.branchName).filter(Boolean))).sort();

    // Get last sync time
    const lastSync = await db
      .select({ syncedAt: inventorySyncLog.syncedAt, status: inventorySyncLog.status })
      .from(inventorySyncLog)
      .orderBy(desc(inventorySyncLog.syncedAt))
      .limit(1);

    const lastUpdated = lastSync[0]?.syncedAt ?? rows[0]?.lastSyncedAt ?? null;

    return { items, species, branches, lastUpdated, source: "supabase" as const };
  }),

  // Manual sync trigger — runs the full sync and returns result
  syncNow: publicProcedure.mutation(async () => {
    const result = await syncInventoryFromSupabase();
    return { success: true, rowsUpserted: result.rowsUpserted, syncedAt: new Date() };
  }),

  // Returns the last 10 sync log entries
  getSyncLog: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(inventorySyncLog)
      .orderBy(desc(inventorySyncLog.syncedAt))
      .limit(10);
  }),
});
