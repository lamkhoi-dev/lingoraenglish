/**
 * Admin management for the Shadowing library.
 *
 * Everything here verifies the caller is an admin on the server first, so the
 * library can be grown or edited from the dashboard without code changes.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { shadowingSentences, shadowingTopics } from "@/db/schema/schema";
import { requireAdmin } from "@/lib/require-auth";

const LEVELS = ["beginner", "elementary", "intermediate", "advanced"] as const;
const VOICES = ["shimmer", "nova", "alloy", "coral", "sage"] as const;

const topicInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2).max(80),
  name: z.string().min(2).max(160),
  topic_group: z.string().min(2).max(120),
  blurb: z.string().max(400).default(""),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

const sentenceInput = z.object({
  id: z.string().uuid().optional(),
  topic_id: z.string().uuid(),
  sentence: z.string().min(2).max(600),
  natural_form: z.string().max(600).default(""),
  translation: z.string().max(600).default(""),
  subcategory: z.string().max(120).default(""),
  level: z.enum(LEVELS),
  difficulty: z.number().int().min(1).max(5).default(1),
  sentence_type: z.string().max(40).default("statement"),
  accent: z.string().max(40).default("american"),
  audio_url: z.string().max(600).default(""),
  pronunciation_focus: z.string().max(400).default(""),
  stress_focus: z.string().max(400).default(""),
  intonation_focus: z.string().max(400).default(""),
  connected_speech_focus: z.string().max(400).default(""),
  grammar_focus: z.string().max(400).default(""),
  is_free: z.boolean().default(false),
  sort_order: z.number().int().min(1).max(9999),
  status: z.enum(["published", "draft"]).default("published"),
});

/** Every topic with its sentence count, including deactivated ones. */
export const adminListShadowTopics = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [topics, counts] = await withAdmin((db) =>
      Promise.all([
        db
          .select({
            id: shadowingTopics.id,
            slug: shadowingTopics.slug,
            name: shadowingTopics.name,
            topicGroup: shadowingTopics.topicGroup,
            blurb: shadowingTopics.blurb,
            sortOrder: shadowingTopics.sortOrder,
            isActive: shadowingTopics.isActive,
          })
          .from(shadowingTopics)
          .orderBy(asc(shadowingTopics.topicGroup), asc(shadowingTopics.sortOrder)),
        db.select({ topicId: shadowingSentences.topicId, isFree: shadowingSentences.isFree, status: shadowingSentences.status }).from(shadowingSentences),
      ]),
    );

    const tally = new Map<string, { total: number; free: number }>();
    for (const row of counts) {
      if (row.status !== "published") continue;
      const t = tally.get(row.topicId) ?? { total: 0, free: 0 };
      t.total += 1;
      if (row.isFree) t.free += 1;
      tally.set(row.topicId, t);
    }

    return topics.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      topic_group: t.topicGroup,
      blurb: t.blurb,
      sort_order: t.sortOrder,
      is_active: t.isActive,
      total_sentences: tally.get(t.id)?.total ?? 0,
      free_sentences: tally.get(t.id)?.free ?? 0,
    }));
  });

export const adminSaveShadowTopic = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => topicInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const values = {
      slug: fields.slug,
      name: fields.name,
      topicGroup: fields.topic_group,
      blurb: fields.blurb,
      sortOrder: fields.sort_order,
      isActive: fields.is_active,
    };
    if (id) {
      await withAdmin((db) => db.update(shadowingTopics).set(values).where(eq(shadowingTopics.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) => db.insert(shadowingTopics).values(values).returning({ id: shadowingTopics.id }));
    return { id: rows[0]!.id };
  });

export const adminSetShadowTopicActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) => db.update(shadowingTopics).set({ isActive: data.is_active }).where(eq(shadowingTopics.id, data.id)));
    return { ok: true };
  });

/** All sentences of one topic, in practice order. */
export const adminListShadowSentences = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ topic_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const rows = await withAdmin((db) =>
      db
        .select({
          id: shadowingSentences.id,
          sortOrder: shadowingSentences.sortOrder,
          level: shadowingSentences.level,
          difficulty: shadowingSentences.difficulty,
          sentenceType: shadowingSentences.sentenceType,
          sentence: shadowingSentences.sentence,
          naturalForm: shadowingSentences.naturalForm,
          translation: shadowingSentences.translation,
          accent: shadowingSentences.accent,
          audioUrl: shadowingSentences.audioUrl,
          isFree: shadowingSentences.isFree,
          status: shadowingSentences.status,
          subcategory: shadowingSentences.subcategory,
          dialogueId: shadowingSentences.dialogueId,
          turnNumber: shadowingSentences.turnNumber,
          speakerLabel: shadowingSentences.speakerLabel,
          speakerVoice: shadowingSentences.speakerVoice,
        })
        .from(shadowingSentences)
        .where(eq(shadowingSentences.topicId, data.topic_id))
        .orderBy(asc(shadowingSentences.sortOrder)),
    );
    return rows.map((r) => ({
      id: r.id,
      sort_order: r.sortOrder,
      level: r.level,
      difficulty: r.difficulty,
      sentence_type: r.sentenceType,
      sentence: r.sentence,
      natural_form: r.naturalForm,
      translation: r.translation,
      accent: r.accent,
      audio_url: r.audioUrl,
      is_free: r.isFree,
      status: r.status,
      subcategory: r.subcategory,
      dialogue_id: r.dialogueId,
      turn_number: r.turnNumber,
      speaker_label: r.speakerLabel,
      speaker_voice: r.speakerVoice,
    }));
  });

export const adminSaveShadowSentence = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => sentenceInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const values = {
      topicId: fields.topic_id,
      sentence: fields.sentence,
      naturalForm: fields.natural_form,
      translation: fields.translation,
      subcategory: fields.subcategory,
      level: fields.level,
      difficulty: fields.difficulty,
      sentenceType: fields.sentence_type,
      accent: fields.accent,
      audioUrl: fields.audio_url,
      pronunciationFocus: fields.pronunciation_focus,
      stressFocus: fields.stress_focus,
      intonationFocus: fields.intonation_focus,
      connectedSpeechFocus: fields.connected_speech_focus,
      grammarFocus: fields.grammar_focus,
      isFree: fields.is_free,
      sortOrder: fields.sort_order,
      status: fields.status,
    };
    if (id) {
      await withAdmin((db) => db.update(shadowingSentences).set(values).where(eq(shadowingSentences.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) => db.insert(shadowingSentences).values(values).returning({ id: shadowingSentences.id }));
    return { id: rows[0]!.id };
  });

/** Quick edits from the list: order, difficulty level, free/premium, audio. */
export const adminUpdateShadowSentence = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        sort_order: z.number().int().min(1).max(9999).optional(),
        level: z.enum(LEVELS).optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        is_free: z.boolean().optional(),
        audio_url: z.string().max(600).optional(),
        sentence: z.string().min(2).max(600).optional(),
        status: z.enum(["published", "draft"]).optional(),
        speaker_label: z.string().max(80).optional(),
        speaker_voice: z.enum(VOICES).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { id, ...rest } = data;
    await withAdmin((db) =>
      db
        .update(shadowingSentences)
        .set({
          ...(rest.sort_order !== undefined && { sortOrder: rest.sort_order }),
          ...(rest.level !== undefined && { level: rest.level }),
          ...(rest.difficulty !== undefined && { difficulty: rest.difficulty }),
          ...(rest.is_free !== undefined && { isFree: rest.is_free }),
          ...(rest.audio_url !== undefined && { audioUrl: rest.audio_url }),
          ...(rest.sentence !== undefined && { sentence: rest.sentence }),
          ...(rest.status !== undefined && { status: rest.status }),
          ...(rest.speaker_label !== undefined && { speakerLabel: rest.speaker_label }),
          ...(rest.speaker_voice !== undefined && { speakerVoice: rest.speaker_voice }),
        })
        .where(eq(shadowingSentences.id, id)),
    );
    return { ok: true };
  });

/**
 * Saves a whole multi-turn dialogue in one go: every turn becomes its own
 * shadowing_sentences row (so all the existing per-line practice/progress/
 * free-premium machinery just works), sharing one fresh dialogue_id and
 * placed right after the topic's current last sentence.
 */
const dialogueTurnInput = z.object({
  speaker_label: z.string().min(1).max(80),
  speaker_voice: z.enum(VOICES),
  sentence: z.string().min(2).max(600),
  natural_form: z.string().max(600).default(""),
  translation: z.string().max(600).default(""),
  is_free: z.boolean().default(false),
});

const dialogueInput = z.object({
  topic_id: z.string().uuid(),
  level: z.enum(LEVELS),
  difficulty: z.number().int().min(1).max(5).default(1),
  subcategory: z.string().max(120).default(""),
  turns: z.array(dialogueTurnInput).min(2).max(12),
});

export const adminSaveShadowDialogue = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => dialogueInput.parse(d))
  .handler(async ({ data }) => {
    const dialogueId = crypto.randomUUID();
    await withAdmin(async (db) => {
      const maxRows = await db
        .select({ max: sql<number>`coalesce(max(${shadowingSentences.sortOrder}), 0)` })
        .from(shadowingSentences)
        .where(eq(shadowingSentences.topicId, data.topic_id));
      let nextSort = (maxRows[0]?.max ?? 0) + 1;
      for (let i = 0; i < data.turns.length; i += 1) {
        const turn = data.turns[i]!;
        await db.insert(shadowingSentences).values({
          topicId: data.topic_id,
          sentence: turn.sentence,
          naturalForm: turn.natural_form,
          translation: turn.translation,
          subcategory: data.subcategory,
          level: data.level,
          difficulty: data.difficulty,
          isFree: turn.is_free,
          sortOrder: nextSort,
          dialogueId,
          turnNumber: i + 1,
          speakerLabel: turn.speaker_label,
          speakerVoice: turn.speaker_voice,
        });
        nextSort += 1;
      }
    });
    return { dialogue_id: dialogueId, turns: data.turns.length };
  });

/** Marks the first N sentences of a topic free and the rest premium. */
export const adminSetShadowFreeCount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ topic_id: z.string().uuid(), free_count: z.number().int().min(0).max(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    await withAdmin(async (db) => {
      await db
        .update(shadowingSentences)
        .set({ isFree: true })
        .where(and(eq(shadowingSentences.topicId, data.topic_id), lte(shadowingSentences.sortOrder, data.free_count)));
      await db
        .update(shadowingSentences)
        .set({ isFree: false })
        .where(and(eq(shadowingSentences.topicId, data.topic_id), gt(shadowingSentences.sortOrder, data.free_count)));
    });
    return { ok: true };
  });
