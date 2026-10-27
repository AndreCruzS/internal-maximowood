"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, FileText, FolderOpen, HeartPulse, Loader2, Pencil, Receipt, Sun, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { ABSENCE_KINDS } from "@/components/home/WhosOut";
import { fmt } from "@/lib/i18n/locale";
import { canCancel, invalidLinks, workdays, type HrLinkId, type TimeOffRow } from "@/lib/timeOff";
import type { TimeOffData } from "@/server/timeOff";
import { notifyTimeOff } from "@/components/hr/notify";

const field = "h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";
const LINK_ICON: Record<HrLinkId, typeof Receipt> = {
  paystubs: Receipt, tax: FileText, benefits: HeartPulse, timeoff: Sun, profile: UserCog, documents: FolderOpen,
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-[#f2fbf7] text-[#00704a] border-[#9fdcc5]",
  declined: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
};

const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function HrView({ data }: { data: TimeOffData }) {
  const { t, tag } = useI18n();
  const h = t.hr;
  const router = useRouter();
  const today = localYmd();
  const names = new Map(data.people.map(p => [p.id, p.full_name]));
  const d = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });
  const range = (a: TimeOffRow) => (a.starts_on === a.ends_on ? d(a.starts_on) : `${d(a.starts_on)} – ${d(a.ends_on)}`);
  const days = (a: TimeOffRow) => {
    const n = workdays(a.starts_on, a.ends_on);
    return n === 1 ? h.workday : fmt(h.workdays, { n });
  };
  const kindName = (k: string) => t.absences.kinds[k as keyof typeof t.absences.kinds] ?? k;

  // ── Request ──────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState({ starts_on: "", ends_on: "", kind: "vacation", note: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const needsApproval = data.approvalKinds.includes(draft.kind);

  const request = async () => {
    const supabase = getSupabase();
    if (!supabase || !data.myPersonId || !draft.starts_on) return;
    setBusy("request");
    const { data: row, error } = await supabase
      .from("absences")
      .insert({ ...draft, ends_on: draft.ends_on || draft.starts_on, note: draft.note.trim(), person_id: data.myPersonId })
      .select("id, status")
      .single();
    setBusy(null);
    if (error) return toast.error(error.message);
    const r = row as { id: string; status: string };
    if (r.status === "pending") {
      await notifyTimeOff(r.id, "requested");
      toast.success(h.sent);
    } else toast.success(h.added);
    setDraft({ starts_on: "", ends_on: "", kind: "vacation", note: "" });
    router.refresh();
  };

  const cancel = async (a: TimeOffRow) => {
    if (!window.confirm(h.cancelConfirm)) return;
    setBusy(a.id);
    const { error } = await getSupabase()!.from("absences").update({ status: "cancelled" }).eq("id", a.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(h.cancelledToast);
    router.refresh();
  };

  // ── Approve ──────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Record<string, string>>({});
  const decide = async (a: TimeOffRow, approve: boolean) => {
    setBusy(a.id);
    const { error } = await getSupabase()!.rpc("decide_absence", { target: a.id, approve, note: comments[a.id] ?? "" });
    setBusy(null);
    if (error) return toast.error(error.message);
    await notifyTimeOff(a.id, "decided");
    toast.success(approve ? h.approvedToast : h.declinedToast);
    router.refresh();
  };

  // ── HR & Pay links ───────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [links, setLinks] = useState(data.hrPay.links);
  const [note, setNote] = useState(data.hrPay.note);
  const saveLinks = async () => {
    const cleaned = links.map(l => ({ id: l.id, url: l.url.trim() }));
    if (invalidLinks(cleaned).length) return toast.error(h.pay.invalid);
    setBusy("links");
    const { error } = await getSupabase()!
      .from("app_settings")
      .upsert({ key: "hr_pay", value: { links: cleaned, note: note.trim() }, updated_at: new Date().toISOString() });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(h.pay.saved);
    setEditing(false);
    router.refresh();
  };

  const status = (a: TimeOffRow) => (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[a.status] ?? STATUS_STYLE.cancelled}`}>{h.status[a.status]}</span>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{h.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{h.subtitle}</p>
        </div>
        {data.canEditHrPay && (
          <div className="flex flex-wrap gap-2">
            <Link href="/hr/access" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:border-[#009f67] hover:text-[#00704a]">{t.access.link} →</Link>
            <Link href="/hr/rippling" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:border-[#009f67] hover:text-[#00704a]">{t.rippling.link} →</Link>
          </div>
        )}
      </header>

      {!data.ready && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{h.migrationPending}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Request time off */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-black text-gray-900">{h.request}</h2>
          {!data.myPersonId ? (
            <p className="mt-2 text-sm text-gray-500">{t.absences.needProfile}</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="to-from">{t.absences.from}</label>
                  <input id="to-from" type="date" value={draft.starts_on} onChange={e => setDraft(x => ({ ...x, starts_on: e.target.value, ends_on: x.ends_on && x.ends_on >= e.target.value ? x.ends_on : e.target.value }))} className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="to-to">{t.absences.to}</label>
                  <input id="to-to" type="date" min={draft.starts_on} value={draft.ends_on} onChange={e => setDraft(x => ({ ...x, ends_on: e.target.value }))} className={field} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="to-kind">{t.absences.kind}</label>
                <select id="to-kind" value={draft.kind} onChange={e => setDraft(x => ({ ...x, kind: e.target.value }))} className={field}>
                  {ABSENCE_KINDS.map(k => <option key={k} value={k}>{kindName(k)}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="to-note">{t.absences.note}</label>
                <input id="to-note" value={draft.note} onChange={e => setDraft(x => ({ ...x, note: e.target.value }))} className={field} />
              </div>
              <p className="text-xs text-gray-500">{needsApproval ? h.needsApproval : h.noApproval}</p>
              <button
                type="button"
                onClick={request}
                disabled={!draft.starts_on || busy === "request" || !data.ready}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#009f67] text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === "request" && <Loader2 className="h-4 w-4 animate-spin" />}
                {needsApproval ? h.send : h.add}
              </button>
            </div>
          )}
        </section>

        {/* To approve */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-black text-gray-900">
            {h.toApprove} {data.toApprove.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{data.toApprove.length}</span>}
          </h2>
          <p className="text-xs text-gray-500">{h.toApproveHint}</p>
          {data.toApprove.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{h.noneToApprove}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.toApprove.map(a => (
                <li key={a.id} className="rounded-xl border border-gray-200 p-3">
                  <p className="font-bold text-gray-900">{names.get(a.person_id) ?? "—"}</p>
                  <p className="text-sm text-gray-600">{kindName(a.kind)} · {range(a)} · {days(a)}</p>
                  {a.note && <p className="mt-1 text-sm text-gray-500">“{a.note}”</p>}
                  <p className="mt-1 text-[11px] text-gray-400">{fmt(h.requestedOn, { date: d(a.created_at.slice(0, 10)) })}</p>
                  <input
                    value={comments[a.id] ?? ""}
                    onChange={e => setComments(c => ({ ...c, [a.id]: e.target.value }))}
                    placeholder={h.comment}
                    aria-label={h.comment}
                    className={`${field} mt-2`}
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy === a.id} onClick={() => decide(a, true)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#009f67] text-sm font-bold text-white disabled:opacity-50">
                      <Check className="h-4 w-4" /> {h.approve}
                    </button>
                    <button type="button" disabled={busy === a.id} onClick={() => decide(a, false)} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white text-sm font-bold text-red-700 disabled:opacity-50">
                      <X className="h-4 w-4" /> {h.decline}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* My time off */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-black text-gray-900">{h.mine}</h2>
        {data.mine.length === 0 ? (
          <p className="py-4 text-sm text-gray-400">{h.noneMine}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {data.mine.map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900">{kindName(a.kind)} · {range(a)}</span>
                  <span className="block text-xs text-gray-500">
                    {days(a)}
                    {a.note && ` · ${a.note}`}
                    {a.decided_by && a.decided_at && ` · ${fmt(h.decidedBy, { name: names.get(a.decided_by) ?? "", date: d(a.decided_at.slice(0, 10)) })}`}
                    {a.decision_note && ` · “${a.decision_note}”`}
                    {a.source === "rippling" && ` · ${h.fromRippling}`}
                  </span>
                </span>
                {status(a)}
                {canCancel(a, today) && (
                  <button type="button" disabled={busy === a.id} onClick={() => cancel(a)} className="text-xs font-bold text-gray-500 underline hover:text-red-600 disabled:opacity-50">
                    {h.cancel}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pay & benefits (Rippling) */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-gray-900">{h.pay.title}</h2>
            <p className="text-sm text-gray-600">{h.pay.subtitle}</p>
          </div>
          {data.canEditHrPay && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <Pencil className="h-3.5 w-3.5" /> {h.pay.edit}
            </button>
          )}
        </div>
        {data.hrPay.note && !editing && <p className="mt-3 rounded-lg bg-[#f2fbf7] px-3 py-2 text-sm text-gray-700">{data.hrPay.note}</p>}

        {editing ? (
          <div className="mt-4 space-y-3">
            {links.map((l, i) => (
              <div key={l.id}>
                <label className={label} htmlFor={`link-${l.id}`}>{h.pay.links[l.id].name}</label>
                <input
                  id={`link-${l.id}`}
                  value={l.url}
                  onChange={e => setLinks(ls => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  className={field}
                  inputMode="url"
                />
              </div>
            ))}
            <div>
              <label className={label} htmlFor="link-note">{h.pay.note}</label>
              <input id="link-note" value={note} onChange={e => setNote(e.target.value)} className={field} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveLinks} disabled={busy === "links"} className="h-9 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">{h.pay.save}</button>
              <button type="button" onClick={() => { setEditing(false); setLinks(data.hrPay.links); setNote(data.hrPay.note); }} className="h-9 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">{h.pay.cancel}</button>
            </div>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.hrPay.links.map(l => {
              const Icon = LINK_ICON[l.id];
              return (
                <li key={l.id}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex h-full items-start gap-3 rounded-xl border border-gray-200 p-3 hover:border-[#009f67] hover:bg-[#f2fbf7]">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#009f67]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-bold text-gray-900">{h.pay.links[l.id].name} <ExternalLink className="h-3 w-3 text-gray-400" /></span>
                      <span className="block text-xs text-gray-500">{h.pay.links[l.id].desc}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-400">{h.pay.notOnRippling}</p>
      </section>
    </div>
  );
}
