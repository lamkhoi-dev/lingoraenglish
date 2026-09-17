import { z } from "zod";

/** Interface languages Lingora English can explain in. English is the
 * fallback. This list is still static (unlike the interface-text
 * dictionaries, which are DB-driven — see i18n.functions.ts) — a language
 * registered purely via admin data entry after this list was last extended
 * falls back to English for AI-explanation language until a code change
 * adds it here. Documented limitation (see roadmap.md), not silently
 * broken: explanationLanguageSchema below already degrades safely to "en"
 * for any unrecognised code rather than erroring. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  hi: "Hindi",
  id: "Indonesian",
  tr: "Turkish",
  ru: "Russian",
  ar: "Modern Standard Arabic",
  th: "Thai",
  pl: "Polish",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  nb: "Norwegian",
  fi: "Finnish",
  is: "Icelandic",
  cs: "Czech",
  sk: "Slovak",
  hu: "Hungarian",
  el: "Greek",
  he: "Hebrew",
  fa: "Persian",
  ur: "Urdu",
  ro: "Romanian",
  uk: "Ukrainian",
  bg: "Bulgarian",
  hr: "Croatian",
  sr: "Serbian",
  sl: "Slovenian",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  ms: "Malay",
  fil: "Filipino",
  bn: "Bengali",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  si: "Sinhala",
  ne: "Nepali",
  my: "Burmese",
  km: "Khmer",
};

export const explanationLanguageSchema = z
  .string()
  .max(8)
  .default("en")
  .transform((code) => (LANGUAGE_NAMES[code] ? code : "en"));

export const langNote = (lang: string) => {
  const name = LANGUAGE_NAMES[lang] ?? "English";
  return name === "English"
    ? "Write everything in clear, simple English."
    : `Write every explanation and feedback field in ${name}, but keep English example sentences, corrections, rewrites and vocabulary in English.`;
};
