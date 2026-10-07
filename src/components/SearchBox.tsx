"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { COMPANIES, DEPARTMENTS, TOOLS, companyName, departmentById } from "@/lib/intranet";

type Result = { label: string; hint: string; href: string; external?: boolean };

// Everything the intranet knows about today. People, news and documents join
// this index as those sections arrive.
const INDEX: Result[] = [
  ...TOOLS.map(t => ({
    label: t.name,
    hint: `${companyName(t.company)} · ${departmentById(t.department)?.name ?? ""}`,
    href: t.href,
    external: t.external,
  })),
  ...DEPARTMENTS.map(d => ({ label: d.name, hint: "Department", href: `/departments/${d.id}` })),
  ...COMPANIES.map(c => ({ label: c.name, hint: "Brand · websites, social media, contact", href: `/brands/${c.id}` })),
  { label: "Home", hint: "Page", href: "/" },
  { label: "News", hint: "Page", href: "/news" },
  { label: "Calendar", hint: "Page · holidays & events", href: "/calendar" },
  { label: "People", hint: "Page", href: "/people" },
  { label: "Resources", hint: "Page", href: "/resources" },
  { label: "My profile & saved quotes", hint: "Page", href: "/profile" },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return INDEX.filter(r => terms.every(t => norm(`${r.label} ${r.hint}`).includes(t))).slice(0, 8);
  }, [q]);

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    if (r.external) window.open(r.href, "_blank", "noopener,noreferrer");
    else router.push(r.href);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={q}
        onChange={e => {
          setQ(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
          else if (e.key === "Enter" && results[cursor]) { e.preventDefault(); go(results[cursor]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search tools, departments and pages"
        aria-label="Search the intranet"
        className="h-10 w-full rounded-lg border border-transparent bg-gray-100 pl-9 pr-3 text-sm outline-none transition focus:border-[#009f67] focus:bg-white"
      />
      {open && q.trim() && (
        <div
          className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No matches for “{q.trim()}”.</p>
          ) : (
            <ul role="listbox">
              {results.map((r, i) => (
                <li key={r.href + r.label}>
                  <button
                    type="button"
                    onClick={() => go(r)}
                    onMouseEnter={() => setCursor(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === cursor ? "bg-gray-50" : ""}`}
                  >
                    <span className="flex-1 truncate font-bold text-gray-900">{r.label}</span>
                    <span className="truncate text-xs text-gray-400">{r.hint}</span>
                    {r.external && <ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
