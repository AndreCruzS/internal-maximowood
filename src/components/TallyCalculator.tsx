"use client";

import { useMemo, useState } from "react";
import { Check, Database, Loader2, Pencil, RefreshCw, Ruler } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/I18nProvider";
import { fmt } from "@/lib/i18n/locale";
import { useInventory } from "@/lib/api";
import { isMetricLength } from "@/lib/realLengths";
import {
  GROUP_IDS, STANDARD_MIX, TALLY_LENGTHS, allocateTally, fillStatus, groupLabel, groupsFor, pieceLF, stockFromInventory,
  type TallyGroup, type TallyMode, type TallyRow,
} from "@/lib/tally";

const GREEN = "#009f67";
/** Group colors (labels only; actions stay GMX green). */
const GROUP_STYLE: Record<TallyGroup, { ink: string; bg: string }> = {
  "4-5": { ink: "#9a6e0a", bg: "#fbf2dd" },
  "6-11": { ink: "#3b6d11", bg: "#edf3e3" },
  "12+": { ink: "#2d6488", bg: "#e4eef5" },
};
/** Species to pick when the product isn't in the inventory. */
const MANUAL_SPECIES = ["Thermo Ayous", "Thermo Ash", "Thermo Scandinavian Pine", "Thermo Clear Radiata", "Accoya", "IPE", "Cumaru", "Garapa", "Massaranduba"];
const itemKey = (i: { specie: string; model: string; profile: string; size: string }) => [i.specie, i.model, i.profile, i.size].join("||");
const itemName = (i: { specie: string; model: string; profile: string; size: string }) => [i.specie, i.model, i.profile, i.size].filter(Boolean).join(" · ");
const rangeOf = (from: number, to: number) => (from > 0 && to >= from && to - from <= 40 ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : TALLY_LENGTHS);
const field = "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#009f67]";
const num = (v: string) => (v.trim() === "" ? 0 : Number(v) || 0);
const lfText = (n: number, tag: string) => n.toLocaleString(tag, { maximumFractionDigits: 1 });

function Section({ n, title, note, children, className = "" }: { n: string; title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-xs font-bold text-gray-300">{n}</span>
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">{title}</h2>
        {note && <span className="text-xs text-gray-400">{note}</span>}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">{children}</div>
    </section>
  );
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors ${value === o.id ? "border-[#009f67] bg-[#009f67] text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MixInputs({ value, onChange, lengths }: { value: Record<TallyGroup, string>; onChange: (v: Record<TallyGroup, string>) => void; lengths: number[] }) {
  const { t } = useI18n();
  const sum = GROUP_IDS.reduce((s, g) => s + num(value[g]), 0);
  return (
    <div className="mt-3 space-y-2">
      {GROUP_IDS.map(g => (
        <label key={g} className="flex items-center gap-3 text-sm">
          <span className="w-20 font-bold" style={{ color: GROUP_STYLE[g].ink }}>{groupLabel(g, lengths)}</span>
          <input type="number" min={0} max={100} value={value[g]} onChange={e => onChange({ ...value, [g]: e.target.value })} className={`${field} h-9 w-24`} aria-label={`${groupLabel(g, lengths)} %`} />
          <span className="text-gray-400">%</span>
        </label>
      ))}
      <p className={`text-xs font-bold ${Math.abs(sum - 100) < 0.01 ? "text-[#00704a]" : "text-red-600"}`}>{fmt(t.tally.mixTotal, { n: sum.toFixed(0) })}</p>
    </div>
  );
}

const pctToMix = (v: Record<TallyGroup, string>) => Object.fromEntries(GROUP_IDS.map(g => [g, num(v[g]) / 100])) as Record<TallyGroup, number>;
const STANDARD_PCT = Object.fromEntries(GROUP_IDS.map(g => [g, String(STANDARD_MIX[g] * 100)])) as Record<TallyGroup, string>;

/** Ayous tally calculator: splits a customer order (real LF) into whole packs per length. */
export default function TallyCalculator() {
  const { t, tag } = useI18n();
  const inventory = useInventory();
  const [product, setProduct] = useState("");
  const [branch, setBranch] = useState("");
  const [manualSpecies, setManualSpecies] = useState(MANUAL_SPECIES[0]);
  const [range, setRange] = useState({ from: "4", to: "16" });
  const [stock, setStock] = useState<Record<number, string>>({});
  const [useStock, setUseStock] = useState(true);
  const [order, setOrder] = useState("");
  const [pack, setPack] = useState("7");
  const [mode, setMode] = useState<TallyMode>("stock");
  const [base, setBase] = useState<"standard" | "stock" | "manual">("standard");
  const [manual, setManual] = useState(STANDARD_PCT);
  const [customManual, setCustomManual] = useState(STANDARD_PCT);
  const [allowed, setAllowed] = useState<Set<number>>(new Set(TALLY_LENGTHS));
  const [result, setResult] = useState<{ rows: TallyRow[]; orderLF: number; pack: number; useStock: boolean; mode: TallyMode; species: string; lengths: number[] } | null>(null);
  const [editing, setEditing] = useState<{ ft: number; value: string } | null>(null);

  // The product: an inventory item (stock loaded per length) or typed in by hand.
  const items = useMemo(() => (inventory.data?.items ?? []).filter(i => !i.isUnmapped || i.branches.some(b => b.lengths.some(l => l.lengthFt))), [inventory.data]);
  const item = items.find(i => itemKey(i) === product) ?? null;
  const species = item ? item.specie : manualSpecies;
  const lengths = useMemo(() => {
    if (!item) return rangeOf(num(range.from), num(range.to));
    const fts = Object.keys(stockFromInventory(item, null)).map(Number);
    return fts.length ? fts.sort((a, b) => a - b) : TALLY_LENGTHS;
  }, [item, range]);
  const groups = useMemo(() => groupsFor(lengths), [lengths]);
  const metric = isMetricLength(species);
  const categories = useMemo(() => [...new Set(items.map(i => i.category))].sort(), [items]);

  const load = (key: string, br: string) => {
    const it = items.find(i => itemKey(i) === key);
    setResult(null);
    if (!it) return setStock({});
    const s = stockFromInventory(it, br || null);
    setStock(Object.fromEntries(Object.entries(s).map(([ft, n]) => [ft, String(n)])));
    setAllowed(new Set(Object.keys(stockFromInventory(it, null)).map(Number)));
    setUseStock(true);
  };
  const chooseProduct = (key: string) => { setProduct(key); load(key, branch); };
  const chooseBranch = (br: string) => { setBranch(br); load(product, br); };
  const refresh = async () => { await inventory.refetch(); load(product, branch); };

  const stockLF = useMemo(() => {
    const per = Object.fromEntries(lengths.map(ft => [ft, num(stock[ft] ?? "") * pieceLF(ft, species)])) as Record<number, number>;
    const total = Object.values(per).reduce((a, b) => a + b, 0);
    const group = Object.fromEntries(GROUP_IDS.map(g => [g, groups[g].reduce((s, ft) => s + per[ft], 0)])) as Record<TallyGroup, number>;
    return { per, total, group };
  }, [stock, lengths, groups, species]);

  const calculate = () => {
    const packN = Math.max(1, Math.floor(num(pack)) || 7);
    const r = allocateTally({
      orderLF: num(order), pack: packN, useStock, mode, customBase: base,
      stock: Object.fromEntries(lengths.map(ft => [ft, Math.floor(num(stock[ft] ?? ""))])),
      lengths, species,
      manual: pctToMix(mode === "custom" ? customManual : manual),
      allowed: [...allowed],
    });
    if ("error" in r) return toast.error(t.tally.errors[r.error]);
    setEditing(null);
    setResult({ rows: r.rows, orderLF: num(order), pack: packN, useStock, mode, species, lengths });
  };

  const applyEdit = () => {
    if (!result || !editing) return;
    const v = Math.floor(num(editing.value) / result.pack) * result.pack;
    setResult({ ...result, rows: result.rows.map(r => (r.ft === editing.ft ? { ...r, pcs: Math.max(0, v), lf: Math.max(0, v) * pieceLF(r.ft, result.species) } : r)) });
    setEditing(null);
  };

  const rows = result ? result.rows.filter(r => r.pcs > 0 || result.mode === "stock") : [];
  const totals = result ? { pcs: result.rows.reduce((s, r) => s + r.pcs, 0), lf: result.rows.reduce((s, r) => s + r.lf, 0) } : null;
  const status = result ? fillStatus(result.rows, result.orderLF, result.pack, result.species) : null;
  const mix = result && totals ? Object.fromEntries(GROUP_IDS.map(g => [g, totals.lf ? (result.rows.filter(r => r.g === g).reduce((s, r) => s + r.lf, 0) / totals.lf) * 100 : 0])) as Record<TallyGroup, number> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{t.tally.title}</h1>
          <p className="text-gray-500">{t.tally.subtitle}</p>
        </div>
        <p className="flex items-center gap-1.5 rounded-full bg-[#e6f6f0] px-3 py-1 text-xs font-bold text-[#00704a]"><Ruler className="h-3.5 w-3.5" /> {metric ? t.tally.realLengths : t.tally.trueFeet}</p>
      </div>

      {/* 01 Product */}
      <Section n="01" title={t.tally.product}>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500">{t.tally.fromInventory}</span>
            <select value={product} onChange={e => chooseProduct(e.target.value)} className={field} disabled={inventory.isLoading}>
              <option value="">{t.tally.manualProduct}</option>
              {categories.map(c => (
                <optgroup key={c} label={c}>
                  {items.filter(i => i.category === c).map(i => (
                    <option key={itemKey(i)} value={itemKey(i)}>{itemName(i)} — {lfText(i.totalLF, tag)} LF</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-gray-500">{t.tally.branch}</span>
            <select value={branch} onChange={e => chooseBranch(e.target.value)} className={field} disabled={!item}>
              <option value="">{t.tally.allBranches}</option>
              {(item?.branches.map(b => b.branch) ?? inventory.data?.branches ?? []).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        </div>
        {!item && (
          <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-500">{t.tally.species}</span>
              <select value={manualSpecies} onChange={e => setManualSpecies(e.target.value)} className={field}>
                {MANUAL_SPECIES.map(x => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-500">{t.tally.shortest}</span>
              <input type="number" min={1} value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} onBlur={() => setAllowed(new Set(rangeOf(num(range.from), num(range.to))))} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-gray-500">{t.tally.longest}</span>
              <input type="number" min={1} value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} onBlur={() => setAllowed(new Set(rangeOf(num(range.from), num(range.to))))} className={field} />
            </label>
          </div>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {inventory.isLoading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.tally.loadingStock}</>
          ) : inventory.error ? (
            <span className="text-amber-700">{t.tally.stockUnavailable}</span>
          ) : (
            <>
              <Database className="h-3.5 w-3.5 text-[#009f67]" />
              {item ? fmt(t.tally.stockLoaded, { branch: branch || t.tally.allBranches }) : t.tally.pickToLoad}
              {inventory.data?.lastUpdated && <span className="text-gray-400">· {fmt(t.tally.updated, { date: new Date(inventory.data.lastUpdated).toLocaleString(tag, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}</span>}
            </>
          )}
          <button type="button" onClick={refresh} disabled={inventory.isFetching} className="ml-auto flex items-center gap-1 font-bold text-[#00704a] hover:underline disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${inventory.isFetching ? "animate-spin" : ""}`} /> {t.tally.refresh}
          </button>
        </p>
      </Section>

      {/* 02 Inventory */}
      <Section n="02" title={t.tally.inventory} note={t.tally.inventoryNote}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-gray-700">
            <button type="button" role="switch" aria-checked={useStock} onClick={() => setUseStock(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${useStock ? "bg-[#009f67]" : "bg-gray-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${useStock ? "left-[22px]" : "left-0.5"}`} />
            </button>
            {t.tally.useStock}
          </label>
          <button type="button" onClick={() => setStock({})} className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50">{t.tally.clear}</button>
        </div>
        <div className={`grid gap-4 lg:grid-flow-col lg:auto-cols-fr ${useStock ? "" : "pointer-events-none opacity-40"}`}>
          {GROUP_IDS.filter(g => groups[g].length).map(g => (
            <div key={g}>
              <p className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-black" style={{ background: GROUP_STYLE[g].bg, color: GROUP_STYLE[g].ink }}>
                {groupLabel(g, lengths)} · {stockLF.total ? ((stockLF.group[g] / stockLF.total) * 100).toFixed(0) : 0}%
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-[repeat(auto-fill,minmax(64px,1fr))]">
                {groups[g].map(ft => (
                  <label key={ft} className="flex flex-col items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 p-1.5 text-center">
                    <span className="text-sm font-black text-gray-900">{ft} ft</span>
                    <span className="font-mono text-[10px] text-gray-400">{metric ? `${Math.round(pieceLF(ft, species) * 12)}″ · ${Math.round(pieceLF(ft, species) * 304.8)}mm` : `${Math.round(ft * 12)}″`}</span>
                    <input type="number" min={0} step={7} inputMode="numeric" value={stock[ft] ?? ""} placeholder="0" aria-label={fmt(t.tally.piecesOf, { ft })}
                      onChange={e => setStock(s => ({ ...s, [ft]: e.target.value }))}
                      className="h-8 w-full rounded-md border border-gray-300 bg-white px-1 text-center text-sm outline-none focus:border-[#009f67]" />
                    <span className="font-mono text-[10px] text-gray-500">{stockLF.total ? `${((stockLF.per[ft] / stockLF.total) * 100).toFixed(1)}%` : "—"}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 03 Order */}
        <Section n="03" title={t.tally.order}>
          <div className="flex items-baseline gap-2">
            <input type="number" min={1} step={100} value={order} onChange={e => setOrder(e.target.value)} placeholder="0" aria-label={t.tally.orderLF}
              onKeyDown={e => { if (e.key === "Enter") calculate(); }}
              className="w-full border-b-2 border-gray-200 bg-transparent text-4xl font-black text-gray-900 outline-none focus:border-[#009f67]" />
            <span className="text-lg font-black text-gray-400">LF</span>
          </div>
          <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold text-gray-700">{t.tally.pack}</span>
            <input type="number" min={1} value={pack} onChange={e => setPack(e.target.value)} className={`${field} h-9 w-20`} />
            <span className="text-xs text-gray-400">{t.tally.packHint}</span>
          </label>
        </Section>

        {/* 04 Distribution */}
        <Section n="04" title={t.tally.distribution}>
          <Pills value={mode} onChange={setMode} options={(["stock", "standard", "manual", "custom"] as const).map(id => ({ id, label: t.tally.modes[id] }))} />
          {mode === "stock" && <p className="mt-3 text-sm text-gray-500">{t.tally.descStock}</p>}
          {mode === "standard" && <p className="mt-3 text-sm text-gray-500">{t.tally.descStandard}</p>}
          {mode === "manual" && <MixInputs value={manual} onChange={setManual} lengths={lengths} />}
          {mode === "custom" && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{t.tally.base}</p>
              <Pills value={base} onChange={setBase} options={[
                { id: "standard", label: t.tally.modes.standard + " 5/45/50" },
                { id: "stock", label: t.tally.modes.stock },
                { id: "manual", label: t.tally.modes.manual },
              ]} />
              {base === "manual" && <MixInputs value={customManual} onChange={setCustomManual} lengths={lengths} />}
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">{t.tally.lengths}</p>
              <div className="flex flex-wrap gap-1.5">
                {lengths.map(ft => {
                  const on = allowed.has(ft);
                  return (
                    <button key={ft} type="button" role="checkbox" aria-checked={on}
                      onClick={() => setAllowed(s => { const n = new Set(s); if (on) n.delete(ft); else n.add(ft); return n; })}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-sm font-bold ${on ? "border-[#009f67] bg-[#f2fbf7] text-[#00704a]" : "border-gray-200 text-gray-400 line-through"}`}>
                      {on && <Check className="h-3.5 w-3.5" />} {ft} ft
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 text-xs font-bold text-[#00704a]">
                <button type="button" onClick={() => setAllowed(new Set(lengths))} className="hover:underline">{t.tally.selectAll}</button>
                <button type="button" onClick={() => setAllowed(new Set())} className="hover:underline">{t.tally.clearAll}</button>
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={calculate} className="h-12 w-full rounded-xl px-8 text-sm font-black uppercase tracking-widest text-white shadow-md hover:opacity-90 sm:w-auto" style={{ background: GREEN }}>
          {t.tally.calculate}
        </button>
      </div>

      {/* Results */}
      {result && totals && status && mix && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-black text-gray-900">{t.tally.allocation}</h2>
            <div className="text-right">
              <span className={`rounded-full px-3 py-1 text-xs font-black ${status.kind === "exact" || status.kind === "close" ? "bg-[#e6f6f0] text-[#00704a]" : status.kind === "short" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                {status.kind === "exact"
                  ? t.tally.exact
                  : status.kind === "close"
                    ? `✓ ${status.pct.toFixed(1)}% · ${fmt(status.gap > 0 ? t.tally.short : t.tally.over, { n: Math.abs(status.gap).toFixed(1) })}`
                    : fmt(status.gap > 0 ? t.tally.short : t.tally.over, { n: Math.abs(status.gap).toFixed(1) })}
              </span>
              {status.kind !== "exact" && <p className="mt-1 text-xs text-gray-400">{t.tally.hints[status.kind]}</p>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-black uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2.5">{t.tally.cols.length}</th>
                  <th className="px-3 py-2.5 text-right">{t.tally.cols.pieces}</th>
                  <th className="px-3 py-2.5 text-right">{t.tally.cols.packs}</th>
                  <th className="px-3 py-2.5 text-right">LF</th>
                  <th className="px-3 py-2.5 text-right">{t.tally.cols.share}</th>
                  <th className="px-3 py-2.5 text-right">{t.tally.cols.stock}</th>
                  <th className="px-5 py-2.5 text-right">{t.tally.cols.adjust}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.ft} style={{ background: `${GROUP_STYLE[r.g].bg}66` }}>
                    <td className="px-5 py-2">
                      <span className="mr-2 rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: GROUP_STYLE[r.g].bg, color: GROUP_STYLE[r.g].ink }}>{groupLabel(r.g, result.lengths)}</span>
                      <span className="font-bold text-gray-900">{r.ft} ft</span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900">{r.pcs.toLocaleString(tag)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.pcs ? r.pcs / result.pack : "—"}</td>
                    <td className="px-3 py-2 text-right">{lfText(r.lf, tag)}</td>
                    <td className="px-3 py-2 text-right">{totals.lf ? ((r.lf / totals.lf) * 100).toFixed(1) : "0.0"}%</td>
                    <td className="px-3 py-2 text-right text-gray-400">
                      {result.useStock ? r.stockPcs.toLocaleString(tag) : "—"}
                      {result.useStock && r.pcs > 0 && r.pcs >= r.stockPcs && <span className="ml-1 text-[10px] font-bold text-red-600">{t.tally.max}</span>}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {editing?.ft === r.ft ? (
                        <span className="inline-flex items-center gap-1">
                          <input autoFocus type="number" min={0} step={result.pack} value={editing.value} onChange={e => setEditing({ ft: r.ft, value: e.target.value })}
                            onKeyDown={e => { if (e.key === "Enter") applyEdit(); if (e.key === "Escape") setEditing(null); }}
                            className="h-8 w-20 rounded-md border border-[#009f67] px-2 text-right text-sm outline-none" aria-label={fmt(t.tally.piecesOf, { ft: r.ft })} />
                          <button type="button" onClick={applyEdit} aria-label={t.common.save} className="rounded p-1 text-[#00704a] hover:bg-[#e6f6f0]"><Check className="h-4 w-4" /></button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setEditing({ ft: r.ft, value: String(r.pcs) })} className="inline-flex items-center gap-1 text-xs font-bold text-[#00704a] hover:underline">
                          <Pencil className="h-3 w-3" /> {r.pcs ? t.tally.edit : t.tally.add}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 font-black text-gray-900">
                <tr>
                  <td className="px-5 py-2.5">{t.tally.total}</td>
                  <td className="px-3 py-2.5 text-right">{totals.pcs.toLocaleString(tag)}</td>
                  <td className="px-3 py-2.5 text-right">{totals.pcs / result.pack}</td>
                  <td className="px-3 py-2.5 text-right">{lfText(totals.lf, tag)}</td>
                  <td className="px-3 py-2.5 text-right">{status.pct.toFixed(1)}%</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-4 sm:divide-y-0">
            {[
              { v: totals.pcs.toLocaleString(tag), l: t.tally.totalPieces },
              { v: lfText(totals.lf, tag), l: t.tally.linearFeet },
              { v: GROUP_IDS.map(g => mix[g].toFixed(1) + "%").join(" · "), l: t.tally.mix, colored: true },
              { v: String(totals.pcs / result.pack), l: fmt(t.tally.packsOf, { n: result.pack }) },
            ].map(x => (
              <div key={x.l} className="px-5 py-4">
                {x.colored ? (
                  <p className="text-base font-black">
                    {GROUP_IDS.map((g, i) => (
                      <span key={g} style={{ color: GROUP_STYLE[g].ink }}>{i > 0 && <span className="text-gray-300"> · </span>}{mix[g].toFixed(1)}%</span>
                    ))}
                  </p>
                ) : (
                  <p className="text-2xl font-black text-gray-900">{x.v}</p>
                )}
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{x.l}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
