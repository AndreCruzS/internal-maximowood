import jsPDF from "jspdf";
import {
  FONT_REGULAR_URL,
  FONT_BOLD_URL,
  LOGO_THERMO_URL,
  LOGO_MW_URL,
  QR_WARRANTY_URL,
  fetchAsBase64,
  fetchFontBase64,
} from "./pdfAssets";

// ── Brand colors ──────────────────────────────────────────────────────────────
const BLACK: [number, number, number] = [26, 26, 26];
const GOLD: [number, number, number] = [201, 162, 39];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_GRAY: [number, number, number] = [245, 244, 240];
const MED_GRAY: [number, number, number] = [120, 120, 120];
const DARK_GRAY: [number, number, number] = [40, 40, 40];
const TABLE_ROW_ALT: [number, number, number] = [250, 249, 246];
const BORDER_COLOR: [number, number, number] = [220, 218, 210];

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
  items: QuoteLineItem[];
  subtotal?: number;
  grandTotal?: number;
};

// ── Register fonts ─────────────────────────────────────────────────────────────
async function registerFonts(doc: jsPDF) {
  try {
    const [regularB64, boldB64] = await Promise.all([
      fetchFontBase64(FONT_REGULAR_URL),
      fetchFontBase64(FONT_BOLD_URL),
    ]);
    doc.addFileToVFS("Anybody-Regular.ttf", regularB64);
    doc.addFont("Anybody-Regular.ttf", "Anybody", "normal");
    doc.addFileToVFS("Anybody-Bold.ttf", boldB64);
    doc.addFont("Anybody-Bold.ttf", "Anybody", "bold");
  } catch {
    // Fonts may already be registered or unavailable — fallback to helvetica
  }
}

export async function generateQuotePDF(data: QuoteData) {
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });

  // Load all assets in parallel before rendering
  const [logoThermo, logoMW, qrWarranty] = await Promise.all([
    fetchAsBase64(LOGO_THERMO_URL).catch(() => null),
    fetchAsBase64(LOGO_MW_URL).catch(() => null),
    fetchAsBase64(QR_WARRANTY_URL).catch(() => null),
    registerFonts(doc),
  ]);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  // Compute totals if not provided
  const itemsSubtotal = data.items.reduce((s, it) => {
    const addOnTotal = it.addOns ? it.addOns.reduce((a, ao) => a + ao.amount, 0) : 0;
    return s + it.total + addOnTotal;
  }, 0);
  const subtotal = data.subtotal ?? itemsSubtotal;
  const tax = data.tax ?? 0;
  const shipping = data.shipping ?? 0;
  const grandTotal = data.grandTotal ?? subtotal + tax + shipping;

  // ── Page background ─────────────────────────────────────────────────────────
  function drawPageBg() {
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(0, 0, pageW, pageH, "F");
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  function drawHeader() {
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, pageW, 36, "F");

    doc.setFillColor(...GOLD);
    doc.rect(0, 36, pageW, 1.2, "F");

    // Thermo logo on black background
    if (logoThermo) {
      try {
        doc.addImage(logoThermo, "PNG", margin, 6, 55, 22, undefined, "FAST");
      } catch {
        doc.setFont("Anybody", "bold");
        doc.setFontSize(18);
        doc.setTextColor(...WHITE);
        doc.text("MAXIMO", margin, 18);
        doc.setFontSize(9);
        doc.setTextColor(...GOLD);
        doc.text("THERMO", margin, 25);
      }
    }

    doc.setFont("Anybody", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text("MAXIMO CONCIERGE", pageW - margin, 14, { align: "right" });

    doc.setFont("Anybody", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text("PROJECT MATERIAL QUOTATION", pageW - margin, 23, { align: "right" });
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  function drawFooter() {
    doc.setFillColor(...GOLD);
    doc.rect(0, pageH - 18, pageW, 0.8, "F");

    doc.setFillColor(...BLACK);
    doc.rect(0, pageH - 17.2, pageW, 17.2, "F");

    if (logoMW) {
      try {
        doc.addImage(logoMW, "PNG", pageW / 2 - 5, pageH - 16, 10, 12, undefined, "FAST");
      } catch {
        doc.setFont("Anybody", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...GOLD);
        doc.text("M", pageW / 2, pageH - 7, { align: "center" });
      }
    }
  }

  // ── Info table ───────────────────────────────────────────────────────────────
  function drawInfoTable(startY: number): number {
    const rows = [
      { label: "Company Name", value: data.company || "—" },
      { label: "Contact",      value: data.contact || "—" },
      { label: "Project",      value: data.project || "—" },
      { label: "Date",         value: data.date },
      { label: "Prepared by",  value: data.preparedBy || "Maximo Concierge Team" },
      { label: "Address",      value: data.address || "—" },
    ];

    const labelW = 42;
    const rowH = 9;
    let y = startY;

    for (const row of rows) {
      doc.setFillColor(...WHITE);
      doc.rect(margin, y, contentW, rowH, "F");

      doc.setFont("Anybody", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK_GRAY);
      doc.text(row.label, margin + 2, y + 6);

      // Gold bottom separator
      doc.setFillColor(...GOLD);
      doc.rect(margin, y + rowH - 0.4, contentW, 0.4, "F");

      doc.setFont("Anybody", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK_GRAY);
      doc.text(row.value, margin + labelW + 3, y + 6);

      y += rowH;
    }

    return y + 6;
  }

  // ── Products table ───────────────────────────────────────────────────────────
  function drawProductsTable(startY: number): number {
    const cols = {
      species: { x: margin,       w: 40 },
      profile: { x: margin + 40,  w: 32 },
      size:    { x: margin + 72,  w: 18 },
      sqft:    { x: margin + 90,  w: 22 },
      lf:      { x: margin + 112, w: 22 },
      price:   { x: margin + 134, w: 22 },
      total:   { x: margin + 156, w: contentW - 156 },
    };

    const hdrH = 8;
    let y = startY;

    // Header
    doc.setFillColor(...BLACK);
    doc.rect(margin, y, contentW, hdrH, "F");

    doc.setFont("Anybody", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);

    const headers: [string, keyof typeof cols][] = [
      ["SPECIES", "species"],
      ["PROFILE", "profile"],
      ["NOM. SIZE", "size"],
      ["SQFT", "sqft"],
      ["LF", "lf"],
      ["PRICE/LF", "price"],
      ["TOTAL", "total"],
    ];

    for (const [label, key] of headers) {
      const col = cols[key];
      doc.text(label, col.x + col.w / 2, y + 5.5, { align: "center" });
    }

    y += hdrH;

    // Rows
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const isAlt = i % 2 === 1;
      const addOnCount = item.addOns ? item.addOns.length : 0;
      const rowH = 10 + addOnCount * 5;

      doc.setFillColor(...(isAlt ? TABLE_ROW_ALT : WHITE));
      doc.rect(margin, y, contentW, rowH, "F");

      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.2);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);

      doc.setFont("Anybody", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...DARK_GRAY);

      const midY = y + 7;

      const speciesLines = doc.splitTextToSize(item.species, cols.species.w - 3);
      doc.text(speciesLines, cols.species.x + 2, midY);

      const profileLines = doc.splitTextToSize(item.profile, cols.profile.w - 2);
      doc.text(profileLines, cols.profile.x + 2, midY);

      doc.text(item.nominalSize, cols.size.x + cols.size.w / 2, midY, { align: "center" });
      doc.text(item.sqft.toFixed(2), cols.sqft.x + cols.sqft.w / 2, midY, { align: "center" });
      doc.text(item.lf.toFixed(2), cols.lf.x + cols.lf.w / 2, midY, { align: "center" });

      doc.setFont("Anybody", "bold");
      doc.text(`$${item.pricePerLF.toFixed(2)}`, cols.price.x + cols.price.w / 2, midY, { align: "center" });
      doc.text(`$${item.total.toFixed(2)}`, cols.total.x + cols.total.w - 2, midY, { align: "right" });

      // Add-ons
      if (item.addOns && item.addOns.length > 0) {
        let aoY = y + 11;
        for (const addon of item.addOns) {
          doc.setFont("Anybody", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...MED_GRAY);
          doc.text(`+ ${addon.label}`, cols.profile.x + 2, aoY);
          doc.setFont("Anybody", "bold");
          doc.text(`$${addon.amount.toFixed(2)}`, cols.total.x + cols.total.w - 2, aoY, { align: "right" });
          aoY += 5;
        }
      }

      y += rowH;
    }

    return y;
  }

  // ── Totals ────────────────────────────────────────────────────────────────────
  function drawTotals(startY: number): number {
    let y = startY + 6;
    const labelX = pageW - margin - 62;
    const valueX = pageW - margin;
    const rowH = 8;

    const rows = [
      { label: "Subtotal", value: subtotal, highlight: false },
      ...(tax > 0 ? [{ label: "Tax", value: tax, highlight: false }] : []),
      ...(shipping > 0 ? [{ label: "Shipping", value: shipping, highlight: false }] : []),
      { label: "TOTAL", value: grandTotal, highlight: true },
    ];

    for (const row of rows) {
      if (row.highlight) {
        doc.setFillColor(...GOLD);
        doc.rect(labelX - 4, y - 5.5, valueX - labelX + 4 + margin, rowH, "F");
        doc.setFont("Anybody", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...BLACK);
      } else {
        doc.setFont("Anybody", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...DARK_GRAY);
      }

      doc.text(row.label, labelX, y);
      doc.text(`$${row.value.toFixed(2)}`, valueX, y, { align: "right" });
      y += rowH;
    }

    return y + 4;
  }

  // ── Terms & Warranty ─────────────────────────────────────────────────────────
  function drawTerms(startY: number) {
    const y = startY + 4;

    doc.setFont("Anybody", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GOLD);
    doc.text("Terms & Conditions", margin, y);

    doc.setFont("Anybody", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MED_GRAY);
    const terms =
      "This quotation is valid for a period of ten (10) days from the date of issue. " +
      "Shipping is not included in the quotation unless previously requested. " +
      "Prices are subject to change without notice.";
    const termLines = doc.splitTextToSize(terms, contentW * 0.58);
    doc.text(termLines, margin, y + 6);

    // WARRANTY INFOS + QR code
    const qrX = pageW - margin - 30;
    const qrY = y - 4;

    doc.setFillColor(...BLACK);
    doc.rect(qrX - 2, qrY, 34, 7, "F");
    doc.setFont("Anybody", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...GOLD);
    doc.text("WARRANTY INFOS", qrX - 1, qrY + 4.5);

    if (qrWarranty) {
      try {
        doc.addImage(qrWarranty, "PNG", qrX - 2, qrY + 8, 32, 32, undefined, "FAST");
      } catch {
        // ignore
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════════════════════════════════════════
  drawPageBg();
  drawHeader();

  let y = 44;
  y = drawInfoTable(y);
  y = drawProductsTable(y);
  y = drawTotals(y);
  drawTerms(y);
  drawFooter();

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — NOTES
  // ═══════════════════════════════════════════════════════════════════════════
  if (data.notes && data.notes.trim().length > 0) {
    doc.addPage();
    drawPageBg();
    drawHeader();

    let y2 = 48;

    doc.setFont("Anybody", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MED_GRAY);
    doc.text("NOTES", margin, y2);
    y2 += 10;

    const noteLines = data.notes.split("\n").filter(l => l.trim().length > 0);
    for (const note of noteLines) {
      doc.setFont("Anybody", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GOLD);
      doc.text("→", margin, y2);

      doc.setFont("Anybody", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK_GRAY);
      const wrapped = doc.splitTextToSize(note.trim(), contentW - 10);
      doc.text(wrapped, margin + 7, y2);
      y2 += wrapped.length * 5.5 + 3;
    }

    drawFooter();
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeName = (data.project || "Project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeDate = data.date.replace(/\//g, "-");
  doc.save(`Maximo_Quote_${safeName}_${safeDate}.pdf`);
}
