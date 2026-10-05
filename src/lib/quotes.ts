import type { QuoteCartItem } from "@/components/QuoteModal";
import type { QuoteData } from "@/lib/generateQuotePDF";

export type QuoteCalculator = "retail" | "b2b";

/** A quote as stored in public.quotes, shaped for the client. */
export type SavedQuote = {
  id: string;
  /** auth.users id of the salesperson who created it. */
  ownerId: string;
  /** Filled in for admins, who can see everyone's quotes. */
  owner?: { email: string | null; name: string | null } | null;
  projectName: string;
  calculator: QuoteCalculator;
  company: string;
  contact: string;
  address: string;
  preparedBy: string;
  notes: string;
  tax: number | null;
  shipping: number | null;
  /** Weeks until the order ships, printed in the PDF terms. */
  leadTimeWeeks: number | null;
  items: QuoteCartItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
};

/** What the client sends to create or update a quote. */
export type QuoteInput = {
  projectName: string;
  calculator: QuoteCalculator;
  company: string;
  contact: string;
  address: string;
  preparedBy: string;
  notes: string;
  tax: number | null;
  shipping: number | null;
  leadTimeWeeks: number | null;
  items: QuoteCartItem[];
};

/** Items + add-ons, before tax and shipping — same sum the quote modal shows. */
export function quoteItemsTotal(items: { total: number; addOns?: { amount: number }[] }[]): number {
  return items.reduce((sum, item) => {
    const addOnTotal = item.addOns ? item.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
    return sum + item.total + addOnTotal;
  }, 0);
}

/** Where to reopen a saved quote for editing. */
export function quoteEditHref(quote: Pick<SavedQuote, "id" | "calculator">): string {
  return `${quote.calculator === "b2b" ? "/b2b" : "/calculator"}?quote=${quote.id}`;
}

export const DEFAULT_PREPARED_BY = "Maximo Concierge Team";

/** PDF payload for a quote — used by the quote modal and the Profile page. */
export function toQuoteData(q: QuoteInput, date = new Date()): QuoteData {
  return {
    company: q.company,
    contact: q.contact,
    project: q.projectName,
    address: q.address,
    preparedBy: q.preparedBy || DEFAULT_PREPARED_BY,
    date: date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
    tax: q.tax ?? undefined,
    shipping: q.shipping ?? undefined,
    leadTimeWeeks: q.leadTimeWeeks ?? undefined,
    notes: q.notes.trim(),
    items: q.items.map(item => ({
      species: item.species,
      profile: item.profile,
      nominalSize: item.nominalSize,
      sqft: item.sqft,
      lf: item.lf,
      pricePerLF: item.pricePerLF,
      total: item.total,
      addOns: item.addOns,
      lengthType: item.lengthType,
    })),
  };
}
