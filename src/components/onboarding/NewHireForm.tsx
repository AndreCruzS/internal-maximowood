"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { notifyIt } from "@/lib/notify";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { COMPANIES, DEPARTMENTS } from "@/lib/intranet";
import { deptName } from "@/lib/i18n/text";

const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const label = "mb-1 block text-xs font-bold text-gray-500";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function YesNo({ value, onChange, name }: { value: boolean; onChange: (v: boolean) => void; name: string }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={name}>
      {[true, false].map(v => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`h-10 flex-1 rounded-lg border text-sm font-bold ${value === v ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 bg-white text-gray-600"}`}>
          {v ? t.hires.yes : t.hires.no}
        </button>
      ))}
    </div>
  );
}

/** Leader adds a new employee: they go into the org chart and IT gets the setup request. */
export default function NewHireForm({ managers }: { managers: { id: string; label: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({
    full_name: "", personal_email: "", title: "", reports_to: "", start_date: "", company_id: "", department_id: "",
    needs_email: true, needs_phone: false, specific_code: false, phone_area_code: "", access_departments: [] as string[], notes: "",
  });
  const set = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const toggleAccess = (id: string) =>
    set({ access_departments: d.access_departments.includes(id) ? d.access_departments.filter(x => x !== id) : [...d.access_departments, id] });

  const submit = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!d.full_name.trim() || !EMAIL.test(d.personal_email.trim()) || !d.title.trim() || !d.department_id || !d.start_date) return toast.error(t.hires.required);
    setBusy(true);
    const { data, error } = await supabase.rpc("create_new_hire", {
      hire: {
        ...d,
        phone_area_code: d.needs_phone && d.specific_code ? d.phone_area_code : "",
        access_departments: d.access_departments.filter(x => x !== d.department_id),
      },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    // Email IT (Brian) about the new hire; the page works the same if email isn't set up yet.
    await notifyIt("new_hire", data as string);
    setBusy(false);
    toast.success(t.hires.created);
    router.push(`/onboarding/hires/${data}`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/onboarding?tab=hires" className="text-sm font-bold text-[#00704a] hover:underline">{t.hires.back}</Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-gray-900"><UserPlus className="h-6 w-6 text-[#00704a]" /> {t.hires.addTitle}</h1>
        <p className="text-gray-500">{t.hires.addHint}</p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="h-name">{t.hires.fullName}</label>
          <input id="h-name" value={d.full_name} onChange={e => set({ full_name: e.target.value })} className={field} autoComplete="off" />
        </div>
        <div>
          <label className={label} htmlFor="h-mail">{t.hires.personalEmail}</label>
          <input id="h-mail" type="email" value={d.personal_email} onChange={e => set({ personal_email: e.target.value })} placeholder="name@gmail.com" className={field} autoComplete="off" />
          <p className="mt-1 text-[11px] text-gray-400">{t.hires.personalEmailHint}</p>
        </div>
        <div>
          <label className={label} htmlFor="h-title">{t.hires.position}</label>
          <input id="h-title" value={d.title} onChange={e => set({ title: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="h-boss">{t.hires.reportsTo}</label>
          <select id="h-boss" value={d.reports_to} onChange={e => set({ reports_to: e.target.value })} className={field}>
            <option value="">—</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="h-start">{t.hires.startDate}</label>
          <input id="h-start" type="date" value={d.start_date} onChange={e => set({ start_date: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="h-brand">{t.hires.brand}</label>
          <select id="h-brand" value={d.company_id} onChange={e => set({ company_id: e.target.value })} className={field}>
            <option value="">—</option>
            {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="h-dept">{t.hires.department}</label>
          <select id="h-dept" value={d.department_id} onChange={e => set({ department_id: e.target.value })} className={field}>
            <option value="">—</option>
            {DEPARTMENTS.map(x => <option key={x.id} value={x.id}>{deptName(t, x.id)}</option>)}
          </select>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        <div>
          <span className={label}>{t.hires.needsEmail}</span>
          <YesNo value={d.needs_email} onChange={v => set({ needs_email: v })} name={t.hires.needsEmail} />
        </div>
        <div>
          <span className={label}>{t.hires.needsPhone}</span>
          <YesNo value={d.needs_phone} onChange={v => set({ needs_phone: v })} name={t.hires.needsPhone} />
        </div>
        {d.needs_phone && (
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>{t.hires.areaCode}?</span>
              <YesNo value={d.specific_code} onChange={v => set({ specific_code: v })} name={t.hires.areaCode} />
            </div>
            {d.specific_code && (
              <div>
                <label className={label} htmlFor="h-code">{t.hires.areaCode}</label>
                <input id="h-code" inputMode="numeric" maxLength={6} value={d.phone_area_code} onChange={e => set({ phone_area_code: e.target.value.replace(/[^\d]/g, "") })} placeholder="305" className={field} />
                <p className="mt-1 text-[11px] text-gray-400">{t.hires.areaCodeHint}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-bold text-gray-900">{t.hires.access}</p>
          <p className="text-xs text-gray-500">{t.hires.accessHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEPARTMENTS.map(x => {
            const own = x.id === d.department_id;
            const on = own || d.access_departments.includes(x.id);
            return (
              <button key={x.id} type="button" disabled={own} onClick={() => toggleAccess(x.id)} aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-sm font-bold ${on ? "border-[#009f67] bg-[#e6f6f0] text-[#00704a]" : "border-gray-300 text-gray-600 hover:bg-gray-50"} disabled:opacity-80`}>
                {on ? "✓ " : ""}{deptName(t, x.id)}
              </button>
            );
          })}
        </div>
        <div>
          <label className={label} htmlFor="h-notes">{t.hires.notes}</label>
          <textarea id="h-notes" rows={2} value={d.notes} onChange={e => set({ notes: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009f67]" />
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Link href="/onboarding?tab=hires" className="flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">{t.common.cancel}</Link>
        <button type="button" onClick={submit} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-[#009f67] px-5 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.hires.create}
        </button>
      </div>
    </div>
  );
}
