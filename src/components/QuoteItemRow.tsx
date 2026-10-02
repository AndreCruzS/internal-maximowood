"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { QuoteCartItem } from "@/components/QuoteModal";
import { addOnName, addOnRate, editQuoteItem, type QuoteItemEdit } from "@/lib/quoteItems";

const GOLD = "#C9A227";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Numeric input that keeps what's typed ("12.", "") and commits valid values live. */
function NumberField({
  label,
  value,
  onCommit,
  prefix,
  suffix,
  decimals = 2,
  allowZero = false,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  allowZero?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 10 ** decimals) / 10 ** decimals);
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">{label}</span>
      <div className="flex items-center rounded-md border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-[#C9A227]/40">
        {prefix && <span className="pl-2 text-xs text-[#888]">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={shown}
          onChange={e => {
            setDraft(e.target.value);
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n) && (allowZero ? n >= 0 : n > 0)) onCommit(n);
          }}
          onBlur={() => setDraft(null)}
          className="w-full min-w-0 bg-transparent px-2 py-1.5 text-sm font-semibold text-[#1A1A1A] outline-none"
        />
        {suffix && <span className="pr-2 text-xs text-[#888]">{suffix}</span>}
      </div>
    </label>
  );
}

/** One line in the quote modal — read-only summary, or inline editor. */
export default function QuoteItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: QuoteCartItem;
  /** Omit to make the row read-only. */
  onChange?: (item: QuoteCartItem) => void;
  /** Omit to hide the remove button (e.g. the last remaining line). */
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
  const itemTotal = item.total + addOnTotal;
  const apply = (edit: QuoteItemEdit) => onChange?.(editQuoteItem(item, edit));

  return (
    <div className="px-3 py-2.5" style={{ background: editing ? "#FFFDF5" : "#C9A22708" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-[#1A1A1A]">{item.species}</p>
          <p className="text-xs text-[#666]">
            {item.profile} · {item.nominalSize}
            {item.lengthType ? ` · ${item.lengthType === "Fixed" ? "Fixed length" : "Random length"}` : ""}
          </p>
          {!editing && (
            <>
              <p className="text-xs text-[#888]">
                {item.lf.toLocaleString("en-US", { maximumFractionDigits: 1 })} LF · {item.sqft.toLocaleString("en-US", { maximumFractionDigits: 1 })} sqft · ${item.pricePerLF.toFixed(2)}/LF
              </p>
              {item.addOns && item.addOns.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {item.addOns.map((ao, ai) => (
                    <p key={ai} className="text-xs text-[#888]">+ {ao.label}: ${money(ao.amount)}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-sm font-black" style={{ color: GOLD }}>${money(itemTotal)}</span>
          {onChange && (
            <button
              type="button"
              onClick={() => setEditing(v => !v)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-black hover:bg-slate-100"
              aria-label={editing ? "Done editing" : "Edit line"}
              title={editing ? "Done" : "Edit quantity, price and add-ons"}
            >
              {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="w-6 h-6 rounded-md flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50"
              aria-label="Remove line"
              title="Remove from quote"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing && onChange && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="Linear ft" value={item.lf} suffix="LF" decimals={1} onCommit={v => apply({ field: "lf", value: v })} />
            <NumberField label="Square ft" value={item.sqft} suffix="sqft" decimals={1} onCommit={v => apply({ field: "sqft", value: v })} />
            <NumberField label="Price" value={item.pricePerLF} prefix="$" suffix="/LF" onCommit={v => apply({ field: "pricePerLF", value: v })} />
          </div>

          {(item.addOns ?? []).map((ao, ai) =>
            ao.amount === 0 && !/\/LF\)/.test(ao.label) ? (
              <div key={ai} className="flex items-center justify-between gap-2 text-xs text-[#888]">
                <span className="truncate">{ao.label}</span>
                <button type="button" onClick={() => apply({ field: "removeAddOn", index: ai })} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${ao.label}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div key={ai} className="grid grid-cols-[1fr_7rem_auto_auto] items-end gap-2">
                <span className="pb-2 text-xs font-semibold text-[#555] truncate">+ {addOnName(ao.label)}</span>
                <NumberField
                  label="Add-on"
                  value={addOnRate(ao, item.lf)}
                  prefix="$"
                  suffix="/LF"
                  allowZero
                  onCommit={v => apply({ field: "addOnRate", index: ai, value: v })}
                />
                <span className="pb-2 text-xs text-[#888] w-20 text-right">${money(ao.amount)}</span>
                <button
                  type="button"
                  onClick={() => apply({ field: "removeAddOn", index: ai })}
                  className="mb-1.5 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${addOnName(ao.label)}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          )}

          <p className="text-[11px] text-[#888]">
            Square feet follow linear feet automatically. To change the product itself, remove this line and add it again from the calculator.
          </p>
        </div>
      )}
    </div>
  );
}
