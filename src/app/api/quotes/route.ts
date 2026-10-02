import { NextResponse } from "next/server";
import {
  QUOTE_COLUMNS,
  isDuplicateProjectName,
  parseQuoteInput,
  quoteToRow,
  rowToQuote,
  type QuoteRow,
} from "@/server/quotes";
import { getQuotesAccess, withOwners } from "@/server/quotesAccess";

export const dynamic = "force-dynamic";

// Salespeople query with their own session (RLS: own quotes only); admins
// with the service role (all quotes). See src/server/quotesAccess.ts.

// ── GET — quotes visible to the signed-in user, most recently updated first ──
export async function GET() {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await access.db
    .from("quotes")
    .select(QUOTE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(access.isAdmin ? 2000 : 500);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const quotes = (data as QuoteRow[]).map(rowToQuote);
  return NextResponse.json({ quotes: access.isAdmin ? await withOwners(quotes) : quotes });
}

// ── POST — save a new quote under its project name ───────────────────────────
export async function POST(request: Request) {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { db, user } = access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseQuoteInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await db
    .from("quotes")
    .insert({ ...quoteToRow(parsed.quote), user_id: user.id })
    .select(QUOTE_COLUMNS)
    .single();

  if (isDuplicateProjectName(error)) {
    // Hand back the existing quote's id so the client can offer to update it.
    const { data: existing } = await db
      .from("quotes")
      .select("id, project_name")
      .eq("user_id", user.id)
      .ilike("project_name", parsed.quote.projectName.replace(/[\\%_]/g, c => `\\${c}`))
      .maybeSingle();
    return NextResponse.json(
      {
        error: `You already have a quote for "${existing?.project_name ?? parsed.quote.projectName}"`,
        existingId: existing?.id ?? null,
      },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ quote: rowToQuote(data as QuoteRow) }, { status: 201 });
}
