"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cake, Check, ChevronDown, Loader2, MessageCircleHeart, PartyPopper, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase/client";
import { useMe } from "@/components/MeProvider";
import { WISH_COLUMNS, WISH_MAX, anniversaryDay, cleanWish, wishWindow, wishesFor, type Occasion, type Wish } from "@/lib/wishes";
import { useMounted } from "@/components/CalendarView";
import { yearsSince } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { monthName } from "@/lib/i18n/text";

export type CelebrationPerson = {
  id: string;
  full_name: string;
  birth_month: number | null;
  birth_day: number | null;
  start_date: string | null;
};

const NEW_JOINER_DAYS = 60;

function Row({ icon, name, text, today, children }: { icon: React.ReactNode; name: string; text: string; today?: boolean; children?: React.ReactNode }) {
  return (
    <li className={`rounded-lg px-2 py-1.5 ${today ? "bg-[#e6f6f0]" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{name}</span>
        <span className="shrink-0 text-xs text-gray-500">{text}</span>
      </div>
      {children}
    </li>
  );
}

const field = "w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-[#009f67]";

/**
 * Wishes for one celebration (open from the day until a week after): who wrote what, and a box to
 * write yours. The person being celebrated reads them; nobody wishes themselves.
 */
function Wishes({ person, occasion, year, wishes, names }: {
  person: CelebrationPerson;
  occasion: Occasion;
  year: number;
  wishes: Wish[];
  names: Map<string, string>;
}) {
  const { t } = useI18n();
  const c = t.celebrations;
  const me = useMe();
  const router = useRouter();
  const mine = wishes.find(w => w.from_person_id === me.personId);
  const isMe = me.personId === person.id;
  const [open, setOpen] = useState(isMe && wishes.length > 0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const first = person.full_name.split(" ")[0];
  const suggestions = occasion === "birthday" ? c.suggestionsBirthday : c.suggestionsAnniversary;

  const send = async () => {
    const supabase = getSupabase();
    const message = cleanWish(text);
    if (!supabase || !message) return;
    if (!me.personId) return toast.info(t.kudos.needProfile);
    setBusy(true);
    const { error } = await supabase
      .from("celebration_wishes")
      .insert({ to_person_id: person.id, occasion, occasion_year: year, message })
      .select(WISH_COLUMNS)
      .single();
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? c.alreadySent : error.message);
    toast.success(c.sent);
    setText("");
    router.refresh();
  };
  const remove = async (w: Wish) => {
    setBusy(true);
    const { error } = await getSupabase()!.from("celebration_wishes").delete().eq("id", w.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    router.refresh();
  };

  return (
    <div className="mt-1 pl-7">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-bold text-[#00704a] hover:underline"
      >
        {mine ? <Check className="h-3.5 w-3.5" /> : <MessageCircleHeart className="h-3.5 w-3.5" />}
        {isMe ? plural(c, "messagesForYou", wishes.length) : mine ? c.wished : c.wish}
        {!isMe && wishes.length > 0 && <span className="font-normal text-gray-500">· {plural(c, "messages", wishes.length)}</span>}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {wishes.length === 0 ? (
            <p className="text-xs text-gray-400">{isMe ? c.selfHint : c.noWishes}</p>
          ) : (
            <ul className="space-y-1.5">
              {wishes.map(w => (
                <li key={w.id} className="rounded-lg bg-white px-2.5 py-1.5 text-sm shadow-sm">
                  <span className="font-bold text-gray-900">{names.get(w.from_person_id) ?? "—"}</span>
                  <span className="whitespace-pre-line text-gray-700">: {w.message}</span>
                  {w.from_person_id === me.personId && (
                    <button type="button" onClick={() => remove(w)} disabled={busy} className="ml-1 inline-flex align-middle text-gray-400 hover:text-red-600" aria-label={c.remove} title={c.remove}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isMe && !mine && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(sug => (
                  <button key={sug} type="button" onClick={() => setText(sug)} className="rounded-full border border-[#9fdcc5] bg-white px-2.5 py-0.5 text-xs text-[#00704a] hover:bg-[#f2fbf7]">
                    {sug}
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, WISH_MAX))}
                rows={2}
                placeholder={fmt(occasion === "birthday" ? c.writeBirthday : c.writeAnniversary, { name: first })}
                aria-label={fmt(occasion === "birthday" ? c.writeBirthday : c.writeAnniversary, { name: first })}
                className={field}
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || !text.trim()}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-[#009f67] px-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {c.send}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** This month's birthdays and work anniversaries; people who joined recently. Computed in the viewer's time zone. */
export function CelebrationsList({ people, wishes = [], everyone = [] }: {
  people: CelebrationPerson[];
  /** Wishes sent this year and last (migration 0027); without them the list is read-only. */
  wishes?: Wish[];
  everyone?: { id: string; full_name: string }[];
}) {
  const { t, tag } = useI18n();
  const mounted = useMounted();
  if (!mounted) return <div className="h-24" />;
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const names = new Map([...everyone, ...people].map(p => [p.id, p.full_name]));
  const wishBox = (p: CelebrationPerson, occasion: Occasion, m: number | null, d: number | null) => {
    const open = wishWindow(m, d, now);
    return open ? <Wishes person={p} occasion={occasion} year={open.year} wishes={wishesFor(wishes, p.id, occasion, open.year)} names={names} /> : null;
  };

  const birthdays = people
    .filter(p => p.birth_month === month && p.birth_day)
    .sort((a, b) => a.birth_day! - b.birth_day!);
  const anniversaries = people
    .filter(p => p.start_date && Number(p.start_date.slice(5, 7)) === month && Number(p.start_date.slice(0, 4)) < now.getFullYear())
    .sort((a, b) => a.start_date!.slice(8).localeCompare(b.start_date!.slice(8)));

  if (!birthdays.length && !anniversaries.length) {
    return <p className="py-6 text-center text-sm text-gray-400">{fmt(t.celebrations.none, { month: monthName(tag, month) })}</p>;
  }
  return (
    <ul className="space-y-0.5">
      {birthdays.map(p => (
        <Row
          key={`b-${p.id}`}
          icon={<Cake className="h-4 w-4 text-pink-500" />}
          name={p.full_name}
          text={p.birth_day === day ? t.celebrations.birthdayToday : fmt(t.celebrations.birthday, { date: `${monthName(tag, month, "short")} ${p.birth_day}` })}
          today={p.birth_day === day}
        >
          {wishBox(p, "birthday", p.birth_month, p.birth_day)}
        </Row>
      ))}
      {anniversaries.map(p => {
        const d = Number(p.start_date!.slice(8, 10));
        const years = now.getFullYear() - Number(p.start_date!.slice(0, 4));
        return (
          <Row
            key={`a-${p.id}`}
            icon={<PartyPopper className="h-4 w-4 text-[#009f67]" />}
            name={p.full_name}
            text={plural(t.celebrations, "years", years).replace("{date}", `${monthName(tag, month, "short")} ${d}`)}
            today={d === day}
          >
            {(() => {
              const a = anniversaryDay(p.start_date, now);
              return a ? wishBox(p, "anniversary", a.month, a.day) : null;
            })()}
          </Row>
        );
      })}
    </ul>
  );
}

/** "New joiners" panel — rendered only when someone started in the last NEW_JOINER_DAYS days. */
export function NewJoinersPanel({ people }: { people: CelebrationPerson[] }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  if (!mounted) return null;
  const cutoff = now - NEW_JOINER_DAYS * 86_400_000;
  const any = people.some(p => p.start_date && new Date(`${p.start_date}T12:00:00`).getTime() >= cutoff && new Date(`${p.start_date}T12:00:00`).getTime() <= now);
  if (!any) return null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-black text-gray-900">{t.home.newJoiners}</h2>
      <NewJoinersList people={people} />
    </section>
  );
}

export function NewJoinersList({ people }: { people: CelebrationPerson[] }) {
  const { t, tag } = useI18n();
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  if (!mounted) return <div className="h-24" />;
  const cutoff = now - NEW_JOINER_DAYS * 86_400_000;
  const joiners = people
    .filter(p => p.start_date && new Date(`${p.start_date}T12:00:00`).getTime() >= cutoff && new Date(`${p.start_date}T12:00:00`).getTime() <= now)
    .sort((a, b) => b.start_date!.localeCompare(a.start_date!));
  if (!joiners.length) return <p className="py-6 text-center text-sm text-gray-400">{fmt(t.celebrations.noJoiners, { n: NEW_JOINER_DAYS })}</p>;
  return (
    <ul className="space-y-0.5">
      {joiners.map(p => {
        const date = new Date(`${p.start_date}T12:00:00`).toLocaleDateString(tag, { month: "short", day: "numeric", year: "numeric" });
        return (
          <Row
            key={p.id}
            icon={<Sparkles className="h-4 w-4 text-amber-500" />}
            name={p.full_name}
            text={yearsSince(p.start_date!) === 0 ? fmt(t.celebrations.joined, { date }) : ""}
          />
        );
      })}
    </ul>
  );
}
