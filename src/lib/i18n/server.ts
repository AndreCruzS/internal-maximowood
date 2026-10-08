import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchLocale, type Locale } from "./locale";
import { DICTIONARIES, type Dict } from "./dictionaries";

/** The viewer's language: their saved choice (cookie), else their browser's, else English. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  try {
    return matchLocale((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
