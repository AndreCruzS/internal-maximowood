/**
 * Vendor Master List (migration 0028): shared types and pure helpers — CSV import, masking,
 * review dates, and the OFAC sanctions name matching.
 *
 * The bank stays the source of truth for bank details: nothing here keeps more than the
 * last 4 digits of an account or routing number.
 */

export const VENDOR_STATUSES = ["pending", "approved", "suspended", "rejected", "legacy_pending"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];
export type SanctionsStatus = "not_run" | "clear" | "possible_match" | "match" | "false_positive";
export type ScreeningResult = "clear" | "possible_match" | "match";

/** What everyone signed in sees (view vendors_public). */
export type VendorPublic = {
  id: string;
  legal_name: string;
  dba: string;
  country: string;
  company_ids: string[];
  category: string;
  status: VendorStatus;
  approved_at: string | null;
  next_review_on: string | null;
  sanctions_status: SanctionsStatus;
  created_at: string;
  /** Computed by the view (migration 0030): the yearly review is due within 30 days, or overdue. */
  review_due?: "overdue" | "due_soon" | null;
};
export const VENDOR_PUBLIC_COLUMNS_V1 = "id, legal_name, dba, country, company_ids, category, status, approved_at, next_review_on, sanctions_status, created_at";
export const VENDOR_PUBLIC_COLUMNS = `${VENDOR_PUBLIC_COLUMNS_V1}, review_due`;

/** Extra fields only vendor staff (approvers, payments, finance, admins) see. */
export type VendorPrivate = {
  id: string;
  tax_id: string;
  tax_id_type: string;
  contact: { name?: string; email?: string; phone?: string };
  website: string;
  currency: string;
  payment_terms: string;
  sanctions_score: number | null;
  sanctions_checked_at: string | null;
};
export const VENDOR_PRIVATE_COLUMNS = "id, tax_id, tax_id_type, contact, website, currency, payment_terms, sanctions_score, sanctions_checked_at";

export type BankAccountMasked = {
  id: string;
  vendor_id: string;
  bank_name: string;
  holder_name: string;
  account_last4: string;
  routing_last4: string;
  swift_bic: string;
  bank_country: string;
  currency: string;
  payment_method: string;
  active: boolean;
};
export const BANK_COLUMNS = "id, vendor_id, bank_name, holder_name, account_last4, routing_last4, swift_bic, bank_country, currency, payment_method, active";

export const PAYMENT_METHODS = ["ach", "wire", "check", "pix", "other"] as const;

// ── Masking ───────────────────────────────────────────────────────────────────
/** The last 4 letters/digits of an account or routing number (all we ever keep). */
export function last4(value: string | null | undefined): string {
  const chars = (value ?? "").replace(/[^0-9A-Za-z]/g, "");
  return chars.slice(-4);
}
/** "•••• 1234", or "" when there's nothing. */
export const masked = (l4: string | null | undefined) => (l4 ? `•••• ${l4}` : "");

// ── Review dates ──────────────────────────────────────────────────────────────
/** Approved vendors are reviewed every `months` months (default 12). */
export function nextReviewOn(approvedAt: string | Date, months = 12): string {
  const d = new Date(approvedAt);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}
export const reviewOverdue = (v: Pick<VendorPublic, "status" | "next_review_on">, today: string) =>
  v.status === "approved" && !!v.next_review_on && v.next_review_on < today;

// ── CSV ───────────────────────────────────────────────────────────────────────
/** RFC 4180-ish: quoted fields with "" escapes and line breaks; comma, semicolon or tab. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const d = delimiter ?? ([",", ";", "\t"].map(c => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Fields a bank/ERP export can be mapped to. Full account / routing numbers are reduced to the last 4. */
export const IMPORT_FIELDS = [
  "legal_name", "dba", "tax_id", "country", "category", "currency", "payment_terms", "website",
  "address", "city", "state", "postal_code", "contact_name", "email", "phone",
  "bank_name", "holder_name", "account_number", "routing_number", "swift_bic", "bank_country", "payment_method",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  legal_name: ["legal name", "vendor name", "vendor", "supplier", "supplier name", "beneficiary", "beneficiary name", "payee", "payee name", "name", "company", "company name", "razao social", "fornecedor", "nome do fornecedor", "beneficiario", "nome", "proveedor", "razon social"],
  dba: ["dba", "trade name", "doing business as", "nome fantasia", "nombre comercial"],
  tax_id: ["tax id", "taxid", "ein", "tin", "tax identification number", "federal tax id", "cnpj", "cpf", "cnpj cpf", "rfc", "vat", "vat number"],
  country: ["country", "pais", "vendor country"],
  category: ["category", "type", "categoria", "tipo", "expense type"],
  currency: ["currency", "moeda", "moneda", "ccy"],
  payment_terms: ["payment terms", "terms", "condicao de pagamento", "condiciones de pago"],
  website: ["website", "site", "web", "url"],
  address: ["address", "street", "address line 1", "endereco", "direccion", "vendor address"],
  city: ["city", "cidade", "ciudad"],
  state: ["state", "estado", "province", "uf"],
  postal_code: ["zip", "zip code", "postal code", "cep", "codigo postal"],
  contact_name: ["contact", "contact name", "contato", "contacto", "vendor contact person"],
  email: ["email", "e mail", "vendor email", "contact email"],
  phone: ["phone", "telephone", "telefone", "telefono", "vendor phone number"],
  bank_name: ["bank", "bank name", "banco", "nome do banco"],
  holder_name: ["account holder", "account holder name", "holder", "beneficiary account name", "titular", "nome do titular", "titular da conta"],
  account_number: ["account", "account number", "account no", "acct", "acct number", "iban", "conta", "numero da conta", "cuenta", "numero de cuenta", "clabe"],
  routing_number: ["routing", "routing number", "aba", "aba routing", "sort code", "agencia", "transit number"],
  swift_bic: ["swift", "bic", "swift bic", "swift code", "swift bic code"],
  bank_country: ["bank country", "pais do banco", "pais del banco"],
  payment_method: ["payment method", "method", "payment type", "preferred payment method", "forma de pagamento", "metodo de pago"],
};

/** Guesses which column holds which field from the header row. Each column is used once. */
export function autoMap(headers: string[]): ColumnMapping {
  const folded = headers.map(fold);
  const out: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const synonyms = HEADER_SYNONYMS[field];
    const i = folded.findIndex((h, idx) => !used.has(idx) && synonyms.includes(h));
    if (i >= 0) { out[field] = i; used.add(i); }
  }
  // Second pass: headers that contain a synonym ("Vendor Legal Name (as registered)").
  for (const field of IMPORT_FIELDS) {
    if (out[field] !== undefined) continue;
    const i = folded.findIndex((h, idx) => !used.has(idx) && HEADER_SYNONYMS[field].some(s => s.length > 3 && h.includes(s)));
    if (i >= 0) { out[field] = i; used.add(i); }
  }
  return out;
}

/** One vendor to import — already reduced: no full account or routing number ever leaves this function. */
export type ImportRow = {
  line: number;
  legal_name: string;
  dba: string;
  tax_id: string;
  country: string;
  category: string;
  currency: string;
  payment_terms: string;
  website: string;
  address: { line1?: string; city?: string; state?: string; postal_code?: string };
  contact: { name?: string; email?: string; phone?: string };
  bank: {
    bank_name: string; holder_name: string; account_last4: string; routing_last4: string;
    swift_bic: string; bank_country: string; payment_method: string;
  } | null;
  errors: string[];
};

const PAYMENT_METHOD_WORDS: [RegExp, (typeof PAYMENT_METHODS)[number]][] = [
  [/\bach\b|direct deposit/i, "ach"], [/wire|swift|transfer|ted|transferencia/i, "wire"], [/check|cheque/i, "check"], [/\bpix\b/i, "pix"],
];
export const paymentMethodOf = (v: string) => (v.trim() ? PAYMENT_METHOD_WORDS.find(([re]) => re.test(v))?.[1] ?? "other" : "");

const SWIFT_RE = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/;

export function rowsToImport(rows: string[][], mapping: ColumnMapping, hasHeader = true): ImportRow[] {
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((r, i) => {
    const get = (f: ImportField) => {
      const idx = mapping[f];
      return idx === undefined ? "" : (r[idx] ?? "").replace(/\s+/g, " ").trim();
    };
    const errors: string[] = [];
    const legal_name = get("legal_name").slice(0, 200);
    if (!legal_name) errors.push("missing_name");
    const currencyRaw = get("currency").toUpperCase();
    const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : currencyRaw ? (errors.push("bad_currency"), "USD") : "USD";
    const swiftRaw = get("swift_bic").toUpperCase().replace(/\s+/g, "");
    const swift_bic = swiftRaw && SWIFT_RE.test(swiftRaw) ? swiftRaw : "";
    if (swiftRaw && !swift_bic) errors.push("bad_swift");
    const email = get("email");
    const bankFields = {
      bank_name: get("bank_name").slice(0, 120),
      holder_name: get("holder_name").slice(0, 200),
      account_last4: last4(get("account_number")),
      routing_last4: last4(get("routing_number")),
      swift_bic,
      bank_country: get("bank_country").slice(0, 60),
      payment_method: paymentMethodOf(get("payment_method")),
    };
    const hasBank = Object.values(bankFields).some(Boolean);
    return {
      line: i + (hasHeader ? 2 : 1),
      legal_name,
      dba: get("dba").slice(0, 200),
      tax_id: get("tax_id").slice(0, 40),
      country: get("country").slice(0, 60),
      category: get("category").slice(0, 80),
      currency,
      payment_terms: get("payment_terms").slice(0, 120),
      website: get("website").slice(0, 300),
      address: dropEmpty({ line1: get("address"), city: get("city"), state: get("state"), postal_code: get("postal_code") }),
      contact: dropEmpty({ name: get("contact_name"), email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "", phone: get("phone") }),
      bank: hasBank ? bankFields : null,
      errors,
    };
  });
}

function dropEmpty<T extends Record<string, string>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Partial<T>;
}

/** Same vendor twice (re-imports, duplicates): normalized tax id, else normalized name + country. */
export function importKey(r: Pick<ImportRow, "tax_id" | "legal_name" | "country">): string {
  const tax = r.tax_id.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (tax.length >= 5) return `tax:${tax}`;
  return `name:${normalizeName(r.legal_name)}|${fold(r.country)}`;
}

/** Re-checks rows sent by a browser: never more than 4 characters of an account or routing number. */
export function sanitizeImportRow(input: unknown): ImportRow | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Partial<ImportRow>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const legal_name = s(r.legal_name, 200);
  if (!legal_name) return null;
  const b = r.bank && typeof r.bank === "object" ? r.bank : null;
  const currency = s(r.currency, 3).toUpperCase();
  const swift = s(b?.swift_bic, 11).toUpperCase();
  const pm = s(b?.payment_method, 10);
  const obj = (v: unknown, keys: string[]) =>
    Object.fromEntries(keys.map(k => [k, s((v as Record<string, unknown> | undefined)?.[k], 200)]).filter(([, x]) => x));
  return {
    line: typeof r.line === "number" ? r.line : 0,
    legal_name,
    dba: s(r.dba, 200),
    tax_id: s(r.tax_id, 40),
    country: s(r.country, 60),
    category: s(r.category, 80),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    payment_terms: s(r.payment_terms, 120),
    website: s(r.website, 300),
    address: obj(r.address, ["line1", "city", "state", "postal_code"]),
    contact: obj(r.contact, ["name", "email", "phone"]),
    bank: b
      ? {
          bank_name: s(b.bank_name, 120),
          holder_name: s(b.holder_name, 200),
          account_last4: last4(s(b.account_last4, 64)),
          routing_last4: last4(s(b.routing_last4, 64)),
          swift_bic: SWIFT_RE.test(swift) ? swift : "",
          bank_country: s(b.bank_country, 60),
          payment_method: (PAYMENT_METHODS as readonly string[]).includes(pm) ? pm : "",
        }
      : null,
    errors: [],
  };
}

// ── Sanctions name matching ───────────────────────────────────────────────────
/** Legal forms and filler words that don't identify anyone. */
const LEGAL = new Set([
  "llc", "l l c", "inc", "incorporated", "corp", "corporation", "co", "company", "cia", "ltd", "limited", "ltda", "sa", "s a",
  "sas", "sl", "srl", "spa", "gmbh", "ag", "kg", "bv", "nv", "plc", "lp", "llp", "pllc", "pc", "me", "mei", "epp", "eireli",
  "pte", "pty", "oy", "ab", "as", "jsc", "ojsc", "cjsc", "pjsc", "ooo", "zao", "oao", "fze", "fzco", "fzc", "dmcc",
  "sociedad", "anonima", "limitada", "the", "of", "and", "y", "e", "de", "da", "do", "das", "dos", "del", "la", "el", "le", "les", "di",
]);
/** Common business words: they count, but much less than a distinctive word. */
const GENERIC = new Set([
  "group", "grupo", "holding", "holdings", "international", "internacional", "intl", "trading", "trade", "global", "enterprise",
  "enterprises", "services", "service", "servicos", "solutions", "industries", "industrial", "import", "export", "imports", "exports",
  "importadora", "exportadora", "logistics", "logistica", "investments", "investment", "partners", "usa", "us", "america", "american",
  "brasil", "brazil", "general", "shipping", "transport", "transportes", "commercial", "comercial", "comercio", "construction",
  "construcoes", "development", "management", "consulting", "consultoria", "technologies", "technology", "tecnologia", "systems",
  "energy", "oil", "gas", "petroleum", "bank", "banco", "capital", "finance", "financial", "resources", "products", "supply", "supplies",
  "materials", "foods", "food", "agro", "marine", "maritime", "air", "airlines", "line", "lines", "east", "west", "north", "south", "middle",
  "new", "world", "national", "united", "first", "star", "sun", "gold", "golden", "royal",
  // Name particles (Arabic, Portuguese, Spanish) that many unrelated names share.
  "al", "el", "bin", "ibn", "abu", "abd", "bint",
]);

/** "Ocean Class Shipping Group, L.L.C." → "ocean class shipping group". */
export function normalizeName(name: string): string {
  return tokens(name).join(" ");
}

function tokens(name: string): string[] {
  const base = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b([a-z])\.(?=[a-z]\.)/g, "$1") // S.A. / L.L.C. → sa / llc
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  // Joined single letters ("s a" → "sa", "l l c" → "llc") before dropping legal forms.
  const raw = base.split(" ").filter(Boolean);
  const merged: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].length === 1 && raw[i + 1]?.length === 1) {
      let j = i;
      let w = "";
      while (j < raw.length && raw[j].length === 1) w += raw[j++];
      merged.push(w);
      i = j - 1;
    } else merged.push(raw[i]);
  }
  return merged.filter(t => !LEGAL.has(t));
}

const weight = (t: string) => (GENERIC.has(t) ? 0.35 : /^\d+$/.test(t) ? 0.5 : 1);

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Same word, allowing a typo in longer words (≥5 letters: 1 edit, ≥9: 2). */
function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 5) return false;
  return lev(a, b, n >= 9 ? 2 : 1) <= (n >= 9 ? 2 : 1);
}

export const MATCH_THRESHOLD = 0.9;
export const POSSIBLE_THRESHOLD = 0.75;

/**
 * 0–1 similarity of two names. Word-order independent ("SILVA, Joao" = "Joao Silva"), ignores
 * legal forms (LLC, Ltda, S.A., GmbH…), accents and punctuation, and weighs common business words
 * (group, trading, global…) much less than distinctive ones. Without a distinctive word in common
 * the score stays below "possible match".
 */
export function nameScore(a: string, b: string): number {
  const ta = [...new Set(tokens(a))];
  const tb = [...new Set(tokens(b))];
  if (!ta.length || !tb.length) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  const usedB = new Set<number>();
  let common = 0;
  let distinctiveCommon = 0;
  for (const t of ta) {
    const j = tb.findIndex((u, idx) => !usedB.has(idx) && sameToken(t, u));
    if (j >= 0) {
      usedB.add(j);
      const w = Math.min(weight(t), weight(tb[j]));
      common += w;
      if (w === 1) distinctiveCommon += 1;
    }
  }
  const total = (ts: string[]) => ts.reduce((s, t) => s + weight(t), 0);
  let score = common / Math.max(total(ta), total(tb));
  // Every distinctive word of one name found in the other (two or more of them): at least "possible".
  const distinct = (ts: string[]) => ts.filter(t => weight(t) === 1).length;
  if (distinctiveCommon >= 2 && distinctiveCommon >= Math.min(distinct(ta), distinct(tb))) score = Math.max(score, 0.8);
  if (distinctiveCommon === 0) return Math.min(score, POSSIBLE_THRESHOLD - 0.01);
  // A single short distinctive word ("ABC") is weak evidence on its own.
  const distinctA = ta.filter(t => weight(t) === 1);
  if (distinctiveCommon === 1 && distinctA.length === 1 && distinctA[0].length <= 3 && score < 1) return Math.min(score, POSSIBLE_THRESHOLD - 0.01);
  return Math.round(score * 1000) / 1000;
}

export const resultOf = (score: number): ScreeningResult =>
  score >= MATCH_THRESHOLD ? "match" : score >= POSSIBLE_THRESHOLD ? "possible_match" : "clear";

export type SanctionsEntry = { id: string; ent_num: number; name: string; name_type: string; sdn_type: string; programs: string; norm: string };
export type SanctionsHit = { ent_num: number; name: string; name_type: string; sdn_type: string; programs: string; score: number; screened_name: string };

/** Lookup keys of a word: itself, its first 4 letters and its consonants ("hezbollah" ≈ "hizballah"). */
const keysOf = (t: string) => (t.length >= 5 ? [t, `~${t.slice(0, 4)}`, `#${t.replace(/[aeiouy]/g, "")}`] : [t]);

/** Token → entries index, so a vendor is only compared with names sharing a word (or a close spelling). */
export class SanctionsIndex {
  private byKey = new Map<string, number[]>();
  constructor(readonly entries: SanctionsEntry[], readonly version = "") {
    entries.forEach((e, i) => {
      for (const t of new Set(e.norm.split(" ").filter(Boolean))) {
        if (weight(t) < 1) continue;
        for (const k of keysOf(t)) {
          const list = this.byKey.get(k);
          if (list) list.push(i); else this.byKey.set(k, [i]);
        }
      }
    });
  }
  candidates(name: string): SanctionsEntry[] {
    const ids = new Set<number>();
    for (const t of tokens(name)) {
      if (weight(t) < 1) continue;
      for (const k of keysOf(t)) for (const i of this.byKey.get(k) ?? []) ids.add(i);
    }
    return [...ids].map(i => this.entries[i]);
  }
}

/** Screens a vendor's names (legal name, DBA…) — best score decides; up to 5 hits are kept. */
export function screenNames(names: string[], index: SanctionsIndex): { result: ScreeningResult; score: number; hits: SanctionsHit[] } {
  const hits: SanctionsHit[] = [];
  for (const screened of [...new Set(names.map(n => n.trim()).filter(Boolean))]) {
    for (const e of index.candidates(screened)) {
      const score = nameScore(screened, e.name);
      if (score >= POSSIBLE_THRESHOLD) hits.push({ ent_num: e.ent_num, name: e.name, name_type: e.name_type, sdn_type: e.sdn_type, programs: e.programs, score, screened_name: screened });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const best = new Map<number, SanctionsHit>();
  for (const h of hits) if (!best.has(h.ent_num)) best.set(h.ent_num, h);
  const top = [...best.values()].slice(0, 5);
  const score = top[0]?.score ?? 0;
  return { result: resultOf(score), score, hits: top };
}

// ── OFAC files ────────────────────────────────────────────────────────────────
const val = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "-0-" ? "" : t;
};

/** SDN.CSV: ent_num, name, type ("-0-" = entity), program, … (no header). */
export function parseSdn(text: string, version: string): (SanctionsEntry & { list_version: string })[] {
  return parseCsv(text, ",")
    .filter(r => /^\d+$/.test((r[0] ?? "").trim()) && val(r[1]))
    .map(r => {
      const name = val(r[1]);
      return {
        id: `sdn:${r[0].trim()}`, ent_num: Number(r[0]), name, name_type: "primary",
        sdn_type: val(r[2]).toLowerCase(), programs: val(r[3]).slice(0, 300), norm: normalizeName(name), list_version: version,
      };
    })
    .filter(e => e.norm);
}

/** ALT.CSV: ent_num, alt_num, type (aka/fka/nka), name, remarks (no header). */
export function parseAlt(text: string, version: string, sdn: Map<number, { sdn_type: string; programs: string }>): (SanctionsEntry & { list_version: string })[] {
  return parseCsv(text, ",")
    .filter(r => /^\d+$/.test((r[0] ?? "").trim()) && /^\d+$/.test((r[1] ?? "").trim()) && val(r[3]))
    .map(r => {
      const name = val(r[3]);
      const type = val(r[2]).toLowerCase().replace(/[^a-z]/g, "");
      const parent = sdn.get(Number(r[0]));
      return {
        id: `alt:${r[1].trim()}`, ent_num: Number(r[0]), name,
        name_type: ["aka", "fka", "nka"].includes(type) ? type : "aka",
        sdn_type: parent?.sdn_type ?? "", programs: parent?.programs ?? "", norm: normalizeName(name), list_version: version,
      };
    })
    .filter(e => e.norm);
}
