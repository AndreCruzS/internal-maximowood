"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Eye, Loader2, Plug, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { COMPANIES, DEPARTMENTS, OFFICES } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import type { FieldChange, RipplingSettings, SyncPlan } from "@/lib/rippling";

export type SyncRun = {
  id: string; started_at: string; finished_at: string | null; dry_run: boolean; sample: boolean; trigger: string;
  counts: Record<string, number>; errors: string[];
};
type Result = { sample: boolean; dryRun: boolean; plan: SyncPlan; counts: Record<string, number>; warnings: string[]; errors: string[] };
type MapKind = "departments" | "companies" | "offices";

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const card = "rounded-2xl border border-gray-200 bg-white p-5";

export default function RipplingView({ connected, ready, settings, runs }: { connected: boolean; ready: boolean; settings: RipplingSettings; runs: SyncRun[] }) {
  const { t, tag } = useI18n();
  const r = t.rippling;
  const router = useRouter();
  const [busy, setBusy] = useState<"preview" | "sync" | "save" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [draft, setDraft] = useState<RipplingSettings>(settings);
  const when = (iso: string) => new Date(iso).toLocaleString(tag, { dateStyle: "medium", timeStyle: "short" });

  const run = async (dryRun: boolean) => {
    if (!dryRun && !window.confirm(r.syncConfirm)) return;
    setBusy(dryRun ? "preview" : "sync");
    const res = await fetch("/api/rippling/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun }) }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as Result & { error?: string }) : { error: r.failed } as { error: string };
    setBusy(null);
    if (!res?.ok || "error" in json && json.error) return toast.error(("error" in json && json.error) || r.failed);
    setResult(json as Result);
    if (!dryRun) toast.success(r.synced);
    router.refresh();
  };

  const save = async (next: RipplingSettings) => {
    setBusy("save");
    const { error } = await getSupabase()!.from("app_settings").upsert({ key: "rippling", value: next, updated_at: new Date().toISOString() });
    setBusy(null);
    if (error) return toast.error(error.message);
    setDraft(next);
    toast.success(r.saved);
    router.refresh();
  };

  // Names to map: what the last preview saw, plus what's already mapped.
  const names = (kind: MapKind) => [...new Set([...(result?.plan.seen[kind] ?? []), ...Object.keys(draft[kind])])].sort((a, b) => a.localeCompare(b));
  const options: Record<MapKind, { id: string; name: string }[]> = {
    departments: DEPARTMENTS.map(d => ({ id: d.id, name: deptName(t, d.id) })),
    companies: COMPANIES.map(c => ({ id: c.id, name: c.name })),
    offices: OFFICES.map(o => ({ id: o.id, name: o.name })),
  };
  const setMap = (kind: MapKind, key: string, value: string) =>
    setDraft(d => {
      const m = { ...d[kind] };
      if (value) m[key] = value;
      else delete m[key];
      return { ...d, [kind]: m };
    });
  const change = (c: FieldChange) => `${r.fields[c.field]}: ${c.from ?? "—"} → ${c.to ?? "—"}`;
  const counts = result?.counts;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link href="/hr" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#00704a]"><ArrowLeft className="h-4 w-4" /> {t.hr.title}</Link>
        <h1 className="text-2xl font-black text-gray-900">{r.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{r.subtitle}</p>
      </header>

      {!ready && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{r.migrationPending}</p>}

      {/* Connection */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Plug className={`h-6 w-6 ${connected ? "text-[#009f67]" : "text-gray-400"}`} />
            <div>
              <p className="font-black text-gray-900">{connected ? r.connected : r.sample}</p>
              <p className="text-sm text-gray-600">{connected ? r.connectedHint : r.sampleHint}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={!connected || busy !== null || !ready}
              onChange={e => save({ ...draft, enabled: e.target.checked })}
              className="h-4 w-4 accent-[#009f67]"
            />
            {r.enabled}
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => run(true)} disabled={busy !== null || !ready} className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} {r.preview}
          </button>
          <button type="button" onClick={() => run(false)} disabled={busy !== null || !connected || !draft.enabled || !ready} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50" title={!connected ? r.sampleHint : !draft.enabled ? r.enableFirst : undefined}>
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {r.syncNow}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">{r.nightly}</p>
      </section>

      {/* Preview / result */}
      {result && counts && (
        <section className={card}>
          <h2 className="font-black text-gray-900">{result.dryRun ? r.previewTitle : r.resultTitle}</h2>
          {result.sample && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{r.sampleBanner}</p>}
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(["creates", "newHires", "updates", "leavers", "leave", "unchanged"] as const).map(k => (
              <li key={k} className="rounded-lg bg-gray-50 px-3 py-2"><span className="block text-xl font-black text-gray-900">{counts[k] ?? 0}</span><span className="text-xs text-gray-500">{r.counts[k]}</span></li>
            ))}
          </ul>
          {[...result.warnings, ...result.errors].length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {[...result.warnings, ...result.errors].map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {w}</li>)}
            </ul>
          )}
          {result.plan.creates.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{r.creates}</p>
              <ul className="mt-1 divide-y divide-gray-100 text-sm">
                {result.plan.creates.map(c => (
                  <li key={c.worker.id} className="py-1.5"><b>{c.worker.fullName}</b> · {c.worker.title || "—"} · {c.departmentId ? deptName(t, c.departmentId) : c.worker.department ?? "—"}{c.isNewHire && <span className="ml-2 rounded-full bg-[#f2fbf7] px-2 py-0.5 text-[11px] font-bold text-[#00704a]">{r.newHire}{c.worker.startDate ? ` · ${c.worker.startDate}` : ""}</span>}</li>
                ))}
              </ul>
            </div>
          )}
          {result.plan.updates.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{r.updates}</p>
              <ul className="mt-1 divide-y divide-gray-100 text-sm">
                {result.plan.updates.map(u => (
                  <li key={u.personId} className="py-1.5"><b>{u.name}</b>{u.link && <span className="ml-2 text-xs text-gray-500">{r.linked}</span>}{u.changes.length > 0 && <span className="block text-xs text-gray-600">{u.changes.map(change).join(" · ")}</span>}</li>
                ))}
              </ul>
            </div>
          )}
          {result.plan.leavers.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{r.leavers}</p>
              <ul className="mt-1 text-sm">{result.plan.leavers.map(l => <li key={l.personId} className="py-1"><b>{l.name}</b> · {fmt(r.lastDay, { date: l.lastDay })}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {/* Mappings */}
      <section className={card}>
        <h2 className="font-black text-gray-900">{r.mappings}</h2>
        <p className="text-sm text-gray-600">{r.mappingsHint}</p>
        {(["departments", "companies", "offices"] as const).map(kind => {
          const list = names(kind);
          return (
            <div key={kind} className="mt-4">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{r.mapKinds[kind]}</p>
              {list.length === 0 ? (
                <p className="mt-1 text-sm text-gray-400">{r.previewToMap}</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {list.map(name => (
                    <li key={name} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                      <span className="text-sm font-bold text-gray-800">{name}{!draft[kind][name] && <span className="ml-2 text-xs font-normal text-amber-700">{r.notMapped}</span>}</span>
                      <select value={draft[kind][name] ?? ""} onChange={e => setMap(kind, name, e.target.value)} className={field} aria-label={name}>
                        <option value="">{r.leaveAsIs}</option>
                        {options[kind].map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => save(draft)} disabled={busy !== null || !ready} className="mt-4 flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {r.saveMappings}
        </button>
      </section>

      {/* History */}
      <section className={card}>
        <h2 className="font-black text-gray-900">{r.history}</h2>
        {runs.length === 0 ? (
          <p className="py-3 text-sm text-gray-400">{r.noRuns}</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100 text-sm">
            {runs.map(x => (
              <li key={x.id} className="py-2">
                <span className="font-bold text-gray-900">{when(x.started_at)}</span>
                <span className="ml-2 text-xs text-gray-500">{x.dry_run ? r.previewRun : r.syncRun}{x.sample ? ` · ${r.sampleShort}` : ""} · {x.trigger === "cron" ? r.cron : r.manual}</span>
                <span className="block text-xs text-gray-600">
                  {fmt(r.runSummary, { creates: x.counts.creates ?? 0, updates: x.counts.updates ?? 0, leavers: x.counts.leavers ?? 0, leave: x.counts.leave ?? 0 })}
                  {x.errors.length > 0 && <span className="ml-2 text-amber-700">{fmt(r.issues, { n: x.errors.length })}</span>}
                  {!x.finished_at && <span className="ml-2 text-red-600">{r.unfinished}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
