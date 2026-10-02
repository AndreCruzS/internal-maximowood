import { NextResponse } from "next/server";
import {
  QUOTE_COLUMNS,
  isDuplicateProjectName,
  parseQuoteInput,
  quoteToRow,
  rowToQuote,
  type QuoteRow,
} from "@/server/quotes";
import { getQuotesAccess, withOwner } from "@/server/quotesAccess";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Quote not found" }, { status: 404 });

// For salespeople RLS hides other users' quotes, so "not yours" and "doesn't
// exist" are both 404. Admins can read and change any quote.

// ── GET — one quote, to reopen it in the calculator ──────────────────────────
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await access.db.from("quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return notFound();

  const quote = rowToQuote(data as QuoteRow);
  return NextResponse.json({ quote: access.isAdmin ? await withOwner(quote, access.user) : quote });
}

// ── PATCH — overwrite an existing quote with the current cart + details ──────
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseQuoteInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await access.db
    .from("quotes")
    .update(quoteToRow(parsed.quote))
    .eq("id", id)
    .select(QUOTE_COLUMNS)
    .maybeSingle();

  if (isDuplicateProjectName(error)) {
    return NextResponse.json(
      { error: `There is already another quote for "${parsed.quote.projectName}" from the same salesperson` },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return notFound();

  const quote = rowToQuote(data as QuoteRow);
  return NextResponse.json({ quote: access.isAdmin ? await withOwner(quote, access.user) : quote });
}

// ── DELETE — remove a saved quote ────────────────────────────────────────────
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { data, error } = await access.db.from("quotes").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data?.length) return notFound();

  return NextResponse.json({ ok: true });
}
