import { NextResponse } from "next/server";
import { getQuotesAccess } from "@/server/quotesAccess";
import { HUBSPOT_PIPELINES, type HubSpotConfig } from "@/lib/hubspot";
import { hubspotToken } from "@/server/hubspot/client";
import { hubspotReference, readSettings } from "@/server/hubspot/settings";
import { smtpConfigured } from "@/server/quoteMail";
import { repOf } from "@/server/hubspot/rep";

export const dynamic = "force-dynamic";

/** What the quote dialog needs: sample vs live, the pipelines a rep can pick, the email template, the rep. */
export async function GET() {
  const access = await getQuotesAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const [settings, ref] = await Promise.all([readSettings(), hubspotReference()]);
  const body: HubSpotConfig = {
    mode: hubspotToken() ? "live" : "sample",
    emailReady: smtpConfigured(),
    pipelines: HUBSPOT_PIPELINES.map(p => ({ id: p.id, label: ref.pipelines.find(x => x.id === p.id)?.label ?? p.label })),
    template: settings.template,
    rep: repOf(access.user),
    portalId: ref.portalId,
  };
  return NextResponse.json(body);
}
