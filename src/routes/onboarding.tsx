import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Loader2, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Spotlights } from "@/components/lily/brand";
import { completeOnboarding, skipOnboarding } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { postAuthNavigation, savePendingSurvey, type SurveyAnswers } from "@/lib/onboarding-flow";
import { getOnboardingOptions, type OnboardingQuestionKey } from "@/lib/onboarding.functions";
import { cn } from "@/lib/utils";
import { en } from "@/locales/en";
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

const POPULAR_LANG_CODES = ["en", "vi", "es", "ko", "ja", "zh-CN", "fr", "de", "id", "ru", "pt", "th"];

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
  const { locale, setLocale, languages, t } = useI18n();
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
  const [instructionLanguage, setInstructionLanguage] = useState<string>(locale);
  const [hasManuallyPickedLang, setHasManuallyPickedLang] = useState(false);
  const [searchLangQuery, setSearchLangQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasManuallyPickedLang && locale) {
      setInstructionLanguage(locale);
    }
  }, [locale, hasManuallyPickedLang]);

  useEffect(() => {
    void getOptionsFn({ data: undefined as never })
      .then((res) => {
        setOptions(res);
        setGoal((g) => g || res.goal[0]?.value || "");
        setMinutes((m) => m || res.minutes[0]?.value || "");
        setLevel((l) => l || res.level[0]?.value || "");
      })
      .catch(() => toast.error(t("common.somethingWrong")));
  }, [getOptionsFn, t]);

  const label = (o: Option) => (locale === "vi" ? o.label_vi || o.label_en : o.label_en);

  const toggleFocusArea = (value: string) => {
    setFocusAreas((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const filteredLanguages = useMemo(() => {
    const q = searchLangQuery.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.native.toLowerCase().includes(q) ||
        l.english.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [searchLangQuery, languages]);

  const selectedLangMeta = useMemo(() => {
    return (
      languages.find((l) => l.code === instructionLanguage) ?? {
        code: instructionLanguage,
        native: instructionLanguage.toUpperCase(),
        english: instructionLanguage,
        flag: "🌐",
        dir: "ltr" as const,
        intl: instructionLanguage,
      }
    );
  }, [languages, instructionLanguage]);

  const canNext = () => {
    if (step === 1) return !!goal;
    if (step === 3) return !!minutes;
    if (step === 4) return !!level;
    if (step === 5) return !!instructionLanguage;
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
      setLocale(instructionLanguage);
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
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg text-foreground">
                  {t("onboarding.q.instructionLanguage")}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("lang.note")}
                </p>
              </div>

              {/* Selected Language Card */}
              <div className="flex items-center justify-between rounded-2xl bg-brass/15 p-4 ring-1 ring-brass/40">
                <div className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{selectedLangMeta.flag}</span>
                  <div>
                    <p className="text-sm font-semibold text-brass-soft">
                      {selectedLangMeta.native}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedLangMeta.english}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-brass/20 px-2.5 py-1 text-xs font-medium text-brass-soft">
                  <Check className="size-3.5" />
                  <span>Selected</span>
                </div>
              </div>

              {/* Quick-select chips */}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Popular languages:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_LANG_CODES.map((code) => {
                    const l = languages.find((item) => item.code === code);
                    if (!l) return null;
                    const isSel = instructionLanguage === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setInstructionLanguage(l.code);
                          setHasManuallyPickedLang(true);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ring-1 transition-all",
                          isSel
                            ? "bg-brass/20 text-brass-soft ring-brass/50 shadow-sm"
                            : "bg-surface-2 text-foreground ring-border hover:bg-surface-3",
                        )}
                      >
                        <span>{l.flag}</span>
                        <span>{l.native}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search & Full 54 Languages Section */}
              <div className="space-y-2.5 rounded-2xl border border-border bg-surface-2/60 p-3">
                <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-border focus-within:ring-brass/50">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchLangQuery}
                    onChange={(e) => setSearchLangQuery(e.target.value)}
                    placeholder="Search all 54 languages (e.g. Korean, 한국어, Français)..."
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {searchLangQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchLangQuery("")}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto pr-1 sm:max-h-64">
                  {filteredLanguages.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No matching language found.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {filteredLanguages.map((l) => {
                        const isSel = instructionLanguage === l.code;
                        return (
                          <button
                            key={l.code}
                            type="button"
                            onClick={() => {
                              setInstructionLanguage(l.code);
                              setHasManuallyPickedLang(true);
                            }}
                            className={cn(
                              "flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-start text-xs font-medium ring-1 transition-colors",
                              isSel
                                ? "bg-brass/15 font-semibold text-brass-soft ring-brass/50"
                                : "bg-surface text-foreground ring-border/70 hover:bg-surface-2",
                            )}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="shrink-0 text-base leading-none">{l.flag}</span>
                              <span className="truncate">{l.native}</span>
                              <span className="truncate text-[10px] text-muted-foreground">({l.english})</span>
                            </span>
                            {isSel && <Check className="size-3.5 shrink-0 text-brass-soft" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
