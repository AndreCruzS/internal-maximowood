"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, FileText, Loader2, Plus, Search, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/dictionaries";
import {
  EMPLOYMENT_TYPES, REFERRALS_BUCKET, REFERRAL_STATUSES, RESUME_TYPES, resumeExt, resumeProblem, roleLabel,
  type EmploymentType, type OpenRole, type Referral, type ReferralStatus,
} from "@/lib/referrals";
import type { ReferData } from "@/server/referrals";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67] focus:ring-2 focus:ring-[#009f67]/20";
const label = "mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500";
const card = "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm";
export const REF_STYLE: Record<ReferralStatus, string> = {
  submitted: "bg-sky-50 text-sky-800", in_review: "bg-amber-50 text-amber-800", interviewing: "bg-violet-50 text-violet-800",
  hired: "bg-[#e6f6f0] text-[#00704a]", not_selected: "bg-gray-100 text-gray-600",
};
const notify = (id: string, event: "submitted" | "status") =>
  fetch("/api/referrals/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, event }) }).catch(() => null);

export default function ReferView({ data }: { data: ReferData }) {
  const { t, tag } = useI18n();
  const x = t.refer;
  const router = useRouter();
  const open = data.roles.filter(r => r.status === "open");
  const roleById = new Map(data.roles.map(r => [r.id, r]));
  const [f, setF] = useState({ name: "", email: "", role: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });

  const pick = (fl: File | undefined) => {
    if (!fl) return;
    const p = resumeProblem(fl);
    if (p) return toast.error(x[p]);
    setFile(fl);
  };

  const send = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!f.name.trim()) return toast.error(x.needName);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return toast.error(x.needEmail);
    if (!f.role) return toast.error(x.needRole);
    if (!file) return toast.error(x.needResume);
    const p = resumeProblem(file);
    if (p) return toast.error(x[p]);
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const path = `${uid}/${crypto.randomUUID()}.${resumeExt(file)}`;
    const contentType = RESUME_TYPES[file.type] ? file.type : Object.keys(RESUME_TYPES).find(k => RESUME_TYPES[k] === resumeExt(file)) ?? "application/pdf";
    const up = await supabase.storage.from(REFERRALS_BUCKET).upload(path, file, { contentType });
    if (up.error) { setBusy(false); return toast.error(up.error.message); }
    const { data: row, error } = await supabase.from("referrals")
      .insert({ candidate_name: f.name.trim(), candidate_email: f.email.trim(), role_id: f.role, resume_path: path, resume_name: file.name, note: f.note.trim() })
      .select("id").single();
    if (error) { setBusy(false); return toast.error(error.message); }
    await notify((row as { id: string }).id, "submitted");
    setBusy(false);
    toast.success(x.sent);
    setF({ name: "", email: "", role: "", note: "" });
    setFile(null);
    router.refresh();
  };

  const withdraw = async (r: Referral) => {
    const supabase = getSupabase();
    if (!supabase || !window.confirm(x.withdrawConfirm)) return;
    const { error } = await supabase.from("referrals").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    if (r.resume_path) await supabase.storage.from(REFERRALS_BUCKET).remove([r.resume_path]);
    router.refresh();
  };

  const steps: [string, string, typeof Send][] = [
    [x.stepRefer, x.stepReferText, Send],
    [x.stepReview, data.program.review, Search],
    [x.stepReward, data.program.reward, Award],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-[#00704a] to-[#009f67] p-8 text-white shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-white/80">{x.kicker}</p>
        <h1 className="mt-2 text-3xl font-black">{x.headline}</h1>
        <p className="mt-2 max-w-2xl text-white/90">{x.intro}</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {steps.map(([title, text, Icon], i) => (
            <li key={title} className="rounded-xl bg-white/10 p-4">
              <span className="flex items-center gap-2 text-sm font-black"><span className="text-white/60">0{i + 1}</span> <Icon className="h-4 w-4" /> {title}</span>
              {text && <p className="mt-1 text-sm text-white/90">{text}</p>}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className={card}>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-gray-900"><UserPlus className="h-5 w-5 text-[#00704a]" /> {x.title}</h2>
          {open.length === 0 ? <p className="text-sm text-gray-500">{x.noRoles}</p> : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={label} htmlFor="rf-name">{x.candidateName}</label><input id="rf-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={120} className={field} /></div>
                <div><label className={label} htmlFor="rf-email">{x.candidateEmail}</label><input id="rf-email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={field} /></div>
              </div>
              <div>
                <label className={label} htmlFor="rf-role">{x.role}</label>
                <select id="rf-role" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} className={field}>
                  <option value="">{x.pickRole}</option>
                  {open.map(r => <option key={r.id} value={r.id}>{roleLabel(r)}{r.employment_type === "1099" ? " (1099)" : ""}</option>)}
                </select>
              </div>
              <div>
                <span className={label}>{x.resume}</span>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 text-sm ${file ? "border-[#009f67] bg-[#f2fbf7]" : "border-gray-300"}`}
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
                  <FileText className="h-6 w-6 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-gray-900">{file ? file.name : x.chooseFile}</span>
                    <span className="block text-xs text-gray-500">{x.resumeHint}</span>
                  </span>
                  <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only"
                    onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </div>
              <div><label className={label} htmlFor="rf-note">{x.note}</label><textarea id="rf-note" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={2000} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" /></div>
              <div className="flex justify-end">
                <button type="button" onClick={send} disabled={busy} className="flex h-11 items-center gap-2 rounded-lg bg-[#009f67] px-6 text-sm font-bold text-white hover:bg-[#00704a] disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {x.send}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="self-start rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-black text-gray-900">{x.mine}</h2>
            <span className="text-xs text-gray-500">{plural(x, "mineCount", data.mine.length)}</span>
          </div>
          {data.mine.length ? (
            <ul className="space-y-2">
              {data.mine.map(r => {
                const role = r.role_id ? roleById.get(r.role_id) : null;
                return (
                  <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-gray-900">{r.candidate_name}</span>
                        <span className="block truncate text-xs text-gray-500">{role?.title ?? "—"} · {date(r.created_at)}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${REF_STYLE[r.status]}`}>{x.status[r.status]}</span>
                    </div>
                    {r.status === "hired" && (
                      <p className="mt-1 text-xs font-bold text-[#00704a]">{r.bonus_paid ? x.bonusPaid : r.bonus_eligible_on ? fmt(x.bonusOn, { date: date(r.bonus_eligible_on) }) : ""}</p>
                    )}
                    {r.status === "submitted" && <button type="button" onClick={() => withdraw(r)} className="mt-1 text-xs font-bold text-gray-400 hover:text-red-600">{x.withdraw}</button>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">{x.mineEmpty}</p>}
        </section>
      </div>

      {data.isRecruiting && <RecruitingPanel data={data} roleById={roleById} />}
    </div>
  );
}

/** Recruiting (HR, people with the recruiting duty, admins): every referral, and the open roles. */
function RecruitingPanel({ data, roleById }: { data: ReferData; roleById: Map<string, OpenRole> }) {
  const { t, tag } = useI18n();
  const x = t.refer;
  const router = useRouter();
  const [role, setRole] = useState({ title: "", company_label: "", location: "", employment_type: "w2" as EmploymentType });
  const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });

  const update = async (r: Referral, patch: Partial<Referral>) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("referrals").update(patch).eq("id", r.id);
    if (error) return toast.error(error.message);
    if (patch.status && patch.status !== r.status) notify(r.id, "status");
    router.refresh();
  };
  const openResume = async (r: Referral) => {
    const supabase = getSupabase();
    if (!supabase || !r.resume_path) return;
    const { data: u, error } = await supabase.storage.from(REFERRALS_BUCKET).createSignedUrl(r.resume_path, 120);
    if (error || !u) return toast.error(error?.message ?? "");
    window.open(u.signedUrl, "_blank", "noopener");
  };
  const saveNotes = async (r: Referral, notes: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("referral_internal").upsert({ referral_id: r.id, notes: notes.trim(), updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success(x.saved);
    router.refresh();
  };
  const addRole = async () => {
    const supabase = getSupabase();
    if (!supabase || !role.title.trim()) return;
    const { error } = await supabase.from("open_roles").insert({ ...role, title: role.title.trim(), company_label: role.company_label.trim(), location: role.location.trim(), sort: data.roles.length + 1 });
    if (error) return toast.error(error.message);
    setRole({ title: "", company_label: "", location: "", employment_type: "w2" });
    router.refresh();
  };
  const toggleRole = async (r: OpenRole) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("open_roles").update({ status: r.status === "open" ? "closed" : "open" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className={card}>
        <h2 className="mb-3 text-lg font-black text-gray-900">{x.queue}</h2>
        {data.all.length === 0 ? <p className="text-sm text-gray-500">{x.queueEmpty}</p> : (
          <ul className="divide-y divide-gray-100">
            {data.all.map(r => (
              <li key={r.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-gray-900">{r.candidate_name} · <a href={`mailto:${r.candidate_email}`} className="font-normal text-[#00704a] hover:underline">{r.candidate_email}</a></span>
                    <span className="block text-xs text-gray-500">{r.role_id ? roleLabel(roleById.get(r.role_id) ?? { title: "—", company_label: "", location: "" }) : "—"}</span>
                    <span className="block text-xs text-gray-400">{fmt(x.referredBy, { name: data.names[r.referrer_person_id ?? ""] ?? "—", date: date(r.created_at) })}</span>
                  </span>
                  {r.resume_path && <button type="button" onClick={() => openResume(r)} className="flex h-8 items-center gap-1 rounded-lg border border-gray-300 px-2 text-xs font-bold text-gray-700 hover:border-[#009f67]"><FileText className="h-3.5 w-3.5" /> {x.openResume}</button>}
                  <select value={r.status} onChange={e => update(r, { status: e.target.value as ReferralStatus, ...(e.target.value === "hired" && !r.hired_on ? { hired_on: new Date().toISOString().slice(0, 10) } : {}) })}
                    aria-label={x.status[r.status]} className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs font-bold">
                    {REFERRAL_STATUSES.map(s => <option key={s} value={s}>{x.status[s]}</option>)}
                  </select>
                </div>
                {r.note && <p className="whitespace-pre-line text-gray-700">{r.note}</p>}
                {r.status === "hired" && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 font-bold text-gray-600">{x.hiredOn}
                      <input type="date" value={r.hired_on ?? ""} onChange={e => update(r, { hired_on: e.target.value || null })} className="h-8 rounded-lg border border-gray-300 px-2" />
                    </label>
                    {r.bonus_eligible_on && <span className="text-gray-500">{fmt(x.bonusOn, { date: date(r.bonus_eligible_on) })}</span>}
                    <label className="flex items-center gap-1.5 font-bold text-gray-600">
                      <input type="checkbox" checked={r.bonus_paid} onChange={e => update(r, { bonus_paid: e.target.checked })} className="h-4 w-4 accent-[#009f67]" /> {x.markPaid}
                    </label>
                  </div>
                )}
                <NotesBox initial={data.notes[r.id] ?? ""} label={x.notes} save={n => saveNotes(r, n)} button={x.saveNotes} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="self-start rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-black text-gray-900">{x.roles}</h2>
        <ul className="space-y-1.5">
          {data.roles.map(r => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className={`min-w-0 flex-1 truncate ${r.status === "closed" ? "text-gray-400 line-through" : "text-gray-900"}`} title={roleLabel(r)}>{roleLabel(r)}</span>
              <button type="button" onClick={() => toggleRole(r)} className="text-xs font-bold text-gray-500 hover:text-[#00704a]">{r.status === "open" ? x.closeRole : x.reopenRole}</button>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          <input value={role.title} onChange={e => setRole({ ...role, title: e.target.value })} placeholder={x.roleTitle} aria-label={x.roleTitle} className={field} />
          <div className="grid grid-cols-2 gap-2">
            <input value={role.company_label} onChange={e => setRole({ ...role, company_label: e.target.value })} placeholder={x.roleCompany} aria-label={x.roleCompany} className={field} />
            <input value={role.location} onChange={e => setRole({ ...role, location: e.target.value })} placeholder={x.roleLocation} aria-label={x.roleLocation} className={field} />
          </div>
          <select value={role.employment_type} onChange={e => setRole({ ...role, employment_type: e.target.value as EmploymentType })} aria-label={x.roleType} className={field}>
            {EMPLOYMENT_TYPES.map(k => <option key={k} value={k}>{x.types[k]}</option>)}
          </select>
          <button type="button" onClick={addRole} disabled={!role.title.trim()} className="flex h-9 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" /> {x.addRole}</button>
        </div>
      </section>
    </div>
  );
}

function NotesBox({ initial, label, button, save }: { initial: string; label: string; button: string; save: (n: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex items-end gap-2">
      <label className="flex-1 text-xs font-bold text-gray-500">{label}
        <textarea value={v} onChange={e => setV(e.target.value)} rows={1} maxLength={5000} className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-1.5 text-sm font-normal outline-none focus:border-amber-400" />
      </label>
      {v !== initial && <button type="button" onClick={() => save(v)} className="h-8 rounded-lg border border-gray-300 px-2 text-xs font-bold text-gray-700">{button}</button>}
    </div>
  );
}
