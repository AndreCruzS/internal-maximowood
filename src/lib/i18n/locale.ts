/** UI languages of the intranet (the Maximo calculators and quote PDF stay in English). */
export const LOCALES = ["en", "es", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "gmx_lang";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español", pt: "Português" };
/** BCP 47 tag for dates and numbers. */
export const LOCALE_TAG: Record<Locale, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Best match from an Accept-Language header ("pt-BR,pt;q=0.9,en;q=0.8" → "pt"). */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

/** "{n} tools" + { n: 3 } → "3 tools". */
export const fmt = (template: string, vars: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
