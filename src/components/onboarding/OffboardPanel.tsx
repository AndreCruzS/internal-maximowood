"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { notifyIt } from "@/lib/notify";

export type OpenOffboarding = { id: string; last_day: string; notes: string } | null;

/** On a profile: start an offboarding (last day + notes → IT gets an email), or see / cancel the open one. */
export default function OffboardPanel({ personId, name, open }: { personId: string; name: string; open: OpenOffboarding }) {
  const { t, tag } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [lastDay, setLastDay] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const date = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString(tag, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const start = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!lastDay) return toast.error(t.offboarding.needLastDay);
    setBusy(true);
    const me = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase.from("offboardings").insert({ person_id: personId, last_day: lastDay, notes: notes.trim(), created_by: me }).select("id").single();
    if (error) { setBusy(false); return toast.error(error.message); }
    const sent = await notifyIt("offboarding", (data as { id: string }).id);
    setBusy(false);
    toast.success(sent === "sent" ? t.offboarding.sent : t.offboarding.saved);
    setEditing(false);
    router.refresh();
  };

  const cancel = async () => {
    const supabase = getSupabase();
    if (!supabase || !open || !window.confirm(fmt(t.offboarding.cancelConfirm, { name }))) return;
    const { error } = await supabase.from("offboardings").update({ status: "cancelled" }).eq("id", open.id);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  if (open) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
        <LogOut className="h-5 w-5 shrink-0 text-amber-700" />
        <span className="min-w-0 flex-1 text-amber-900">
          <b>{t.offboarding.inProgress}</b> · {fmt(t.offboarding.lastDayOn, { date: date(open.last_day) })}
          {open.notes && <span className="block text-amber-800">{open.notes}</span>}
        </span>
        <button type="button" onClick={cancel} className="text-sm font-bold text-amber-900 hover:underline">{t.offboarding.cancel}</button>
      </section>
    );
  }

  if (!editing) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-red-700">
          <LogOut className="h-4 w-4" /> {t.offboarding.start}
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-black text-gray-900">{fmt(t.offboarding.title, { name })}</h2>
        <p className="text-sm text-gray-500">{t.offboarding.hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gray-500">{t.offboarding.lastDay}</span>
          <input type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#009f67]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-gray-500">{t.offboarding.notes}</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} placeholder={t.offboarding.notesPlaceholder} className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#009f67]" />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-bold text-gray-700">{t.common.cancel}</button>
        <button type="button" onClick={start} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t.offboarding.submit}
        </button>
      </div>
    </section>
  );
}
