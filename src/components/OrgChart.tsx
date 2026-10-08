"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, ChevronDown, ChevronUp, Maximize2, MapPin, Minus, Phone, Plus, X } from "lucide-react";
import { companyName, type CompanyId } from "@/lib/intranet";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { deptName } from "@/lib/i18n/text";
import { getSupabase } from "@/lib/supabase/client";
import { Heart } from "lucide-react";
import type { Person, Position } from "@/components/PeopleView";
import PersonFacts from "@/components/PersonFacts";

// One color per department (Whale-style label + card strip). Leadership = GMX green.
const DEPT_COLOR: Record<string, string> = {
  leadership: "#009f67",
  commercial: "#e8702a",
  marketing: "#d6336c",
  operations: "#3b6fd8",
  logistics: "#0f9fb0",
  finance: "#7b4fd6",
  hr: "#d99a00",
  it: "#5b6b7a",
};
const colorOf = (dept: string | null) => DEPT_COLOR[dept ?? "leadership"] ?? "#5b6b7a";

const ROOT = "__gmx__";
const DEFAULT_DEPTH = 2; // levels expanded below the GMX root on first load

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

/** `inverse`: white disc with colored initials (for colored backgrounds). */
function Photo({ person, size, color, inverse }: { person: Person; size: number; color: string; inverse?: boolean }) {
  const ring = { width: size, height: size, boxShadow: inverse ? "0 0 0 3px rgba(255,255,255,0.6)" : `0 0 0 3px #fff, 0 0 0 5px ${color}` };
  return person.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.photo_url} alt="" className="rounded-full object-cover" style={ring} />
  ) : (
    <span
      className="flex items-center justify-center rounded-full font-black"
      style={{ ...ring, background: inverse ? "#fff" : color, color: inverse ? color : "#fff", fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(person.full_name)}
    </span>
  );
}

type Tree = { children: Map<string, Position[]>; roots: Position[]; board: Position[] };

/** Whale-style org chart: top-down cards, collapsible branches, zoom/pan canvas, detail panel. */
export default function OrgChart({ people, positions, dept }: { people: Person[]; positions: Position[]; dept: string }) {
  const { t } = useI18n();
  const deptLabel = (d: string | null) => deptName(t, d);
  /** "Department · Team", without repeating a team named like its department. */
  const deptTeam = (d: string | null, team: string | null) => {
    const label = deptLabel(d);
    return team && d && !label.toLowerCase().includes(team.toLowerCase()) ? `${label} · ${team}` : label;
  };
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const positionById = useMemo(() => new Map(positions.map(p => [p.id, p])), [positions]);

  // Positions in scope; a position whose manager is out of scope hangs off the GMX root.
  const tree: Tree = useMemo(() => {
    const scope = positions.filter(p => dept === "all" || p.department_id === dept);
    const ids = new Set(scope.map(p => p.id));
    const children = new Map<string, Position[]>();
    const roots: Position[] = [];
    for (const p of scope) {
      if (p.reports_to && ids.has(p.reports_to)) children.set(p.reports_to, [...(children.get(p.reports_to) ?? []), p]);
      else roots.push(p);
    }
    roots.sort((a, b) => Number(!!a.department_id) - Number(!!b.department_id) || a.sort - b.sort);
    for (const list of children.values()) list.sort((a, b) => a.sort - b.sort);
    // Leadership with no one reporting to them yet sits in a row under the GMX box,
    // so the department trees don't all share one very wide row with them.
    const board = roots.filter(r => !r.department_id && !children.has(r.id));
    return { children, roots: roots.filter(r => !board.includes(r)), board };
  }, [positions, dept]);

  // Collapsed branches: everything deeper than DEFAULT_DEPTH starts collapsed.
  const defaultCollapsed = useMemo(() => {
    const out = new Set<string>();
    const walk = (p: Position, depth: number) => {
      const kids = tree.children.get(p.id) ?? [];
      if (kids.length && depth >= DEFAULT_DEPTH) out.add(p.id);
      kids.forEach(k => walk(k, depth + 1));
    };
    tree.roots.forEach(r => walk(r, 1));
    return out;
  }, [tree]);
  const [collapsedState, setCollapsed] = useState<{ key: Tree; set: Set<string> } | null>(null);
  const collapsed = collapsedState?.key === tree ? collapsedState.set : defaultCollapsed;
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed({ key: tree, set: next });
  };
  const expandAll = () => setCollapsed({ key: tree, set: new Set() });
  const collapseAll = () => setCollapsed({ key: tree, set: new Set(positions.map(p => p.id)) });

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const fit = useCallback((minScale = 0) => {
    const vp = viewport.current;
    const cv = canvas.current;
    if (!vp || !cv) return;
    const w = cv.scrollWidth;
    const h = cv.scrollHeight;
    const scale = Math.max(minScale, Math.min(1, (vp.clientWidth - 48) / w, (vp.clientHeight - 48) / h));
    // Centered on the top of the chart (the GMX box) when it doesn't all fit.
    setView({ scale, x: (vp.clientWidth - w * scale) / 2, y: 72 });
  }, []);

  // Re-fit whenever the visible tree changes shape.
  useEffect(() => {
    const id = requestAnimationFrame(() => fit(0.6));
    return () => cancelAnimationFrame(id);
  }, [fit, tree, collapsed]);

  const zoomBy = (factor: number, cx?: number, cy?: number) =>
    setView(v => {
      const vp = viewport.current;
      const px = cx ?? (vp ? vp.clientWidth / 2 : 0);
      const py = cy ?? (vp ? vp.clientHeight / 2 : 0);
      const scale = Math.min(2, Math.max(0.2, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });

  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        zoomBy(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      } else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  // ── Detail panel ──────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Position | null>(null);
  const selectedPerson = selected ? peopleById.get(selected.person_id) ?? null : null;
  const [received, setReceived] = useState<{ personId: string; items: { id: string; from_person_id: string; message: string; created_at: string }[] } | null>(null);
  useEffect(() => {
    const id = selectedPerson?.id;
    const supabase = getSupabase();
    if (!id || !supabase) return;
    let active = true;
    supabase
      .from("kudos")
      .select("id, from_person_id, message, created_at")
      .eq("to_person_id", id)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (active) setReceived({ personId: id, items: (data as NonNullable<typeof received>["items"] | null) ?? [] });
      });
    return () => {
      active = false;
    };
  }, [selectedPerson?.id]);
  const kudosList = received && received.personId === selectedPerson?.id ? received.items : [];

  const card = (p: Position) => {
    const person = peopleById.get(p.person_id);
    if (!person) return null;
    const color = colorOf(p.department_id);
    const kids = tree.children.get(p.id) ?? [];
    const isCollapsed = collapsed.has(p.id);
    return (
      <li key={p.id}>
        <div className="relative pt-8">
          <button
            type="button"
            onClick={() => !drag.current?.moved && setSelected(p)}
            className="relative block w-56 rounded-xl border-2 bg-white px-4 pb-4 pt-10 text-center shadow-sm transition-shadow hover:shadow-md"
            style={{ borderColor: `${color}55` }}
          >
            <span className="absolute -top-8 left-1/2 -translate-x-1/2">
              <Photo person={person} size={60} color={color} />
            </span>
            <span className="block truncate font-black text-gray-900">{person.full_name}</span>
            <span className="mt-0.5 block min-h-8 text-xs leading-4 text-gray-500">{p.title}</span>
            <span className="mt-2 block truncate text-xs font-bold" style={{ color }}>
              {deptTeam(p.department_id, p.team)}
            </span>
            {!person.user_id && <span className="mt-1 block text-[10px] text-gray-400">{t.people.notSignedIn}</span>}
            <span className="absolute inset-x-0 bottom-0 h-1 rounded-b-[10px]" style={{ background: color }} />
          </button>
          {kids.length > 0 && (
            <button
              type="button"
              onClick={() => toggle(p.id)}
              className="absolute -bottom-3.5 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full border-2 bg-white px-2.5 text-xs font-black text-gray-700 hover:bg-gray-50"
              style={{ borderColor: `${color}88` }}
              aria-expanded={!isCollapsed}
              aria-label={fmt(isCollapsed ? t.people.showReports : t.people.hideReports, { n: kids.length, name: person.full_name })}
            >
              {kids.length}
              {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {kids.length > 0 && !isCollapsed && <ul>{kids.map(card)}</ul>}
      </li>
    );
  };

  const btn = "flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100";

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-[#f4f6f5]">
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <button type="button" className={btn} onClick={() => zoomBy(1.2)} aria-label={t.people.zoomIn}><Plus className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => zoomBy(1 / 1.2)} aria-label={t.people.zoomOut}><Minus className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => fit()} aria-label={t.people.fit}><Maximize2 className="h-4 w-4" /></button>
        <button type="button" className="h-9 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100" onClick={() => setView(v => ({ ...v, scale: 1 }))}>
          {Math.round(view.scale * 100)}%
        </button>
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <button type="button" className="h-9 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100" onClick={expandAll}>{t.people.expandAll}</button>
        <button type="button" className="h-9 rounded-lg px-2 text-xs font-bold text-gray-600 hover:bg-gray-100" onClick={collapseAll}>{t.people.collapseAll}</button>
      </div>

      {/* Canvas */}
      <div
        ref={viewport}
        className="h-[72vh] min-h-[480px] cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={e => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) > 4) {
            d.moved = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (d.moved) setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
        }}
        onPointerUp={() => {
          // Let the click that ends a drag be ignored, then reset.
          setTimeout(() => (drag.current = null), 0);
        }}
      >
        <div ref={canvas} className="orgchart inline-block origin-top-left px-6 pb-10" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {tree.roots.length === 0 && tree.board.length === 0 ? (
            <p className="p-10 text-sm text-gray-500">{t.people.noOne}</p>
          ) : (
            <ul>
              <li key={ROOT}>
                <div className="rounded-2xl border-2 border-[#009f67]/40 bg-white px-6 pb-5 pt-4 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/gmx-logo-color.png" alt="GMX Group" className="mx-auto h-8 w-auto" />
                  {tree.board.length > 0 && (
                    <ul className="board">{tree.board.map(card)}</ul>
                  )}
                </div>
                {tree.roots.length > 0 && <ul>{tree.roots.map(card)}</ul>}
              </li>
            </ul>
          )}
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-3 right-4 text-[11px] text-gray-400">{t.people.hint}</p>

      {/* Detail panel */}
      {selected && selectedPerson && (
        <div className="absolute inset-0 z-30 flex justify-end bg-black/20" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-sm overflow-y-auto bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="relative px-6 pb-6 pt-8 text-white" style={{ background: colorOf(selected.department_id) }}>
              <button type="button" onClick={() => setSelected(null)} className="absolute right-3 top-3 rounded p-1 hover:bg-white/20" aria-label={t.common.close}>
                <X className="h-5 w-5" />
              </button>
              <Photo person={selectedPerson} size={72} color={colorOf(selected.department_id)} inverse />
              <p className="mt-4 text-xl font-black">{selectedPerson.full_name}</p>
              <p className="text-sm text-white/90">
                {positions.filter(x => x.person_id === selectedPerson.id).map(x => x.title).join(" · ")}
              </p>
            </div>
            <div className="space-y-6 p-6 text-sm">
              <div className="space-y-2">
                {selectedPerson.email && (
                  <a href={`mailto:${selectedPerson.email}`} className="flex items-center gap-2 text-gray-800 hover:text-[#00704a]">
                    <AtSign className="h-4 w-4 text-gray-400" /> {selectedPerson.email}
                  </a>
                )}
                {selectedPerson.phone && (
                  <a href={`tel:${selectedPerson.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-gray-800 hover:text-[#00704a]">
                    <Phone className="h-4 w-4 text-gray-400" /> {selectedPerson.phone}
                  </a>
                )}
                {selectedPerson.location && (
                  <p className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4 text-gray-400" /> {selectedPerson.location}</p>
                )}
                <PersonFacts p={selectedPerson} />
                {!selectedPerson.email && !selectedPerson.phone && (
                  <p className="text-gray-400">{selectedPerson.user_id ? t.people.noContact : t.people.contactLater}</p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.people.departmentsLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  {positions.filter(x => x.person_id === selectedPerson.id).map(x => (
                    <span key={x.id} className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: colorOf(x.department_id) }}>
                      {deptTeam(x.department_id, x.team)}
                    </span>
                  ))}
                </div>
                {selectedPerson.company_id && <p className="mt-2 text-xs text-gray-500">{companyName(selectedPerson.company_id as CompanyId)}</p>}
              </div>

              {kudosList.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.people.kudos}</p>
                  <ul className="space-y-2">
                    {kudosList.map(k => (
                      <li key={k.id} className="flex gap-2">
                        <Heart className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-pink-400 text-pink-400" />
                        <span>
                          <span className="text-gray-700">{k.message}</span>{" "}
                          <span className="text-xs text-gray-400">{t.kudos.from.replace("{name}", peopleById.get(k.from_person_id)?.full_name ?? "—")}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(() => {
                const manager = selected.reports_to ? positionById.get(selected.reports_to) : null;
                const managerPerson = manager ? peopleById.get(manager.person_id) : null;
                const reports = positions.filter(x => x.reports_to === selected.id);
                return (
                  <>
                    {manager && managerPerson && (
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{t.people.reportsTo}</p>
                        <button type="button" onClick={() => setSelected(manager)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-gray-50">
                          <Photo person={managerPerson} size={32} color={colorOf(manager.department_id)} />
                          <span>
                            <span className="block font-bold text-gray-900">{managerPerson.full_name}</span>
                            <span className="block text-xs text-gray-500">{manager.title}</span>
                          </span>
                        </button>
                      </div>
                    )}
                    {reports.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">{fmt(t.people.directReports, { n: reports.length })}</p>
                        {reports.map(r => {
                          const rp = peopleById.get(r.person_id);
                          return rp ? (
                            <button key={r.id} type="button" onClick={() => setSelected(r)} className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left hover:bg-gray-50">
                              <Photo person={rp} size={32} color={colorOf(r.department_id)} />
                              <span>
                                <span className="block font-bold text-gray-900">{rp.full_name}</span>
                                <span className="block text-xs text-gray-500">{r.title}</span>
                              </span>
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
