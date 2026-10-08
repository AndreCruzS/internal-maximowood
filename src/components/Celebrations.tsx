"use client";

import { useState } from "react";
import { Cake, PartyPopper, Sparkles } from "lucide-react";
import { useMounted } from "@/components/CalendarView";
import { MONTHS, yearsSince } from "@/lib/intranet";

export type CelebrationPerson = {
  id: string;
  full_name: string;
  birth_month: number | null;
  birth_day: number | null;
  start_date: string | null;
};

const NEW_JOINER_DAYS = 60;

function Row({ icon, name, text, today }: { icon: React.ReactNode; name: string; text: string; today?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${today ? "bg-[#e6f6f0]" : ""}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{name}</span>
      <span className="shrink-0 text-xs text-gray-500">{text}</span>
    </li>
  );
}

/** This month's birthdays and work anniversaries; people who joined recently. Computed in the viewer's time zone. */
export function CelebrationsList({ people }: { people: CelebrationPerson[] }) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-24" />;
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const birthdays = people
    .filter(p => p.birth_month === month && p.birth_day)
    .sort((a, b) => a.birth_day! - b.birth_day!);
  const anniversaries = people
    .filter(p => p.start_date && Number(p.start_date.slice(5, 7)) === month && Number(p.start_date.slice(0, 4)) < now.getFullYear())
    .sort((a, b) => a.start_date!.slice(8).localeCompare(b.start_date!.slice(8)));

  if (!birthdays.length && !anniversaries.length) {
    return <p className="py-6 text-center text-sm text-gray-400">No birthdays or anniversaries in {MONTHS[month - 1]} yet — add yours on your profile.</p>;
  }
  return (
    <ul className="space-y-0.5">
      {birthdays.map(p => (
        <Row
          key={`b-${p.id}`}
          icon={<Cake className="h-4 w-4 text-pink-500" />}
          name={p.full_name}
          text={p.birth_day === day ? "Birthday today! 🎉" : `Birthday · ${MONTHS[month - 1].slice(0, 3)} ${p.birth_day}`}
          today={p.birth_day === day}
        />
      ))}
      {anniversaries.map(p => {
        const d = Number(p.start_date!.slice(8, 10));
        const years = now.getFullYear() - Number(p.start_date!.slice(0, 4));
        return (
          <Row
            key={`a-${p.id}`}
            icon={<PartyPopper className="h-4 w-4 text-[#009f67]" />}
            name={p.full_name}
            text={`${years} year${years === 1 ? "" : "s"} · ${MONTHS[month - 1].slice(0, 3)} ${d}`}
            today={d === day}
          />
        );
      })}
    </ul>
  );
}

export function NewJoinersList({ people }: { people: CelebrationPerson[] }) {
  const mounted = useMounted();
  const [now] = useState(() => Date.now());
  if (!mounted) return <div className="h-24" />;
  const cutoff = now - NEW_JOINER_DAYS * 86_400_000;
  const joiners = people
    .filter(p => p.start_date && new Date(`${p.start_date}T12:00:00`).getTime() >= cutoff && new Date(`${p.start_date}T12:00:00`).getTime() <= now)
    .sort((a, b) => b.start_date!.localeCompare(a.start_date!));
  if (!joiners.length) return <p className="py-6 text-center text-sm text-gray-400">No new joiners in the last {NEW_JOINER_DAYS} days.</p>;
  return (
    <ul className="space-y-0.5">
      {joiners.map(p => {
        const [y, m, d] = p.start_date!.split("-").map(Number);
        return (
          <Row
            key={p.id}
            icon={<Sparkles className="h-4 w-4 text-amber-500" />}
            name={p.full_name}
            text={yearsSince(p.start_date!) === 0 ? `Joined ${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}` : ""}
          />
        );
      })}
    </ul>
  );
}
