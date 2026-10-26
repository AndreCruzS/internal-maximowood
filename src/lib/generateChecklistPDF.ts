import jsPDF from "jspdf";
import {
  HEADER_FIELDS, PROFILE_FIELDS, SECTIONS, fieldText, priceLines,
  type ChecklistData, type Field,
} from "./checklist";

/**
 * The checklist as a PDF, laid out like Maximo_Sales_Checklist_Model.pdf: black title bar with a
 * yellow stripe, total amount bar, numbered black section bars, grey label column. Empty fields
 * show the model's hint in grey italics, so logistics sees what is still open.
 */

type RGB = [number, number, number];
const BLACK: RGB = [26, 26, 26];
const YELLOW: RGB = [246, 202, 33];
const GREEN: RGB = [147, 196, 125];
const LABEL_BG: RGB = [243, 243, 243];
const BORDER: RGB = [221, 221, 221];
const INK: RGB = [40, 40, 40];
const HINT: RGB = [150, 150, 150];

const PAGE_W = 215.9; // Letter, mm
const PAGE_H = 279.4;
const M = 12;
const W = PAGE_W - 2 * M;
const LABEL_W = 62;
const PAD = 2.2;
const LINE = 4.1;

const usDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const usDateTime = (v: string) => {
  const d = new Date(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(d.getTime())
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : v;
};

function display(f: Field, values: Record<string, string>) {
  const text = fieldText(f, values);
  if (!text) return "";
  if (f.kind === "date") return text.replace(values[f.key] ?? "", usDate(values[f.key] ?? ""));
  if (f.kind === "datetime") return text.replace(values[f.key] ?? "", usDateTime(values[f.key] ?? ""));
  return text;
}

export async function checklistPDFBlob(d: ChecklistData): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  let y = M;

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold" | "italic", size: number) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
  const ensure = (h: number) => { if (y + h > PAGE_H - M) { doc.addPage(); y = M; } };

  // ── Title bar ──
  fill(BLACK); doc.rect(M, y, W, 16, "F");
  font("bold", 17); color([255, 255, 255]); doc.text("MAXIMO WOOD", M + 4, y + 10.5);
  font("bold", 8.5); color(YELLOW); doc.text("MAXIMO CONCIERGE", M + W - 4, y + 6.5, { align: "right" });
  font("bold", 12); color([255, 255, 255]); doc.text("CLIENT APPROVAL CHECKLIST", M + W - 4, y + 12, { align: "right" });
  y += 16;
  fill(YELLOW); doc.rect(M, y, W, 3.5, "F");
  y += 3.5;

  // ── Client / date ──
  const client = HEADER_FIELDS[0], date = HEADER_FIELDS[1], total = HEADER_FIELDS[2];
  fill(LABEL_BG); doc.rect(M, y, W, 8, "F");
  font("bold", 9); color(BLACK);
  doc.text(`CLIENT   ${display(client, d.header)}`.trim(), M + 3, y + 5.3, { maxWidth: W - 50 });
  doc.text(display(date, d.header), M + W - 3, y + 5.3, { align: "right" });
  y += 12;

  // ── Total amount ──
  fill(YELLOW); doc.rect(M, y, W / 2, 9, "F");
  fill(GREEN); doc.rect(M + W / 2, y, W / 2, 9, "F");
  font("bold", 12); color(BLACK);
  doc.text(`TOTAL AMOUNT  ${display(total, d.header) || "$"}`, M + 3, y + 6.2);
  y += 13;

  const sectionBar = (number: string, title: string) => {
    ensure(8 + 8);
    fill(BLACK); doc.rect(M, y, W, 7, "F");
    font("bold", 8.5); color(YELLOW); doc.text(number, M + 3, y + 4.8);
    color([255, 255, 255]); doc.text(title.toUpperCase(), M + 9, y + 4.8);
    y += 7;
  };

  const row = (label: string, value: string, hint = "") => {
    font("normal", 8.5);
    const shown = value || hint;
    const lines = doc.splitTextToSize(shown || " ", W - LABEL_W - 2 * PAD) as string[];
    const labelLines = doc.splitTextToSize(label.toUpperCase(), LABEL_W - 2 * PAD) as string[];
    const h = Math.max(lines.length, labelLines.length) * LINE + 2 * PAD;
    ensure(h);
    fill(LABEL_BG); doc.rect(M, y, LABEL_W, h, "F");
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]); doc.setLineWidth(0.2);
    doc.rect(M, y, LABEL_W, h); doc.rect(M + LABEL_W, y, W - LABEL_W, h);
    font("bold", 7.8); color(INK); doc.text(labelLines, M + PAD, y + PAD + 3);
    if (value) { font("normal", 8.8); color(BLACK); } else { font("italic", 8); color(HINT); }
    doc.text(lines, M + LABEL_W + PAD, y + PAD + 3);
    y += h;
  };

  // ── 01 Product specifications, one block per profile ──
  d.profiles.forEach((p, i) => {
    const of = d.profiles.length > 1 ? ` — profile ${i + 1} of ${d.profiles.length}` : "";
    sectionBar("01", `Product specifications — client approval${of}`);
    for (const f of PROFILE_FIELDS) row(f.label, display(f, p.fields), f.hint);

    // Feet length distribution
    const cols = Math.max(8, p.lengths.length);
    const perRow = 12;
    for (let start = 0; start < cols; start += perRow) {
      const slice = Array.from({ length: Math.min(perRow, cols - start) }, (_, k) => p.lengths[start + k] ?? { feet: "", qty: "" });
      const head = 7, cell = 6.5, firstW = 28;
      const cw = (W - LABEL_W - firstW) / perRow;
      ensure(head + 2 * cell + 4);
      const x0 = M + LABEL_W / 2;
      fill(LABEL_BG); doc.rect(x0, y + 2, firstW + cw * slice.length, head, "F");
      font("bold", 8.5); color(INK);
      doc.text(`Feet Length (Distribution)${start ? " (cont.)" : ""}`, x0 + (firstW + cw * slice.length) / 2, y + 2 + 4.7, { align: "center" });
      const rowsY = y + 2 + head;
      [["BOARDS", "feet"], ["QUANTITY", "qty"]].forEach(([name, key], r) => {
        const ry = rowsY + r * cell;
        fill(LABEL_BG); doc.rect(x0, ry, firstW, cell, "FD");
        font("bold", 7.5); color(INK); doc.text(name, x0 + firstW / 2, ry + 4.3, { align: "center" });
        slice.forEach((l, k) => {
          doc.rect(x0 + firstW + k * cw, ry, cw, cell);
          const v = (l as Record<string, string>)[key];
          if (v) { font("normal", 8); color(BLACK); doc.text(key === "feet" ? `${v}'` : v, x0 + firstW + k * cw + cw / 2, ry + 4.3, { align: "center" }); }
        });
      });
      y = rowsY + 2 * cell + 3;
    }

    // Profile photo & drawing
    const boxH = 48;
    ensure(boxH);
    fill(LABEL_BG); doc.rect(M, y, LABEL_W, boxH, "F");
    doc.rect(M, y, LABEL_W, boxH); doc.rect(M + LABEL_W, y, W - LABEL_W, boxH);
    font("bold", 7.8); color(INK); doc.text("PROFILE PHOTO & DRAWING", M + PAD, y + boxH / 2);
    if (p.photo) {
      try {
        const props = doc.getImageProperties(p.photo);
        const maxW = W - LABEL_W - 6, maxH = boxH - 6;
        const s = Math.min(maxW / props.width, maxH / props.height);
        const iw = props.width * s, ih = props.height * s;
        doc.addImage(p.photo, props.fileType, M + LABEL_W + 3 + (maxW - iw) / 2, y + 3 + (maxH - ih) / 2, iw, ih);
      } catch { /* a broken image just leaves the box empty */ }
    }
    y += boxH + 5;
  });

  // ── 02–05 ──
  const prices = priceLines(d);
  for (const s of SECTIONS) {
    sectionBar(s.number, s.title);
    const values = d.sections[s.id] ?? {};
    for (const f of s.fields) {
      row(f.label, display(f, values), f.hint);
      if (s.id === "order" && f.key === "linkedOrder") {
        row("Price to end customer", prices.end.join("\n"), "$ per LF, per profile");
        row("Price to distributor", prices.dist.join("\n"), "$ per LF itemized: material + milling + finishing");
      }
    }
    y += 4;
  }

  ensure(8);
  fill([0, 0, 0]); doc.rect(M, y, W, 7.5, "F");
  font("bold", 8.5); color([255, 255, 255]); doc.text("MAXIMO CONCIERGE TEAM", M + 3, y + 5);

  const safe = (display(client, d.header) || "Client").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "Client";
  const day = d.header.date || new Date().toISOString().slice(0, 10);
  return { blob: doc.output("blob"), filename: `Checklist - ${safe} - ${day}.pdf` };
}

export async function downloadChecklistPDF(d: ChecklistData) {
  const { blob, filename } = await checklistPDFBlob(d);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
