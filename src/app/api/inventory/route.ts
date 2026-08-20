import { NextResponse } from "next/server";
import { fetchMaximoInventory, groupMaximoRows } from "@/server/maximoInventoryView";

export const dynamic = "force-dynamic";

// Live read of the Maximo inventory view, grouped for the UI
// (parity with the legacy tRPC procedure inventory.getAll).
export async function GET() {
  try {
    const rows = await fetchMaximoInventory();
    const grouped = groupMaximoRows(rows);
    return NextResponse.json({ ...grouped, source: "live" as const });
  } catch (error) {
    console.error("[api/inventory]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inventory fetch failed" },
      { status: 502 },
    );
  }
}
