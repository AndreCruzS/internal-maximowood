import { NextResponse } from "next/server";
import { getQuotesAccess } from "@/server/quotesAccess";
import { selectQuotes, type QuoteRow } from "@/server/quotes";
import {
  MAX_PDF_BYTES,
  hubspotRecordUrl,
  matchOwner,
  parseHubSpotQuoteRequest,
  planHubSpotCalls,
  type HubSpotQuoteResponse,
  type QuoteSendRecord,
} from "@/lib/hubspot";
import { hubspotToken } from "@/server/hubspot/client";
import { executePlan, sampleResult, type ExecuteResult } from "@/server/hubspot/execute";
import { hubspotReference, readSettings } from "@/server/hubspot/settings";
import { repOf } from "@/server/hubspot/rep";
import { sendQuoteMail, smtpConfigured, type MailResult } from "@/server/quoteMail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * "Send to customer" or "Save to HubSpot only" for a saved quote.
 * multipart/form-data: `payload` (JSON, see parseHubSpotQuoteRequest) + `pdf` (the quote PDF, ≤ 10 MB).
 * The quote is read with the caller's access (RLS: own quotes; admins: any), so its total comes from the database.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return bad("Quote not found", 404);
  const access = await getQuotesAccess();
  if (!access.ok) return bad(access.error, access.status);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Expected a form with the quote PDF");
  }
  const pdf = form.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) return bad("The quote PDF is missing");
  if (pdf.size > MAX_PDF_BYTES) return bad("The PDF is larger than 10 MB");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return bad("That file isn't a PDF");
  const filename = (pdf.name || "Quote.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 120);

  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return bad("Invalid request");
  }
  const parsed = parseHubSpotQuoteRequest(payload);
  if (!parsed.ok) return bad(parsed.error);
  const req = parsed.value;

  const { data, error } = await selectQuotes(cols => access.db.from("quotes").select(cols).eq("id", id).maybeSingle());
  if (error) return bad(error.message, 502);
  if (!data) return bad("Quote not found", 404);
  const quote = data as unknown as QuoteRow;

  const live = !!hubspotToken();
  const rep = repOf(access.user);
  const now = new Date();
  const [settings, ref] = await Promise.all([readSettings(), hubspotReference()]);
  const ownerId = live ? matchOwner(rep.email, ref.owners, settings.ownerOverrides) : null;
  const ownerWarning =
    live && !ownerId
      ? ref.ownersReadable
        ? `HubSpot: no HubSpot user matches ${rep.email} — the deal and task were created without an owner (set it under Admin → HubSpot)`
        : `HubSpot: missing scope crm.objects.owners.read and no owner set for ${rep.email} under Admin → HubSpot — the deal and task were created without an owner`
      : null;
  const steps = planHubSpotCalls(req, { projectName: quote.project_name, amount: Number(quote.total), now, defaultStages: settings.defaultStages });

  // 1. The email (only for "send"). In live mode a failed email stops here: nothing is logged as sent.
  let email: MailResult | { status: "sample" | "not_sent"; error?: string } = { status: "not_sent" };
  if (req.action === "send") {
    if (!live) email = { status: "sample" };
    else if (!smtpConfigured()) return bad("Email isn't set up yet (SMTP), so the quote can't be sent. Use \"Save to HubSpot only\" for now.", 503);
    else {
      email = await sendQuoteMail({
        from: rep,
        to: req.email.to,
        cc: [rep.email],
        subject: req.email.subject,
        message: req.email.message,
        attachment: { filename, content: bytes },
      });
    }
  }

  // 2. HubSpot.
  let result: ExecuteResult;
  if (!live) result = sampleResult(steps, req.target);
  else if (email.status === "failed") {
    const { contactId, companyId, dealId } = req.target;
    result = { contactId, companyId, dealId, fileId: null, engagementId: null, taskId: null, warnings: [], errors: [`Not logged in HubSpot: the email failed (${email.error ?? "unknown error"})`] };
  } else {
    result = await executePlan(steps, {
      target: req.target,
      ownerId,
      pdf: { blob: new Blob([bytes], { type: "application/pdf" }), filename },
      rep,
      now,
    });
  }
  const hubspotStatus: QuoteSendRecord["hubspotStatus"] = !live ? "sample" : result.errors.length === 0 ? "done" : result.engagementId ? "partial" : "failed";
  const warnings = [...(ownerWarning && email.status !== "failed" ? [ownerWarning] : []), ...result.warnings];
  const errors = [...(email.status === "failed" ? [`Email: ${email.error ?? "failed"}`] : []), ...result.errors];

  // 3. History + the quote's HubSpot link. Before migration 0026 these just fail quietly.
  await access.db.from("quote_sends").insert({
    quote_id: id,
    user_id: access.user.id,
    action: req.action,
    to_email: req.action === "send" ? req.email.to : null,
    cc: req.action === "send" ? [rep.email] : [],
    subject: req.action === "send" ? req.email.subject : null,
    message: req.email.message || null,
    email_status: email.status,
    hubspot_status: hubspotStatus,
    hubspot_contact_id: result.contactId,
    hubspot_company_id: result.companyId,
    hubspot_deal_id: result.dealId,
    hubspot_file_id: result.fileId,
    hubspot_engagement_id: result.engagementId,
    hubspot_task_id: result.taskId,
    quote_total: Number(quote.total),
    // Warnings (skipped for a missing scope) are kept with the errors, marked as such.
    errors: [...errors, ...warnings.map(w => `Warning: ${w}`)],
  });
  if (email.status !== "failed") {
    await access.db
      .from("quotes")
      .update({
        hubspot_contact_id: result.contactId,
        hubspot_company_id: result.companyId,
        hubspot_deal_id: result.dealId,
        last_sent_at: now.toISOString(),
        last_sent_to: req.action === "send" ? req.email.to : null,
        last_send_action: req.action,
      })
      .eq("id", id);
  }

  const body: HubSpotQuoteResponse = {
    mode: live ? "live" : "sample",
    emailStatus: email.status,
    hubspotStatus,
    errors,
    warnings,
    dealUrl: hubspotRecordUrl(ref.portalId, "deal", result.dealId),
    contactId: result.contactId,
    companyId: result.companyId,
    dealId: result.dealId,
  };
  return NextResponse.json(body, { status: email.status === "failed" ? 502 : 200 });
}

/** The quote's send / save history, newest first. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return bad("Quote not found", 404);
  const access = await getQuotesAccess();
  if (!access.ok) return bad(access.error, access.status);
  const { data, error } = await access.db
    .from("quote_sends")
    .select("id, action, to_email, cc, subject, email_status, hubspot_status, hubspot_deal_id, errors, created_at")
    .eq("quote_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ sends: [] });
  type Row = { id: string; action: "send" | "save_only"; to_email: string | null; cc: string[]; subject: string | null; email_status: QuoteSendRecord["emailStatus"]; hubspot_status: QuoteSendRecord["hubspotStatus"]; hubspot_deal_id: string | null; errors: string[]; created_at: string };
  const sends: QuoteSendRecord[] = ((data as Row[] | null) ?? []).map(r => ({
    id: r.id,
    action: r.action,
    toEmail: r.to_email,
    cc: r.cc ?? [],
    subject: r.subject,
    emailStatus: r.email_status,
    hubspotStatus: r.hubspot_status,
    dealId: r.hubspot_deal_id,
    errors: Array.isArray(r.errors) ? r.errors : [],
    createdAt: r.created_at,
  }));
  return NextResponse.json({ sends });
}
