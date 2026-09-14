import { createServerFn } from "@tanstack/react-start";

import { withAnon } from "@/db";
import { uiTranslations } from "@/db/schema/schema";

/** Every admin-edited UI string, across every locale — public read, no
 * per-user gating (RLS: "public read ui_translations"). Used once at app
 * start to overlay on top of the bundled dictionaries. */
export const getAllTranslationOverrides = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await withAnon((db) =>
    db
      .select({ locale: uiTranslations.locale, translationKey: uiTranslations.translationKey, value: uiTranslations.value })
      .from(uiTranslations),
  );
  return rows.map((r) => ({ locale: r.locale, translation_key: r.translationKey, value: r.value }));
});
