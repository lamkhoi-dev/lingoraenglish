import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Spotlights } from "@/components/lily/brand";
import { completeOnboarding, skipOnboarding } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { postAuthNavigation, savePendingSurvey, type SurveyAnswers } from "@/lib/onboarding-flow";
import { getOnboardingOptions, type OnboardingQuestionKey } from "@/lib/onboarding.functions";
import { cn } from "@/lib/utils";
import { en, type TranslationKey } from "@/locales/en";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/onboarding")({
  // Where to go afterwards — set by OnboardingGate (page the learner was
  // heading to) and by /auth (plan picked on /pricing), so the survey never
  // costs them their place.
  validateSearch: z.object({
    next: z.string().optional(),
    plan: z.string().optional(),
    interval: z.enum(["month", "year"]).optional(),
  }),
  head: () => ({
    meta: [
      NOINDEX_META,
      { title: `${en["onboarding.title"]} — ${en["brand.name"]}` },
      { name: "description", content: en["onboarding.sub"] },
      { property: "og:title", content: `${en["onboarding.title"]} — ${en["brand.name"]}` },
      { property: "og:description", content: en["onboarding.sub"] },
    ],
  }),
  component: OnboardingPage,
});

type Option = { value: string; label_en: string; label_vi: string };
type OptionsByQuestion = Record<OnboardingQuestionKey, Option[]>;

const TOTAL_STEPS = 5;

/** The survey is English-only on purpose: it has no header (so no language
 * switcher) and it is the one screen every new learner must get through, so it
 * must not depend on whatever interface language they happened to land in.
 * Question 5 is where they choose the language for instructions afterwards. */
function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return en[key].replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars?.[name] ?? ""));
}

/** Deliberately not AppShell: the survey is a focused 5-step flow, so no site
 * header, footer or banners — just the brand background and the steps. */
function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background spotlight">
      <Spotlights />
      <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-10 sm:px-8">
        {children}
      </main>
    </div>
  );
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
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

/**
 * Redesigned 2026-09-18 to the customer's 5-question survey (was 4 steps:
 * interface language / native language / CEFR level+target / goal+minutes).
 * Interface language is dropped here — it's already selectable from the
 * header/footer LanguageSelector and from /account. Question text and the
 * options themselves come from getOnboardingOptions (admin-editable in
 * /admin's "Onboarding" tab), not hard-coded, so the customer's next round
 * of survey-question changes doesn't need a code deploy.
 *
 * Two entry points, one page: a visitor with no account answers it BEFORE
 * signing up (answers are parked in onboarding-flow.ts, then sent to /auth);
 * a signed-in learner who hasn't done it yet — e.g. a first Google sign-in,
 * which has no survey step of its own — is sent here by OnboardingGate and the
 * answers are saved straight to their profile.
 */
function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { next, plan, interval } = Route.useSearch();
  const getOptionsFn = useServerFn(getOnboardingOptions);
  const completeOnboardingFn = useServerFn(completeOnboarding);
  const skipOnboardingFn = useServerFn(skipOnboarding);
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<OptionsByQuestion | null>(null);
  const [goal, setGoal] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [minutes, setMinutes] = useState("");
  const [level, setLevel] = useState("");
  const [instructionLanguage, setInstructionLanguage] = useState<"en" | "vi">("en");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getOptionsFn({ data: undefined as never })
      .then((res) => {
        setOptions(res);
        setGoal((g) => g || res.goal[0]?.value || "");
        setMinutes((m) => m || res.minutes[0]?.value || "");
        setLevel((l) => l || res.level[0]?.value || "");
      })
      .catch(() => toast.error(t("common.somethingWrong")));
  }, [getOptionsFn]);

  const label = (o: Option) => o.label_en;

  const toggleFocusArea = (value: string) => {
    setFocusAreas((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const canNext = () => {
    if (step === 1) return !!goal;
    if (step === 3) return !!minutes;
    if (step === 4) return !!level;
    return true;
  };

  // Not signed in yet → on to the sign-up form (survey comes first, account
  // second); signed in → on to wherever the learner was heading.
  const afterSurvey = () =>
    user
      ? navigate(postAuthNavigation({ next, plan, interval }, "/ai-speaking") as never)
      : navigate({ to: "/auth", search: { mode: "signup", next, plan, interval } as never });

  const finish = async () => {
    setSaving(true);
    try {
      const answers: SurveyAnswers = {
        goal,
        focusAreas,
        dailyGoalMinutes: Number(minutes) || 10,
        englishLevel: (level === "unsure" ? "B1" : level) as SurveyAnswers["englishLevel"],
        instructionLanguage,
      };
      if (user) {
        await completeOnboardingFn({ data: answers });
        await refreshProfile();
        toast.success(t("onboarding.done"));
      } else {
        savePendingSurvey({ answers });
      }
      await afterSurvey();
    } catch {
      toast.error(t("common.somethingWrong"));
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    try {
      if (user) {
        await skipOnboardingFn();
        await refreshProfile();
      } else {
        savePendingSurvey({ skipped: true });
      }
      await afterSurvey();
    } catch {
      toast.error(t("common.somethingWrong"));
    }
  };

  if (!options) {
    return (
      <OnboardingShell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-brass-soft" />
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
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
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.goal")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {options.goal.map((o) => (
                  <OptionButton key={o.value} selected={goal === o.value} onClick={() => setGoal(o.value)}>
                    {label(o)}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.focus")}</h2>
              <p className="mt-2 text-xs text-muted-foreground">{t("onboarding.q.focusHint")}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {options.focus_areas.map((o) => (
                  <OptionButton
                    key={o.value}
                    selected={focusAreas.includes(o.value)}
                    onClick={() => toggleFocusArea(o.value)}
                  >
                    {label(o)}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.minutes")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {options.minutes.map((o) => (
                  <OptionButton key={o.value} selected={minutes === o.value} onClick={() => setMinutes(o.value)}>
                    {label(o)}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.level")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {options.level.map((o) => (
                  <OptionButton key={o.value} selected={level === o.value} onClick={() => setLevel(o.value)}>
                    {label(o)}
                  </OptionButton>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="font-display text-lg text-foreground">{t("onboarding.q.instructionLanguage")}</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {options.instruction_language.map((o) => (
                  <OptionButton
                    key={o.value}
                    selected={instructionLanguage === o.value}
                    onClick={() => setInstructionLanguage(o.value as "en" | "vi")}
                  >
                    {label(o)}
                  </OptionButton>
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
              onClick={() => void skip()}
              className="rounded-full px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t("common.skip")}
            </button>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                disabled={!canNext()}
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-2 rounded-full bg-brass px-5 py-3 text-sm font-semibold text-background shadow-brass disabled:opacity-60"
              >
                {t("common.next")}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || !canNext()}
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
    </OnboardingShell>
  );
}
