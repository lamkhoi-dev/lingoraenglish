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
import { hreflangLinks } from "@/lib/seo";
import type { TranslationKey } from "@/locales/en";

const TITLE = "Lingora English — AI Speaking Coach: Speak, Get Corrected, Improve";
const DESCRIPTION =
  "Practise English speaking with your AI coach and get instant feedback on pronunciation, grammar, vocabulary, fluency and natural English. Shadowing, daily conversations and IELTS, TOEFL and PTE speaking practice.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: hreflangLinks("/"),
  }),
  component: HomePage,
});

const FEATURES: { to: string; icon: typeof Mic; titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { to: "/ai-speaking", icon: MessageCircle, titleKey: "app.home.features.coach.title", bodyKey: "app.home.features.coach.body" },
  { to: "/shadowing", icon: Headphones, titleKey: "app.home.features.shadowing.title", bodyKey: "app.home.features.shadowing.body" },
  { to: "/speaking-tests", icon: Target, titleKey: "app.home.features.tests.title", bodyKey: "app.home.features.tests.body" },
  { to: "/pronunciation", icon: Volume2, titleKey: "app.home.features.pron.title", bodyKey: "app.home.features.pron.body" },
  { to: "/listening-lab", icon: Headphones, titleKey: "app.home.features.listening.title", bodyKey: "app.home.features.listening.body" },
  { to: "/vocabulary", icon: BookOpen, titleKey: "app.home.features.vocab.title", bodyKey: "app.home.features.vocab.body" },
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

        {/* Visual: a live speaking correction */}
        <div className="lounge-panel p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-brass/15 text-brass-soft">
              <Mic className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("app.home.liveSession")}</p>
              <p className="text-xs text-muted-foreground">{t("app.home.liveSessionSub")}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {CONVERSATION_KEYS.map((line, i) => (
              <div
                key={i}
                className={
                  line.who === "coach"
                    ? "rounded-2xl bg-surface-2 p-3.5 text-sm text-mist ring-1 ring-border"
                    : line.who === "you"
                      ? "ml-6 rounded-2xl bg-plum/25 p-3.5 text-sm text-foreground ring-1 ring-border"
                      : "ml-6 rounded-2xl bg-brass/12 p-3.5 text-sm text-brass-soft ring-1 ring-brass/25"
                }
              >
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {line.who === "coach" ? t("app.home.chat.coach") : line.who === "you" ? t("app.home.chat.you") : t("app.home.chat.corrected")}
                </p>
                {t(line.key)}
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Fluency", value: "7.0" },
              { label: "Grammar", value: "7.2" },
              { label: "Pronunciation", value: "78%" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                <p className="font-display text-xl text-brass-soft">{s.value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</p>
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
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.titleKey} to={f.to} className="lounge-panel group p-5 transition-transform hover:-translate-y-1">
              <f.icon className="size-5 text-brass" />
              <h3 className="mt-4 font-display text-lg text-foreground">{t(f.titleKey)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.bodyKey)}</p>
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
