import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Globe, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { completeOnboarding } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, useI18n, type LocaleCode } from "@/lib/i18n";
import { en, type TranslationKey } from "@/locales/en";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: `${en["onboarding.title"]} — ${en["brand.name"]}` },
      { name: "description", content: en["onboarding.sub"] },
      { property: "og:title", content: `${en["onboarding.title"]} — ${en["brand.name"]}` },
      { property: "og:description", content: en["onboarding.sub"] },
    ],
  }),
  component: OnboardingPage,
});

const LEVELS: { value: string; key: TranslationKey }[] = [
  { value: "A1", key: "level.A1" },
  { value: "A2", key: "level.A2" },
  { value: "B1", key: "level.B1" },
  { value: "B2", key: "level.B2" },
  { value: "C1", key: "level.C1" },
  { value: "C2", key: "level.C2" },
];

const GOALS: { value: string; key: TranslationKey }[] = [
  { value: "confidence", key: "goal.confidence" },
  { value: "pronunciation", key: "goal.pronunciation" },
  { value: "work", key: "goal.work" },
  { value: "travel", key: "goal.travel" },
  { value: "ielts", key: "goal.ielts" },
  { value: "toeic", key: "goal.toeic" },
  { value: "study", key: "goal.study" },
  { value: "daily", key: "goal.daily" },
  { value: "business", key: "goal.business" },
  { value: "interview", key: "goal.interview" },
];

const MINUTES = [5, 10, 15, 30, 60];
const TOTAL_STEPS = 4;

function OptionButton({
  selected,
  onClick,
  children,
  lang,
  dir,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  lang?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      lang={lang}
      dir={dir}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-start text-sm font-medium ring-1 transition-colors",
        selected
          ? "bg-brass/15 text-brass-soft ring-brass/50"
          : "bg-surface-2 text-foreground ring-border hover:bg-surface-3",
      )}
    >
      <span>{children}</span>
      {selected && <Check className="size-4 shrink-0" />}
    </button>
  );
}

function OnboardingPage() {
  const { t, locale, setLocale, language } = useI18n();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const completeOnboardingFn = useServerFn(completeOnboarding);

  const [step, setStep] = useState(1);
  const [native, setNative] = useState<string>(language.english);
  const [level, setLevel] = useState("A2");
  const [target, setTarget] = useState("B2");
  const [goal, setGoal] = useState("confidence");
  const [minutes, setMinutes] = useState(10);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      window.localStorage.setItem(
        "lily.onboarding",
        JSON.stringify({ locale, native, level, target, goal, minutes }),
      );
      if (user) {
        await completeOnboardingFn({
          data: {
            interfaceLanguage: locale,
            nativeLanguage: native,
            englishLevel: level as "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
            targetLevel: target as "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
            learningGoal: goal,
            dailyGoalMinutes: minutes,
          },
        });
        await refreshProfile();
      }
      toast.success(t("onboarding.done"));
      await navigate({ to: user ? "/ai-speaking" : "/auth" });
    } catch {
      toast.error(t("common.somethingWrong"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 text-brass-soft">
          <Sparkles className="size-4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
            {t("onboarding.step", { current: step, total: TOTAL_STEPS })}
          </span>
        </div>
        <h1 className="mt-4 font-display text-3xl text-foreground sm:text-4xl">{t("onboarding.title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("onboarding.sub")}</p>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brass transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <div className="lounge-panel mt-8 p-5 sm:p-7">
          {step === 1 && (
            <>
              <h2 className="flex items-center gap-2 font-display text-lg text-foreground">
                <Globe className="size-4 text-brass" />
                {t("onboarding.q.language")}
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">{t("lang.note")}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {LANGUAGES.map((l) => (
                  <OptionButton
                    key={l.code}
                    selected={l.code === locale}
                    onClick={() => setLocale(l.code as LocaleCode)}
                    lang={l.code}
                    dir={l.dir}
                  >
                    <span aria-hidden className="me-2">
                      {l.flag}
                    </span>
                    {l.native}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.native")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {LANGUAGES.map((l) => (
                  <OptionButton
                    key={l.code}
                    selected={native === l.english}
                    onClick={() => setNative(l.english)}
                    lang={l.code}
                    dir={l.dir}
                  >
                    {l.native}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.level")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {LEVELS.map((l) => (
                  <OptionButton key={l.value} selected={level === l.value} onClick={() => setLevel(l.value)}>
                    {t(l.key)}
                  </OptionButton>
                ))}
              </div>
              <h3 className="mt-7 font-display text-base text-foreground">{t("account.targetLevel")}</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {LEVELS.map((l) => (
                  <OptionButton key={l.value} selected={target === l.value} onClick={() => setTarget(l.value)}>
                    {t(l.key)}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.goal")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {GOALS.map((g) => (
                  <OptionButton key={g.value} selected={goal === g.value} onClick={() => setGoal(g.value)}>
                    {t(g.key)}
                  </OptionButton>
                ))}
              </div>
              <h3 className="mt-7 font-display text-base text-foreground">{t("onboarding.q.minutes")}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutes(m)}
                    aria-pressed={minutes === m}
                    className={cn(
                      "rounded-full px-4 py-2.5 text-sm font-semibold ring-1 transition-colors",
                      minutes === m
                        ? "bg-brass text-background ring-brass"
                        : "bg-surface-2 text-foreground ring-border hover:bg-surface-3",
                    )}
                  >
                    {t("common.minutes", { count: m })}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => (step === 1 ? void navigate({ to: "/" }) : setStep((s) => s - 1))}
            className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-3 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
            {t("common.back")}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void navigate({ to: "/ai-speaking" })}
              className="rounded-full px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t("common.skip")}
            </button>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-2 rounded-full bg-brass px-5 py-3 text-sm font-semibold text-background shadow-brass"
              >
                {t("common.next")}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void finish()}
                className="inline-flex items-center gap-2 rounded-full bg-brass px-5 py-3 text-sm font-semibold text-background shadow-brass disabled:opacity-60"
              >
                {saving ? t("common.loading") : t("common.finish")}
                <Check className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
