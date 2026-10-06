import jsPDF from "jspdf";
import { LOGO_MAXIMO_DARK_URL, QR_WARRANTY_URL, fetchAsBase64 } from "./pdfAssets";

/**
 * Quote PDF, laid out like the Maximo quote template (maximo-thermo-quote.html):
 * white Letter page, Bill To / Ship To, a Line · Item · Description table with
 * every add-on on its own line, totals, terms + warranty QR, acceptance lines.
 *
 * Only the presentation follows the template — quantities, prices and totals
 * are the calculator's own numbers, passed through unchanged.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type QuoteLineItem = {
  species: string;
  profile: string;
  nominalSize: string;
  sqft: number;
  lf: number;
  pricePerLF: number;
  total: number;
  lengthType?: "RL" | "Fixed";
  addOns?: { label: string; amount: number }[];
  /** Quantity before waste (the calculator's raw LF / sqft). Absent on quotes saved before it was recorded. */
  projectLF?: number;
  projectSqft?: number;
  /** The calculator's waste option label, e.g. "10% waste" or "No waste". */
  wastePercent?: string;
};

export type QuoteData = {
  company: string;
  contact: string;
  project: string;
  address: string;
  preparedBy: string;
  date: string;
  notes?: string;
  tax?: number;
  shipping?: number;
  /** Printed in the terms as "Lead Time: Up to N weeks". */
  leadTimeWeeks?: number;
  items: QuoteLineItem[];
  subtotal?: number;
  grandTotal?: number;
};

/** How long a quote stays valid. */
export const QUOTE_VALID_DAYS = 30;

// ── Rows of the line table ────────────────────────────────────────────────────
/** One unnumbered breakdown row under a product line (material, then each add-on). */
export type QuoteBreakdown = { label: string; rate: number; amount: number };

/** One numbered line per product; its add-ons are folded in and listed in `breakdown`. */
export type QuoteRow = {
  line: number;
  item: string;
  desc: [string, string][];
  qty: number;
  rate: number;
  amount: number;
  breakdown: QuoteBreakdown[];
};

const num = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (x: number) => `$${num(x)}`;

const productName = (species: string) =>
  /thermo/i.test(species) ? "Maximo Thermo" : /accoya/i.test(species) ? "Maximo Accoya" : "Maximo Hardwood";

/**
 * Turn a calculator add-on label like "Pre-Finish Color: Regular ($2.20/LF)"
 * into a breakdown label ("Pre-Finished Color: Regular") and its rate.
 */
function parseAddOn(label: string, amount: number, lf: number): QuoteBreakdown {
  const m = label.match(/^(.*?)\s*\(\$([\d.,]+)\/LF\)\s*$/);
  const name = (m ? m[1] : label).trim().replace(/^Pre-Finish\b/, "Pre-Finished");
  const rate = m ? parseFloat(m[2].replace(/,/g, "")) : lf > 0 ? amount / lf : 0;
  return { label: name, rate, amount };
}

/** One line per product; add-ons are added into it (zero-amount notes such as promos are left off). */
export function buildQuoteRows(items: QuoteLineItem[]): QuoteRow[] {
  return items.map((it, i) => {
    const addOns = (it.addOns ?? []).filter(ao => ao.amount > 0).map(ao => parseAddOn(ao.label, ao.amount, it.lf));
    const amount = it.total + addOns.reduce((s, a) => s + a.amount, 0);
    const desc: [string, string][] = [
      ["Species", it.species],
      ["Mill Profile", it.profile],
      ["Nominal Size", it.nominalSize],
    ];
    if (it.lengthType) desc.push(["Lengths", it.lengthType === "Fixed" ? "Fixed Lengths" : "Random Lengths"]);
    // Waste: project quantity + allowance = order quantity (the calculator's own numbers).
    const wasteLF = it.projectLF != null ? Math.round((it.lf - it.projectLF) * 100) / 100 : 0;
    if (it.projectLF != null && wasteLF > 0) {
      const wasteCost = it.lf > 0 ? (amount / it.lf) * wasteLF : 0;
      desc.push(["Project Quantity", `${num(it.projectLF)} LF${it.projectSqft != null ? ` (${num(it.projectSqft)} sqft)` : ""}`]);
      desc.push(["Waste Allowance", `${(it.wastePercent ?? "").replace(/\s*waste$/i, "") || "Waste"} (${num(wasteLF)} LF, ${money(wasteCost)} of this line)`]);
    }
    desc.push(["Order Quantity", `${num(it.lf)} LF (${num(it.sqft)} sqft)`]);
    if (it.sqft > 0) desc.push(["Price per sqft", money(amount / it.sqft)]);
    return {
      line: i + 1,
      item: productName(it.species),
      desc,
      qty: it.lf,
      rate: it.lf > 0 ? amount / it.lf : it.pricePerLF,
      amount,
      breakdown: addOns.length ? [{ label: "Material", rate: it.pricePerLF, amount: it.total }, ...addOns] : [],
    };
  });
}

/** "MM/DD/YYYY" + days, same format back. */
export function addDays(usDate: string, days: number): string {
  const [m, d, y] = usDate.split("/").map(Number);
  if (!m || !d || !y) return "";
  const dt = new Date(y, m - 1, d + days);
  return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}/${dt.getFullYear()}`;
}

// ── Look (points; the template's sizes) ───────────────────────────────────────
type RGB = [number, number, number];
const INK: RGB = [27, 27, 27];
const SOFT: RGB = [51, 51, 51];
const MUTED: RGB = [68, 68, 68];
const HEAD_BG: RGB = [233, 233, 233];
const RULE: RGB = [227, 227, 227];
const GOLD: RGB = [196, 162, 63];

const IN = 72;
const MARGIN_X = 0.6 * IN;
const MARGIN_TOP = 0.5 * IN;
const MARGIN_BOTTOM = 0.4 * IN;
const FOOTER_H = 18;

export async function generateQuotePDF(data: QuoteData) {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const [logo, qr] = await Promise.all([
    fetchAsBase64(LOGO_MAXIMO_DARK_URL).catch(() => null),
    fetchAsBase64(QR_WARRANTY_URL).catch(() => null),
  ]);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN_X * 2;
  const bottomLimit = pageH - MARGIN_BOTTOM - FOOTER_H - 8;

  // Totals — same arithmetic as before.
  const itemsSubtotal = data.items.reduce((s, it) => {
    const addOnTotal = it.addOns ? it.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
    return s + it.total + addOnTotal;
  }, 0);
  const subtotal = data.subtotal ?? itemsSubtotal;
  const tax = data.tax ?? 0;
  const shipping = data.shipping ?? 0;
  const grandTotal = data.grandTotal ?? subtotal + tax + shipping;

  const font = (style: "normal" | "bold", size: number, color: RGB = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lineH = (size: number) => size * 1.3;

  // ── Page furniture ──────────────────────────────────────────────────────────
  function drawFooter() {
    const y = pageH - MARGIN_BOTTOM - FOOTER_H;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(1.5);
    doc.line(MARGIN_X, y, pageW - MARGIN_X, y);
    font("bold", 7.4);
    doc.text("maximowood.com  |  info@maximowood.com", pageW / 2, y + 12, { align: "center" });
  }

  function newPage(): number {
    drawFooter();
    doc.addPage();
    return MARGIN_TOP;
  }

  // ── Header: logo + Quote / Date / Expires ───────────────────────────────────
  let y = MARGIN_TOP;
  if (logo) {
    const h = 0.5 * IN;
    try {
      doc.addImage(logo, "PNG", MARGIN_X, y + 3, h * (1400 / 320), h, undefined, "FAST");
    } catch {
      // logo is decoration; the quote still renders without it
    }
  }
  font("bold", 20);
  doc.text("Quote", pageW - MARGIN_X, y + 16, { align: "right" });
  font("normal", 8.5);
  doc.text(`Date: ${data.date}`, pageW - MARGIN_X, y + 32, { align: "right" });
  const expires = addDays(data.date, QUOTE_VALID_DAYS);
  if (expires) doc.text(`Expires: ${expires}`, pageW - MARGIN_X, y + 32 + lineH(8.5), { align: "right" });
  y += 0.5 * IN + 0.3 * IN;

  // ── Bill To / Ship To (no separate ship-to yet: same as bill-to) ────────────
  const colW = contentW / 2;
  const addressLines = [data.company, data.address].filter(s => s && s.trim());
  let addrBottom = y;
  for (const [i, title] of ["Bill To", "Ship To"].entries()) {
    const x = MARGIN_X + i * colW;
    let ay = y + 8;
    font("bold", 8);
    doc.text(title, x, ay);
    font("normal", 8);
    for (const l of addressLines) {
      for (const w of doc.splitTextToSize(l, colW - 12) as string[]) {
        ay += lineH(8);
        doc.text(w, x, ay);
      }
    }
    addrBottom = Math.max(addrBottom, ay);
  }
  y = addrBottom + 0.18 * IN;

  // ── Contact / Prepared By / Project / Shipping strip ────────────────────────
  const strip: [string, string][] = [
    ["Contact", data.contact],
    ["Prepared By", data.preparedBy],
    ["Project Name", data.project],
    ["Shipping", shipping > 0 ? "Included" : "Not included"],
  ];
  const stripW = contentW / strip.length;
  doc.setFillColor(...HEAD_BG);
  doc.rect(MARGIN_X, y, contentW, 14, "F");
  font("bold", 7.6);
  strip.forEach(([h], i) => doc.text(h, MARGIN_X + i * stripW + 6, y + 9.5));
  font("normal", 8);
  let stripBottom = y + 14;
  strip.forEach(([, v], i) => {
    const wrapped = doc.splitTextToSize(v || "", stripW - 12) as string[];
    doc.text(wrapped, MARGIN_X + i * stripW + 6, y + 14 + 10);
    stripBottom = Math.max(stripBottom, y + 14 + 6 + wrapped.length * lineH(8));
  });
  y = stripBottom + 0.2 * IN;

  // ── Line table ──────────────────────────────────────────────────────────────
  // Template widths: Line 38px, Item 96px, Description 285px; the rest share what's left.
  const cols = (() => {
    const line = 28, item = 72, desc = 214;
    const rest = (contentW - line - item - desc) / 4;
    let x = MARGIN_X;
    const mk = (w: number) => { const c = { x, w }; x += w; return c; };
    return { line: mk(line), item: mk(item), desc: mk(desc), qty: mk(rest), unit: mk(rest), rate: mk(rest), amount: mk(rest) };
  })();

  function drawTableHead(top: number): number {
    doc.setFillColor(...HEAD_BG);
    doc.rect(MARGIN_X, top, contentW, 15, "F");
    font("bold", 7.6);
    const by = top + 10;
    doc.text("Line", cols.line.x + cols.line.w / 2, by, { align: "center" });
    doc.text("Item", cols.item.x + 6, by);
    doc.text("Description", cols.desc.x + 6, by);
    doc.text("Qty", cols.qty.x + cols.qty.w - 6, by, { align: "right" });
    doc.text("Unit", cols.unit.x + 6, by);
    doc.text("Rate", cols.rate.x + cols.rate.w - 6, by, { align: "right" });
    doc.text("Amount", cols.amount.x + cols.amount.w - 6, by, { align: "right" });
    return top + 15;
  }

  y = drawTableHead(y);
  const PAD = 5;
  const DL = lineH(8);
  for (const row of buildQuoteRows(data.items)) {
    font("normal", 8);
    const descLines = row.desc.flatMap(([k, v]) => doc.splitTextToSize(`${k}: ${v}`, cols.desc.w - 12) as string[]);
    const itemLines = doc.splitTextToSize(row.item, cols.item.w - 12) as string[];
    const unitLines = ["Linear", "Feet"];
    const mainH = PAD * 2 + Math.max(descLines.length, itemLines.length, unitLines.length) * DL;
    const BL = lineH(7.6);
    const breakdownH = row.breakdown.length ? 4 + row.breakdown.length * BL + PAD : 0;
    const rowH = mainH + breakdownH;

    if (y + rowH > bottomLimit) y = drawTableHead(newPage());

    const ty = y + PAD + 8;
    font("normal", 8);
    doc.text(String(row.line), cols.line.x + cols.line.w / 2, ty, { align: "center" });
    doc.text(descLines, cols.desc.x + 6, ty, { lineHeightFactor: 1.3 });
    doc.text(num(row.qty), cols.qty.x + cols.qty.w - 6, ty, { align: "right" });
    doc.text(unitLines, cols.unit.x + 6, ty, { lineHeightFactor: 1.3 });
    doc.text(money(row.rate), cols.rate.x + cols.rate.w - 6, ty, { align: "right" });
    doc.text(money(row.amount), cols.amount.x + cols.amount.w - 6, ty, { align: "right" });
    font("bold", 8);
    doc.text(itemLines, cols.item.x + 6, ty, { lineHeightFactor: 1.3 });

    // Breakdown: material + each add-on, unnumbered, under the description.
    if (row.breakdown.length) {
      const by = y + mainH - PAD + 2;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(cols.desc.x + 6, by, pageW - MARGIN_X - 6, by);
      font("normal", 7.6, MUTED);
      row.breakdown.forEach((b, i) => {
        const ly = by + 4 + 7 + i * BL;
        doc.text(b.label, cols.desc.x + 6, ly);
        doc.text(`${money(b.rate)}/LF`, cols.rate.x + cols.rate.w - 6, ly, { align: "right" });
        doc.text(money(b.amount), cols.amount.x + cols.amount.w - 6, ly, { align: "right" });
      });
    }

    y += rowH;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.75);
    doc.line(MARGIN_X, y, pageW - MARGIN_X, y);
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totals: [string, string][] = [
    ["Subtotal", money(subtotal)],
    ...(tax > 0 ? [["Tax", money(tax)] as [string, string]] : []),
    ["Shipping Cost", shipping > 0 ? money(shipping) : "Not included"],
  ];
  const totalsW = 2.7 * IN;
  const totalsH = totals.length * 14 + 24;
  y += 0.12 * IN;
  if (y + totalsH > bottomLimit) y = newPage();
  const tx = pageW - MARGIN_X;
  const labelX = tx - 90; // right edge of the label column
  for (const [label, value] of totals) {
    y += 12;
    font("normal", 8, MUTED);
    doc.text(label, labelX, y, { align: "right" });
    font("normal", 8);
    doc.text(value, tx - 6, y, { align: "right" });
    y += 2;
  }
  y += 5;
  doc.setDrawColor(...INK);
  doc.setLineWidth(1.1);
  doc.line(tx - totalsW, y, tx, y);
  y += 14;
  font("bold", 10);
  doc.text("Total", labelX, y, { align: "right" });
  doc.text(money(grandTotal), tx - 6, y, { align: "right" });

  // ── Terms + warranty QR ─────────────────────────────────────────────────────
  const terms = [
    `Valid for ${QUOTE_VALID_DAYS} days from the date of issue. Prices may change after expiration.`,
    ...(data.leadTimeWeeks ? [`Lead Time: Up to ${data.leadTimeWeeks} ${data.leadTimeWeeks === 1 ? "week" : "weeks"}.`] : []),
    "Shipping not included unless requested.",
    "Priced per linear foot (LF). Square footage shown for reference.",
    "Waste is chosen by the customer and billed on every line. We recommend 10% to 20%.",
    "Pre-finished options are charged per LF on top of the material rate.",
    "Wood is natural. Expect variation in color and grain. A finish sample is recommended before ordering.",
  ];
  const qrCol = 1.15 * IN;
  const termsW = contentW - qrCol - 0.25 * IN;
  font("normal", 7.6, SOFT);
  const termLines = terms.map(t => doc.splitTextToSize(`* ${t}`, termsW) as string[]);
  const termsH = 14 + termLines.reduce((h, l) => h + l.length * lineH(7.6) + 3, 0);
  const blockH = Math.max(termsH, 1 * IN + 24);
  y += 0.25 * IN;
  if (y + blockH > bottomLimit) y = newPage();

  font("bold", 7.8);
  doc.text("Terms & Conditions", MARGIN_X, y + 8);
  let ly = y + 8 + 12;
  font("normal", 7.6, SOFT);
  for (const l of termLines) {
    doc.text(l, MARGIN_X, ly, { lineHeightFactor: 1.3 });
    ly += l.length * lineH(7.6) + 3;
  }

  const qrX = pageW - MARGIN_X - qrCol;
  if (qr) {
    try {
      doc.addImage(qr, "PNG", qrX + (qrCol - IN) / 2, y, IN, IN, undefined, "FAST");
    } catch {
      // QR is decoration; the quote still renders without it
    }
  }
  font("normal", 6.8, SOFT);
  doc.text(doc.splitTextToSize("Scan for warranty, data sheets and installation guides", qrCol) as string[], qrX + qrCol / 2, y + IN + 9, {
    align: "center",
    lineHeightFactor: 1.3,
  });
  y += blockH;

  // ── Acceptance ──────────────────────────────────────────────────────────────
  const acceptH = 0.35 * IN + 26;
  if (y + acceptH > bottomLimit) y = newPage();
  y += 0.35 * IN;
  const gap = 0.4 * IN;
  const wideW = ((contentW - gap) * 2) / 3;
  font("bold", 8);
  doc.text("Accepted By:", MARGIN_X, y + 8);
  doc.text("Accepted Date:", MARGIN_X + wideW + gap, y + 8);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.75);
  doc.line(MARGIN_X, y + 26, MARGIN_X + wideW, y + 26);
  doc.line(MARGIN_X + wideW + gap, y + 26, pageW - MARGIN_X, y + 26);

  drawFooter();

  // ── Save ────────────────────────────────────────────────────────────────────
  const safeName = (data.project || "Project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeDate = data.date.replace(/\//g, "-");
  doc.save(`Maximo_Quote_${safeName}_${safeDate}.pdf`);
}
