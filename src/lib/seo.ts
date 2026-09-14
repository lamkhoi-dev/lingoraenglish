import { LANGUAGES } from "@/lib/i18n";

/**
 * Every route shares one URL across all 16 interface languages (locale is a
 * client-side preference, not a path segment) — `?lang=` is the only thing
 * that varies, and `I18nProvider` honours it on load. So the hreflang
 * alternate for a given route is the same path with `?lang=<code>` appended.
 */
export function hreflangLinks(path: string) {
  return LANGUAGES.map((l) => ({ rel: "alternate", hrefLang: l.code, href: `${path}?lang=${l.code}` }));
}
