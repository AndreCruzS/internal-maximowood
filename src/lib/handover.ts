/** The offboarding handover (migration 0017: offboardings.handover, successor_id). */
export const HANDOVER_KEYS = ["projects", "accounts", "open", "delivered"] as const;
export type HandoverKey = (typeof HANDOVER_KEYS)[number];
export type Handover = Partial<Record<HandoverKey, string>>;

export type HandoverRow = {
  id: string;
  person_id: string;
  last_day: string;
  status: "requested" | "done" | "cancelled";
  handover: Handover | null;
  successor_id: string | null;
  handover_at: string | null;
};

/** Columns for the offboardings table, and the list without the 0017 ones while it's pending. */
export const HANDOVER_COLUMNS = "handover, successor_id, handover_at";

/** Answers as lists: one item per non-empty line. */
export const handoverLines = (text: string | undefined) =>
  (text ?? "").split("\n").map(l => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);

export const handoverFilled = (h: Handover | null | undefined) => HANDOVER_KEYS.some(k => (h?.[k] ?? "").trim());
