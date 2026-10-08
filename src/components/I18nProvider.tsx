"use client";

import { createContext, useContext } from "react";
import { DICTIONARIES, type Dict } from "@/lib/i18n/dictionaries";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_TAG, type Locale } from "@/lib/i18n/locale";

const I18n = createContext<{ locale: Locale; t: Dict; tag: string }>({
  locale: DEFAULT_LOCALE,
  t: DICTIONARIES[DEFAULT_LOCALE],
  tag: LOCALE_TAG[DEFAULT_LOCALE],
});

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18n.Provider value={{ locale, t: DICTIONARIES[locale], tag: LOCALE_TAG[locale] }}>{children}</I18n.Provider>;
}

/** `t` = the dictionary for the viewer's language; `tag` = BCP 47 tag for dates/numbers. */
export const useI18n = () => useContext(I18n);

/** Remember the choice for a year; the caller refreshes the page. */
export function saveLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
