"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Send } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/components/I18nProvider";
import { useMe } from "@/components/MeProvider";
import type { Kudo, PersonLite } from "@/server/intranet";

/** Recent shout-outs, and a quick form to thank a colleague. */
export default function Kudos({ kudos, people }: { kudos: Kudo[]; people: PersonLite[] }) {
  const { t, tag } = useI18n();
  const me = useMe();
  const router = useRouter();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const names = new Map(people.map(p => [p.id, p.full_name]));

  const send = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    if (!me.personId) return toast.info(t.kudos.needProfile);
    setBusy(true);
    const { error } = await supabase.from("kudos").insert({ from_person_id: me.personId, to_person_id: to, message: message.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t.kudos.sent);
    setTo("");
    setMessage("");
    router.refresh();
  };

  const field = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm outline-none focus:border-[#009f67]";
  return (
    <div className="space-y-3">
      {kudos.length === 0 ? (
        <p className="py-2 text-center text-sm text-gray-400">{t.kudos.empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {kudos.map(k => (
            <li key={k.id} className="flex gap-3">
              <Heart className="mt-0.5 h-4 w-4 shrink-0 fill-pink-400 text-pink-400" />
              <div className="min-w-0 text-sm">
                <p className="text-gray-900">
                  <span className="font-bold">{names.get(k.to_person_id) ?? "—"}</span>{" "}
                  <span className="text-xs text-gray-400">
                    {t.kudos.from.replace("{name}", names.get(k.from_person_id) ?? "—")} · {new Date(k.created_at).toLocaleDateString(tag, { month: "short", day: "numeric" })}
                  </span>
                </p>
                <p className="text-gray-600">{k.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row">
        <select value={to} onChange={e => setTo(e.target.value)} className={`${field} sm:w-48`} aria-label={t.kudos.to}>
          <option value="">{t.kudos.chooseColleague}</option>
          {people.filter(p => p.id !== me.personId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <input value={message} onChange={e => setMessage(e.target.value)} maxLength={500} placeholder={t.kudos.messagePlaceholder} className={`${field} min-w-0 flex-1`} aria-label={t.kudos.message} />
        <button type="button" disabled={busy || !to || !message.trim()} onClick={send} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50">
          <Send className="h-4 w-4" /> {t.kudos.send}
        </button>
      </div>
    </div>
  );
}
