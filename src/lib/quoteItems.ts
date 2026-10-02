import type { QuoteCartItem } from "@/components/QuoteModal";

/**
 * Edit a quote line in place. Every add-on the calculators produce (milling,
 * pre-finish color/texture) is priced per LF, and sqft is LF × exposed face,
 * so a line can be rescaled exactly without re-running the calculator.
 */
export type QuoteItemEdit =
  | { field: "lf"; value: number }
  | { field: "sqft"; value: number }
  | { field: "pricePerLF"; value: number }
  | { field: "addOnRate"; index: number; value: number }
  | { field: "removeAddOn"; index: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

const RATE_IN_LABEL = /\(\$([\d,]+(?:\.\d+)?)\/LF\)/;

/** $/LF of an add-on: from its label ("Milling ($1.50/LF)") or amount ÷ LF. */
export function addOnRate(addOn: { label: string; amount: number }, lf: number): number {
  const m = addOn.label.match(RATE_IN_LABEL);
  if (m) return Number(m[1].replace(/,/g, ""));
  return lf > 0 ? addOn.amount / lf : 0;
}

/** Add-on label without its "($x/LF)" suffix. */
export const addOnName = (label: string) => label.replace(RATE_IN_LABEL, "").trim();

function withRate(label: string, rate: number) {
  const tag = `($${rate.toFixed(2)}/LF)`;
  return RATE_IN_LABEL.test(label) ? label.replace(RATE_IN_LABEL, tag) : `${label} ${tag}`;
}

export function editQuoteItem(item: QuoteCartItem, edit: QuoteItemEdit): QuoteCartItem {
  const sqftPerLf = item.lf > 0 ? item.sqft / item.lf : 0;

  let lf = item.lf;
  let sqft = item.sqft;
  if (edit.field === "lf") {
    lf = edit.value;
    sqft = lf * sqftPerLf;
  } else if (edit.field === "sqft" && sqftPerLf > 0) {
    sqft = edit.value;
    lf = sqft / sqftPerLf;
  }
  lf = round2(Math.max(0, lf));
  sqft = round2(Math.max(0, sqft));

  const pricePerLF = edit.field === "pricePerLF" ? Math.max(0, edit.value) : item.pricePerLF;

  const addOns = (item.addOns ?? []).flatMap((ao, i) => {
    if (edit.field === "removeAddOn" && edit.index === i) return [];
    const rate = edit.field === "addOnRate" && edit.index === i ? Math.max(0, edit.value) : addOnRate(ao, item.lf);
    // Zero-amount lines are notes (e.g. the promo scenario label) — keep as-is.
    if (ao.amount === 0 && !(edit.field === "addOnRate" && edit.index === i)) return [ao];
    const label = edit.field === "addOnRate" && edit.index === i ? withRate(ao.label, rate) : ao.label;
    return [{ label, amount: round2(rate * lf) }];
  });

  return {
    ...item,
    lf,
    sqft,
    neededLF: lf,
    pricePerLF,
    total: round2(lf * pricePerLF),
    addOns,
  };
}
