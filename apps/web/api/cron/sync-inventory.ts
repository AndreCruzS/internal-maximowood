import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { syncInventoryFromSupabase } from "../../server/inventorySync";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const result = await syncInventoryFromSupabase();
    res.status(200).json({ success: true, rowsUpserted: result.rowsUpserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
}
