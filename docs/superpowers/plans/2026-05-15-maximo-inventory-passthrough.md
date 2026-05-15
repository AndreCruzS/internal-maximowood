# Maximo Inventory Pass-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the inventory feature from a local-DB-cached sync model to a direct read against the new Maximo Supabase view documented in the ODBC handoff, removing the sync cron, sync mutation, and local inventory tables.

**Architecture:** The tRPC `inventory.getAll` procedure fetches `maximo_inventory_view` over HTTPS on each call (publishable-key + reader-JWT auth), groups rows in-process into the existing `InventoryItem[]` shape the UI already consumes, and returns. No DB, no cron, no sync state. React Query's existing 5-min client `staleTime` is the only cache.

**Tech Stack:** TypeScript, tRPC v11, React Query v5, Drizzle ORM (only for the cleanup migration), Vitest, Vite, Vercel functions. Existing project: `apps/web/` workspace in a pnpm monorepo.

**Reference spec:** `docs/superpowers/specs/2026-05-15-maximo-inventory-passthrough-design.md`
**Reference handoff:** `f:\SKYLEV\GMX\CODEBASE 2026 GMX\ODBC\docs\operations\handoff\maximo-inventory-api.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/server/_core/env.ts` | Modify | Expose `supabaseInventoryUrl`, `supabaseInventoryApikey`, `maximoReaderJwt`. Drop `supabaseInventoryAnonKey`. |
| `apps/web/.env.example` | Modify | Document the three env vars with placeholder values. |
| `apps/web/server/maximoInventoryView.ts` | **Create** | Pure HTTP client + row→`InventoryItem[]` grouping. No tRPC, no React. One job: "fetch the view, return grouped rows + metadata." |
| `apps/web/server/maximoInventoryView.test.ts` | **Create** | Unit tests for the grouping function. Mock `fetch` for the HTTP path. |
| `apps/web/server/inventoryRouter.ts` | Rewrite | tRPC procedure that calls `maximoInventoryView.ts`. Drop `syncNow` and `getSyncLog`. |
| `apps/web/server/inventorySync.ts` | **Delete** | Replaced by `maximoInventoryView.ts`. |
| `apps/web/server/inventorySync.test.ts` | **Delete** | Was a live integration test against the old project URL. |
| `apps/web/api/cron/sync-inventory.ts` | **Delete** | No more cron. |
| `apps/web/vercel.json` | Modify | Remove the `crons` entry, the `sync-inventory` rewrite, and the function config. |
| `apps/web/client/src/pages/Inventory.tsx` | Modify | Remove "Sync Supabase" button and `syncMutation`. Keep "Refresh". Adjust source indicator copy. |
| `apps/web/drizzle/schema.ts` | Modify | Remove `inventory` and `inventorySyncLog` tables and their exported types. |
| `apps/web/drizzle/migrations/0001_drop_inventory_tables.sql` (+ meta journal) | **Create** (via `drizzle-kit generate`) | Auto-generated `DROP TABLE` migration. |
| `apps/web/server/inventory.test.ts` | Keep as-is | Pure-function grouping tests over an in-memory shape. Still valid documentation of expected output. |

The pure `maximoInventoryView.ts` module exists so the HTTP-plus-grouping logic is unit-testable without spinning up tRPC. Keeping it separate from the router keeps each file focused.

---

## Task 1: Split the env vars

**Files:**
- Modify: `apps/web/server/_core/env.ts`
- Modify: `apps/web/.env.example`

The current `env.ts` exposes `supabaseInventoryUrl` and `supabaseInventoryAnonKey`. The new view needs the URL plus **two** distinct values — a publishable `apikey` and a `Bearer` JWT. We split the env into three named values up front so subsequent tasks can rely on them.

- [ ] **Step 1: Update `apps/web/server/_core/env.ts`**

Replace the whole file with:

```ts
export const ENV = {
  databaseUrl: process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseInventoryUrl: process.env.SUPABASE_INVENTORY_URL ?? "",
  supabaseInventoryApikey: process.env.SUPABASE_INVENTORY_APIKEY ?? "",
  maximoReaderJwt: process.env.MAXIMO_READER_JWT ?? "",
};
```

The old `supabaseInventoryAnonKey` is removed. Any reference to it elsewhere becomes a TypeScript error — we fix those callers in later tasks.

- [ ] **Step 2: Update `apps/web/.env.example`**

Replace the two `SUPABASE_INVENTORY_*` lines:

```
# Supabase Inventory — Maximo read-only view (project: mmmdvtpmmwdupdcincoo)
# Values are live credentials; see ODBC handoff doc, do not commit real values.
SUPABASE_INVENTORY_URL=https://mmmdvtpmmwdupdcincoo.supabase.co
SUPABASE_INVENTORY_APIKEY=sb_publishable_xxx
MAXIMO_READER_JWT=eyJ_reader_maximo_jwt_xxx
```

Leave everything else in `.env.example` unchanged.

- [ ] **Step 3: Sanity-check the typecheck before moving on**

From `apps/web`:

```
pnpm check
```

Expected: TypeScript errors complaining that `inventorySync.ts` references `ENV.supabaseInventoryAnonKey` which no longer exists. Those errors are expected — they will be resolved by Tasks 2–4 deleting/replacing that file.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/_core/env.ts apps/web/.env.example
git commit -m "feat(env): split inventory apikey and reader JWT for new Maximo view"
```

---

## Task 2: Write the failing grouping test

**Files:**
- Create: `apps/web/server/maximoInventoryView.test.ts`

We start with the test so the contract for the new module is pinned before we implement it. The module exposes two things: `fetchMaximoInventory()` (network) and `groupMaximoRows(rows)` (pure). We test grouping first because it's the substance of the change.

- [ ] **Step 1: Write the failing test file**

```ts
// apps/web/server/maximoInventoryView.test.ts
import { describe, it, expect } from "vitest";
import { groupMaximoRows, type MaximoRow } from "./maximoInventoryView";

describe("groupMaximoRows", () => {
  it("groups rows by (species, profile, nominal_size) across branches", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 10,
        lf_available: 160,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global NY",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 14,
        pieces_available: 5,
        lf_available: 70,
        last_updated: "2026-05-11T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 12,
        pieces_available: 2,
        lf_available: 24,
        last_updated: "2026-05-09T00:00:00Z",
      },
    ];

    const result = groupMaximoRows(rows);

    expect(result.items).toHaveLength(1);
    const ipe = result.items[0];
    expect(ipe.specie).toBe("IPE");
    expect(ipe.profile).toBe("S4S E4E");
    expect(ipe.size).toBe("2x6");
    expect(ipe.totalLF).toBe(254); // 160 + 70 + 24

    expect(ipe.branches).toHaveLength(2);
    const miami = ipe.branches.find(b => b.branch === "Global Miami");
    expect(miami?.totalLF).toBe(184); // 160 + 24
    expect(miami?.lengths).toEqual([
      { lengthFt: 16, pieces: 10, stockLf: 160 },
      { lengthFt: 12, pieces: 2, stockLf: 24 },
    ]);

    expect(result.species).toEqual(["IPE"]);
    expect(result.branches).toEqual(["Global Miami", "Global NY"]);
    expect(result.lastUpdated).toEqual(new Date("2026-05-11T00:00:00Z"));
  });

  it("treats null profile and null nominal_size as empty-string keys", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: null,
        profile: null,
        lf_per_piece: 0,
        pieces_available: 100,
        lf_available: 0,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].profile).toBe("");
    expect(result.items[0].size).toBe("");
  });

  it("returns empty arrays and null lastUpdated for empty input", () => {
    const result = groupMaximoRows([]);
    expect(result.items).toEqual([]);
    expect(result.species).toEqual([]);
    expect(result.branches).toEqual([]);
    expect(result.lastUpdated).toBeNull();
  });

  it("sorts items by species, then profile, then size", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "CUMARU",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
      {
        branch_name: "Global Miami",
        species: "ANGELIM",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 1,
        lf_available: 16,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const result = groupMaximoRows(rows);
    expect(result.items.map(i => i.specie)).toEqual(["ANGELIM", "CUMARU"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/web`:

```
pnpm test maximoInventoryView
```

Expected: failure — `Cannot find module './maximoInventoryView'`. This confirms the test is correctly wired before we write the implementation.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/maximoInventoryView.test.ts
git commit -m "test(inventory): pin grouping contract for Maximo view"
```

---

## Task 3: Implement the grouping function

**Files:**
- Create: `apps/web/server/maximoInventoryView.ts`

Implement only what makes Task 2's grouping tests pass. The HTTP fetch goes in the next task.

- [ ] **Step 1: Create `apps/web/server/maximoInventoryView.ts` with the types and pure grouping function**

```ts
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
```

The `lengthFt > 0 ? value : null` mirrors the spec note that `lf_per_piece = 0` means "length not tracked" (e.g. tiles). The existing UI already filters length entries on `l.lengthFt != null` to decide whether to render the per-length row, so emitting `null` here is the cleaner contract.

- [ ] **Step 2: Run the tests to verify they pass**

From `apps/web`:

```
pnpm test maximoInventoryView
```

Expected: all four tests in `maximoInventoryView.test.ts` pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/maximoInventoryView.ts
git commit -m "feat(inventory): pure groupMaximoRows over view rows"
```

---

## Task 4: Add the HTTP fetch function

**Files:**
- Modify: `apps/web/server/maximoInventoryView.ts`
- Modify: `apps/web/server/maximoInventoryView.test.ts`

Now add the network-side function: `fetchMaximoInventory()`. We unit-test by mocking `fetch` so the test is offline.

- [ ] **Step 1: Append the failing fetch test to `maximoInventoryView.test.ts`**

Append (do NOT replace existing tests):

```ts
import { vi, beforeEach, afterEach } from "vitest";
import { fetchMaximoInventory } from "./maximoInventoryView";

describe("fetchMaximoInventory", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.SUPABASE_INVENTORY_URL = "https://example.supabase.co";
    process.env.SUPABASE_INVENTORY_APIKEY = "test-apikey";
    process.env.MAXIMO_READER_JWT = "test-jwt";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("calls the view with both apikey and Bearer headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [] as MaximoRow[],
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await fetchMaximoInventory();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://example.supabase.co/rest/v1/maximo_inventory_view");
    expect(url).toContain("select=branch_name,species,nominal_size,profile,lf_per_piece,pieces_available,lf_available,last_updated");
    expect(url).toContain("limit=2000");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("test-apikey");
    expect(headers.Authorization).toBe("Bearer test-jwt");
    expect(headers.Accept).toBe("application/json");
  });

  it("throws with status + body when the view returns non-2xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid JWT",
      json: async () => ({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    await expect(fetchMaximoInventory()).rejects.toThrow(/401.*invalid JWT/);
  });

  it("returns rows on a 200 response", async () => {
    const sample: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        nominal_size: "2x6",
        profile: "S4S E4E",
        lf_per_piece: 16,
        pieces_available: 3,
        lf_available: 48,
        last_updated: "2026-05-10T00:00:00Z",
      },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => sample,
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const rows = await fetchMaximoInventory();
    expect(rows).toEqual(sample);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```
pnpm test maximoInventoryView
```

Expected: the three new tests fail with `fetchMaximoInventory is not a function` (or "not exported"). Existing grouping tests still pass.

- [ ] **Step 3: Implement `fetchMaximoInventory` in `apps/web/server/maximoInventoryView.ts`**

Add these imports at the top, just under the file-level comment:

```ts
import { ENV } from "./_core/env";
```

Append this function at the bottom of `maximoInventoryView.ts`:

```ts
export async function fetchMaximoInventory(): Promise<MaximoRow[]> {
  const base = ENV.supabaseInventoryUrl;
  const apikey = ENV.supabaseInventoryApikey;
  const jwt = ENV.maximoReaderJwt;

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
```

The env-missing guard fires only when none of the three are configured, which is the dev-without-`.env` case. We surface a clear, actionable error message instead of a confusing PostgREST 401.

- [ ] **Step 4: Run the tests, confirm all pass**

```
pnpm test maximoInventoryView
```

Expected: all seven tests pass (four grouping + three fetch).

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/maximoInventoryView.ts apps/web/server/maximoInventoryView.test.ts
git commit -m "feat(inventory): fetch Maximo view with split apikey/JWT auth"
```

---

## Task 5: Rewrite the tRPC router to call the new module

**Files:**
- Modify: `apps/web/server/inventoryRouter.ts`

Drop the `syncNow` and `getSyncLog` procedures. `getAll` now calls `fetchMaximoInventory` + `groupMaximoRows` and returns the same shape the UI already consumes (plus a `source: "live" | "error"` constant for the existing source indicator).

- [ ] **Step 1: Replace `apps/web/server/inventoryRouter.ts` entirely with:**

```ts
import { publicProcedure, router } from "./_core/trpc";
import { fetchMaximoInventory, groupMaximoRows } from "./maximoInventoryView";

export type { InventoryItem, BranchStock, LengthEntry } from "./maximoInventoryView";

export const inventoryRouter = router({
  // Live read of the Maximo inventory view, grouped for the UI.
  getAll: publicProcedure.query(async () => {
    const rows = await fetchMaximoInventory();
    const { items, species, branches, lastUpdated } = groupMaximoRows(rows);
    return { items, species, branches, lastUpdated, source: "live" as const };
  }),
});
```

The `export type { ... }` re-exports keep any importers (the UI used to import types loosely from here via the inferred tRPC type, but we re-export defensively in case future code imports them by name).

- [ ] **Step 2: Run typecheck**

```
pnpm check
```

Expected: the only remaining errors should be in `inventorySync.ts` and `api/cron/sync-inventory.ts`, which we delete in Task 6. The router itself should typecheck cleanly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/inventoryRouter.ts
git commit -m "feat(inventory): tRPC getAll reads Maximo view live, drops syncNow/getSyncLog"
```

---

## Task 6: Delete the cron + sync infrastructure

**Files:**
- Delete: `apps/web/server/inventorySync.ts`
- Delete: `apps/web/server/inventorySync.test.ts`
- Delete: `apps/web/api/cron/sync-inventory.ts`
- Modify: `apps/web/vercel.json`

Nothing references these anymore (router was rewritten in Task 5).

- [ ] **Step 1: Delete the three files**

From the repo root:

```bash
rm "apps/web/server/inventorySync.ts" \
   "apps/web/server/inventorySync.test.ts" \
   "apps/web/api/cron/sync-inventory.ts"
```

(On Windows PowerShell: `Remove-Item apps/web/server/inventorySync.ts, apps/web/server/inventorySync.test.ts, apps/web/api/cron/sync-inventory.ts`)

- [ ] **Step 2: Update `apps/web/vercel.json` to remove cron and sync-inventory references**

Replace the file with:

```json
{
  "version": 2,
  "buildCommand": "pnpm build",
  "outputDirectory": "dist/public",
  "installCommand": "pnpm install",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "functions": {
    "api/index.ts": { "maxDuration": 30 }
  }
}
```

Removed: the `/api/cron/sync-inventory` rewrite, the `api/cron/sync-inventory.ts` function config, and the entire `crons` array.

- [ ] **Step 3: Run typecheck and tests**

```
pnpm check
pnpm test
```

Expected: typecheck clean. All tests pass — `inventory.test.ts` (still valid — it tests an in-memory grouping function unrelated to the deletion) and `maximoInventoryView.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/server/inventorySync.ts apps/web/server/inventorySync.test.ts apps/web/api/cron/sync-inventory.ts apps/web/vercel.json
git commit -m "chore(inventory): remove sync cron and local-cache infrastructure"
```

(The `-A` ensures deletions are staged. Verify with `git status` before committing.)

---

## Task 7: Clean up the Inventory page UI

**Files:**
- Modify: `apps/web/client/src/pages/Inventory.tsx`

Remove the "Sync Supabase" button and the `syncMutation`. Drop the `"syncing"` source branch (no longer reachable). Relabel the source indicator from "Last synced" to "Live · last changed".

- [ ] **Step 1: Edit `apps/web/client/src/pages/Inventory.tsx`**

Remove these imports (no longer used after the changes below):
- `Database` from `lucide-react` (keep `CloudOff`; if `Database` was only used by the removed button, drop it)
- `toast` from `sonner` (only used by the deleted `onSuccess`/`onError`)

Remove the `syncMutation` block entirely (lines ~44-52 in the current file):

```ts
// DELETE THIS:
const syncMutation = trpc.inventory.syncNow.useMutation({ ... });
```

Update `isSyncing` (around line 71):

```ts
// BEFORE
const isSyncing = syncMutation.isPending || isFetching;
// AFTER
const isSyncing = isFetching;
```

Replace the source-indicator block (lines ~81-104) with:

```tsx
{source === "live" && (
  <span className="flex items-center gap-1 text-xs text-[#888]">
    <Database className="w-3 h-3" style={{ color: GOLD }} />
    Live · last changed{" "}
    {data?.lastUpdated
      ? new Date(data.lastUpdated).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        })
      : "—"}
  </span>
)}
```

(Keep `Database` imported — it's still used here. Drop only the unused imports above.)

Delete the "Sync Supabase" button block (lines ~117-128):

```tsx
// DELETE:
<button
  onClick={() => syncMutation.mutate()}
  ...
>
  ...
  {syncMutation.isPending ? "Syncing..." : "Sync Supabase"}
</button>
```

Delete the "Syncing for first time" branch (lines ~217-223):

```tsx
// DELETE:
{!isLoading && !error && source === "syncing" && (
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
    ...
  </div>
)}
```

Update the "Empty" condition (line ~226) — it currently reads `source !== "syncing"`. Simplify since `syncing` no longer exists:

```tsx
// BEFORE
{!isLoading && !error && source !== "syncing" && filtered.length === 0 && (
// AFTER
{!isLoading && !error && filtered.length === 0 && (
```

- [ ] **Step 2: Run typecheck**

```
pnpm check
```

Expected: clean.

- [ ] **Step 3: Smoke-test in the browser**

Start the dev server (`pnpm dev` from `apps/web`), navigate to the Inventory page, and confirm:
- Page loads with the live data (no spinner, no error banner)
- "Live · last changed <date>" appears in the header
- "Sync Supabase" button is gone
- "Refresh" button works (click → spinner → refresh)
- Filters work (species, branch, search)
- Inventory cards show grouped products with per-branch and per-length breakdowns

If `pnpm dev` can't be run interactively in this environment, note that explicitly in the commit message rather than silently skipping verification.

- [ ] **Step 4: Commit**

```bash
git add apps/web/client/src/pages/Inventory.tsx
git commit -m "feat(inventory-ui): remove sync button, relabel for live source"
```

---

## Task 8: Drop the inventory tables from the schema

**Files:**
- Modify: `apps/web/drizzle/schema.ts`
- Create (auto-generated): `apps/web/drizzle/migrations/0001_*.sql` and updated meta journal

`schema.ts` no longer has any consumers of the `inventory` and `inventorySyncLog` tables after Tasks 5–6. Drop them and let `drizzle-kit generate` produce the migration.

- [ ] **Step 1: Edit `apps/web/drizzle/schema.ts`**

Delete the entire `inventory` and `inventorySyncLog` table blocks (currently lines ~47-73). The file should end after the `users` table and its type exports. Also remove the `integer` import if no other table uses it (the `users` table doesn't use it, so it can be dropped from the import).

Resulting imports:

```ts
import {
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
```

(Drop `integer`.)

- [ ] **Step 2: Generate the migration**

From `apps/web`:

```
pnpm drizzle-kit generate
```

Expected: a new file `apps/web/drizzle/migrations/0001_<random-name>.sql` containing `DROP TABLE "inventory"` and `DROP TABLE "inventory_sync_log"` statements, plus an updated `apps/web/drizzle/migrations/meta/_journal.json`.

Inspect the generated SQL to confirm it only drops those two tables. If it looks wrong, do not apply — investigate before proceeding.

- [ ] **Step 3: Apply the migration against the dev DB (manual / authorised)**

> **This is the destructive step. Run it only with explicit go-ahead from the owner.** It drops two tables in the linked Supabase project. They contain only cached inventory data that is fully reconstructible from the live view, but if a non-cache value somehow ended up there it would be lost.

From `apps/web` with `DATABASE_URL` (or `POSTGRES_URL`) pointing at the target environment:

```
pnpm drizzle-kit migrate
```

Expected: drizzle-kit reports `0001_*` applied. The Supabase dashboard for the project should no longer list the `inventory` or `inventory_sync_log` tables.

- [ ] **Step 4: Commit**

```bash
git add apps/web/drizzle/schema.ts apps/web/drizzle/migrations/
git commit -m "chore(db): drop unused inventory and inventory_sync_log tables"
```

---

## Task 9: Final verification pass

**Files:** (none modified)

A quick belt-and-braces check before declaring done.

- [ ] **Step 1: Typecheck the whole web workspace**

From `apps/web`:

```
pnpm check
```

Expected: zero errors.

- [ ] **Step 2: Run the test suite**

```
pnpm test
```

Expected: all tests pass. The suite at this point is:
- `apps/web/server/inventory.test.ts` (pure grouping unit tests; unchanged)
- `apps/web/server/maximoInventoryView.test.ts` (created in Tasks 2–4)
- Any other unrelated tests already in the repo

- [ ] **Step 3: Browser smoke test**

If not done in Task 7, run the dev server now and confirm the Inventory page renders live data end-to-end. Note in the final commit message whether this verification ran.

- [ ] **Step 4: Final commit (only if anything changed, e.g. a small fix)**

```bash
git status
# If clean, no commit needed.
```

---

## Verification checklist (manual)

After all tasks:

- [ ] `pnpm check` is clean
- [ ] `pnpm test` is green
- [ ] Inventory page renders live data from the new view
- [ ] No "Sync Supabase" button is visible
- [ ] Source indicator reads "Live · last changed …"
- [ ] Network panel shows requests going to `mmmdvtpmmwdupdcincoo.supabase.co/rest/v1/maximo_inventory_view` with both `apikey` and `Authorization: Bearer` headers
- [ ] Vercel dashboard for the project shows no `sync-inventory` cron in the upcoming runs
- [ ] Supabase dashboard for the linked project (the *app's* DB, not the Maximo source) no longer lists `inventory` / `inventory_sync_log`
