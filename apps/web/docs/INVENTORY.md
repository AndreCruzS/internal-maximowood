# Inventory System

## Overview

The inventory system syncs product stock data from an **external Supabase database** (managed by André) into the app's local MySQL/TiDB database. This two-database architecture allows the app to serve inventory data quickly from a local query while André maintains the source of truth in his own Supabase project.

---

## External Source: Supabase Inventory View

André's Supabase project exposes a view called `maximo_inventory_view` with the following columns:

| Column | Type | Description |
|---|---|---|
| `branch_name` | text | Warehouse location (e.g. "Miami", "NY", "Boston") |
| `species` | text | Wood species name |
| `nominal_size` | text | Board dimensions (e.g. "1x6") |
| `profile` | text | Surface profile (e.g. "V Joint / Square Back") |
| `length` | integer | Piece length in feet |
| `pieces` | integer | Number of pieces of this length in stock |
| `stock_lf` | integer | Total linear feet for this length (= length × pieces) |

The view is accessed via the Supabase REST API using the project's anon key. No authentication beyond the anon key is required.

```typescript
// server/inventorySync.ts — fetch from Supabase view
const url = `${ENV.supabaseInventoryUrl}/rest/v1/maximo_inventory_view?select=*&limit=5000`;
const response = await fetch(url, {
  headers: {
    "apikey": ENV.supabaseInventoryAnonKey,
    "Authorization": `Bearer ${ENV.supabaseInventoryAnonKey}`,
  },
});
```

---

## Local Database Schema

The synced data is stored in the `inventory` table:

```sql
CREATE TABLE inventory (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branchName    VARCHAR(128) NOT NULL,
  species       VARCHAR(128) NOT NULL,
  nominalSize   VARCHAR(32),
  profile       VARCHAR(256),
  lengthFt      INT,          -- from view.length
  pieces        INT,          -- from view.pieces
  stockLf       INT NOT NULL DEFAULT 0,
  lastSyncedAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Each row represents one **product × branch × length** combination. For example, Cumaru 5/4x6 at Miami in 10ft lengths is a single row.

---

## Sync Logic (`server/inventorySync.ts`)

The sync process:

1. Fetches all rows from `maximo_inventory_view` (up to 5,000 rows).
2. Deletes all existing rows in the local `inventory` table.
3. Inserts the new rows in batches of 200 to avoid query size limits.
4. Logs the result to `inventory_sync_log`.

```typescript
// server/inventorySync.ts — sync function signature
export async function syncInventoryFromSupabase(): Promise<{
  rowsUpserted: number;
  syncedAt: Date;
}>;
```

The sync is triggered in two ways:
- **Automatically** at 11:00 UTC daily via a `setTimeout`-based scheduler in `server/_core/index.ts`.
- **Manually** by a rep clicking "Sync Supabase" in the Inventory tab UI, which calls `trpc.inventory.syncNow`.

---

## tRPC Procedures (`server/inventoryRouter.ts`)

| Procedure | Type | Description |
|---|---|---|
| `inventory.getAll` | query | Returns grouped inventory: `InventoryItem[]` |
| `inventory.syncNow` | mutation | Triggers an immediate sync from Supabase |
| `inventory.getSyncLog` | query | Returns the 10 most recent sync log entries |

### `getAll` Response Shape

```typescript
interface InventoryItem {
  species: string;
  nominalSize: string;
  profile: string;
  totalLF: number;
  branches: BranchStock[];
}

interface BranchStock {
  branchName: string;
  totalLF: number;
  lengths: {
    lengthFt: number;
    pieces: number;
    stockLf: number;
  }[];
}
```

The router groups the flat DB rows by `(species, nominalSize, profile)` → `branchName` → `lengthFt` in a single pass, computing totals at each level.

---

## Environment Variables Required

```bash
SUPABASE_INVENTORY_URL=https://[ANDRE-PROJECT-REF].supabase.co
SUPABASE_INVENTORY_ANON_KEY=eyJ...
```

These are separate from the app's own database credentials. The app's own database is configured via `DATABASE_URL`.
