# Maximo Inventory — align to curated dictionary fields

**Date:** 2026-05-20
**Owner:** andre@gmxgroup.com
**Status:** Approved (design); implementation pending
**Reference:** `f:\SKYLEV\GMX\CODEBASE 2026 GMX\ODBC\docs\operations\handoff\maximo-inventory-api.md`
**Builds on:** `docs/superpowers/specs/2026-05-15-maximo-inventory-passthrough-design.md`

## Goal

The `maximo_inventory_view` now exposes a curated-dictionary column block (the same
columns the team's "Master Inventory" Excel pivot is built on — Sheet1 *is* this view).
Switch the web app's inventory grouping, filters, and LF source to those dictionary
columns. The on-screen presentation stays exactly as it is today: product cards,
branches nested, length leaves, LF as the only displayed measure.

## Why

- The dictionary columns (`specie`, `model`, `profile_finish`, `size`, `length_ft`, `lf`)
  are GMX-curated classifications that match how the team aggregates daily. Grouping on
  them aligns the app with the team's mental model and adds the missing **Model** dimension.
- `lf` is the view's pre-computed *available* linear feet (`(pieces_on_hand − pieces_committed) × length_ft`,
  tiles `= pieces`). It is exactly the "buyable LF" our code computes by hand, but uses the
  dictionary `length_ft`, which is populated even for the ~16 beam SKUs where Spruce's
  `lf_per_piece` is `0`. Sourcing LF from `lf` therefore both simplifies the code and fixes
  those rows at the source.
- Adopting `size` / `length_ft` removes the need for description-parsing on mapped SKUs.

## Non-goals

- No layout change: no collapsible 6-level tree, no branch-first reorientation.
- No new displayed measures: **Pieces** and **CBM (m³)** are NOT shown. Display stays LF-only,
  identical to today. (`m3` / `conv_pc_m3` are therefore not selected.)
- No server-side aggregation/search/pagination changes; client still filters and groups.
- No auth/endpoint/env changes — those landed in the 2026-05-15 passthrough work.

## Measure decision

Confirmed with owner: keep showing LF only, exactly as today. The "match the pivot"
intent is about which **fields** drive grouping/filtering, not about adding the pivot's
Pieces/CBM columns to the display.

## Field resolution (per row)

Mapped SKUs use dictionary columns; unmapped SKUs (`is_unmapped = true`, dictionary
columns null) fall back to the raw view columns so nothing disappears from the page.

| Logical field | Mapped (dictionary) | Fallback (unmapped / null) |
|---|---|---|
| `specie`   | `specie`         | `species` |
| `model`    | `model`          | `""` |
| `profile`  | `profile_finish` | `profile ?? ""` |
| `size`     | `size`           | `nominal_size?.trim() || sizeFromDescription(description)` |
| `lengthFt` | `length_ft`      | `lf_per_piece > 0 ? lf_per_piece : lengthFromDescription(description)` (else `null`) |
| leaf `LF`  | `lf`             | `lengthFt != null ? lengthFt × pieces_available : 0` |

Notes:
- `is_unmapped === true` is the authoritative "this SKU isn't classified" flag. Independently,
  the fallback for any single field kicks in whenever that dictionary field is null/empty — so
  a partially-classified row (e.g. has `specie` but null `model`) resolves field-by-field.
- The two parser functions `sizeFromDescription` and `lengthFromDescription` are **kept**,
  but demoted to the unmapped fallback path only. They are no longer the primary path.

## Grouping

- Product key changes from `species‖profile‖size` to **`specie‖model‖profile‖size`**
  (using the resolved values above).
- Hierarchy is unchanged: product → branch → length leaf.
- `pieces` per leaf = `pieces_available`. Branch total and product total = sum of leaf `LF`.
- `last_updated` handling unchanged (max across rows → one page timestamp).

## Data layer — `apps/web/server/maximoInventoryView.ts`

- `SELECT_COLS` adds: `specie, model, profile_finish, size, length_ft, lf, is_unmapped`.
  Existing columns retained (needed for the fallback path): `branch_name, species, category,
  nominal_size, profile, description, lf_per_piece, pieces_available, lf_available, last_updated`.
- `MaximoRow` interface extended with the new fields, all nullable:
  `specie: string | null`, `model: string | null`, `profile_finish: string | null`,
  `size: string | null`, `length_ft: number | null`, `lf: number | null`, `is_unmapped: boolean | null`.
- `InventoryItem` gains `model: string` and `isUnmapped: boolean`.
- `groupMaximoRows` applies the field-resolution table, the new grouping key, and sources
  leaf LF from `lf` (with fallback).
- `GroupedInventory` gains `models: string[]` (sorted, blanks filtered) for the filter list.
- Query `order=` and pagination unchanged.

## Server contract — `apps/web/server/inventoryRouter.ts`

- `getAll` returns the same shape plus `models`. Re-export `InventoryItem`/`BranchStock`/`LengthEntry` as today.

## UI — `apps/web/client/src/pages/Inventory.tsx`

- `InventoryItem` type gains `model: string` and `isUnmapped: boolean`.
- Card header renders `Specie · Model · Profile · Size`; the **Model** segment is hidden when
  empty (same convention already used for profile/size). A small **⚠ unmapped** marker shows
  when `isUnmapped`.
- Filter bar adds a **Model** dropdown, cascading consistently with the existing
  Category/Specie/Profile/Size filters. Search continues to match specie/model/profile/size text.
- All LF figures now derive from the `lf`-sourced totals; no Pieces/CBM columns added.
- Refresh button, "Live · last changed" indicator, loading/error/empty states: unchanged.

## Tests

- `apps/web/server/maximoInventoryView.test.ts`: add cases for
  (a) mapped row grouped by dictionary fields,
  (b) unmapped row falling back to raw species/nominal_size/length,
  (c) leaf LF sourced from `lf` for mapped and from the computed fallback for unmapped,
  (d) `models` list populated and de-duplicated.
- Keep existing grouping tests; update fixtures to include the new columns.

## Files changed

| File | Change |
|---|---|
| `apps/web/server/maximoInventoryView.ts` | New columns in `SELECT_COLS` + `MaximoRow`; field-resolution; new grouping key; `lf`-sourced totals; `model`/`isUnmapped` on `InventoryItem`; `models` on `GroupedInventory`; keep parsers as fallback only |
| `apps/web/server/inventoryRouter.ts` | Return `models` in `getAll` payload |
| `apps/web/server/maximoInventoryView.test.ts` | New fixtures/cases per Tests section |
| `apps/web/client/src/pages/Inventory.tsx` | Model in header (hidden when empty) + ⚠ unmapped marker; Model filter dropdown; types updated |

## Risks

| Risk | Mitigation |
|---|---|
| Dictionary `lf` null for unmapped non-tile SKUs | Fallback computes LF from `lf_per_piece`/description parse, as today |
| Many unmapped SKUs clutter the catalog | Acceptable per owner; they remain visible (flagged ⚠). `maximo_unmapped_skus` is the source of truth for the gap list |
| Two different SKUs collapse into one dictionary product key | Intended — that is the pivot's aggregation behavior; lengths still separate into distinct leaves |
| `specie`/`size` dictionary values differ from raw `species`/`nominal_size` | Intended; dictionary is the team's canonical classification |

## Open questions

None. Design approved by owner 2026-05-20.
