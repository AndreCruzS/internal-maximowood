import { describe, expect, it } from "vitest";
import { DICTIONARIES, plural } from "@/lib/i18n/dictionaries";
import { fmt, matchLocale } from "@/lib/i18n/locale";

// Leaf paths joined with "›" (tool keys are URLs containing dots).
const leaves = (o: unknown, path: string[] = []): [string, unknown][] =>
  o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => leaves(v, [...path, k])) : [[path.join("›"), o]];
const keys = (o: unknown) => leaves(o).map(([k]) => k);

describe("i18n", () => {
  it("Spanish and Portuguese have every English label, and nothing empty", () => {
    const en = keys(DICTIONARIES.en).sort();
    for (const l of ["es", "pt"] as const) {
      expect(keys(DICTIONARIES[l]).sort()).toEqual(en);
      expect(leaves(DICTIONARIES[l]).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k)).toEqual([]);
    }
  });
  it("picks the browser language and fills placeholders / plurals", () => {
    expect(matchLocale("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(matchLocale("fr-FR,es;q=0.5")).toBe("es");
    expect(matchLocale(null)).toBe("en");
    expect(fmt("{done} of {total}", { done: 2, total: 6 })).toBe("2 of 6");
    expect(plural(DICTIONARIES.pt.home, "tools", 1)).toBe("1 ferramenta");
    expect(plural(DICTIONARIES.es.home, "tools", 3)).toBe("3 herramientas");
  });
});
