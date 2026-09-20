/**
 * Public read side of the onboarding survey — options admins configured in
 * the "Onboarding" admin tab (onboarding-admin.functions.ts). No auth
 * required: the onboarding page can render before a visitor has signed in.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { withAnon } from "@/db";
import { onboardingOptions } from "@/db/schema/schema";

export const ONBOARDING_QUESTION_KEYS = ["goal", "focus_areas", "minutes", "level", "instruction_language"] as const;
export type OnboardingQuestionKey = (typeof ONBOARDING_QUESTION_KEYS)[number];

export const getOnboardingOptions = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await withAnon((db) =>
    db
      .select({
        questionKey: onboardingOptions.questionKey,
        optionValue: onboardingOptions.optionValue,
        labelEn: onboardingOptions.labelEn,
        labelVi: onboardingOptions.labelVi,
      })
      .from(onboardingOptions)
      .where(and(eq(onboardingOptions.isActive, true)))
      .orderBy(asc(onboardingOptions.questionKey), asc(onboardingOptions.sortOrder)),
  );

  const byQuestion: Record<OnboardingQuestionKey, { value: string; label_en: string; label_vi: string }[]> = {
    goal: [],
    focus_areas: [],
    minutes: [],
    level: [],
    instruction_language: [],
  };
  for (const r of rows) {
    const key = r.questionKey as OnboardingQuestionKey;
    if (byQuestion[key]) byQuestion[key].push({ value: r.optionValue, label_en: r.labelEn, label_vi: r.labelVi });
  }
  return byQuestion;
});
