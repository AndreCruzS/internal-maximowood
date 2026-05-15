import { publicProcedure, router } from "./_core/trpc.js";
import { fetchMaximoInventory, groupMaximoRows } from "./maximoInventoryView.js";

export type { InventoryItem, BranchStock, LengthEntry } from "./maximoInventoryView.js";

export const inventoryRouter = router({
  // Live read of the Maximo inventory view, grouped for the UI.
  getAll: publicProcedure.query(async () => {
    const rows = await fetchMaximoInventory();
    const { items, species, categories, profiles, sizes, branches, lastUpdated } = groupMaximoRows(rows);
    return { items, species, categories, profiles, sizes, branches, lastUpdated, source: "live" as const };
  }),
});
