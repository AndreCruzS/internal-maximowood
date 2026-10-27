"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/I18nProvider";
import { EMPLOYMENT_TYPES, type AccessRow, type EmploymentType, type ImportPlan } from "@/lib/access";
import { HOLIDAY_CALENDARS } from "@/lib/holidays";

type Data =
  | { ready: true; enforce: boolean; people: AccessRow[]; refused: { email: string; reason: "no_person" | "inactive" | "not_enabled" }[] }
  | { ready: false; error: string };

const field = "h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
const card = "rounded-2xl border border-gray-200 bg-white p-5";

export default function AccessView({ initial }: { initial: Data }) {
  const { t } = useI18n();
  const a = t.access;
  const [data, setData] = useState<Data>(initial);
  const [busy, setBusy] = useState<"enforce" | "preview" | "apply" | null>(null);
  const [paste, setPaste] = useState("");
  const [plan, setPlan] = useState<{ plan: ImportPlan; errors: { line: number }[] } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EmploymentType | "unset" | "all">("all");

  const reload = async () => {
    const res = await fetch("/api/hr/access").catch(() => null);
    if (res?.ok) setData(await res.json());
  };
  const post = async (body: object) => {
    const res = await fetch("/api/hr/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    return { ok: !!res?.ok, ...json };
  };

  const people = useMemo(() => (data.ready ? data.people : []), [data]);
  const counts = useMemo(() => {
    const active = people.filter(p => p.active);
    const n = (ts: (EmploymentType | null)[]) => active.filter(p => ts.includes(p.employment_type)).length;
    return { w2: n(["w2"]), br: n(["clt", "pj"]), contractor: n(["contractor"]), unset: n([null]) };
  }, [people]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p =>
      (filter === "all" || (filter === "unset" ? !p.employment_type : p.employment_type === filter)) &&
      (!q || [p.full_name, p.email, ...p.alt_emails].some(x => (x ?? "").toLowerCase().includes(q))));
  }, [people, search, filter]);

  if (!data.ready) return <p className="mx-auto max-w-5xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.error}</p>;

  const setEnforce = async (on: boolean) => {
    if (on && !window.confirm(a.enforceConfirm)) return;
    setBusy("enforce");
    const r = await post({ enforce: on });
    setBusy(null);
    if (!r.ok) return toast.error(r.error === "self_locked" ? a.selfLocked : r.error || a.failed);
    setData(d => (d.ready ? { ...d, enforce: on } : d));
    toast.success(a.saved);
  };

  const runImport = async (apply: boolean) => {
    setBusy(apply ? "apply" : "preview");
    const r = await post({ import: paste, apply });
    setBusy(null);
    if (!r.ok) return toast.error(r.error || a.failed);
    if (!apply) return setPlan({ plan: r.plan, errors: r.errors });
    if (r.failed?.length) toast.error(r.failed.slice(0, 3).join("\n"));
    else toast.success(a.applied);
    setPlan(null);
    setPaste("");
    await reload();
  };

  const patch = async (id: string, change: Partial<Pick<AccessRow, "employment_type" | "legal_entity" | "alt_emails" | "holiday_calendar">>) => {
    const res = await fetch("/api/hr/access", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...change }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      toast.error(json.error || a.failed);
      return reload();
    }
    setData(d => (d.ready ? { ...d, people: d.people.map(p => (p.id === id ? (json.person as AccessRow) : p)) } : d));
    if ("employment_type" in change) void reload(); // the "refused" list depends on it
  };

  const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((acc, [k, x]) => acc.replace(`{${k}}`, String(x)), s);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <Link href="/hr" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-[#00704a]"><ArrowLeft className="h-4 w-4" /> {t.hr.title}</Link>
        <h1 className="text-2xl font-black text-gray-900">{a.title}</h1>
        <p className="mt-1 text-sm text-gray-600">{a.subtitle}</p>
      </header>

      {/* The switch + who it would refuse */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className={`h-6 w-6 ${data.enforce ? "text-[#009f67]" : "text-gray-400"}`} />
            <div>
              <p className="font-black text-gray-900">{a.enforce}</p>
              <p className="text-sm text-gray-600">{data.enforce ? fill(a.counts, counts) : a.enforceHint}</p>
            </div>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-gray-300 text-sm font-bold">
            {[false, true].map(on => (
              <button key={String(on)} type="button" disabled={busy !== null} onClick={() => on !== data.enforce && void setEnforce(on)}
                className={`flex items-center gap-1.5 px-4 py-1.5 ${data.enforce === on ? (on ? "bg-[#009f67] text-white" : "bg-gray-800 text-white") : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {busy === "enforce" && data.enforce !== on && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{on ? a.on : a.off}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{a.refusedTitle} ({data.refused.length})</p>
          {data.refused.length === 0 ? (
            <p className="mt-1 text-sm text-gray-600">{a.refusedNone}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {data.refused.map(r => (
                <li key={r.email} className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs text-red-800">{r.email} · {a.reasons[r.reason]}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Import */}
      <section className={card}>
        <h2 className="font-black text-gray-900">{a.importTitle}</h2>
        <p className="mt-1 text-sm text-gray-600">{a.importHint}</p>
        <textarea value={paste} onChange={e => { setPaste(e.target.value); setPlan(null); }} rows={6} spellCheck={false}
          placeholder={"ane@lumberplus.com\tW2\tAne Rambo\tLumber Plus Enterprises\njoe@gmxgroup.com\tContractor"}
          className="mt-3 w-full rounded-lg border border-gray-300 p-2.5 font-mono text-xs outline-none focus:border-[#009f67]" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runImport(false)} disabled={busy !== null || !paste.trim()} className="flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} {a.preview}
          </button>
          <button type="button" onClick={() => void runImport(true)} disabled={busy !== null || !plan || (!plan.plan.updates.length && !plan.plan.creates.length)} className="flex h-9 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {a.apply}
          </button>
        </div>
        {plan && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-bold text-gray-900">{fill(a.planSummary, { updates: plan.plan.updates.length, creates: plan.plan.creates.length, unchanged: plan.plan.unchanged })}</p>
            {(plan.plan.updates.length > 0 || plan.plan.creates.length > 0) && (
              <ul className="max-h-56 overflow-auto rounded-lg border border-gray-100 text-xs">
                {plan.plan.updates.map(u => (
                  <li key={u.personId} className="border-b border-gray-50 px-3 py-1.5">{u.name} <span className="text-gray-400">{u.email}</span> · {u.from ? a.types[u.from] : a.unset} → <b>{a.types[u.to]}</b>{u.entity && ` · ${u.entity}`}</li>
                ))}
                {plan.plan.creates.map(c => (
                  <li key={c.email} className="border-b border-gray-50 px-3 py-1.5 text-[#00704a]">+ {c.name} <span className="text-gray-400">{c.email}</span> · <b>{a.types[c.type]}</b>{c.entity && ` · ${c.entity}`}</li>
                ))}
              </ul>
            )}
            {plan.plan.missingName.length > 0 && <p className="text-amber-800">{fill(a.missingName, { list: plan.plan.missingName.join(", ") })}</p>}
            {plan.errors.length > 0 && <p className="text-red-700">{fill(a.badLines, { list: plan.errors.map(e => e.line).join(", ") })}</p>}
          </div>
        )}
      </section>

      {/* Directory */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-gray-900">{a.peopleTitle}</h2>
            <p className="text-xs text-gray-500">{fill(a.counts, counts)} · {a.rippling}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
              <option value="all">{a.all}</option>
              <option value="unset">{a.unset}</option>
              {EMPLOYMENT_TYPES.map(x => <option key={x} value={x}>{a.types[x]}</option>)}
            </select>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={a.search} className="h-9 w-56 rounded-lg border border-gray-300 px-2.5 text-sm outline-none focus:border-[#009f67]" />
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-3">{a.name}</th>
                <th className="w-36 px-2 py-2">{a.type}</th>
                <th className="w-48 px-2 py-2">{a.entity}</th>
                <th className="w-64 px-2 py-2">{a.otherEmails}</th>
                <th className="w-52 px-2 py-2">{a.calendar}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(p => (
                <tr key={p.id} className={`border-b border-gray-50 align-top ${p.active ? "" : "opacity-50"}`}>
                  <td className="py-2 pr-3">
                    <Link href={`/people/${p.id}`} className="font-semibold text-gray-900 hover:underline">{p.full_name}</Link>
                    {!p.active && <span className="ml-1.5 text-xs text-gray-500">({a.left})</span>}
                    <div className="text-xs text-gray-500">{p.email ?? "—"}</div>
                  </td>
                  <td className="px-2 py-2">
                    <select value={p.employment_type ?? ""} onChange={e => void patch(p.id, { employment_type: (e.target.value || null) as EmploymentType | null })}
                      className={`${field} ${p.employment_type ? "" : "border-amber-300 bg-amber-50"}`}>
                      <option value="">{a.unset}</option>
                      {EMPLOYMENT_TYPES.map(x => <option key={x} value={x}>{a.types[x]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input key={`e-${p.id}-${p.legal_entity}`} defaultValue={p.legal_entity} maxLength={120} className={field}
                      onBlur={e => e.target.value.trim() !== p.legal_entity && void patch(p.id, { legal_entity: e.target.value })} />
                  </td>
                  <td className="px-2 py-2">
                    <input key={`m-${p.id}-${p.alt_emails.join()}`} defaultValue={p.alt_emails.join(", ")} placeholder="name@gmxgroup.com" className={field}
                      onBlur={e => {
                        const list = e.target.value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
                        if (list.join() !== p.alt_emails.join()) void patch(p.id, { alt_emails: list });
                      }} />
                  </td>
                  <td className="px-2 py-2">
                    <select value={p.holiday_calendar ?? ""} onChange={e => void patch(p.id, { holiday_calendar: e.target.value || null })} className={field}>
                      <option value="">{a.fromOffice}</option>
                      {HOLIDAY_CALENDARS.map(c => <option key={c} value={c}>{t.holidays.calendars[c]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
