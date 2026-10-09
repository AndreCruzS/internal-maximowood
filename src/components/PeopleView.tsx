"use client";

import { useMemo, useState } from "react";
import { Network, Search, Users } from "lucide-react";
import { COMPANIES, DEPARTMENTS, officeById } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { plural } from "@/lib/i18n/dictionaries";
import { fmt } from "@/lib/i18n/locale";
import { deptName as deptNameT } from "@/lib/i18n/text";
import MyEntry from "@/components/MyEntry";
import OrgChart from "@/components/OrgChart";
import PersonPanel from "@/components/people/PersonPanel";

export type Person = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  photo_url: string | null;
  company_id: string | null;
  user_id: string | null;
  languages?: string[] | null;
  office?: string | null;
  birth_month?: number | null;
  birth_day?: number | null;
  start_date?: string | null;
  skills?: string[] | null;
  start_year?: number | null;
  nickname?: string | null;
  nationality?: string | null;
  companies?: string[] | null;
  slack_id?: string | null;
};

export type Position = {
  id: string;
  person_id: string;
  title: string;
  department_id: string | null;
  team: string | null;
  reports_to: string | null;
  sort: number;
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

export function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  return person.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.photo_url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-[#00704a]"
      style={{ width: size, height: size, background: "rgba(0,159,103,0.12)", fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(person.full_name)}
    </span>
  );
}


/** Directory + org chart of everyone in GMX Group, plus the signed-in person's own entry. */
export default function PeopleView({ people, positions, me, error, initialPerson = null, initialDept = null }: {
  people: Person[];
  positions: Position[];
  me: string | null;
  isAdmin: boolean;
  error: string | null;
  /** ?person=<id>: open that person's profile (links from department pages). */
  initialPerson?: string | null;
  /** ?dept=<id>: start with the org chart filtered to a department. */
  initialDept?: string | null;
}) {
  const { t } = useI18n();
  const deptName = (id: string | null) => deptNameT(t, id);
  const [tab, setTab] = useState<"directory" | "chart">("chart");
  const [openPos, setOpenPos] = useState<Position | null>(() =>
    initialPerson ? (positions.filter(x => x.person_id === initialPerson).sort((a, b) => a.sort - b.sort)[0] ?? null) : null,
  );
  const [dept, setDept] = useState<string>(() => (initialDept && DEPARTMENTS.some(d => d.id === initialDept) ? initialDept : "all"));
  const [company, setCompany] = useState<string>("all");
  const [q, setQ] = useState("");

  const mine = people.find(p => p.user_id === me) ?? null;

  const directory = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return people
      .map(p => ({ person: p, roles: positions.filter(x => x.person_id === p.id) }))
      .filter(({ person, roles }) => {
        if (company !== "all" && person.company_id !== company) return false;
        if (dept !== "all" && !roles.some(r => r.department_id === dept)) return false;
        const hay = `${person.full_name} ${person.email ?? ""} ${roles.map(r => `${r.title} ${r.team ?? ""} ${deptNameT(t, r.department_id)}`).join(" ")} ${(person.skills ?? []).join(" ")} ${(person.languages ?? []).join(" ")}`.toLowerCase();
        return terms.every(t => hay.includes(t));
      });
  }, [people, positions, q, dept, company, t]);

  const select = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.people.title}</h1>
          <p className="text-gray-500">{plural(t.people, "count", people.length)}</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-bold">
          {([["chart", t.people.orgChart, Network], ["directory", t.people.directory, Users]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${tab === id ? "bg-[#009f67] text-white" : "text-gray-500 hover:text-gray-900"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fmt(t.common.couldntLoad, { error })}</p>}

      {me && <MyEntry key={mine?.id ?? "new"} mine={mine} people={people} positions={positions} />}

      <div className="flex flex-wrap items-center gap-2">
        {tab === "directory" && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t.people.search} className={`${select} w-64 pl-8`} aria-label={t.common.search} />
          </div>
        )}
        <select value={dept} onChange={e => setDept(e.target.value)} className={select} aria-label={t.myEntry.department}>
          <option value="all">{t.people.allDepartments}</option>
          {DEPARTMENTS.map(d => (
            <option key={d.id} value={d.id}>{deptName(d.id)}</option>
          ))}
        </select>
        {tab === "directory" && (
          <select value={company} onChange={e => setCompany(e.target.value)} className={select} aria-label={t.myEntry.company}>
            <option value="all">{t.people.allCompanies}</option>
            {COMPANIES.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {openPos && <PersonPanel position={openPos} people={people} positions={positions} onSelect={setOpenPos} onClose={() => setOpenPos(null)} />}

      {tab === "chart" ? (
        <OrgChart people={people} positions={positions} dept={dept} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {directory.map(({ person, roles }) => {
            const main = roles.slice().sort((x, y) => x.sort - y.sort)[0];
            const office = officeById(person.office);
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => main && setOpenPos(main)}
                disabled={!main}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition-all hover:border-[#009f67] hover:shadow-md disabled:cursor-default"
              >
                <Avatar person={person} size={44} />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-gray-900">
                    {person.full_name}
                    {person.nickname ? <span className="font-normal text-gray-500"> “{person.nickname}”</span> : null}
                  </span>
                  <span className="block truncate text-xs text-gray-500">{main ? `${main.title} · ${deptName(main.department_id)}` : ""}</span>
                  <span className="block truncate text-xs text-gray-400">{office?.name ?? (person.user_id ? "" : t.people.notSignedIn)}</span>
                </span>
              </button>
            );
          })}
          {directory.length === 0 && <p className="text-sm text-gray-500">{t.common.noMatches}</p>}
        </div>
      )}
    </div>
  );
}
