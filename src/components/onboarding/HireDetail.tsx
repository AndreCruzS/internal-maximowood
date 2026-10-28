"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Eye, KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import RequiredTrainings from "@/components/onboarding/RequiredTrainings";
import type { RequiredTraining, TrainingCompletion } from "@/lib/requiredTrainings";
import { useMe } from "@/components/MeProvider";
import { companyInk, companyName, type CompanyId } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";
import { hireProgress, type AttemptSummary, type HireAccount, type NewHire, type TrainingModule } from "@/lib/onboarding";
import { ProgressBar, STATUS_STYLE } from "@/components/onboarding/HireList";
import PrehireChecklist from "@/components/onboarding/PrehireChecklist";
import WelcomePlan from "@/components/onboarding/WelcomePlan";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 text-sm">
      <dt className="w-40 shrink-0 font-bold text-gray-500">{k}</dt>
      <dd className="min-w-0 text-gray-900">{children}</dd>
    </div>
  );
}

/** One new hire: what the leader asked for, IT's setup (company email, phone, accounts), and training progress. */
export default function HireDetail({ hire: h, people, names, creator, canEditIt, canEditPlan, canCancel, path, attempts, welcomeDone, required, canMarkTrainings = false }: {
  hire: NewHire;
  people: { id: string; full_name: string }[];
  names: Record<string, string>;
  creator: string | null;
  canEditIt: boolean;
  canEditPlan: boolean;
  canCancel: boolean;
  path: TrainingModule[];
  attempts: Record<string, AttemptSummary>;
  welcomeDone: boolean;
  /** Mandatory trainings taken in Rippling (US team); HR ticks them off. */
  required?: { required: RequiredTraining[]; done: TrainingCompletion[] };
  canMarkTrainings?: boolean;
}) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [it, setIt] = useState({ company_email: h.company_email ?? "", phone_number: h.phone_number ?? "", it_notes: h.it_notes });
  const [accounts, setAccounts] = useState<HireAccount[]>(h.accounts.length ? h.accounts : [{ name: "Gmail", login: "", url: "https://mail.google.com" }]);
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const yes = (b: boolean) => (b ? t.hires.yes : t.hires.no);

  const saveIt = async (ready: boolean) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase
      .from("new_hires")
      .update({
        company_email: it.company_email.trim().toLowerCase() || null,
        phone_number: it.phone_number.trim() || null,
        it_notes: it.it_notes.trim(),
        accounts: accounts.map(a => ({ name: a.name.trim(), login: a.login.trim(), url: a.url.trim() })).filter(a => a.name),
        ...(ready && h.status === "it_setup" ? { status: "ready", it_done_at: new Date().toISOString(), it_done_by: me.userId } : {}),
      })
      .eq("id", h.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.hires.savedIt);
    router.refresh();
  };

  const cancel = async () => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(fmt(t.hires.cancelConfirm, { name: h.full_name }))) return;
    const { error } = await supabase.from("new_hires").update({ status: "cancelled" }).eq("id", h.id);
    if (error) return toast.error(error.message);
    router.push("/onboarding?tab=hires");
    router.refresh();
  };

  const progress = hireProgress(h, welcomeDone, path, attempts);
  const setAccount = (i: number, patch: Partial<HireAccount>) => setAccounts(a => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/onboarding?tab=hires" className="text-sm font-bold text-[#00704a] hover:underline">{t.hires.back}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{h.full_name}</h1>
          <p className="text-gray-500">
            {h.title}{h.department_id ? ` · ${deptName(t, h.department_id)}` : ""}
            {h.company_id && <span style={{ color: companyInk(h.company_id) }}> · {companyName(h.company_id as CompanyId)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_STYLE[h.status]}`}>{t.hires.status[h.status]}</span>
          <Link href={`/onboarding/preview?hire=${h.id}`} className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-800 hover:bg-gray-50">
            <Eye className="h-4 w-4" /> {t.prehire.preview}
          </Link>
        </div>
      </div>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <ProgressBar label={t.prehire.leaderSide} value={progress.leader} />
        <ProgressBar label={t.prehire.employeeSide} value={progress.employee} />
      </section>

      <PrehireChecklist hire={h} canTick={canEditPlan || canEditIt} canTickIt={canEditIt} />

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="divide-y divide-gray-100">
          <Row k={t.hires.startDate}>{h.start_date ? date(h.start_date) : "—"}</Row>
          <Row k={t.hires.reportsTo}>{h.reports_to ? names[h.reports_to] ?? "—" : "—"}</Row>
          <Row k={t.hires.personalEmail}>{h.personal_email}</Row>
          <Row k={t.hires.needsEmail}>{yes(h.needs_email)}</Row>
          <Row k={t.hires.needsPhone}>{yes(h.needs_phone)}{h.needs_phone && h.phone_area_code ? ` · ${t.hires.areaCode}: ${h.phone_area_code}` : ""}</Row>
          <Row k={t.hires.access}>
            {[h.department_id, ...h.access_departments].filter(Boolean).map(d => deptName(t, d)).join(", ") || "—"}
          </Row>
          {h.notes && <Row k={t.hires.notes}>{h.notes}</Row>}
          {creator && <Row k="">{fmt(t.hires.addedBy, { name: creator })}</Row>}
        </dl>
      </section>

      <WelcomePlan hire={h} people={people} names={names} canEdit={canEditPlan} />

      <section id="it" className="scroll-mt-24 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 font-black text-gray-900"><KeyRound className="h-5 w-5 text-gray-400" /> {t.hires.itTitle}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-700"><ShieldAlert className="h-3.5 w-3.5" /> {t.hires.noPasswords}</p>
        </div>
        {canEditIt ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="it-mail">{t.hires.companyEmail}</label>
                <input id="it-mail" type="email" value={it.company_email} onChange={e => setIt(x => ({ ...x, company_email: e.target.value }))} placeholder="name@maximowood.com" className={field} autoComplete="off" />
              </div>
              <div>
                <label className={label} htmlFor="it-phone">{t.hires.phoneNumber}</label>
                <input id="it-phone" value={it.phone_number} onChange={e => setIt(x => ({ ...x, phone_number: e.target.value }))} placeholder={h.phone_area_code ? `+1 ${h.phone_area_code} …` : "+1 …"} className={field} autoComplete="off" />
              </div>
            </div>
            <div className="space-y-2">
              <span className={label}>{t.hires.accounts}</span>
              {accounts.map((a, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input value={a.name} onChange={e => setAccount(i, { name: e.target.value })} placeholder={t.hires.accountName} aria-label={t.hires.accountName} className={field} />
                  <input value={a.login} onChange={e => setAccount(i, { login: e.target.value })} placeholder={t.hires.accountLogin} aria-label={t.hires.accountLogin} className={field} autoComplete="off" />
                  <input value={a.url} onChange={e => setAccount(i, { url: e.target.value })} placeholder="https://…" aria-label={t.hires.accountUrl} className={field} />
                  <button type="button" onClick={() => setAccounts(x => x.filter((_, j) => j !== i))} aria-label={t.common.delete} className="h-10 rounded-lg px-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setAccounts(x => [...x, { name: "", login: "", url: "" }])} className="flex items-center gap-1.5 text-sm font-bold text-[#00704a] hover:underline">
                <Plus className="h-4 w-4" /> {t.hires.addAccount}
              </button>
            </div>
            <div>
              <label className={label} htmlFor="it-notes">{t.hires.itNotes}</label>
              <textarea id="it-notes" rows={2} value={it.it_notes} onChange={e => setIt(x => ({ ...x, it_notes: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => saveIt(false)} disabled={busy} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700 disabled:opacity-50">{t.hires.saveIt}</button>
              {h.status === "it_setup" && (
                <button type="button" onClick={() => saveIt(true)} disabled={busy || (h.needs_email && !it.company_email.trim())} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-4 text-sm font-bold text-white disabled:opacity-50">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.hires.markReady}
                </button>
              )}
            </div>
          </>
        ) : (
          <dl className="divide-y divide-gray-100">
            <Row k={t.hires.companyEmail}>{h.company_email ?? "—"}</Row>
            <Row k={t.hires.phoneNumber}>{h.phone_number ?? "—"}</Row>
            <Row k={t.hires.accounts}>{h.accounts.length ? h.accounts.map(a => a.name).join(", ") : "—"}</Row>
          </dl>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-black text-gray-900">{t.prehire.employeeSide}</h2>
        <ul className="mb-2 space-y-2">
          {[
            { on: !!h.linked_at, text: t.prehire.signedIn },
            { on: welcomeDone, text: t.prehire.welcomeForm },
          ].map(x => (
            <li key={x.text} className="flex items-center gap-3 text-sm">
              {x.on ? <CheckCircle2 className="h-4 w-4 text-[#009f67]" /> : <Circle className="h-4 w-4 text-gray-300" />}
              <span className="flex-1 font-bold text-gray-900">{x.text}</span>
              <span className={x.on ? "text-[#00704a]" : "text-gray-400"}>{x.on ? t.training.done : t.hires.notStarted}</span>
            </li>
          ))}
        </ul>
        {path.length === 0 ? (
          <p className="text-sm text-gray-500">{t.training.noPath}</p>
        ) : (
          <ul className="space-y-2">
            {path.map(m => {
              const a = attempts[m.id];
              return (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  {a?.passed ? <CheckCircle2 className="h-4 w-4 text-[#009f67]" /> : <Circle className="h-4 w-4 text-gray-300" />}
                  <span className="flex-1 font-bold text-gray-900">{m.title}</span>
                  <span className={a?.passed ? "text-[#00704a]" : "text-gray-400"}>
                    {a ? fmt(a.passed ? t.hires.passed : t.hires.failed, { score: a.best }) : t.hires.notStarted}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {required && <RequiredTrainings required={required.required} done={required.done} personId={h.person_id} canMark={canMarkTrainings} />}

      {canCancel && h.status !== "done" && (
        <div className="flex justify-end">
          <button type="button" onClick={cancel} className="text-sm font-bold text-red-600 hover:underline">{t.hires.cancel}</button>
        </div>
      )}
    </div>
  );
}
