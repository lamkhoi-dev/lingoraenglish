import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { withAnon } from "@/db";
import { uiLanguages, uiTranslations } from "@/db/schema/schema";

/* ------------------------------------------------------------------------
 * Small in-memory cache, one Node process per the deploy setup (see
 * roadmap.md — single Docker container on the VPS), so no cross-instance
 * invalidation is needed. This is what keeps "every page load queries the
 * DB for translations" from adding noticeable latency as the number of
 * languages grows (Yêu cầu 8's "tốc độ tải trang không bị ảnh hưởng đáng
 * kể") — each request only ever loads ONE locale's rows, and repeats of
 * that within the TTL window are free. `bustLocaleCache`/`bustLanguagesCache`
 * are called by the admin write paths so edits show up immediately instead
 * of waiting out the TTL.
 * ---------------------------------------------------------------------- */
const TTL_MS = 120_000;
const translationsCache = new Map<string, { data: { translation_key: string; value: string }[]; expiresAt: number }>();
let languagesCache: { data: UiLanguage[]; expiresAt: number } | null = null;

export function bustLocaleCache(locale: string) {
  translationsCache.delete(locale);
}

export function bustLanguagesCache() {
  languagesCache = null;
}

const localeSchema = z.object({ locale: z.string().max(8) });

/** Every UI string for one locale — admin-edited overrides AND, for a
 * language that only exists as data (no compiled src/locales/<code>.ts),
 * this IS its whole dictionary. Public/anon (RLS: "public read
 * ui_translations"), filtered to the requested locale only — replaces the
 * old getAllTranslationOverrides(), which selected every row for every
 * locale on every page load regardless of which one was active; that was
 * already wasteful at 16 languages and would fetch tens of thousands of
 * rows per page view once dozens of languages are DB-only. */
export const getTranslationsForLocale = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => localeSchema.parse(d))
  .handler(async ({ data }) => {
    const cached = translationsCache.get(data.locale);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const rows = await withAnon((db) =>
      db
        .select({ translationKey: uiTranslations.translationKey, value: uiTranslations.value })
        .from(uiTranslations)
        .where(eq(uiTranslations.locale, data.locale))
        .limit(4000),
    );
    const result = rows.map((r) => ({ translation_key: r.translationKey, value: r.value }));
    translationsCache.set(data.locale, { data: result, expiresAt: Date.now() + TTL_MS });
    return result;
  });

export type UiLanguage = {
  code: string;
  native_name: string;
  english_name: string;
  flag: string;
  direction: string;
  intl_tag: string;
  sort_order: number;
};

/** Every enabled language registered purely as data — this is what lets a
 * new interface language be added without touching source code: an admin
 * (or the bulk loader script) inserts one ui_languages row and the language
 * appears in every language picker on the next cache refresh, no redeploy. */
export const getUiLanguages = createServerFn({ method: "GET" }).handler(async () => {
  if (languagesCache && languagesCache.expiresAt > Date.now()) return languagesCache.data;

  const rows = await withAnon((db) =>
    db
      .select({
        code: uiLanguages.code,
        nativeName: uiLanguages.nativeName,
        englishName: uiLanguages.englishName,
        flag: uiLanguages.flag,
        direction: uiLanguages.direction,
        intlTag: uiLanguages.intlTag,
        sortOrder: uiLanguages.sortOrder,
      })
      .from(uiLanguages)
      .where(eq(uiLanguages.enabled, true))
      .orderBy(asc(uiLanguages.sortOrder)),
  );
  const result = rows.map((r) => ({
    code: r.code,
    native_name: r.nativeName,
    english_name: r.englishName,
    flag: r.flag,
    direction: r.direction,
    intl_tag: r.intlTag,
    sort_order: r.sortOrder,
  }));
  languagesCache = { data: result, expiresAt: Date.now() + TTL_MS };
  return result;
});
