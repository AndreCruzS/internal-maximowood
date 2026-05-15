# Maximo Inventory — pass-through against the new Supabase view

**Date:** 2026-05-15
**Owner:** andre@gmxgroup.com
**Status:** Approved (design); implementation pending
**Reference:** `f:\SKYLEV\GMX\CODEBASE 2026 GMX\ODBC\docs\operations\handoff\maximo-inventory-api.md`

## Goal

Switch the Maximowood web app's inventory feature to read directly from the new live Supabase view (`maximo_inventory_view` in project `mmmdvtpmmwdupdcincoo`) on every request. Remove the local DB cache, sync cron, and sync mutation. The view is already filtered to positive on-hand, the three in-scope categories, and the seven whitelisted branches, so the server just relays it to the existing UI shape.

## Why

- The handoff is the authoritative integration contract going forward. It's live, read-only, refreshes within a minute of Spruce changes, and uses a different auth model than the project we were syncing from previously.
- Current code is wrong against the new endpoint in three ways: it uses the old project URL, it sends one shared key as both `apikey` and `Authorization: Bearer`, and it selects column names (`length`, `pieces`, `stock_lf`) that no longer exist in the new view.
- 1,400 rows is small enough that a per-request fetch is cheaper and simpler than maintaining a cache + cron + reconciliation logic. The local DB was a cache, not a source of truth — there's nothing in it that isn't fully reconstructible from the view.

## Non-goals

- Surfacing new columns (`sku`, `category`, `branch_id`, `pieces_committed`, `pieces_on_order`, `last_updated` per-row, `lf_uom`, `base_uom`, `description`) in the UI. We keep the existing grouped-by-product UI shape. Adding these is a follow-up if/when they're needed.
- Server-side aggregation, search, or pagination. The client already filters and groups; payload size doesn't justify it.
- Schema migrations beyond dropping the two now-unused tables.

## Auth model change

The new view requires two **distinct** header values:

| Header | Value | Env var |
|---|---|---|
| `apikey` | publishable key (`sb_publishable_…`) | `SUPABASE_INVENTORY_APIKEY` |
| `Authorization` | `Bearer <reader_maximo JWT>` | `MAXIMO_READER_JWT` |

Project base URL: `SUPABASE_INVENTORY_URL` = `https://mmmdvtpmmwdupdcincoo.supabase.co`.

Current code reuses `SUPABASE_INVENTORY_ANON_KEY` as both. That env var is dropped.

**Why:** PostgREST validates the `apikey` as the project front door and then validates the JWT to `SET ROLE reader_maximo` for the request. They are not the same value.

**How to apply:** The publishable apikey and the JWT are live credentials in the handoff doc. They go into Vercel project env vars and the developer's local `.env`. `.env.example` shows placeholders only — never commit the real values.

## Endpoint

```
GET {SUPABASE_INVENTORY_URL}/rest/v1/maximo_inventory_view
    ?select=branch_name,species,nominal_size,profile,lf_per_piece,pieces_available,lf_available,last_updated
    &limit=2000
Headers:
  apikey:        {SUPABASE_INVENTORY_APIKEY}
  Authorization: Bearer {MAXIMO_READER_JWT}
  Accept:        application/json
```

`limit=2000` comfortably covers the current ~1,400 rows. No filtering — the view is already scoped to positive on-hand × the 7 whitelisted branches × the 3 categories.

## Field mapping (view → router output)

Router output keeps its current shape so the frontend changes are cosmetic only.

| Router field | View column | Notes |
|---|---|---|
| `branch` | `branch_name` | |
| `specie` | `species` | |
| `profile` | `profile ?? ""` | view may return null for non-profiled items |
| `size` | `nominal_size ?? ""` | view may return null |
| `lengthFt` | `lf_per_piece` | **now numeric** — drop the `Math.round` int coercion |
| `pieces` | `pieces_available` | spec: use as the customer-facing "can be ordered" number |
| `stockLf` | `lf_available` | matches Crystal Reports `LFBFLength × OnHand` gated on `lf_uom = 'LF'` |
| `lastUpdated` | `max(last_updated)` across all rows | one timestamp for the whole page |

## Files changed

| File | Change |
|---|---|
| `apps/web/server/_core/env.ts` | Replace `supabaseInventoryAnonKey` with `supabaseInventoryApikey` and `maximoReaderJwt` |
| `apps/web/server/inventoryRouter.ts` | `getAll` fetches view directly; drop `syncNow` and `getSyncLog` procedures |
| `apps/web/server/inventorySync.ts` | **Delete** |
| `apps/web/server/inventorySync.test.ts` | **Delete** (integration test against old project) |
| `apps/web/api/cron/sync-inventory.ts` | **Delete** |
| `apps/web/vercel.json` | Remove the cron entry, the `sync-inventory` rewrite, and its function config |
| `apps/web/drizzle/schema.ts` | Drop `inventory` and `inventorySyncLog` table definitions and their TS types |
| `apps/web/drizzle/0003_drop_inventory_tables.sql` | New migration: `DROP TABLE IF EXISTS inventory; DROP TABLE IF EXISTS inventory_sync_log;` (next in the existing 0000/0001/0002 sequence) |
| `apps/web/client/src/pages/Inventory.tsx` | Remove "Sync Supabase" button and `syncMutation`; keep "Refresh"; rename source indicator from "Last synced" to "Live · last changed" |
| `apps/web/.env.example` | Replace `SUPABASE_INVENTORY_ANON_KEY` with `SUPABASE_INVENTORY_APIKEY` and `MAXIMO_READER_JWT`; placeholders only |
| `apps/web/server/inventory.test.ts` | Keep grouping tests as-is (they're pure unit tests over an in-memory shape); no change needed |

## Caching and load

- Client: React Query keeps `inventory.getAll` with `staleTime: 5 * 60 * 1000`. A user navigating around the app re-uses the cached response for 5 minutes.
- Server: no in-memory cache. Each tRPC call hits the view. With ~1,400 rows and the handoff's recommended "≥ 30s polling" comfortably exceeded by a 5-min client stale window, load is a non-issue.
- Spec says PostgREST is "free of project-imposed throttling at this tier" — we don't need to worry about per-app rate limits.

## Error handling

- Non-2xx response → tRPC procedure throws; UI renders its existing red `error` branch with the message.
- No fallback to stale local data — the local DB is gone. This is a deliberate trade: simpler code, plus an outage in the view is visible immediately rather than masked.
- The "syncing" UI state (which previously meant "DB empty, triggering first sync") is removed. The `source` field becomes `"live"` always (or implicit; we can drop it).

## Risks

| Risk | Mitigation |
|---|---|
| View goes down → inventory page errors with no fallback | Acceptable. The view is the source of truth; cached data could be hours stale and silently misleading. Surface the error clearly. |
| JWT expires before 2027-05-12 rotation | Operational, not code. The error message bubbles up; ops contact in handoff is `andre@gmxgroup.com`. |
| Numeric `lf_per_piece` / `pieces_available` / `lf_available` overflow display formatting | Existing `toLocaleString` calls in the UI handle floats fine. The previous `Math.round` was lossy and is removed deliberately. |
| Dropping `inventory` + `inventory_sync_log` is irreversible | No-op for product behavior; these were a cache. Migration is committed so it's traceable. |

## Open questions

None. Design is fully specified.
