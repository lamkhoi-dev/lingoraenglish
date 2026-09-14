import { en, type Dictionary } from "./en";
import { vi } from "./vi";
import { es } from "./es";
import { pt } from "./pt";
import { fr } from "./fr";
import { de } from "./de";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import { hi } from "./hi";
import { id } from "./id";
import { tr } from "./tr";
import { ru } from "./ru";
import { ar } from "./ar";

// Full-site coverage added later: every string that used to be English-only
// (AI Speaking Coach, Shadowing, Listening Lab, Speaking Tests, shared pages).
import { sectionsVi } from "./sections/vi";
import { sectionsEs } from "./sections/es";
import { sectionsPt } from "./sections/pt";
import { sectionsFr } from "./sections/fr";
import { sectionsDe } from "./sections/de";
import { sectionsIt } from "./sections/it";
import { sectionsJa } from "./sections/ja";
import { sectionsKo } from "./sections/ko";
import { sectionsZhCN } from "./sections/zh-CN";
import { sectionsZhTW } from "./sections/zh-TW";
import { sectionsHi } from "./sections/hi";
import { sectionsId } from "./sections/id";
import { sectionsTr } from "./sections/tr";
import { sectionsRu } from "./sections/ru";
import { sectionsAr } from "./sections/ar";

/**
 * Every bundled interface dictionary, keyed by locale code.
 * English is complete; the others are Partial and fall back to English per key,
 * so a missing string never surfaces as a raw key.
 */
export const LOCALE_DICTIONARIES: Record<string, Dictionary> = {
  en,
  vi: { ...sectionsVi, ...vi },
  es: { ...sectionsEs, ...es },
  pt: { ...sectionsPt, ...pt },
  fr: { ...sectionsFr, ...fr },
  de: { ...sectionsDe, ...de },
  it: { ...sectionsIt, ...it },
  ja: { ...sectionsJa, ...ja },
  ko: { ...sectionsKo, ...ko },
  "zh-CN": { ...sectionsZhCN, ...zhCN },
  "zh-TW": { ...sectionsZhTW, ...zhTW },
  hi: { ...sectionsHi, ...hi },
  id: { ...sectionsId, ...id },
  tr: { ...sectionsTr, ...tr },
  ru: { ...sectionsRu, ...ru },
  ar: { ...sectionsAr, ...ar },
};
