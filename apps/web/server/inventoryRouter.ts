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
