"use client";

import { useMemo, useState } from "react";
import { AtSign, MapPin, Network, Phone, Search, Users } from "lucide-react";
import { COMPANIES, DEPARTMENTS, companyName, departmentById, type CompanyId } from "@/lib/intranet";
import MyEntry from "@/components/MyEntry";
import OrgChart from "@/components/OrgChart";

export type Person = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  photo_url: string | null;
  company_id: string | null;
  user_id: string | null;
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

const deptName = (id: string | null) => (id ? departmentById(id)?.name ?? id : "Leadership");

/** Directory + org chart of everyone in GMX Group, plus the signed-in person's own entry. */
export default function PeopleView({ people, positions, me, error }: {
  people: Person[];
  positions: Position[];
  me: string | null;
  isAdmin: boolean;
  error: string | null;
}) {
  const [tab, setTab] = useState<"directory" | "chart">("chart");
  const [dept, setDept] = useState<string>("all");
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
        const hay = `${person.full_name} ${person.email ?? ""} ${roles.map(r => `${r.title} ${r.team ?? ""} ${deptName(r.department_id)}`).join(" ")}`.toLowerCase();
        return terms.every(t => hay.includes(t));
      });
  }, [people, positions, q, dept, company]);

  const select = "h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">People</h1>
          <p className="text-gray-500">{people.length} people across GMX Group</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm font-bold">
          {([["chart", "Org chart", Network], ["directory", "Directory", Users]] as const).map(([id, label, Icon]) => (
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

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Couldn&apos;t load people: {error}</p>}

      {me && <MyEntry key={mine?.id ?? "new"} mine={mine} people={people} positions={positions} />}

      <div className="flex flex-wrap items-center gap-2">
        {tab === "directory" && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, title, team…" className={`${select} w-64 pl-8`} aria-label="Search people" />
          </div>
        )}
        <select value={dept} onChange={e => setDept(e.target.value)} className={select} aria-label="Department">
          <option value="all">All departments</option>
          {DEPARTMENTS.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {tab === "directory" && (
          <select value={company} onChange={e => setCompany(e.target.value)} className={select} aria-label="Company">
            <option value="all">All companies</option>
            {COMPANIES.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {tab === "chart" ? (
        <OrgChart people={people} positions={positions} dept={dept} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {directory.map(({ person, roles }) => (
            <div key={person.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <Avatar person={person} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-bold text-gray-900">{person.full_name}</p>
                  {roles.map(r => (
                    <p key={r.id} className="truncate text-xs text-gray-500">
                      {r.title} · {deptName(r.department_id)}
                    </p>
                  ))}
                  {person.company_id && (
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{companyName(person.company_id as CompanyId)}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {person.email && (
                  <a href={`mailto:${person.email}`} className="flex items-center gap-2 truncate text-gray-700 hover:text-[#00704a]">
                    <AtSign className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {person.email}
                  </a>
                )}
                {person.phone && (
                  <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-gray-700 hover:text-[#00704a]">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {person.phone}
                  </a>
                )}
                {person.location && (
                  <p className="flex items-center gap-2 text-gray-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {person.location}
                  </p>
                )}
                {!person.user_id && <p className="text-xs text-gray-400">Not signed in yet — details will appear once they do.</p>}
              </div>
            </div>
          ))}
          {directory.length === 0 && <p className="text-sm text-gray-500">No matches.</p>}
        </div>
      )}
    </div>
  );
}
