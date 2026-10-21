import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { HUBSPOT_PIPELINES, parseSettings } from "@/lib/hubspot";
import { hubspotToken, probeScopes } from "@/server/hubspot/client";
import { REQUIRED_SCOPES } from "@/server/hubspot/fields";
import { hubspotReference, readSettings, writeSettings } from "@/server/hubspot/settings";
import { smtpConfigured } from "@/server/quoteMail";

export const dynamic = "force-dynamic";

/** Calculator admins: HubSpot connection status, settings, and the owners / pipelines to pick from. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const live = !!hubspotToken();
  const [settings, ref, probes] = await Promise.all([readSettings(), hubspotReference(), live ? probeScopes() : Promise.resolve([])]);
  return NextResponse.json({
    mode: live ? "live" : "sample",
    probes,
    ownersReadable: ref.ownersReadable,
    emailReady: smtpConfigured(),
    scopes: REQUIRED_SCOPES,
    settings,
    owners: ref.owners,
    pipelines: HUBSPOT_PIPELINES.map(p => ({
      id: p.id,
      label: p.label,
      stages: ref.pipelines.find(x => x.id === p.id)?.stages.filter(s => !s.closed) ?? [],
    })),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const settings = parseSettings(body);
  const { error } = await writeSettings(settings, auth.user.id);
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ settings });
}
