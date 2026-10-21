import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_SETTINGS, parseSettings, type HsOwner, type HsPipeline, type HubSpotSettings } from "@/lib/hubspot";
import { getOwners, getPipelines, getPortalId, hubspotToken, isMissingScope } from "./client";

/** Admin settings (public.hubspot_settings, one row). Defaults before migration 0026 or without the service key. */
export async function readSettings(): Promise<HubSpotSettings> {
  const admin = getSupabaseAdmin();
  if (!admin) return DEFAULT_SETTINGS;
  const { data, error } = await admin.from("hubspot_settings").select("value").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return parseSettings((data as { value: unknown }).value);
}

export async function writeSettings(value: HubSpotSettings, userId: string): Promise<{ error: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY isn't set" };
  const { error } = await admin
    .from("hubspot_settings")
    .upsert({ id: 1, value, updated_by: userId, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}

// HubSpot reference data changes rarely: keep it for 10 minutes per server instance.
const TTL = 10 * 60_000;
export type HubSpotReference = {
  owners: HsOwner[];
  /** False when the token lacks crm.objects.owners.read: reps then come from the admin mapping only. */
  ownersReadable: boolean;
  pipelines: HsPipeline[];
  portalId: string | null;
};
let cache: (HubSpotReference & { at: number }) | null = null;

export async function hubspotReference(): Promise<HubSpotReference> {
  if (!hubspotToken()) return { owners: [], ownersReadable: false, pipelines: [], portalId: null };
  if (cache && Date.now() - cache.at < TTL) return cache;
  let ownersReadable = true;
  const [owners, pipelines, portalId] = await Promise.all([
    getOwners().catch(e => {
      if (isMissingScope(e)) ownersReadable = false;
      return [] as HsOwner[];
    }),
    getPipelines().catch(() => [] as HsPipeline[]),
    process.env.HUBSPOT_PORTAL_ID?.trim() || getPortalId(),
  ]);
  cache = { at: Date.now(), owners, ownersReadable, pipelines, portalId };
  return cache;
}
