# Maximo Inventory — Align to Dictionary Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the inventory page's grouping, filters, and LF source to the view's curated dictionary columns (`specie`, `model`, `profile_finish`, `size`, `length_ft`, `lf`), adding a Model dimension and keeping the LF-only card display unchanged.

**Architecture:** Server resolves each row field-by-field — preferring the dictionary column, falling back to the raw view column (and the existing description parsers) for SKUs flagged `is_unmapped`. Grouping key gains `model`. LF is sourced from the view's pre-computed `lf` with a computed fallback. The React page gains a Model filter, a Model header segment, and an "unmapped" marker. No layout change, no new measures.

**Tech Stack:** TypeScript, tRPC, React 19, Vitest, PostgREST (Supabase view), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-05-20-maximo-inventory-dictionary-fields-design.md`

**Working directory for all commands:** `apps/web/` (the `@internal-maximowood/web` package).

**Setup:** Work on a branch — `git checkout -b feat/inventory-dictionary-fields` (skip if your execution harness already created an isolated worktree/branch).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/web/server/maximoInventoryView.ts` | PostgREST client + row→product grouping | Add dictionary columns to types & select; field-resolution; new grouping key; `lf`-sourced totals |
| `apps/web/server/maximoInventoryView.test.ts` | Unit tests for grouping + fetch | Add dictionary-path tests; update `select=` assertion |
| `apps/web/server/inventoryRouter.ts` | tRPC `getAll` passthrough | Return `models` in payload |
| `apps/web/client/src/pages/Inventory.tsx` | Inventory UI | Model filter + header segment + unmapped marker; type updates |

---

### Task 1: Dictionary field resolution in `groupMaximoRows`

**Files:**
- Modify: `apps/web/server/maximoInventoryView.ts`
- Test: `apps/web/server/maximoInventoryView.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside the existing `describe("groupMaximoRows", ...)` block in `apps/web/server/maximoInventoryView.test.ts` (e.g. after the "collects distinct categories" test):

```ts
  it("groups by dictionary fields and sources LF from the view's lf column", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Texas",
        species: "Thermo Ayous",
        category: "Thermowood",
        nominal_size: "1x6",
        profile: "S4S",
        description: null,
        lf_per_piece: 14,
        pieces_available: 160,
        lf_available: 2240,
        last_updated: "2026-05-10T00:00:00Z",
        specie: "Maximo Thermo Ayous",
        model: "Alfa Profile",
        profile_finish: "Groco Matte",
        size: "1x6",
        length_ft: 14,
        lf: 2240,
        is_unmapped: false,
      },
      {
        branch_name: "Global Texas",
        species: "Thermo Ayous",
        category: "Thermowood",
        nominal_size: "1x6",
        profile: "S4S",
        description: null,
        lf_per_piece: 16,
        pieces_available: 228,
        lf_available: 3648,
        last_updated: "2026-05-11T00:00:00Z",
        specie: "Maximo Thermo Ayous",
        model: "Alfa Profile",
        profile_finish: "Groco Matte",
        size: "1x6",
        length_ft: 16,
        lf: 3648,
        is_unmapped: false,
      },
    ];

    const result = groupMaximoRows(rows);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.specie).toBe("Maximo Thermo Ayous");
    expect(item.model).toBe("Alfa Profile");
    expect(item.profile).toBe("Groco Matte");
    expect(item.size).toBe("1x6");
    expect(item.isUnmapped).toBe(false);
    expect(item.totalLF).toBe(5888); // 2240 + 3648, taken straight from `lf`
    expect(item.branches[0].lengths).toEqual([
      { lengthFt: 14, pieces: 160, stockLf: 2240 },
      { lengthFt: 16, pieces: 228, stockLf: 3648 },
    ]);
    expect(result.models).toEqual(["Alfa Profile"]);
  });

  it("falls back to raw fields and flags isUnmapped when dictionary columns are null", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "2x6",
        profile: "S4S E4E",
        description: null,
        lf_per_piece: 16,
        pieces_available: 10,
        lf_available: 160,
        last_updated: "2026-05-10T00:00:00Z",
        specie: null,
        model: null,
        profile_finish: null,
        size: null,
        length_ft: null,
        lf: null,
        is_unmapped: true,
      },
    ];

    const result = groupMaximoRows(rows);
    const item = result.items[0];
    expect(item.specie).toBe("IPE");      // fell back to species
    expect(item.model).toBe("");
    expect(item.profile).toBe("S4S E4E"); // fell back to profile
    expect(item.size).toBe("2x6");        // fell back to nominal_size
    expect(item.isUnmapped).toBe(true);
    expect(item.totalLF).toBe(160);       // computed 16 × 10 because `lf` was null
    expect(item.branches[0].lengths).toEqual([
      { lengthFt: 16, pieces: 10, stockLf: 160 },
    ]);
    expect(result.models).toEqual([]);    // empty model filtered out
  });

  it("uses the view's lf for mapped tiles (lf = pieces, length null)", () => {
    const rows: MaximoRow[] = [
      {
        branch_name: "Global Miami",
        species: "IPE",
        category: "Hardwoods",
        nominal_size: "",
        profile: "IPE Decking",
        description: 'Ipe Tiles 24" x 24"',
        lf_per_piece: 0,
        pieces_available: 30,
        lf_available: 30,
        last_updated: "2026-05-10T00:00:00Z",
        specie: "IpeB",
        model: "Tile",
        profile_finish: "Brushed",
        size: "24x24",
        length_ft: null,
        lf: 30,
        is_unmapped: false,
      },
    ];
    const result = groupMaximoRows(rows);
    const item = result.items[0];
    expect(item.size).toBe("24x24");
    expect(item.totalLF).toBe(30); // straight from `lf` (tiles convention)
    expect(item.branches[0].lengths).toEqual([
      { lengthFt: null, pieces: 30, stockLf: 30 },
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web/`): `pnpm vitest run server/maximoInventoryView.test.ts`
Expected: the three new tests FAIL — TypeScript reports the new properties (`specie`, `model`, …) are not on `MaximoRow`, and/or `item.model` / `result.models` / `item.isUnmapped` do not exist.

- [ ] **Step 3: Extend the interfaces**

In `apps/web/server/maximoInventoryView.ts`, extend `MaximoRow` (the new fields are **optional** so existing fixtures keep compiling and absent fields take the fallback path):

```ts
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
  specie?: string | null;
  model?: string | null;
  profile_finish?: string | null;
  size?: string | null;
  length_ft?: number | null;
  lf?: number | null;
  is_unmapped?: boolean | null;
}
```

Add `model` and `isUnmapped` to `InventoryItem`:

```ts
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
```

Add `models` to `GroupedInventory`:

```ts
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
```

- [ ] **Step 4: Rewrite the `groupMaximoRows` body**

Replace the entire `groupMaximoRows` function in `apps/web/server/maximoInventoryView.ts` with:

```ts
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
```

Leave `sizeFromDescription` and `lengthFromDescription` exactly as they are — they are now only used on the fallback path.

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/web/`): `pnpm vitest run server/maximoInventoryView.test.ts`
Expected: PASS — the three new tests plus all pre-existing `groupMaximoRows` tests (which exercise the fallback path because their fixtures omit the dictionary columns). The `fetchMaximoInventory` `select=` test will still pass here because `SELECT_COLS` is unchanged in this task.

- [ ] **Step 6: Commit**

```bash
git add apps/web/server/maximoInventoryView.ts apps/web/server/maximoInventoryView.test.ts
git commit -m "feat(inventory): group by curated dictionary fields with raw fallback"
```

---

### Task 2: Select the dictionary columns from the view

**Files:**
- Modify: `apps/web/server/maximoInventoryView.ts` (the `SELECT_COLS` constant)
- Test: `apps/web/server/maximoInventoryView.test.ts` (the `fetchMaximoInventory` select assertion)

- [ ] **Step 1: Update the failing assertion**

In `apps/web/server/maximoInventoryView.test.ts`, in the test `"calls the view with apikey, Bearer, and Range headers + stable ordering"`, replace the `select=` assertion line with the version that includes the dictionary columns:

```ts
    expect(url).toContain("select=branch_name%2Cspecies%2Ccategory%2Cnominal_size%2Cprofile%2Cdescription%2Clf_per_piece%2Cpieces_available%2Clf_available%2Clast_updated%2Cspecie%2Cmodel%2Cprofile_finish%2Csize%2Clength_ft%2Clf%2Cis_unmapped");
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web/`): `pnpm vitest run server/maximoInventoryView.test.ts -t "stable ordering"`
Expected: FAIL — the URL still contains the old (shorter) `select=` string.

- [ ] **Step 3: Update `SELECT_COLS`**

In `apps/web/server/maximoInventoryView.ts`, replace the `SELECT_COLS` constant:

```ts
const SELECT_COLS =
  "branch_name,species,category,nominal_size,profile,description,lf_per_piece,pieces_available,lf_available,last_updated,specie,model,profile_finish,size,length_ft,lf,is_unmapped";
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web/`): `pnpm vitest run server/maximoInventoryView.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/maximoInventoryView.ts apps/web/server/maximoInventoryView.test.ts
git commit -m "feat(inventory): request dictionary columns from the view"
```

---

### Task 3: Expose `models` in the tRPC payload

**Files:**
- Modify: `apps/web/server/inventoryRouter.ts`

- [ ] **Step 1: Add `models` to `getAll`**

Replace the body of `getAll` in `apps/web/server/inventoryRouter.ts`:

```ts
export const inventoryRouter = router({
  // Live read of the Maximo inventory view, grouped for the UI.
  getAll: publicProcedure.query(async () => {
    const rows = await fetchMaximoInventory();
    const { items, species, categories, models, profiles, sizes, branches, lastUpdated } =
      groupMaximoRows(rows);
    return { items, species, categories, models, profiles, sizes, branches, lastUpdated, source: "live" as const };
  }),
});
```

- [ ] **Step 2: Typecheck**

Run (from `apps/web/`): `pnpm check`
Expected: PASS — no type errors. (`models` now flows through to the inferred client type.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/inventoryRouter.ts
git commit -m "feat(inventory): return models list from getAll"
```

---

### Task 4: Model filter, header segment, and unmapped marker in the UI

**Files:**
- Modify: `apps/web/client/src/pages/Inventory.tsx`

- [ ] **Step 1: Extend the local `InventoryItem` type**

In `apps/web/client/src/pages/Inventory.tsx`, replace the `InventoryItem` type (around lines 23-30):

```ts
type InventoryItem = {
  specie: string;
  category: string;
  model: string;
  profile: string;
  size: string;
  branches: BranchStock[];
  totalLF: number;
  isUnmapped: boolean;
};
```

- [ ] **Step 2: Add the Model filter state**

Add after the `filterSpecie` state declaration:

```ts
  const [filterModel, setFilterModel] = useState("all");
```

- [ ] **Step 3: Apply the Model filter and add model to search**

In the `filtered` `useMemo`, add the model match and include model in search. Replace the filter callback body so it reads:

```ts
    return (data.items as InventoryItem[]).filter(item => {
      const matchCategory = filterCategory === "all" || item.category === filterCategory;
      const matchSpecie = filterSpecie === "all" || item.specie === filterSpecie;
      const matchModel = filterModel === "all" || item.model === filterModel;
      const matchProfile = filterProfile === "all" || item.profile === filterProfile;
      const matchSize = filterSize === "all" || item.size === filterSize;
      const search = filterSearch.toLowerCase();
      const matchSearch = !search ||
        item.specie.toLowerCase().includes(search) ||
        item.model.toLowerCase().includes(search) ||
        item.profile.toLowerCase().includes(search) ||
        item.size.toLowerCase().includes(search);
      const matchBranch = filterBranch === "all" ||
        item.branches.some(b => b.branch === filterBranch);
      return matchCategory && matchSpecie && matchModel && matchProfile && matchSize && matchSearch && matchBranch;
    });
```

And add `filterModel` to the `useMemo` dependency array:

```ts
  }, [data, filterCategory, filterSpecie, filterModel, filterProfile, filterSize, filterBranch, filterSearch]);
```

- [ ] **Step 4: Add the Model dropdown to the filter bar**

Insert this `<Select>` immediately after the Species `<Select>` (the one whose `placeholder="Species"`) and before the Profile `<Select>`:

```tsx
        <Select value={filterModel} onValueChange={setFilterModel}>
          <SelectTrigger className="w-full sm:w-44 h-11 border-[#E0DDD4] focus:ring-[#C9A227] focus:border-[#C9A227]">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            {(data?.models ?? [])
              .filter((m: string) =>
                ((data?.items as InventoryItem[] | undefined) ?? []).some(i =>
                  i.model === m &&
                  (filterCategory === "all" || i.category === filterCategory) &&
                  (filterSpecie === "all" || i.specie === filterSpecie)
                )
              )
              .map((m: string) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
          </SelectContent>
        </Select>
```

Then make the Profile and Size dropdowns cascade on the selected model too. In the Profile `<Select>`'s `.filter(...)` predicate, add the model condition so it reads:

```tsx
            {(data?.profiles ?? [])
              .filter((p: string) =>
                ((data?.items as InventoryItem[] | undefined) ?? []).some(i =>
                  i.profile === p &&
                  (filterCategory === "all" || i.category === filterCategory) &&
                  (filterSpecie === "all" || i.specie === filterSpecie) &&
                  (filterModel === "all" || i.model === filterModel) &&
                  (filterSize === "all" || i.size === filterSize)
                )
              )
```

In the Size `<Select>`'s `.filter(...)` predicate, likewise add the model condition:

```tsx
            {(data?.sizes ?? [])
              .filter((sz: string) =>
                ((data?.items as InventoryItem[] | undefined) ?? []).some(i =>
                  i.size === sz &&
                  (filterCategory === "all" || i.category === filterCategory) &&
                  (filterSpecie === "all" || i.specie === filterSpecie) &&
                  (filterModel === "all" || i.model === filterModel) &&
                  (filterProfile === "all" || i.profile === filterProfile)
                )
              )
```

- [ ] **Step 5: Add the Model segment and unmapped marker to the card header**

In the product header block, find the species span:

```tsx
                    <span className="font-black text-sm text-[#1A1A1A]">{item.specie}</span>
```

Replace it with the species span followed by the unmapped marker and the model segment (the model segment is hidden when empty, matching the existing profile/size convention):

```tsx
                    <span className="font-black text-sm text-[#1A1A1A]">{item.specie}</span>
                    {item.isUnmapped && (
                      <span
                        title="Not in dictionary — showing raw Spruce fields"
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                      >
                        ⚠ unmapped
                      </span>
                    )}
                    {item.model && (
                      <>
                        <span className="text-[#ccc]">·</span>
                        <span className="text-sm text-[#555]">{item.model}</span>
                      </>
                    )}
```

- [ ] **Step 6: Typecheck and build**

Run (from `apps/web/`): `pnpm check`
Expected: PASS — no type errors.

Run (from `apps/web/`): `pnpm build`
Expected: PASS — Vite client build and esbuild server bundle complete with no errors.

- [ ] **Step 7: Manual verification**

Run (from `apps/web/`): `pnpm dev`, open the app, go to the inventory page, and confirm:
- A **Model** dropdown appears between Species and Profile, populated with model values.
- Selecting a Model narrows the visible cards and the Profile/Size dropdowns.
- Card headers read `Specie · Model · Profile · Size`, with the Model segment absent when a product has no model.
- Any unmapped product shows the amber **⚠ unmapped** marker and still displays its raw species/size and LF.
- LF totals render as before (no Pieces/CBM columns introduced).

- [ ] **Step 8: Commit**

```bash
git add apps/web/client/src/pages/Inventory.tsx
git commit -m "feat(inventory): add Model filter, header segment, and unmapped marker"
```

---

## Self-Review Notes

- **Spec coverage:** field resolution table → Task 1 Step 4; grouping key → Task 1 Step 4; `SELECT_COLS` + new `MaximoRow`/`InventoryItem`/`GroupedInventory` → Tasks 1-2; `models` in router → Task 3; Model header/marker/filter → Task 4; LF-only (no `m3`) → no task adds m3, confirmed; parsers kept as fallback → Task 1 Step 4 note; unmapped fallback per-field → Task 1 Step 4 resolution + Task 1 Step 1 test.
- **Type consistency:** `InventoryItem` gains `model: string` + `isUnmapped: boolean` in both server (Task 1) and client (Task 4); `GroupedInventory.models` defined in Task 1 and consumed in Tasks 3-4; `MaximoRow` dictionary fields optional so existing fixtures compile.
- **No new measures:** display stays LF-only; `m3`/`conv_pc_m3`/`subgroup` deliberately not selected.
