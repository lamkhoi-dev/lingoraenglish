import { useServerFn } from "@tanstack/react-start";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { updateEnglishOnlyMode, updateInterfaceLanguage } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { getAllTranslationOverrides } from "@/lib/i18n.functions";
import { en, type Dictionary, type TranslationKey } from "@/locales/en";
import { LOCALE_DICTIONARIES } from "@/locales/index";

/* ---------------------------------------------------------------- languages */

export type LocaleCode =
  | "en"
  | "vi"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "it"
  | "ja"
  | "ko"
  | "zh-CN"
  | "zh-TW"
  | "hi"
  | "id"
  | "tr"
  | "ru"
  | "ar";

export type LanguageMeta = {
  code: LocaleCode;
  /** Shown in the UI — always the native name. */
  native: string;
  /** Internal/admin label only. */
  english: string;
  flag: string;
  dir: "ltr" | "rtl";
  /** BCP-47 tag used for Intl date/number formatting. */
  intl: string;
};

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", native: "English", english: "English", flag: "🇺🇸", dir: "ltr", intl: "en-US" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese", flag: "🇻🇳", dir: "ltr", intl: "vi-VN" },
  { code: "es", native: "Español", english: "Spanish", flag: "🇪🇸", dir: "ltr", intl: "es-ES" },
  { code: "pt", native: "Português", english: "Portuguese", flag: "🇧🇷", dir: "ltr", intl: "pt-BR" },
  { code: "fr", native: "Français", english: "French", flag: "🇫🇷", dir: "ltr", intl: "fr-FR" },
  { code: "de", native: "Deutsch", english: "German", flag: "🇩🇪", dir: "ltr", intl: "de-DE" },
  { code: "it", native: "Italiano", english: "Italian", flag: "🇮🇹", dir: "ltr", intl: "it-IT" },
  { code: "ja", native: "日本語", english: "Japanese", flag: "🇯🇵", dir: "ltr", intl: "ja-JP" },
  { code: "ko", native: "한국어", english: "Korean", flag: "🇰🇷", dir: "ltr", intl: "ko-KR" },
  { code: "zh-CN", native: "简体中文", english: "Simplified Chinese", flag: "🇨🇳", dir: "ltr", intl: "zh-CN" },
  { code: "zh-TW", native: "繁體中文", english: "Traditional Chinese", flag: "🇹🇼", dir: "ltr", intl: "zh-TW" },
  { code: "hi", native: "हिन्दी", english: "Hindi", flag: "🇮🇳", dir: "ltr", intl: "hi-IN" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", flag: "🇮🇩", dir: "ltr", intl: "id-ID" },
  { code: "tr", native: "Türkçe", english: "Turkish", flag: "🇹🇷", dir: "ltr", intl: "tr-TR" },
  { code: "ru", native: "Русский", english: "Russian", flag: "🇷🇺", dir: "ltr", intl: "ru-RU" },
  { code: "ar", native: "العربية", english: "Arabic", flag: "🇸🇦", dir: "rtl", intl: "ar-SA" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function findLanguage(code: string | null | undefined): LanguageMeta {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

/** Maps a browser tag such as "pt-PT" or "zh-Hant-TW" onto a supported locale. */
export function matchBrowserLocale(tags: readonly string[]): LocaleCode | null {
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    if (tag.startsWith("zh")) {
      if (/hant|tw|hk|mo/.test(tag)) return "zh-TW";
      return "zh-CN";
    }
    const exact = LANGUAGES.find((l) => l.code.toLowerCase() === tag);
    if (exact) return exact.code;
    const base = tag.split("-")[0]!;
    const partial = LANGUAGES.find((l) => l.code.split("-")[0] === base);
    if (partial) return partial.code;
  }
  return null;
}

/* -------------------------------------------------------------------- store */

const LANG_KEY = "lily.locale";
const MODE_KEY = "lily.englishOnly";

type Overrides = Partial<Record<LocaleCode, Dictionary>>;

type I18nValue = {
  locale: LocaleCode;
  language: LanguageMeta;
  dir: "ltr" | "rtl";
  setLocale: (code: LocaleCode) => void;
  /** Translate a key, with optional {{placeholders}}. Falls back to English. */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** Native name of the current interface language, for prompts and labels. */
  languageName: string;
  /** English name of the current interface language — used in AI prompts. */
  languageEnglishName: string;
  /** True when the learner wants Lingora English to work entirely in English. */
  englishOnly: boolean;
  setEnglishOnly: (value: boolean) => void;
  /** The language Lingora English should explain in: English when English Only Mode is on. */
  explanationLanguage: string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number, fractionDigits?: number) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  ready: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const updateInterfaceLanguageFn = useServerFn(updateInterfaceLanguage);
  const updateEnglishOnlyModeFn = useServerFn(updateEnglishOnlyMode);
  const fetchAllOverrides = useServerFn(getAllTranslationOverrides);
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [englishOnly, setEnglishOnlyState] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [ready, setReady] = useState(false);

  // ?lang= (how the hreflang alternate links on / point at each locale) wins over
  // everything else, then stored preference, then browser detection, then English.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl && LANGUAGES.some((l) => l.code === fromUrl)) {
      setLocaleState(fromUrl as LocaleCode);
      window.localStorage.setItem(LANG_KEY, fromUrl);
    } else {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored && LANGUAGES.some((l) => l.code === stored)) {
        setLocaleState(stored as LocaleCode);
      } else {
        const detected = matchBrowserLocale(navigator.languages ?? [navigator.language]);
        if (detected) setLocaleState(detected);
      }
    }
    setEnglishOnlyState(window.localStorage.getItem(MODE_KEY) === "true");
    setReady(true);
  }, []);

  // Signed-in learners: their profile is the source of truth. Reacts to
  // `profile` from AuthProvider (now our parent — see __root.tsx) instead of
  // subscribing to Supabase's own auth-state stream, which no longer exists.
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.interface_language && LANGUAGES.some((l) => l.code === profile.interface_language)) {
      setLocaleState(profile.interface_language as LocaleCode);
      window.localStorage.setItem(LANG_KEY, profile.interface_language);
    }
    setEnglishOnlyState(Boolean(profile.english_only_mode));
  }, [user, profile]);

  // Admin-edited strings, applied on top of the bundled dictionaries.
  useEffect(() => {
    let cancelled = false;
    void fetchAllOverrides().then((rows) => {
      if (cancelled) return;
      const next: Overrides = {};
      for (const row of rows) {
        const code = row.locale as LocaleCode;
        next[code] = { ...(next[code] ?? {}), [row.translation_key as TranslationKey]: row.value };
      }
      setOverrides(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAllOverrides]);

  const language = findLanguage(locale);

  // Keep <html lang> and text direction in sync — required for RTL locales.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = language.dir;
  }, [locale, language.dir]);

  const setLocale = useCallback(
    (code: LocaleCode) => {
      setLocaleState(code);
      window.localStorage.setItem(LANG_KEY, code);
      if (user) void updateInterfaceLanguageFn({ data: { interfaceLanguage: code } });
    },
    [user, updateInterfaceLanguageFn],
  );

  const setEnglishOnly = useCallback(
    (value: boolean) => {
      setEnglishOnlyState(value);
      window.localStorage.setItem(MODE_KEY, String(value));
      if (user) void updateEnglishOnlyModeFn({ data: { englishOnlyMode: value } });
    },
    [user, updateEnglishOnlyModeFn],
  );

  const t = useCallback<I18nValue["t"]>(
    (key, vars) => {
      const dict = LOCALE_DICTIONARIES[locale];
      const raw = overrides[locale]?.[key] ?? dict?.[key] ?? en[key] ?? String(key);
      if (!vars) return raw;
      return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        vars[name] === undefined ? "" : String(vars[name]),
      );
    },
    [locale, overrides],
  );

  const value = useMemo<I18nValue>(() => {
    const intl = language.intl;
    return {
      locale,
      language,
      dir: language.dir,
      setLocale,
      t,
      languageName: language.native,
      languageEnglishName: language.english,
      englishOnly,
      setEnglishOnly,
      explanationLanguage: englishOnly ? "English" : language.english,
      formatNumber: (v, options) => new Intl.NumberFormat(intl, options).format(v),
      formatPercent: (v, fractionDigits = 0) =>
        new Intl.NumberFormat(intl, {
          style: "percent",
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        }).format(v / 100),
      formatDate: (v, options) =>
        new Intl.DateTimeFormat(intl, options ?? { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(v),
        ),
      ready,
    };
  }, [locale, language, setLocale, t, englishOnly, setEnglishOnly, ready]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

/** Coverage report for the admin translation manager. */
export function translationCoverage(locale: LocaleCode, overrides?: Dictionary) {
  const keys = Object.keys(en) as TranslationKey[];
  const dict = LOCALE_DICTIONARIES[locale] ?? {};
  const missing = keys.filter((k) => !(overrides?.[k] ?? dict[k]));
  return { total: keys.length, translated: keys.length - missing.length, missing };
}

export type { TranslationKey, Dictionary };
