/**
 * Admin management for the Speaking Tests library — IELTS Parts 1/2/3 plus
 * TOEFL and PTE (mục 4.3: edit the library without touching source).
 *
 * Same conventions as listening-admin.functions.ts: admin re-checked on the
 * server, soft status toggle instead of a hard delete, and is_free left out
 * because Yêu cầu 9 owns it.
 */
import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { speakingTests } from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";

const EXAMS = ["ielts", "toefl", "pte"] as const;
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

const testInput = z
  .object({
    id: z.string().uuid().optional(),
    exam: z.enum(EXAMS).default("ielts"),
    /** IELTS uses 1/2/3; TOEFL and PTE are single-part and stored as 0. */
    part: z.number().int().min(0).max(3),
    slug: z
      .string()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9-]+$/, "Slug is lowercase letters, numbers and hyphens only."),
    topic: z.string().min(2).max(200),
    difficulty: z.enum(DIFFICULTIES).default("Intermediate"),
    questions: z.array(z.string().min(1).max(600)).min(1).max(30),
    cue_card: z.string().max(1000).default(""),
    cue_points: z.array(z.string().min(1).max(300)).max(10).default([]),
    preparation_time: z.number().int().min(0).max(600).default(0),
    speaking_time: z.number().int().min(30).max(1800).default(300),
    test_number: z.number().int().min(0).max(999).default(0),
    task_type: z.string().max(60).default(""),
    task_label: z.string().max(120).default(""),
    instructions: z.string().max(1000).default(""),
    sort_order: z.number().int().min(0).max(9999),
    status: z.enum(["published", "draft"]).default("published"),
  })
  .refine((v) => (v.exam === "ielts" ? v.part >= 1 && v.part <= 3 : v.part === 0), {
    message: "IELTS tests are Part 1-3; TOEFL and PTE tests use part 0.",
    path: ["part"],
  })
  .refine((v) => (v.exam === "ielts" && v.part === 2 ? v.cue_card.trim().length > 0 : true), {
    message: "IELTS Part 2 needs a cue card — that is what the learner speaks from.",
    path: ["cue_card"],
  });

/** Every test plus a per-exam/part tally, so gaps against the required 30 per
 * part are visible in the editor itself. */
export const adminListSpeakingTests = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: speakingTests.id,
          exam: speakingTests.exam,
          part: speakingTests.part,
          slug: speakingTests.slug,
          topic: speakingTests.topic,
          difficulty: speakingTests.difficulty,
          questions: speakingTests.questions,
          cueCard: speakingTests.cueCard,
          cuePoints: speakingTests.cuePoints,
          preparationTime: speakingTests.preparationTime,
          speakingTime: speakingTests.speakingTime,
          testNumber: speakingTests.testNumber,
          taskType: speakingTests.taskType,
          taskLabel: speakingTests.taskLabel,
          instructions: speakingTests.instructions,
          isFree: speakingTests.isFree,
          sortOrder: speakingTests.sortOrder,
          status: speakingTests.status,
        })
        .from(speakingTests)
        .orderBy(asc(speakingTests.exam), asc(speakingTests.part), asc(speakingTests.sortOrder)),
    );

    const tally = new Map<string, { total: number; free: number }>();
    for (const r of rows) {
      const key = r.exam === "ielts" ? `ielts:${r.part}` : r.exam;
      const entry = tally.get(key) ?? { total: 0, free: 0 };
      entry.total += 1;
      if (r.isFree) entry.free += 1;
      tally.set(key, entry);
    }

    return {
      tests: rows.map((r) => ({
        id: r.id,
        exam: r.exam,
        part: r.part,
        slug: r.slug,
        topic: r.topic,
        difficulty: r.difficulty,
        questions: (r.questions as string[]) ?? [],
        cue_card: r.cueCard,
        cue_points: r.cuePoints ?? [],
        preparation_time: r.preparationTime,
        speaking_time: r.speakingTime,
        test_number: r.testNumber,
        task_type: r.taskType,
        task_label: r.taskLabel,
        instructions: r.instructions,
        is_free: r.isFree,
        sort_order: r.sortOrder,
        status: r.status,
      })),
      tally: Object.fromEntries(
        ["ielts:1", "ielts:2", "ielts:3", "toefl", "pte"].map((k) => [
          k,
          tally.get(k) ?? { total: 0, free: 0 },
        ]),
      ),
    };
  });

export const adminSaveSpeakingTest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => testInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    // is_free omitted on purpose — billing_plans.limits.speaking_tests_free_*
    // owns it and resyncContentFreeRanks() writes it (Yêu cầu 9).
    const values = {
      exam: fields.exam,
      part: fields.part,
      slug: fields.slug,
      topic: fields.topic,
      difficulty: fields.difficulty,
      questions: fields.questions,
      cueCard: fields.cue_card,
      cuePoints: fields.cue_points,
      preparationTime: fields.preparation_time,
      speakingTime: fields.speaking_time,
      testNumber: fields.test_number,
      taskType: fields.task_type,
      taskLabel: fields.task_label,
      instructions: fields.instructions,
      sortOrder: fields.sort_order,
      status: fields.status,
      updatedAt: new Date().toISOString(),
    };
    if (id) {
      await withAdmin((db) => db.update(speakingTests).set(values).where(eq(speakingTests.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) =>
      db.insert(speakingTests).values(values).returning({ id: speakingTests.id }),
    );
    return { id: rows[0]!.id };
  });

export const adminSetSpeakingTestStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["published", "draft"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db
        .update(speakingTests)
        .set({ status: data.status, updatedAt: new Date().toISOString() })
        .where(eq(speakingTests.id, data.id)),
    );
    return { ok: true };
  });
