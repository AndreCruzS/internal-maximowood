import type { SavedQuote } from "@/lib/quotes";

/**
 * Sales checklist (Maximo Concierge "Client Approval Checklist"): what sales sends logistics once
 * the customer approves a quote. Fields follow Maximo_Sales_Checklist_Model.pdf, in order.
 * Everything is a string so the form stays simple; the PDF prints the hint when a field is empty.
 */

export type FieldKind = "text" | "textarea" | "yesno" | "choice" | "date" | "datetime" | "money" | "person";
export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  options?: string[];
  /** yes/no and choices can carry a short note (stored at `${key}Note`), e.g. "No — Fluted not billed". */
  note?: string;
  required?: boolean;
};

export type SectionId = "order" | "delivery" | "acceptance" | "handoff";
export type ChecklistProfile = {
  id: string;
  fields: Record<string, string>;
  /** "Feet Length (Distribution)": board length in feet and how many boards. */
  lengths: { feet: string; qty: string }[];
  /** Profile photo & drawing, a resized JPEG/PNG data URL. */
  photo: string | null;
};
export type ChecklistData = {
  header: Record<string, string>;
  profiles: ChecklistProfile[];
  sections: Record<SectionId, Record<string, string>>;
};
export type ChecklistStatus = "draft" | "sent";
export type Checklist = {
  id: string;
  ownerId: string;
  quoteId: string | null;
  title: string;
  status: ChecklistStatus;
  data: ChecklistData;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: { email: string | null; name: string | null } | null;
};

export const HEADER_FIELDS: Field[] = [
  { key: "client", label: "Client", kind: "text", required: true },
  { key: "date", label: "Date", kind: "date" },
  { key: "totalAmount", label: "Total amount", kind: "money", required: true },
];

export const PROFILE_FIELDS: Field[] = [
  { key: "species", label: "Species", kind: "text", required: true },
  { key: "profile", label: "Profile", kind: "text", required: true },
  { key: "profileNumber", label: "Profile number (milling)", kind: "text" },
  { key: "size", label: "Nominal / actual size", kind: "text", hint: 'e.g., 1x6 nominal = 3/4" x 5-1/2" actual', required: true },
  { key: "reversible", label: "Reversible profile", kind: "yesno", hint: "Yes / No" },
  { key: "sqft", label: "Total square feet", kind: "text" },
  { key: "lf", label: "Linear footage", kind: "text", hint: "Exact LF for THIS profile — no rounding", required: true },
  { key: "colorCode", label: "Pre-finished (color and code)", kind: "text", hint: "Based on the SKU list" },
  { key: "coating", label: "Pre-finished (species/type)", kind: "choice", options: ["EverClad", "EverDeck", "Unfinished"], hint: "EverClad or EverDeck", required: true },
  { key: "texture", label: "Texture", kind: "text" },
  { key: "sideToCoat", label: "Side to coat (exposed face)", kind: "text", hint: "Name the face, not the profile — e.g., Nickel Gap face / Flat face" },
  { key: "coats", label: "Number of coats", kind: "text", hint: "e.g., 2 coats" },
  { key: "backEdgesEnds", label: "Back / edges / ends", kind: "yesno", hint: "Coat? Yes / No — which ones", note: "Which ones" },
  { key: "mockup", label: "Mockup approval", kind: "text" },
  { key: "lengthType", label: "Length type", kind: "choice", options: ["Random", "Specified"], hint: "Random / Specified — if Random, total LF must match exactly", required: true },
];

/** Per-profile prices, printed in section 02. */
export const PROFILE_PRICE_FIELDS: Field[] = [
  { key: "priceEnd", label: "Price to end customer ($/LF)", kind: "money" },
  { key: "distMaterial", label: "Distributor: material ($/LF)", kind: "money" },
  { key: "distMilling", label: "Distributor: milling ($/LF)", kind: "money" },
  { key: "distFinishing", label: "Distributor: finishing ($/LF)", kind: "money" },
];

export const SECTIONS: { id: SectionId; number: string; title: string; fields: Field[] }[] = [
  {
    id: "order", number: "02", title: "Order & billing (Distribution)", fields: [
      { key: "endCustomer", label: "End customer", kind: "text", hint: "Name / project location", required: true },
      { key: "dealer", label: "Dealer / distributor", kind: "text", hint: "Company + contact person" },
      { key: "po", label: "PO number & date", kind: "text", hint: "Attach PO in PDF", required: true },
      { key: "poMatches", label: "PO matches product?", kind: "yesno", hint: "Yes / No — if No, explain (e.g., Fluted not billed to distributor)", note: "If No, explain" },
      { key: "linkedOrder", label: "Linked order", kind: "text", hint: "If shipping with another order: PO # / Sales Order #" },
      { key: "payment", label: "Customer payment", kind: "choice", options: ["Confirmed", "Pending"], hint: "Confirmed? Attach proof", note: "Proof / note" },
      { key: "stockSource", label: "Stock source", kind: "choice", options: ["Miami", "Houston"], hint: "Warehouse (Miami / Houston) — transfer needed?", note: "Transfer needed?" },
    ],
  },
  {
    id: "delivery", number: "03", title: "Deadline & delivery", fields: [
      { key: "priority", label: "Priority", kind: "choice", options: ["Standard", "Urgent"], hint: "Standard / Urgent — reason", note: "Reason", required: true },
      { key: "targetMillingDate", label: "Target date to milling", kind: "date", hint: "Date" },
      { key: "paintingLeadTime", label: "Lead time painting process", kind: "text" },
      { key: "deliveryDate", label: "Delivery date", kind: "date", required: true },
      { key: "deliveryAddress", label: "Delivery address", kind: "textarea", required: true },
    ],
  },
  {
    id: "acceptance", number: "04", title: "Quote acceptance", fields: [
      { key: "lineItemsReviewed", label: "Line items reviewed", kind: "yesno", note: "Note" },
      { key: "totalAccepted", label: "Total accepted", kind: "money" },
      { key: "terms", label: "Terms & conditions", kind: "text" },
      { key: "paymentTerms", label: "Payment terms", kind: "text" },
    ],
  },
  {
    id: "handoff", number: "05", title: "Handoff & logistics acceptance", fields: [
      { key: "salesOwner", label: "Sales owner", kind: "person", hint: "Single point of contact on the commercial side", required: true },
      { key: "logisticsOwner", label: "Logistics owner", kind: "person", hint: "Single point of contact on the logistics side", required: true },
      { key: "logisticsBackup", label: "Logistics backup", kind: "person", hint: "Named substitute if the owner is away — handover in writing" },
      { key: "sentToLogistics", label: "Sent to logistics", kind: "datetime", hint: "Date / time" },
      { key: "logisticsAcceptance", label: "Logistics acceptance", kind: "textarea", hint: "Accepted OR full list of missing items in ONE reply — date / time" },
      { key: "openQuestions", label: "Open questions", kind: "textarea", hint: "Anything still pending — owner + due date" },
    ],
  },
];

export const MAX_PROFILES = 30;
export const MAX_LENGTHS = 24;
export const MAX_PHOTO_CHARS = 1_500_000;
const MAX_TEXT = 4000;

const newId = () => Math.random().toString(36).slice(2, 10);
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rate = (n: number) => (n > 0 ? fmt2(n) : "");

export function emptyProfile(): ChecklistProfile {
  return { id: newId(), fields: {}, lengths: [], photo: null };
}

export function emptyChecklist(): ChecklistData {
  return { header: {}, profiles: [emptyProfile()], sections: { order: {}, delivery: {}, acceptance: {}, handoff: {} } };
}

/** "Milling ($1.10/LF)" → 1.10 */
const addOnRate = (label: string, amount: number, lf: number) => {
  const m = label.match(/\(\$([\d.,]+)\/LF\)\s*$/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : lf > 0 ? amount / lf : 0;
};

/** A checklist pre-filled from an approved quote: one profile block per quote line. */
export function checklistFromQuote(q: SavedQuote, salesOwner: string, today: string): ChecklistData {
  const grand = q.total + (q.tax ?? 0) + (q.shipping ?? 0);
  const b2b = q.calculator === "b2b";
  const profiles = q.items.map(it => {
    const addOns = (it.addOns ?? []).filter(a => a.amount > 0);
    const find = (re: RegExp) => addOns.find(a => re.test(a.label));
    const milling = find(/^Milling\b/);
    const color = find(/^Pre-Finish Color:/);
    const texture = find(/^Pre-Finish Texture:/);
    const name = (a: { label: string } | undefined, prefix: RegExp) =>
      a ? a.label.replace(prefix, "").replace(/\s*\(\$[\d.,]+\/LF\)\s*$/, "").trim() : "";
    const lineRate = it.lf > 0 ? (it.total + addOns.reduce((s, a) => s + a.amount, 0)) / it.lf : it.pricePerLF;
    const finishing = [color, texture].reduce((s, a) => s + (a ? addOnRate(a.label, a.amount, it.lf) : 0), 0);
    const fields: Record<string, string> = {
      species: it.species,
      profile: it.profile,
      size: it.nominalSize ? `${it.nominalSize} nominal` : "",
      sqft: it.sqft ? fmt2(it.sqft) : "",
      lf: it.lf ? fmt2(it.lf) : "",
      colorCode: name(color, /^Pre-Finish Color:\s*/).split(" · ")[0] ?? "",
      coating: color ? "" : "Unfinished",
      texture: name(texture, /^Pre-Finish Texture:\s*/),
      lengthType: it.lengthType === "Fixed" ? "Specified" : it.lengthType === "RL" ? "Random" : "",
      priceEnd: b2b ? "" : rate(lineRate),
      distMaterial: b2b ? rate(it.pricePerLF) : "",
      distMilling: b2b && milling ? rate(addOnRate(milling.label, milling.amount, it.lf)) : "",
      distFinishing: b2b ? rate(finishing) : "",
    };
    return { id: newId(), fields, lengths: [], photo: null } satisfies ChecklistProfile;
  });
  return {
    header: { client: q.company || q.contact || q.projectName, date: today, totalAmount: rate(grand) },
    profiles: profiles.length ? profiles : [emptyProfile()],
    sections: {
      order: {
        endCustomer: [b2b ? "" : q.company || q.contact, q.projectName].filter(Boolean).join(" — "),
        dealer: b2b ? [q.company, q.contact].filter(Boolean).join(" — ") : "",
      },
      delivery: {
        deliveryAddress: q.address,
        paintingLeadTime: q.leadTimeWeeks ? `Up to ${q.leadTimeWeeks} week${q.leadTimeWeeks === 1 ? "" : "s"}` : "",
      },
      acceptance: {
        lineItemsReviewed: "yes",
        lineItemsReviewedNote: `${q.items.length} line${q.items.length === 1 ? "" : "s"} as quoted (see section 01)`,
        totalAccepted: rate(grand),
      },
      handoff: { salesOwner },
    },
  };
}

/** Price lines for section 02, one per profile. */
export function priceLines(d: ChecklistData) {
  const label = (p: ChecklistProfile, i: number) => p.fields.profile || p.fields.species || `Profile ${i + 1}`;
  const end = d.profiles
    .map((p, i) => (p.fields.priceEnd ? `${label(p, i)}: $${p.fields.priceEnd}/LF` : ""))
    .filter(Boolean);
  const dist = d.profiles
    .map((p, i) => {
      const parts = [["material", p.fields.distMaterial], ["milling", p.fields.distMilling], ["finishing", p.fields.distFinishing]]
        .filter(([, v]) => v)
        .map(([k, v]) => `${k} $${v}`);
      return parts.length ? `${label(p, i)}: ${parts.join(" + ")} /LF` : "";
    })
    .filter(Boolean);
  return { end, dist };
}

/** What a field reads as on the PDF ("No — Fluted not billed"), or "" when empty. */
export function fieldText(f: Field, values: Record<string, string>): string {
  const v = (values[f.key] ?? "").trim();
  const note = f.note ? (values[`${f.key}Note`] ?? "").trim() : "";
  const shown = f.kind === "yesno" ? (v === "yes" ? "Yes" : v === "no" ? "No" : "") : f.kind === "money" && v ? `$${v}` : v;
  return [shown, note].filter(Boolean).join(" — ");
}

/** Required fields still empty, as "Section · Field" labels. Doesn't block the PDF; shown before sending. */
export function missingFields(d: ChecklistData): string[] {
  const out: string[] = [];
  for (const f of HEADER_FIELDS) if (f.required && !fieldText(f, d.header)) out.push(f.label);
  d.profiles.forEach((p, i) => {
    const name = `Profile ${i + 1}${p.fields.profile ? ` (${p.fields.profile})` : ""}`;
    for (const f of PROFILE_FIELDS) if (f.required && !fieldText(f, p.fields)) out.push(`${name} · ${f.label}`);
  });
  for (const s of SECTIONS) for (const f of s.fields) if (f.required && !fieldText(f, d.sections[s.id] ?? {})) out.push(`${s.number} · ${f.label}`);
  return out;
}

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : "");
const strings = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 80)) if (/^[A-Za-z]{1,40}$/.test(k) && typeof x === "string") out[k] = str(x);
  }
  return out;
};

/** Cleans a checklist sent by the browser: known shape only, capped sizes, images only as data URLs. */
export function parseChecklistData(v: unknown): { ok: true; data: ChecklistData } | { ok: false; error: string } {
  if (!v || typeof v !== "object") return { ok: false, error: "Checklist data is missing" };
  const raw = v as Record<string, unknown>;
  const rawProfiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  if (rawProfiles.length > MAX_PROFILES) return { ok: false, error: `At most ${MAX_PROFILES} profiles` };
  const profiles: ChecklistProfile[] = [];
  for (const p of rawProfiles) {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const photo = typeof o.photo === "string" && o.photo ? o.photo : null;
    if (photo && (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO_CHARS)) {
      return { ok: false, error: "A profile photo is too large or not an image" };
    }
    const lengths = (Array.isArray(o.lengths) ? o.lengths : []).slice(0, MAX_LENGTHS).map(l => {
      const x = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      return { feet: str(x.feet).slice(0, 20), qty: str(x.qty).slice(0, 20) };
    });
    profiles.push({ id: typeof o.id === "string" && /^[a-z0-9]{1,20}$/.test(o.id) ? o.id : newId(), fields: strings(o.fields), lengths, photo });
  }
  const sections = (raw.sections && typeof raw.sections === "object" ? raw.sections : {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      header: strings(raw.header),
      profiles,
      sections: { order: strings(sections.order), delivery: strings(sections.delivery), acceptance: strings(sections.acceptance), handoff: strings(sections.handoff) },
    },
  };
}

export const checklistTitle = (d: ChecklistData, fallback = "Checklist") => (d.header.client || "").trim() || fallback;
