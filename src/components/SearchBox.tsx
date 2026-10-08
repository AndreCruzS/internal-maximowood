"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { COMPANIES, DEPARTMENTS, TOOLS, companyName } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { deptName, toolText } from "@/lib/i18n/text";
import { fmt } from "@/lib/i18n/locale";

type Result = { label: string; hint: string; href: string; external?: boolean };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Search over tools, departments, brands and pages (in the viewer's language, plus English names). */
export default function SearchBox() {
  const router = useRouter();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const index: (Result & { extra: string })[] = useMemo(
    () => [
      ...TOOLS.map(tool => ({
        label: toolText(t, tool).name,
        hint: `${companyName(tool.company)} · ${deptName(t, tool.department)}`,
        href: tool.href,
        external: tool.external,
        extra: `${tool.name} ${tool.description} ${toolText(t, tool).description}`,
      })),
      ...DEPARTMENTS.map(d => ({ label: deptName(t, d.id), hint: t.nav.department, href: `/departments/${d.id}`, extra: d.name })),
      ...COMPANIES.map(c => ({ label: c.name, hint: t.nav.brandHint, href: `/brands/${c.id}`, extra: "" })),
      { label: t.nav.home, hint: t.nav.page, href: "/", extra: "home" },
      { label: t.nav.news, hint: t.nav.page, href: "/news", extra: "news announcements" },
      { label: t.nav.calendar, hint: t.nav.calendarHint, href: "/calendar", extra: "calendar holidays events" },
      { label: t.nav.people, hint: t.nav.page, href: "/people", extra: "people org chart directory" },
      { label: t.nav.resources, hint: t.nav.page, href: "/resources", extra: "resources documents links" },
      { label: t.nav.help, hint: t.nav.page, href: "/help", extra: "help faq" },
      { label: t.nav.onboarding, hint: t.nav.page, href: "/onboarding", extra: "onboarding" },
      { label: t.nav.myProfile, hint: t.nav.page, href: "/profile", extra: "profile" },
    ],
    [t],
  );

  const results = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return index.filter(r => terms.every(term => norm(`${r.label} ${r.hint} ${r.extra}`).includes(term))).slice(0, 8);
  }, [q, index]);

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
        placeholder={t.nav.searchPlaceholder}
        aria-label={t.common.search}
        className="h-10 w-full rounded-lg border border-transparent bg-gray-100 pl-9 pr-3 text-sm outline-none transition focus:border-[#009f67] focus:bg-white"
      />
      {open && q.trim() && (
        <div
          className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">{fmt(t.nav.searchNoMatch, { q: q.trim() })}</p>
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
