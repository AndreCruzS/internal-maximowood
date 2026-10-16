"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { fmt } from "@/lib/i18n/locale";
import type { Playbook } from "@/lib/playbooks";
import PlaybookContent, { type PlaybookBody } from "@/components/playbooks/PlaybookContent";

type Snapshot = PlaybookBody & Pick<Playbook, "title" | "summary"> & Partial<Pick<Playbook, "category" | "link_url" | "owner_person_id" | "ack_required" | "language">>;
export type Version = { version: number; snapshot: Snapshot; edited_by: string | null; edited_at: string };

/** Every saved version of a playbook (newest first): view any of them and restore it as a new version. */
export default function PlaybookHistory({ playbook: p, currentBy, versions, names, userNames }: {
  playbook: Playbook;
  currentBy: string | null;
  versions: Version[];
  names: Record<string, string>;
  /** auth user id → name (who edited). */
  userNames: Record<string, string>;
}) {
  const { t, tag } = useI18n();
  const s = t.sop;
  const me = useMe();
  const router = useRouter();
  const currentVersion = p.version ?? 1;
  const [selected, setSelected] = useState(currentVersion);
  const [busy, setBusy] = useState(false);
  const date = (iso: string) => new Date(iso).toLocaleString(tag, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const rows = [{ version: currentVersion, snapshot: p as Snapshot, edited_by: currentBy, edited_at: p.updated_at }, ...versions.filter(v => v.version < currentVersion)];
  const shown = rows.find(v => v.version === selected) ?? rows[0];

  const restore = async (v: Version) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(fmt(s.restoreConfirm, { n: v.version }))) return;
    const x = v.snapshot;
    setBusy(true);
    const { error } = await supabase.from("playbooks").update({
      kind: x.kind, title: x.title, summary: x.summary ?? "", category: x.category ?? "", company_id: x.company_id ?? null,
      body: x.body ?? "", steps: x.steps ?? [], link_url: x.link_url ?? null, template: x.template ?? null, sections: x.sections ?? {},
      roles: x.roles ?? [], definitions: x.definitions ?? [], resources: x.resources ?? [], video_url: x.video_url ?? null,
      owner_person_id: x.owner_person_id ?? null, ack_required: x.ack_required ?? false, language: x.language ?? null, updated_by: me.userId,
    }).eq("id", p.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(s.restored);
    router.push(`/playbooks/${p.id}`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/playbooks/${p.id}`} className="text-sm font-bold text-[#00704a] hover:underline">{fmt(s.backTo, { title: p.title })}</Link>
      <h1 className="flex items-center gap-2 text-2xl font-black text-gray-900"><History className="h-6 w-6 text-[#00704a]" /> {s.historyTitle}</h1>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ol className="space-y-1.5 self-start rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
          {rows.map(v => (
            <li key={v.version}>
              <button type="button" onClick={() => setSelected(v.version)} aria-current={selected === v.version}
                className={`w-full rounded-xl px-3 py-2 text-left ${selected === v.version ? "bg-[#e6f6f0]" : "hover:bg-gray-50"}`}>
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  {fmt(s.viewing, { n: v.version })}
                  {v.version === currentVersion && <span className="rounded-full bg-[#009f67] px-2 py-0.5 text-[10px] font-bold uppercase text-white">{s.current}</span>}
                </span>
                <span className="block text-xs text-gray-500">{fmt(s.editedBy, { name: (v.edited_by && userNames[v.edited_by]) || s.unknown, date: date(v.edited_at) })}</span>
              </button>
            </li>
          ))}
          {rows.length === 1 && <li className="px-3 py-2 text-xs text-gray-500">{s.noHistory}</li>}
        </ol>

        <div className="min-w-0 space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-gray-400">{fmt(s.viewing, { n: shown.version })}</p>
              <h2 className="mt-1 text-2xl font-black text-gray-900">{shown.snapshot.title}</h2>
              {shown.snapshot.summary && <p className="mt-1 text-gray-600">{shown.snapshot.summary}</p>}
            </div>
            {shown.version !== currentVersion && (
              <button type="button" onClick={() => restore(shown)} disabled={busy}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} {s.restore}
              </button>
            )}
          </header>
          <PlaybookContent p={{ ...shown.snapshot, steps: shown.snapshot.steps ?? [], body: shown.snapshot.body ?? "" }} names={names} />
        </div>
      </div>
    </div>
  );
}
