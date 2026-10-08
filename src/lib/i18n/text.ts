import type { Dict } from "./dictionaries";
import type { Tool } from "@/lib/intranet";

/** Department name in the viewer's language; null = Leadership. */
export function deptName(t: Dict, id: string | null | undefined): string {
  if (!id) return t.departments.leadership;
  const d = (t.departments as Record<string, unknown>)[id];
  return d && typeof d === "object" ? (d as { name: string }).name : id;
}

export function deptDescription(t: Dict, id: string): string {
  const d = (t.departments as Record<string, unknown>)[id];
  return d && typeof d === "object" ? (d as { description: string }).description : "";
}

/** A built-in tool's name/description in the viewer's language (falls back to English in code). */
export const toolText = (t: Dict, tool: Tool) => t.tools[tool.href] ?? { name: tool.name, description: tool.description };

/** Month names for a BCP 47 tag ("pt-BR" → "janeiro"…). */
export const monthName = (tag: string, month1to12: number, style: "long" | "short" = "long") =>
  new Date(2000, month1to12 - 1, 1).toLocaleDateString(tag, { month: style });
