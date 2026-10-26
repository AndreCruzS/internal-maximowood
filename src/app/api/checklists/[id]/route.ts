import { NextResponse } from "next/server";
import { checklistTitle, parseChecklistData } from "@/lib/checklist";
import { CHECKLIST_COLUMNS, rowToChecklist, type ChecklistRow } from "@/server/checklists";
import { getQuotesAccess } from "@/server/quotesAccess";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Checklist not found" }, { status: 404 });

// Like quotes: RLS keeps reps to their own checklists; admins can open and change any.

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { data, error } = await access.db.from("sales_checklists").select(CHECKLIST_COLUMNS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return notFound();
  return NextResponse.json({ checklist: rowToChecklist(data as ChecklistRow) });
}

/** Save the form; `status: "sent"` marks it sent to logistics (first time stamps sent_at). */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = (await request.json().catch(() => null)) as { data?: unknown; status?: string } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.data !== undefined) {
    const parsed = parseChecklistData(body.data);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update.data = parsed.data;
    update.title = checklistTitle(parsed.data).slice(0, 200);
  }
  if (body.status === "draft" || body.status === "sent") {
    update.status = body.status;
    if (body.status === "sent") {
      const { data: cur } = await access.db.from("sales_checklists").select("sent_at").eq("id", id).maybeSingle();
      if (cur && !(cur as { sent_at: string | null }).sent_at) update.sent_at = new Date().toISOString();
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

  const { data, error } = await access.db.from("sales_checklists").update(update).eq("id", id).select(CHECKLIST_COLUMNS).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return notFound();
  return NextResponse.json({ checklist: rowToChecklist(data as ChecklistRow) });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { data, error } = await access.db.from("sales_checklists").delete().eq("id", id).select("id, quote_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data?.length) return notFound();
  // The quote goes back to "not approved yet".
  const quoteId = (data[0] as { quote_id: string | null }).quote_id;
  if (quoteId) await access.db.from("quotes").update({ customer_approved_at: null }).eq("id", quoteId);
  return NextResponse.json({ ok: true });
}
