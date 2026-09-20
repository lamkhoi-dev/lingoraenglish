/**
 * Admin management for the onboarding survey's answer options — same
 * fixed-slot-with-editable-options pattern as pronunciation-admin.functions.ts
 * (8 fixed skills there, 5 fixed question_keys here). Admins can add/edit/
 * reorder/hide options within a question, not invent new questions (that
 * needs a code change to onboarding.tsx/completeOnboarding since each
 * question_key is wired to real app logic — see onboarding.functions.ts).
 */
import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { onboardingOptions } from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";

import { ONBOARDING_QUESTION_KEYS } from "./onboarding.functions";

const optionInput = z.object({
  id: z.string().uuid().optional(),
  question_key: z.enum(ONBOARDING_QUESTION_KEYS),
  option_value: z.string().min(1).max(40),
  label_en: z.string().min(1).max(160),
  label_vi: z.string().max(160).default(""),
  sort_order: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
});

export const adminListOnboardingOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: onboardingOptions.id,
          questionKey: onboardingOptions.questionKey,
          optionValue: onboardingOptions.optionValue,
          labelEn: onboardingOptions.labelEn,
          labelVi: onboardingOptions.labelVi,
          sortOrder: onboardingOptions.sortOrder,
          isActive: onboardingOptions.isActive,
        })
        .from(onboardingOptions)
        .orderBy(asc(onboardingOptions.questionKey), asc(onboardingOptions.sortOrder)),
    );
    return rows.map((r) => ({
      id: r.id,
      question_key: r.questionKey,
      option_value: r.optionValue,
      label_en: r.labelEn,
      label_vi: r.labelVi,
      sort_order: r.sortOrder,
      is_active: r.isActive,
    }));
  });

export const adminSaveOnboardingOption = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => optionInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const values = {
      questionKey: fields.question_key,
      optionValue: fields.option_value,
      labelEn: fields.label_en,
      labelVi: fields.label_vi,
      sortOrder: fields.sort_order,
      isActive: fields.is_active,
    };
    if (id) {
      await withAdmin((db) => db.update(onboardingOptions).set(values).where(eq(onboardingOptions.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) =>
      db.insert(onboardingOptions).values(values).returning({ id: onboardingOptions.id }),
    );
    return { id: rows[0]!.id };
  });

export const adminSetOnboardingOptionActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db.update(onboardingOptions).set({ isActive: data.is_active }).where(eq(onboardingOptions.id, data.id)),
    );
    return { ok: true };
  });
