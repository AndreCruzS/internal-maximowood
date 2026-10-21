import { NextResponse, type NextRequest } from "next/server";
import { getQuotesAccess } from "@/server/quotesAccess";
import { isAllowedPipeline, isRecordId, sampleDeals } from "@/lib/hubspot";
import { hubspotToken, openDeals } from "@/server/hubspot/client";
import { hubspotReference } from "@/server/hubspot/settings";

export const dynamic = "force-dynamic";

/** Open deals of the picked contact and/or company, in the pipelines a quote can go to. */
export async function GET(request: NextRequest) {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const sp = request.nextUrl.searchParams;
  const contactId = sp.get("contactId") || null;
  const companyId = sp.get("companyId") || null;
  if ((contactId && !isRecordId(contactId)) || (companyId && !isRecordId(companyId))) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (!contactId && !companyId) return NextResponse.json({ deals: [] });
  if (!hubspotToken()) return NextResponse.json({ deals: sampleDeals(contactId, companyId) });
  try {
    const { pipelines } = await hubspotReference();
    const deals = await openDeals(contactId, companyId, pipelines);
    return NextResponse.json({ deals: deals.filter(d => isAllowedPipeline(d.pipelineId)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load deals" }, { status: 502 });
  }
}
