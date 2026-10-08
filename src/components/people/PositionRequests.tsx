"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import type { Person, Position } from "@/components/PeopleView";

export type PositionRequest = {
  id: string;
  person_id: string;
  title: string;
  department_id: string | null;
  reports_to: string | null;
  note: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
};

/** Admins: pending "Request to change my position" requests; approving applies them to the person's main position. */
export default function PositionRequests({ people, positions }: { people: Person[]; positions: Position[] }) {
  const router = useRouter();
  const { t, tag } = useI18n();
  const [requests, setRequests] = useState<PositionRequest[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const mainOf = (personId: string) => positions.filter(p => p.person_id === personId).sort((a, b) => a.sort - b.sort)[0];

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    supabase
      .from("position_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at")
      .then(({ data }) => {
        if (active) setRequests((data as PositionRequest[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const decide = async (r: PositionRequest, approve: boolean) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(r.id);
    const fail = (m: string) => {
      setBusy(null);
      toast.error(m);
    };
    if (approve) {
      const main = mainOf(r.person_id);
      const boss = r.reports_to ? mainOf(r.reports_to) : null;
      const patch: Partial<Position> = {};
      if (r.title) patch.title = r.title;
      if (r.department_id) patch.department_id = r.department_id;
      if (boss) patch.reports_to = boss.id;
      if (Object.keys(patch).length) {
        const { error } = main
          ? await supabase.from("positions").update(patch).eq("id", main.id)
          : await supabase.from("positions").insert({ person_id: r.person_id, title: r.title || "—", sort: 1000, ...patch });
        if (error) return fail(error.message);
      }
    }
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("position_requests")
      .update({ status: approve ? "approved" : "declined", decided_at: new Date().toISOString(), decided_by: auth.user?.id ?? null })
      .eq("id", r.id);
    if (error) return fail(error.message);
    setBusy(null);
    toast.success(approve ? t.myEntry.approved : t.myEntry.declined);
    setReload(n => n + 1);
    if (approve) router.refresh();
  };

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.myEntry.requestsTitle}</p>
      {requests.length === 0 ? (
        <p className="text-sm text-gray-400">{t.myEntry.requestsEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {requests.map(r => {
            const main = mainOf(r.person_id);
            const changes = [
              r.title && `${t.myEntry.title}: ${r.title}`,
              r.department_id && `${t.myEntry.department}: ${deptName(t, r.department_id)}`,
              r.reports_to && `${t.myEntry.reportsTo}: ${byId.get(r.reports_to)?.full_name ?? "—"}`,
            ].filter(Boolean);
            return (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900">
                    {byId.get(r.person_id)?.full_name ?? "—"}{" "}
                    <span className="font-normal text-gray-400">· {new Date(r.created_at).toLocaleDateString(tag, { month: "short", day: "numeric" })}</span>
                  </p>
                  {main && <p className="text-xs text-gray-500">{fmt(t.myEntry.current, { current: `${main.title} · ${deptName(t, main.department_id)}` })}</p>}
                  {changes.length > 0 && <p className="mt-1 text-gray-800">{changes.join(" · ")}</p>}
                  {r.note && <p className="mt-1 italic text-gray-600">“{r.note}”</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <X className="h-3.5 w-3.5" /> {t.myEntry.decline}
                  </button>
                  <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className="flex h-8 items-center gap-1 rounded-lg bg-[#009f67] px-3 text-xs font-bold text-white disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> {t.myEntry.approve}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
