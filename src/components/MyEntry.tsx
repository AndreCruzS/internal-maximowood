"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { COMPANIES, DEPARTMENTS } from "@/lib/intranet";
import type { Person, Position } from "@/components/PeopleView";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import PositionRequests, { type PositionRequest } from "@/components/people/PositionRequests";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import { matchPeople } from "@/lib/personMatch";

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

/**
 * The signed-in person's own entry. First visit: claim their name from the
 * org chart (or add themselves). After that: keep their details up to date and
 * request position changes, which an admin approves (people can't change
 * their own position). Admins also see the pending requests here.
 */
export default function MyEntry({ mine, people, positions }: {
  mine: Person | null;
  people: Person[];
  positions: Position[];
}) {
  const router = useRouter();
  const { t, tag } = useI18n();
  const me = useMe();
  const supabase = getSupabase();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<"details" | "request" | null>(null);

  // ── First visit: claim ────────────────────────────────────────────────────
  // Entries that could be me (surname, first name or email) come first and the best one is pre-selected.
  const suggested = useMemo(() => {
    const name = me.name.includes("@") ? "" : me.name.trim();
    const parts = name.split(/\s+/);
    return matchPeople(people, { first: parts[0] ?? "", last: parts.slice(1).join(" "), email: me.name.includes("@") ? me.name : "" });
  }, [people, me.name]);
  const unclaimed = [...suggested, ...people.filter(p => !p.user_id && !suggested.includes(p))];
  const [pick, setPick] = useState(suggested[0]?.id ?? "");
  const [newName, setNewName] = useState("");

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    if (!supabase) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(ok);
      router.refresh();
    }
  };

  // ── Details & position requests ───────────────────────────────────────────
  const myPositions = useMemo(() => (mine ? positions.filter(p => p.person_id === mine.id).sort((a, b) => a.sort - b.sort) : []), [mine, positions]);
  const [details, setDetails] = useState({
    full_name: mine?.full_name ?? "",
    location: mine?.location ?? "",
    company_id: mine?.company_id ?? "",
  });
  const [request, setRequest] = useState({ title: "", department_id: "", reports_to: "", note: "" });
  const [pending, setPending] = useState<PositionRequest | null>(null);
  const [reload, setReload] = useState(0);
  const others = useMemo(() => people.filter(p => p.id !== mine?.id).sort((a, b) => a.full_name.localeCompare(b.full_name)), [people, mine]);

  useEffect(() => {
    if (!supabase || !mine) return;
    let active = true;
    supabase
      .from("position_requests")
      .select("*")
      .eq("person_id", mine.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (active) setPending((data?.[0] as PositionRequest | undefined) ?? null);
      });
    return () => {
      active = false;
    };
  }, [supabase, mine, reload]);

  if (!mine) {
    return (
      <section className="rounded-xl border-2 border-[#009f67] bg-[#f2fbf7] p-5">
        <h2 className="flex items-center gap-2 font-black text-gray-900">
          <UserCheck className="h-5 w-5 text-[#00704a]" /> {t.myEntry.addTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{t.myEntry.addText}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className={label} htmlFor="claim">{t.myEntry.listed}</label>
            <select id="claim" value={pick} onChange={e => setPick(e.target.value)} className={field}>
              <option value="">{t.myEntry.chooseName}</option>
              {unclaimed.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!pick || busy}
            onClick={() => run(async () => supabase!.rpc("claim_person", { target: pick }), t.myEntry.linked)}
            className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {t.myEntry.thatsMe}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#cdeee0] pt-4">
          <div className="min-w-64 flex-1">
            <label className={label} htmlFor="newname">{t.myEntry.notListed}</label>
            <input id="newname" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t.myEntry.yourName} className={field} />
          </div>
          <button
            type="button"
            disabled={!newName.trim() || busy}
            onClick={() => run(async () => supabase!.rpc("create_my_person", { name: newName }), t.myEntry.added)}
            className="h-9 rounded-lg border border-[#009f67] bg-white px-4 text-sm font-bold text-[#00704a] disabled:opacity-50"
          >
            {t.myEntry.addMe}
          </button>
        </div>
      </section>
    );
  }

  const saveDetails = () =>
    run(async () => {
      const r = await supabase!
        .from("people")
        .update({
          full_name: details.full_name.trim() || mine.full_name,
          location: details.location.trim() || null,
          company_id: details.company_id || null,
        })
        .eq("id", mine.id);
      if (!r.error) setOpen(null);
      return r;
    }, t.myEntry.updated);

  const sendRequest = async () => {
    if (!supabase) return;
    const row = {
      person_id: mine.id,
      title: request.title.trim(),
      department_id: request.department_id || null,
      reports_to: request.reports_to || null,
      note: request.note.trim(),
    };
    if (!row.title && !row.department_id && !row.reports_to && !row.note) return toast.error(t.myEntry.requestEmpty);
    setBusy(true);
    const { error } = await supabase.from("position_requests").insert(row);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.myEntry.requestSent);
    setOpen(null);
    setRequest({ title: "", department_id: "", reports_to: "", note: "" });
    setReload(n => n + 1);
  };

  const cancelRequest = async () => {
    if (!supabase || !pending) return;
    const { error } = await supabase.from("position_requests").delete().eq("id", pending.id);
    if (error) return toast.error(error.message);
    setPending(null);
  };

  const button = "h-9 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-black text-gray-900">{t.myEntry.yourEntry}</h2>
          <p className="text-sm text-gray-500">
            {myPositions.length ? myPositions.map(p => `${p.title} · ${deptName(t, p.department_id)}`).join("  |  ") : t.myEntry.addPositionHint}
          </p>
        </div>
        {!open && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOpen("details")} className={button}>{t.myEntry.editDetails}</button>
            {!mine.rippling_id && <button type="button" onClick={() => setOpen("request")} disabled={!!pending} className={button}>{t.myEntry.requestButton}</button>}
          </div>
        )}
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {fmt(t.myEntry.pending, { date: new Date(pending.created_at).toLocaleDateString(tag, { month: "short", day: "numeric" }) })}
          </span>
          <button type="button" onClick={cancelRequest} className="text-xs font-bold underline">{t.myEntry.cancelRequest}</button>
        </div>
      )}

      {open === "details" && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="me-name">{t.myEntry.fullName}</label>
              <input id="me-name" value={details.full_name} onChange={e => setDetails(d => ({ ...d, full_name: e.target.value }))} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="me-loc">{t.myEntry.location}</label>
              <input id="me-loc" value={details.location} onChange={e => setDetails(d => ({ ...d, location: e.target.value }))} placeholder="Curitiba, Brazil" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="me-co">{t.myEntry.company}</label>
              <select id="me-co" value={details.company_id} onChange={e => setDetails(d => ({ ...d, company_id: e.target.value }))} disabled={!!mine.rippling_id} title={mine.rippling_id ? t.rippling.managedHint : undefined} className={`${field} disabled:bg-gray-50`}>
                <option value="">—</option>
                {COMPANIES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-400">{fmt(t.myEntry.email, { email: mine.email ?? "—" })}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(null)} className={button}>{t.common.cancel}</button>
            <button type="button" onClick={saveDetails} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.common.save}
            </button>
          </div>
        </div>
      )}

      {open === "request" && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="font-bold text-gray-900">{t.myEntry.requestTitle}</p>
            <p className="text-sm text-gray-500">{t.myEntry.requestHint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="rq-title">{t.myEntry.newTitle}</label>
              <input id="rq-title" value={request.title} onChange={e => setRequest(r => ({ ...r, title: e.target.value }))} placeholder={myPositions[0]?.title || t.myEntry.titlePlaceholder} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="rq-dept">{t.myEntry.department}</label>
              <select id="rq-dept" value={request.department_id} onChange={e => setRequest(r => ({ ...r, department_id: e.target.value }))} className={field}>
                <option value="">{t.myEntry.keep}</option>
                {DEPARTMENTS.map(x => (
                  <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="rq-boss">{t.myEntry.reportsToPerson}</label>
              <select id="rq-boss" value={request.reports_to} onChange={e => setRequest(r => ({ ...r, reports_to: e.target.value }))} className={field}>
                <option value="">{t.myEntry.keep}</option>
                {others.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="rq-note">{t.myEntry.note}</label>
            <textarea id="rq-note" rows={2} maxLength={1000} value={request.note} onChange={e => setRequest(r => ({ ...r, note: e.target.value }))} placeholder={t.myEntry.notePlaceholder} className={`${field} h-auto py-2`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(null)} className={button}>{t.common.cancel}</button>
            <button type="button" onClick={sendRequest} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.myEntry.sendRequest}
            </button>
          </div>
        </div>
      )}

      {me.isAdmin && <PositionRequests people={people} positions={positions} />}
    </section>
  );
}
