import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Globe,
  Headphones,
  MessageCircle,
  Mic,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";

import { AppShell } from "@/components/lily/app-shell";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { canonicalLink, SITE_NAME, SITE_URL } from "@/lib/seo";
import type { TranslationKey } from "@/locales/en";

const TITLE = "Lingora English — AI Speaking Coach: Speak, Get Corrected, Improve";
const DESCRIPTION =
  "Practise English speaking with your AI coach and get instant feedback on pronunciation, grammar, vocabulary, fluency and natural English. Shadowing, daily conversations and IELTS, TOEFL and PTE speaking practice.";

// Structured data for Google (brand name/logo, site name, app type). Only facts
// that are true and visible on the site — no ratings or prices, which Google
// treats as spam markup when they don't match the page.
// The brand is also written as one word (the domain) — telling Google these are
// the same site is what lets a search for "lingoraenglishai" (no ".com") find it.
const ALTERNATE_NAMES = ["lingoraenglishai", "Lingora English AI", "lingoraenglishai.com"];

const STRUCTURED_DATA = JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: ALTERNATE_NAMES,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ALTERNATE_NAMES,
    url: SITE_URL,
    inLanguage: "en",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: DESCRIPTION,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
  },
]);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/` },
    ],
    links: [canonicalLink("/")],
    scripts: [{ type: "application/ld+json", children: STRUCTURED_DATA }],
  }),
  component: HomePage,
});

const FEATURES: { to: string; icon: typeof Mic; titleKey: TranslationKey; bodyKey: TranslationKey; image: string }[] = [
  { to: "/ai-speaking", icon: MessageCircle, titleKey: "app.home.features.coach.title", bodyKey: "app.home.features.coach.body", image: "/images/ai-coach-practice.png" },
  { to: "/shadowing", icon: Headphones, titleKey: "app.home.features.shadowing.title", bodyKey: "app.home.features.shadowing.body", image: "/images/shadowing-practice.jpg" },
  { to: "/speaking-tests", icon: Target, titleKey: "app.home.features.tests.title", bodyKey: "app.home.features.tests.body", image: "/images/ielts-speaking-exam.jpg" },
  { to: "/pronunciation", icon: Volume2, titleKey: "app.home.features.pron.title", bodyKey: "app.home.features.pron.body", image: "/images/pronunciation-guide.jpg" },
  { to: "/listening-lab", icon: Headphones, titleKey: "app.home.features.listening.title", bodyKey: "app.home.features.listening.body", image: "/images/listening-dictation.jpg" },
  { to: "/vocabulary", icon: BookOpen, titleKey: "app.home.features.vocab.title", bodyKey: "app.home.features.vocab.body", image: "/images/vocabulary-cards.jpg" },
];

const STEP_KEYS: TranslationKey[] = [
  "app.home.how.1",
  "app.home.how.2",
  "app.home.how.3",
  "app.home.how.4",
  "app.home.how.5",
  "app.home.how.6",
];

const CONVERSATION_KEYS: { who: "coach" | "you" | "fix"; key: TranslationKey }[] = [
  { who: "coach", key: "app.home.chat.coachLine" },
  { who: "you", key: "app.home.chat.youLine" },
  { who: "fix", key: "app.home.chat.fixLine" },
  { who: "coach", key: "app.home.chat.coachReply" },
];

function HomePage() {
  const { t, setLocale } = useI18n();

  return (
    <AppShell>
      {/* Hero */}
      <section className="animate-rise grid items-center gap-10 pt-4 sm:pt-10 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-soft ring-1 ring-border">
            <Sparkles className="size-3" />
            {t("app.home.badge")}
          </span>
          <h1 className="mt-6 font-display text-4xl leading-[1.05] text-foreground sm:text-5xl">
            {t("app.home.heroTitle")}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("app.home.heroSub")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/ai-speaking"
              className="inline-flex items-center gap-2 rounded-full bg-brass px-6 py-3.5 text-sm font-semibold text-plum-deep shadow-brass transition-transform hover:-translate-y-0.5"
            >
              <Mic className="size-4" />
              {t("app.home.startSpeaking")}
            </Link>
            <Link
              to="/shadowing"
              className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-6 py-3.5 text-sm font-semibold text-foreground ring-1 ring-border transition-transform hover:-translate-y-0.5 hover:bg-surface-3"
            >
              <Headphones className="size-4" />
              {t("app.home.tryShadowing")}
            </Link>
          </div>
        </div>

        {/* Visual: a live speaking correction with real photo */}
        <div className="lounge-panel relative overflow-hidden p-5 sm:p-6">
          <div className="relative -mx-5 -mt-5 mb-5 sm:-mx-6 sm:-mt-6 aspect-[16/9] overflow-hidden">
            <img
              src="/images/ai-coach-practice.png"
              alt="Lingora English AI Speaking Practice"
              className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
            <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-background/85 px-3 py-1 text-[11px] font-semibold text-foreground backdrop-blur-md ring-1 ring-border">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span>1-on-1 AI Coach</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-brass/15 text-brass-soft">
              <Mic className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("app.home.liveSession")}</p>
              <p className="text-xs text-muted-foreground">{t("app.home.liveSessionSub")}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {CONVERSATION_KEYS.map((line, i) => (
              <div
                key={i}
                className={
                  line.who === "coach"
                    ? "rounded-2xl bg-surface-2 p-3 text-xs sm:text-sm text-mist ring-1 ring-border"
                    : line.who === "you"
                      ? "ml-6 rounded-2xl bg-plum/25 p-3 text-xs sm:text-sm text-foreground ring-1 ring-border"
                      : "ml-6 rounded-2xl bg-brass/12 p-3 text-xs sm:text-sm text-brass-soft ring-1 ring-brass/25"
                }
              >
                <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {line.who === "coach" ? t("app.home.chat.coach") : line.who === "you" ? t("app.home.chat.you") : t("app.home.chat.corrected")}
                </p>
                {t(line.key)}
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
            {[
              { label: "Fluency", value: "7.0" },
              { label: "Grammar", value: "7.2" },
              { label: "Pronunciation", value: "78%" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-2 p-2.5 ring-1 ring-border">
                <p className="font-display text-lg text-brass-soft">{s.value}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t("app.home.exampleSession")}
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mt-20">
        <h2 className="font-display text-2xl text-foreground sm:text-3xl">{t("app.home.features.title")}</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.titleKey}
              to={f.to}
              className="lounge-panel group flex flex-col overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1.5 hover:ring-brass/35"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-2">
                <img
                  src={f.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent" />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs font-semibold backdrop-blur-md ring-1 ring-border">
                  <f.icon className="size-3.5 text-brass" />
                  <span className="text-foreground">{t(f.titleKey)}</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-lg text-foreground transition-colors group-hover:text-brass-soft">
                  {t(f.titleKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground flex-1">
                  {t(f.bodyKey)}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-brass-soft">
                  <span>{t("app.home.features.explore")}</span>
                  <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20">
        <h2 className="font-display text-2xl text-foreground sm:text-3xl">{t("app.home.how.title")}</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEP_KEYS.map((stepKey, i) => (
            <li key={stepKey} className="lounge-panel flex items-center gap-4 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brass/15 font-display text-sm text-brass-soft">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-foreground">{t(stepKey)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Progress */}
      <section className="mt-20 grid gap-4 sm:grid-cols-2">
        <div className="lounge-panel p-6">
          <BarChart3 className="size-5 text-brass" />
          <h2 className="mt-4 font-display text-xl text-foreground">{t("app.home.progress.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("app.home.progress.body")}
          </p>
          <Link
            to="/progress"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
          >
            {t("app.home.progress.link")}
          </Link>
        </div>
        <div className="lounge-panel p-6">
          <Globe className="size-5 text-brass" />
          <h2 className="mt-4 font-display text-xl text-foreground">{t("home.global.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("app.home.global.body")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLocale(l.code)}
                lang={l.code}
                dir={l.dir}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-3 hover:text-brass-soft"
              >
                <span aria-hidden className="me-1.5">
                  {l.flag}
                </span>
                {l.native}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-20 rounded-3xl bg-plum/20 p-8 text-center ring-1 ring-border sm:p-12">
        <h2 className="font-display text-2xl text-foreground sm:text-3xl">{t("app.home.cta.title")}</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
          {t("app.home.cta.body")}
        </p>
        <Link
          to="/ai-speaking"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-brass px-6 py-3.5 text-sm font-semibold text-plum-deep shadow-brass transition-transform hover:-translate-y-0.5"
        >
          <Mic className="size-4" />
          {t("app.home.cta.button")}
        </Link>
      </section>
    </AppShell>
  );
}
