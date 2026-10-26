import { NextResponse } from "next/server";
import { checklistFromQuote, checklistTitle, emptyChecklist } from "@/lib/checklist";
import { CHECKLIST_COLUMNS, CHECKLIST_LIST_COLUMNS, rowToChecklist, type ChecklistRow } from "@/server/checklists";
import { rowToQuote, selectQuotes, type QuoteRow } from "@/server/quotes";
import { getQuotesAccess, withOwners } from "@/server/quotesAccess";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET — the signed-in rep's checklists (admins: everyone's), newest first ──
export async function GET() {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { data, error } = await access.db.from("sales_checklists").select(CHECKLIST_LIST_COLUMNS).order("updated_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const list = ((data as unknown as ChecklistRow[] | null) ?? []).map(rowToChecklist);
  if (!access.isAdmin) return NextResponse.json({ checklists: list });
  return NextResponse.json({ checklists: await withOwners(list) });
}

// ── POST — "Customer approved": the checklist for a quote (made from it the first time), or a blank one ──
export async function POST(request: Request) {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = (await request.json().catch(() => ({}))) as { quoteId?: string };
  const today = new Date().toISOString().slice(0, 10);
  const me = (access.user.user_metadata?.name as string | undefined) || access.user.email || "";

  if (!body.quoteId) {
    const data = emptyChecklist();
    data.header.date = today;
    data.sections.handoff.salesOwner = me;
    const { data: row, error } = await access.db.from("sales_checklists")
      .insert({ user_id: access.user.id, title: "New checklist", data }).select(CHECKLIST_COLUMNS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ checklist: rowToChecklist(row as ChecklistRow) }, { status: 201 });
  }

  if (!UUID_RE.test(body.quoteId)) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const { data: existing } = await access.db.from("sales_checklists").select(CHECKLIST_COLUMNS).eq("quote_id", body.quoteId).maybeSingle();
  if (existing) return NextResponse.json({ checklist: rowToChecklist(existing as ChecklistRow) });

  const { data: qRow, error: qErr } = await selectQuotes(cols => access.db.from("quotes").select(cols).eq("id", body.quoteId!).maybeSingle());
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 502 });
  if (!qRow) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quote = rowToQuote(qRow as QuoteRow);

  const data = checklistFromQuote(quote, quote.preparedBy || me, today);
  const { data: row, error } = await access.db.from("sales_checklists")
    .insert({ user_id: quote.ownerId, quote_id: quote.id, title: checklistTitle(data, quote.projectName), data })
    .select(CHECKLIST_COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await access.db.from("quotes").update({ customer_approved_at: new Date().toISOString() }).eq("id", quote.id);
  return NextResponse.json({ checklist: rowToChecklist(row as ChecklistRow) }, { status: 201 });
}
