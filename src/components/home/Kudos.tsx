"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandHeart, Leaf, Lightbulb, Rocket, Send, Users, X, Zap, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import { useMounted } from "@/components/CalendarView";
import type { Kudo, PersonLite } from "@/server/intranet";

/** Company values a kudo can recognize (same ids as the kudos.category check in 0008). */
export const KUDO_VALUES: { id: "teamwork" | "innovation" | "agility" | "ownership" | "customer" | "sustainability"; icon: LucideIcon; color: string }[] = [
  { id: "teamwork", icon: Users, color: "#3b6fd8" },
  { id: "innovation", icon: Lightbulb, color: "#d99a00" },
  { id: "agility", icon: Zap, color: "#e8702a" },
  { id: "ownership", icon: Rocket, color: "#7b4fd6" },
  { id: "customer", icon: HandHeart, color: "#d6336c" },
  { id: "sustainability", icon: Leaf, color: "#009f67" },
];

/** Monday 00:00 of the viewer's current week. */
function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Give a kudo for one of the company values; this week's kudos are public on the home page. */
export default function Kudos({ kudos, people }: { kudos: Kudo[]; people: PersonLite[] }) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const mounted = useMounted();
  const [value, setValue] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const names = new Map(people.map(p => [p.id, p.full_name]));
  const valueOf = (id: string | null) => KUDO_VALUES.find(v => v.id === id);

  const send = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!me.personId) return toast.info(t.kudos.needProfile);
    setBusy(true);
    const { error } = await supabase.from("kudos").insert({ from_person_id: me.personId, to_person_id: to, message: message.trim(), category: value });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.kudos.sent);
    setValue(null);
    setTo("");
    setMessage("");
    router.refresh();
  };

  const thisWeek = mounted ? kudos.filter(k => new Date(k.created_at) >= weekStart()) : [];
  const field = "h-10 rounded-lg border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-[#009f67]";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Give */}
      <div>
        <p className="mb-2 text-sm font-bold text-gray-700">{t.kudos.chooseValue}</p>
        <ul className="space-y-1.5">
          {KUDO_VALUES.map(v => {
            const Icon = v.icon;
            const text = t.kudos.values[v.id];
            const open = value === v.id;
            return (
              <li key={v.id} className={`rounded-xl border transition-colors ${open ? "border-[#009f67] bg-[#f7fcfa]" : "border-gray-200"}`}>
                <button type="button" onClick={() => setValue(open ? null : v.id)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: `${v.color}1a` }}>
                    <Icon className="h-5 w-5" style={{ color: v.color }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-gray-900">{text.name}</span>
                    <span className="block truncate text-xs text-gray-500">{text.desc}</span>
                  </span>
                  <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: v.color, color: v.color }}>
                    {t.kudos.give}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-col gap-2 border-t border-gray-100 px-3 py-3 sm:flex-row">
                    <select value={to} onChange={e => setTo(e.target.value)} className={`${field} sm:w-48`} aria-label={t.kudos.to}>
                      <option value="">{t.kudos.chooseColleague}</option>
                      {people.filter(p => p.id !== me.personId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                    <input value={message} onChange={e => setMessage(e.target.value)} maxLength={500} placeholder={t.kudos.messagePlaceholder} className={`${field} min-w-0 flex-1`} aria-label={t.kudos.message} />
                    <button type="button" disabled={busy || !to || !message.trim()} onClick={send} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50">
                      <Send className="h-4 w-4" /> {t.kudos.send}
                    </button>
                    <button type="button" onClick={() => setValue(null)} aria-label={t.common.close} className="hidden rounded p-2 text-gray-400 hover:bg-gray-100 sm:block"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* This week */}
      <div>
        <p className="text-sm font-bold text-gray-700">{t.kudos.weekTitle}</p>
        <p className="mb-2 text-xs text-gray-400">{t.kudos.weekHint}</p>
        {thisWeek.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">{t.kudos.empty}</p>
        ) : (
          <ul className="space-y-2.5">
            {thisWeek.map(k => {
              const v = valueOf(k.category);
              const Icon = v?.icon ?? HandHeart;
              return (
                <li key={k.id} className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${v?.color ?? "#d6336c"}1a` }}>
                    <Icon className="h-4 w-4" style={{ color: v?.color ?? "#d6336c" }} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="text-gray-900">
                      <span className="font-bold">{names.get(k.to_person_id) ?? "—"}</span>
                      {v && <span className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${v.color}1a`, color: v.color }}>{t.kudos.values[v.id].name}</span>}
                    </p>
                    <p className="text-gray-600">{k.message}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t.kudos.from.replace("{name}", names.get(k.from_person_id) ?? "—")} · {new Date(k.created_at).toLocaleDateString(tag, { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
