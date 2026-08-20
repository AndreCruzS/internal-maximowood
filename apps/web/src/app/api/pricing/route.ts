import { NextResponse } from "next/server";
import { fetchAllPricing } from "@/server/pricing";

export const dynamic = "force-dynamic";

// Live read of the Google Sheet price list, all three tabs
// (parity with the legacy tRPC procedure pricing.getAll).
export async function GET() {
  try {
    return NextResponse.json(await fetchAllPricing());
  } catch (error) {
    console.error("[api/pricing]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pricing fetch failed" },
      { status: 502 },
    );
  }
}
