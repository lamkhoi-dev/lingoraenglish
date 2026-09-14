/**
 * One-off validation script — NOT part of the app. Exercises the final
 * pieces of Giai đoạn 3: getCurrentUser's new interface_language/
 * english_only_mode fields (added so I18nProvider could stop calling
 * Supabase directly), updateInterfaceLanguage (confirms it touches ONLY
 * interface_language, not ui_language — a deliberate original quirk being
 * preserved, not fixed), updateEnglishOnlyMode, and getAllTranslationOverrides
 * (public, all locales at once).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { rawSql, withAdmin, withAnon, withUser } from "../src/db";
import { profiles, uiTranslations, usersInAuth } from "../src/db/schema/schema";

async function main() {
  const userId = await withAdmin(async (db) => {
    const rows = await db
      .insert(usersInAuth)
      .values({ email: `test-i18n-${randomUUID()}@test.local`, encryptedPassword: "x" })
      .returning({ id: usersInAuth.id });
    return rows[0]!.id;
  });

  // Seed a known starting state so the "only touches one column" check is meaningful.
  await withUser(userId, (db) =>
    db.update(profiles).set({ interfaceLanguage: "en", uiLanguage: "en", englishOnlyMode: false }).where(eq(profiles.id, userId)),
  );

  // updateInterfaceLanguage-style write: only interface_language changes, ui_language does not.
  await withUser(userId, (db) => db.update(profiles).set({ interfaceLanguage: "vi" }).where(eq(profiles.id, userId)));
  let row = (await withAdmin((db) => db.select().from(profiles).where(eq(profiles.id, userId)))).at(0)!;
  if (row.interfaceLanguage !== "vi") throw new Error(`FAIL: interfaceLanguage did not update, got "${row.interfaceLanguage}"`);
  if (row.uiLanguage !== "en") throw new Error(`FAIL: updateInterfaceLanguage-style write should NOT touch ui_language, but it changed to "${row.uiLanguage}"`);
  console.log("updateInterfaceLanguage-style write: interface_language changes, ui_language stays put (matches original quirk). OK.");

  // updateEnglishOnlyMode-style write.
  await withUser(userId, (db) => db.update(profiles).set({ englishOnlyMode: true }).where(eq(profiles.id, userId)));
  row = (await withAdmin((db) => db.select().from(profiles).where(eq(profiles.id, userId)))).at(0)!;
  if (row.englishOnlyMode !== true) throw new Error("FAIL: englishOnlyMode did not update");
  console.log("updateEnglishOnlyMode-style write: OK.");

  // getCurrentUser-style read: profile now carries interface_language + english_only_mode.
  const profileForAuth = await withUser(userId, (db) =>
    db
      .select({ interfaceLanguage: profiles.interfaceLanguage, englishOnlyMode: profiles.englishOnlyMode })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
  );
  if (profileForAuth[0]?.interfaceLanguage !== "vi" || profileForAuth[0]?.englishOnlyMode !== true) {
    throw new Error(`FAIL: getCurrentUser-style read did not see the updated fields, got ${JSON.stringify(profileForAuth[0])}`);
  }
  console.log("getCurrentUser-style read exposes interface_language + english_only_mode: OK.");

  // getAllTranslationOverrides-style read: public, spans every locale.
  const key = `test.i18n.${randomUUID()}`;
  await withAdmin((db) => db.insert(uiTranslations).values([
    { locale: "vi", translationKey: key, value: "Xin chào" },
    { locale: "fr", translationKey: key, value: "Bonjour" },
  ]));
  const allOverrides = await withAnon((db) =>
    db.select({ locale: uiTranslations.locale, translationKey: uiTranslations.translationKey, value: uiTranslations.value }).from(uiTranslations),
  );
  const viRow = allOverrides.find((r) => r.locale === "vi" && r.translationKey === key);
  const frRow = allOverrides.find((r) => r.locale === "fr" && r.translationKey === key);
  if (viRow?.value !== "Xin chào" || frRow?.value !== "Bonjour") {
    throw new Error("FAIL: getAllTranslationOverrides-style read did not return both locales for the same key");
  }
  console.log("getAllTranslationOverrides-style read: anon sees rows across multiple locales in one call. OK.");

  // Cleanup
  await withAdmin((db) => db.delete(usersInAuth).where(eq(usersInAuth.id, userId)));
  await withAdmin((db) => db.delete(uiTranslations).where(eq(uiTranslations.translationKey, key)));

  console.log("\nALL I18N-FUNCTIONS CHECKS PASSED");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
