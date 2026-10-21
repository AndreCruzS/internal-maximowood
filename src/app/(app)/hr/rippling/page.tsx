import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { parseRipplingSettings } from "@/lib/rippling";
import { ripplingConnected } from "@/server/rippling/client";
import RipplingView, { type SyncRun } from "@/components/hr/RipplingView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getDict();
  return { title: `${t.rippling.title} · GMX Group Intranet` };
}

/** HR and admins: the Rippling connection, its mappings, a preview of what a sync changes, and "Sync now". */
export default async function RipplingPage() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect("/login");
  const { data: hr } = await supabase.rpc("is_hr_editor");
  if (hr !== true) redirect("/hr");
  const [settings, runs] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "rippling").maybeSingle(),
    supabase.from("rippling_sync_runs").select("id, started_at, finished_at, dry_run, sample, trigger, counts, errors").order("started_at", { ascending: false }).limit(10),
  ]);
  return (
    <RipplingView
      connected={ripplingConnected()}
      ready={!runs.error}
      settings={parseRipplingSettings((settings.data as { value: unknown } | null)?.value)}
      runs={(runs.data as SyncRun[] | null) ?? []}
    />
  );
}
