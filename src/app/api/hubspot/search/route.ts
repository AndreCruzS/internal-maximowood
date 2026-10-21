import { NextResponse, type NextRequest } from "next/server";
import { getQuotesAccess } from "@/server/quotesAccess";
import { sampleSearch } from "@/lib/hubspot";
import { HubSpotError, hubspotToken, searchCustomers } from "@/server/hubspot/client";

export const dynamic = "force-dynamic";

/** Typeahead over HubSpot contacts and companies (sample data without a token). */
export async function GET(request: NextRequest) {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ contacts: [], companies: [] });
  if (!hubspotToken()) return NextResponse.json(sampleSearch(q));
  try {
    return NextResponse.json(await searchCustomers(q));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "HubSpot search failed" }, { status: e instanceof HubSpotError ? 502 : 500 });
  }
}
