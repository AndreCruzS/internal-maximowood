import { NextResponse } from "next/server";
import { checklistPeople } from "@/server/checklists";
import { getQuotesAccess } from "@/server/quotesAccess";

export const dynamic = "force-dynamic";

/** Names for the sales / logistics owner pickers (Logistics people first). */
export async function GET() {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ people: await checklistPeople(access.db) });
}
