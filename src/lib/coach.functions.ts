/**
 * AI Speaking Coach — topic library, sessions and server-enforced free turns.
 *
 * Everything that decides access lives here: the free-turn allowance is counted
 * from rows in `coach_turns`, so refreshing, switching topics, signing out or
 * editing frontend code cannot reset it.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { withAdmin, withAnon, withUser } from "@/db";
import { aiUsageLog, coachSessions, coachSettings, coachTopics, coachTurns } from "@/db/schema/schema";
import { getOptionalUserId, requireAdmin, requireAuth } from "@/lib/require-auth";
import { currentLlmModel, currentTextProvider, llmCompleteWhole, type ChatMessage } from "./ai-providers.server";
import { resolveTier, UpgradeRequiredError, type Tier } from "./entitlements.server";
import type { SpeakingAnalysis } from "./lily.functions";

export const COACH_CATEGORIES = ["free", "daily", "roleplay", "interview", "challenge"] as const;
export type CoachCategory = (typeof COACH_CATEGORIES)[number];

export type CoachTopicPublic = {
  id: string;
  category: string;
  slug: string;
  title: string;
  description: string;
  level: string;
  access_tier: string;
  ai_role: string;
  user_role: string;
  situation: string;
  objective: string;
  interview_type: string;
  challenge_prompt: string;
  vocabulary_focus: string;
  grammar_focus: string;
  time_limit_seconds: number;
  estimated_minutes: number;
  sort_order: number;
  unlocked: boolean;
};

export type CoachUsage = {
  tier: Tier;
  freeTurnLimit: number;
  freeTurnsUsed: number;
  turnsLeft: number | null;
  unlimited: boolean;
  monthlyLimit: number;
  monthlyUsed: number;
};

const DAILY_TURN_CAP = 400;

const topicCatalogueSchema = z.object({ category: z.string().max(30).optional() });

/**
 * Reads the coach_topics catalogue straight off the new self-hosted Postgres
 * via the same `coach_topic_catalogue()` SQL function the original Supabase
 * migrations defined (not reimplemented — called as-is so the `unlocked`
 * tier check stays identical). Anon callers get the free-tier-only view,
 * same as getVocabularyWords() in vocabulary.functions.ts.
 */
export const getCoachTopicCatalogue = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => topicCatalogueSchema.parse(d))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const query = (db: Parameters<Parameters<typeof withAnon>[0]>[0]) =>
      db.execute(sql`select * from coach_topic_catalogue(${data.category ?? null})`);
    const rows = userId ? await withUser(userId, query) : await withAnon(query);
    return rows as unknown as CoachTopicPublic[];
  });

async function settings() {
  const rows = await withAdmin((db) =>
    db
      .select({ freeTurnLimit: coachSettings.freeTurnLimit, premiumMonthlyTurns: coachSettings.premiumMonthlyTurns, proMonthlyTurns: coachSettings.proMonthlyTurns })
      .from(coachSettings)
      .where(eq(coachSettings.id, "default"))
      .limit(1),
  );
  const row = rows[0];
  return {
    freeTurnLimit: row?.freeTurnLimit ?? 4,
    premiumMonthlyTurns: row?.premiumMonthlyTurns ?? 0,
    proMonthlyTurns: row?.proMonthlyTurns ?? 0,
  };
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function countTurns(userId: string, extra: ReturnType<typeof eq>) {
  const rows = await withAdmin((db) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(coachTurns)
      .where(and(eq(coachTurns.userId, userId), extra)),
  );
  return rows[0]!.n;
}

/** Reads the learner's plan and how much of the speaking allowance is left. */
async function readUsage(userId: string): Promise<CoachUsage> {
  const [tier, cfg, freeUsed, monthUsed] = await Promise.all([
    resolveTier(userId),
    settings(),
    countTurns(userId, eq(coachTurns.countedFree, true)),
    countTurns(userId, gte(coachTurns.createdAt, monthStart())),
  ]);

  const monthlyLimit =
    tier === "ielts_pro" ? cfg.proMonthlyTurns : tier === "premium" ? cfg.premiumMonthlyTurns : 0;

  if (tier === "free") {
    return {
      tier,
      freeTurnLimit: cfg.freeTurnLimit,
      freeTurnsUsed: freeUsed,
      turnsLeft: Math.max(0, cfg.freeTurnLimit - freeUsed),
      unlimited: false,
      monthlyLimit: 0,
      monthlyUsed: monthUsed,
    };
  }

  return {
    tier,
    freeTurnLimit: cfg.freeTurnLimit,
    freeTurnsUsed: freeUsed,
    turnsLeft: monthlyLimit > 0 ? Math.max(0, monthlyLimit - monthUsed) : null,
    unlimited: monthlyLimit <= 0,
    monthlyLimit,
    monthlyUsed: monthUsed,
  };
}

function assertTurnAvailable(usage: CoachUsage) {
  if (usage.tier === "free" && usage.freeTurnsUsed >= usage.freeTurnLimit) {
    throw new UpgradeRequiredError(
      "conversation",
      usage.tier,
      `You have used your ${usage.freeTurnLimit} free speaking turns with the AI coach. Upgrade to Premium to keep the conversation going — every topic, every category, unlimited turns.`,
    );
  }
  if (usage.tier !== "free" && !usage.unlimited && (usage.turnsLeft ?? 0) <= 0) {
    throw new UpgradeRequiredError(
      "conversation",
      usage.tier,
      `You have used your speaking turns for this month (${usage.monthlyUsed}/${usage.monthlyLimit}). Upgrade your plan or come back next month.`,
    );
  }
}

async function assertDailyCap(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = await countTurns(userId, gte(coachTurns.createdAt, since));
  if (count >= DAILY_TURN_CAP) {
    throw new Error("You have reached today's practice limit. Come back tomorrow — Lingora English will be here!");
  }
}

const LEVEL_STYLE: Record<string, string> = {
  A1: "Use very simple words and short sentences. Ask one very short question. Speak slowly and warmly. Correct only what blocks understanding.",
  A2: "Use simple everyday words and short sentences. One clear question. Gentle, encouraging corrections.",
  B1: "Speak naturally but clearly. Ask normal follow-up questions and invite a few details.",
  B2: "Speak like a fluent friend. Use varied vocabulary and ask questions that need explanation and opinion.",
  C1: "Speak like an educated native speaker. Explore abstract ideas, nuance, and challenge their opinions politely.",
};

type TopicRow = {
  category: string;
  title: string;
  description: string;
  level: string;
  ai_role: string;
  user_role: string;
  situation: string;
  objective: string;
  opening_message: string;
  instructions: string;
  follow_up_directions: string[];
  vocabulary_focus: string;
  grammar_focus: string;
  interview_type: string;
  challenge_prompt: string;
  evaluation_criteria: string;
  time_limit_seconds: number;
};

function systemPrompt(topic: TopicRow, level: string) {
  const style = LEVEL_STYLE[level.toUpperCase()] ?? LEVEL_STYLE["B1"];
  const mode: Record<string, string> = {
    free: "This is open conversation practice. Be a curious, friendly conversation partner.",
    daily: `This is a realistic everyday situation. Play ${topic.ai_role || "the other person"} for real; the learner is ${topic.user_role || "themselves"}. Stay in the situation — it is an interaction, not a quiz.`,
    roleplay: `This is a role-play. You are ${topic.ai_role || "the other character"}; the learner is ${topic.user_role || "the main character"}. Stay in character the whole time and improvise naturally if they surprise you.`,
    interview: `This is interview practice (${topic.interview_type || "job interview"}). You are the interviewer: ${topic.ai_role}. Ask one question at a time, probe their actual answer, and vary the order of questions. Professional but friendly.`,
    challenge: `This is a speaking challenge. Task: ${topic.challenge_prompt}. After each attempt, praise one specific strength, name one fixable issue, then invite a retry or a harder variation. ${topic.evaluation_criteria}`,
  };

  return `You are Lingora English, a warm, natural English-speaking coach talking with a ${level} learner.

TOPIC: ${topic.title}${topic.description ? ` — ${topic.description}` : ""}
${topic.situation ? `SITUATION: ${topic.situation}` : ""}
${topic.objective ? `GOAL: ${topic.objective}` : ""}
MODE: ${mode[topic.category] ?? mode["free"]}
${topic.instructions ? `COACH NOTES: ${topic.instructions}` : ""}
${topic.follow_up_directions?.length ? `POSSIBLE DIRECTIONS: ${topic.follow_up_directions.join("; ")}` : ""}
${topic.vocabulary_focus ? `USEFUL LANGUAGE: ${topic.vocabulary_focus}` : ""}
${topic.grammar_focus ? `STRUCTURE TO ENCOURAGE: ${topic.grammar_focus}` : ""}

HOW YOU TALK
- Listen, react to what they actually said, then ask ONE relevant question.
- Normally 1-3 sentences, roughly 15-45 words. Shorter when short is right.
- Mention a concrete detail from their answer instead of generic filler.
- Never repeat a question you already asked. Move the conversation forward.
- The learner should do most of the talking.
- If they make an important mistake, give one short natural correction and carry straight on. Never more than one per turn.
- Never teach vocabulary or grammar every turn, and never write long explanations.
- Remember earlier turns and refer back naturally.

STYLE: ${style}
Spoken English only — no bullet points, headings, emoji or stage directions. Always finish your final sentence.`;
}

/* --------------------------------- reads ---------------------------------- */

export const getCoachUsage = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => readUsage(context.userId));

/** Only safe, learner-facing fields leave the server. */
function toPublicTopic(topic: typeof coachTopics.$inferSelect): CoachTopicPublic {
  return {
    id: topic.id,
    category: topic.category,
    slug: topic.slug,
    title: topic.title,
    description: topic.description,
    level: topic.level,
    access_tier: topic.accessTier,
    ai_role: topic.aiRole,
    user_role: topic.userRole,
    situation: topic.situation,
    objective: topic.objective,
    interview_type: topic.interviewType,
    challenge_prompt: topic.challengePrompt,
    vocabulary_focus: topic.vocabularyFocus,
    grammar_focus: topic.grammarFocus,
    time_limit_seconds: topic.timeLimitSeconds,
    estimated_minutes: topic.estimatedMinutes,
    sort_order: topic.sortOrder,
    unlocked: true,
  };
}

/**
 * Reloads an existing session's topic + turn history, so refreshing the page
 * (or coming back later) never loses a conversation that's already in
 * progress — the transcript is always durable in `coach_turns`, this just
 * exposes it back to the client that started it.
 */
export const getCoachSession = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sessionRows = await withAdmin((db) =>
      db
        .select({ id: coachSessions.id, userId: coachSessions.userId, topicId: coachSessions.topicId })
        .from(coachSessions)
        .where(eq(coachSessions.id, data.sessionId))
        .limit(1),
    );
    const session = sessionRows[0];
    if (!session || session.userId !== context.userId) throw new Error("Session not found.");

    const topicRows = await withAdmin((db) =>
      db.select().from(coachTopics).where(eq(coachTopics.id, session.topicId ?? "")).limit(1),
    );
    const topic = topicRows[0];
    if (!topic) throw new Error("That topic is no longer available.");

    const turnRows = await withAdmin((db) =>
      db
        .select({
          turnNumber: coachTurns.turnNumber,
          userText: coachTurns.userText,
          coachText: coachTurns.coachText,
          analysis: coachTurns.analysis,
        })
        .from(coachTurns)
        .where(eq(coachTurns.sessionId, session.id))
        .orderBy(asc(coachTurns.turnNumber)),
    );

    const turns: { role: "coach" | "you"; text: string; analysis?: SpeakingAnalysis }[] = [];
    for (const row of turnRows) {
      if (row.turnNumber === 0) {
        if (row.coachText) turns.push({ role: "coach", text: row.coachText });
        continue;
      }
      if (!row.coachText) continue; // reserved but never completed (e.g. the AI call failed) — nothing to show
      if (row.userText) {
        const analysis = (row.analysis as SpeakingAnalysis | null) ?? undefined;
        turns.push(analysis ? { role: "you", text: row.userText, analysis } : { role: "you", text: row.userText });
      }
      turns.push({ role: "coach", text: row.coachText });
    }

    return { sessionId: session.id, topic: toPublicTopic(topic), turns };
  });

/* ------------------------------- session start ---------------------------- */

export const startCoachSession = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        topicId: z.string().uuid(),
        level: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const topicRows = await withAdmin((db) =>
      db.select().from(coachTopics).where(and(eq(coachTopics.id, data.topicId), eq(coachTopics.isActive, true))).limit(1),
    );
    const topic = topicRows[0];
    if (!topic) throw new Error("That topic is not available.");

    const usage = await readUsage(context.userId);

    // Every topic is open to everyone (Yêu cầu 1) — access is governed purely
    // by the shared free-turn allowance below, never by a per-topic tier.
    assertTurnAvailable(usage);
    await assertDailyCap(context.userId);

    const level = data.level ?? topic.level;
    const sessionRows = await withAdmin((db) =>
      db
        .insert(coachSessions)
        .values({
          userId: context.userId,
          topicId: topic.id,
          category: topic.category,
          topicTitle: topic.title,
          level,
          tierAtStart: usage.tier,
        })
        .returning({ id: coachSessions.id }),
    );
    const session = sessionRows[0]!;

    // The coach always speaks first — the learner never has to open the conversation.
    const opening = topic.openingMessage.trim();
    await withAdmin((db) =>
      db.insert(coachTurns).values({
        sessionId: session.id,
        userId: context.userId,
        turnNumber: 0,
        userText: "",
        coachText: opening,
        countedFree: false,
      }),
    );

    return { sessionId: session.id, reply: opening, usage, level, topic: toPublicTopic(topic) };
  });

/* -------------------------------- coach reply ----------------------------- */

export const coachReply = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionId: z.string().uuid(), transcript: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sessionRows = await withAdmin((db) =>
      db
        .select({ id: coachSessions.id, userId: coachSessions.userId, topicId: coachSessions.topicId, level: coachSessions.level })
        .from(coachSessions)
        .where(eq(coachSessions.id, data.sessionId))
        .limit(1),
    );
    const session = sessionRows[0];
    if (!session || session.userId !== context.userId) throw new Error("Session not found.");

    const usage = await readUsage(context.userId);
    assertTurnAvailable(usage);
    await assertDailyCap(context.userId);

    const topicRows = await withAdmin((db) =>
      db.select().from(coachTopics).where(eq(coachTopics.id, session.topicId ?? "")).limit(1),
    );
    const topic = topicRows[0];
    if (!topic) throw new Error("That topic is no longer available.");

    const history = await withAdmin((db) =>
      db
        .select({ turnNumber: coachTurns.turnNumber, userText: coachTurns.userText, coachText: coachTurns.coachText })
        .from(coachTurns)
        .where(eq(coachTurns.sessionId, session.id))
        .orderBy(asc(coachTurns.turnNumber))
        .limit(30),
    );

    const topicForPrompt: TopicRow = {
      category: topic.category,
      title: topic.title,
      description: topic.description,
      level: topic.level,
      ai_role: topic.aiRole,
      user_role: topic.userRole,
      situation: topic.situation,
      objective: topic.objective,
      opening_message: topic.openingMessage,
      instructions: topic.instructions,
      follow_up_directions: topic.followUpDirections,
      vocabulary_focus: topic.vocabularyFocus,
      grammar_focus: topic.grammarFocus,
      interview_type: topic.interviewType,
      challenge_prompt: topic.challengePrompt,
      evaluation_criteria: topic.evaluationCriteria,
      time_limit_seconds: topic.timeLimitSeconds,
    };

    const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(topicForPrompt, session.level) }];
    for (const row of history) {
      if (row.userText) messages.push({ role: "user", content: row.userText });
      if (row.coachText) messages.push({ role: "assistant", content: row.coachText });
    }
    messages.push({ role: "user", content: data.transcript });

    // Reserve the turn in the database FIRST so the free allowance cannot be
    // beaten by firing several requests at once. Calls the original
    // coach_reserve_turn() Postgres function as-is (not reimplemented) —
    // it takes an advisory lock for the duration of the transaction and
    // checks auth.uid() itself, which is exactly why this one call runs
    // through withUser() while everything else in this file uses
    // withAdmin(): the function requires a real authenticated caller.
    let turnNumber: number;
    try {
      const rows = await withUser(context.userId, (db) =>
        db.execute(sql`select coach_reserve_turn(${session.id}, ${usage.freeTurnLimit}, ${usage.tier === "free"}) as turn_number`),
      );
      const value = (rows as unknown as { turn_number: number | null }[])[0]?.turn_number;
      if (value == null) throw new Error("Could not start that turn.");
      turnNumber = value;
    } catch (err) {
      // Postgres's raised "turn_limit_reached" text ends up on the DrizzleQueryError's
      // .cause, not its own .message ("Failed query: ...") — walk the chain.
      let turnLimitReached = false;
      let cause: unknown = err;
      for (let i = 0; i < 5 && cause; i++) {
        if (cause instanceof Error && cause.message.includes("turn_limit_reached")) {
          turnLimitReached = true;
          break;
        }
        cause = cause instanceof Error ? cause.cause : undefined;
      }
      if (turnLimitReached) assertTurnAvailable({ ...usage, turnsLeft: 0 });
      throw new Error("Could not start that turn.");
    }

    const { text, inputTokens, outputTokens } = await llmCompleteWhole(messages, { maxTokens: 220 });
    const reply = text.trim();

    await withAdmin((db) =>
      db
        .update(coachTurns)
        .set({ userText: data.transcript, coachText: reply })
        .where(and(eq(coachTurns.sessionId, session.id), eq(coachTurns.turnNumber, turnNumber))),
    );

    await withAdmin((db) =>
      db.insert(aiUsageLog).values({
        userId: context.userId,
        capability: "coach_turn",
        provider: currentTextProvider(),
        model: currentLlmModel(),
        units: 1,
        inputTokens,
        outputTokens,
      }),
    );

    const after = await readUsage(context.userId);
    return {
      reply,
      usage: after,
      locked: after.tier === "free" && after.freeTurnsUsed >= after.freeTurnLimit,
      turnNumber,
    };
  });

/**
 * Attaches the speaking-analysis scorecard to the turn it belongs to, so
 * reloading the page (getCoachSession above) can restore the feedback panel
 * for past turns instead of just the bare transcript. Best-effort: the
 * caller computes this analysis via a separate AI call from coachReply
 * (they run in parallel — see ai-speaking.tsx), so it's saved as a follow-up
 * write rather than inside coachReply itself.
 */
const turnAnalysisSchema = z.object({
  fluency: z.number(),
  grammar: z.number(),
  vocabulary: z.number(),
  overall: z.number(),
  mistakes: z.array(z.object({ wrong: z.string(), why: z.string() })),
  corrections: z.array(z.object({ from: z.string(), to: z.string() })),
  better_vocabulary: z.array(z.object({ instead_of: z.string(), use: z.string() })),
  natural_answer: z.string(),
  feedback: z.string(),
});

export const saveCoachTurnAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ sessionId: z.string().uuid(), turnNumber: z.number().int().min(1), analysis: turnAnalysisSchema })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sessionRows = await withAdmin((db) =>
      db.select({ userId: coachSessions.userId }).from(coachSessions).where(eq(coachSessions.id, data.sessionId)).limit(1),
    );
    const session = sessionRows[0];
    if (!session || session.userId !== context.userId) throw new Error("Session not found.");

    await withAdmin((db) =>
      db
        .update(coachTurns)
        .set({ analysis: data.analysis })
        .where(and(eq(coachTurns.sessionId, data.sessionId), eq(coachTurns.turnNumber, data.turnNumber))),
    );
    return { ok: true };
  });

/* ------------------------------ admin controls ---------------------------- */

const topicInput = z.object({
  id: z.string().uuid().optional(),
  category: z.enum(COACH_CATEGORIES),
  slug: z.string().min(2).max(80),
  title: z.string().min(2).max(160),
  description: z.string().max(600).default(""),
  level: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  access_tier: z.enum(["free", "premium", "ielts_pro"]),
  ai_role: z.string().max(200).default(""),
  user_role: z.string().max(200).default(""),
  situation: z.string().max(800).default(""),
  objective: z.string().max(400).default(""),
  opening_message: z.string().min(4).max(800),
  instructions: z.string().max(1200).default(""),
  follow_up_directions: z.array(z.string().max(160)).max(12).default([]),
  vocabulary_focus: z.string().max(400).default(""),
  grammar_focus: z.string().max(300).default(""),
  interview_type: z.string().max(80).default(""),
  challenge_prompt: z.string().max(600).default(""),
  evaluation_criteria: z.string().max(600).default(""),
  time_limit_seconds: z.number().int().min(0).max(600).default(0),
  estimated_minutes: z.number().int().min(1).max(60).default(5),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const adminListCoachTopics = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ category: z.enum(COACH_CATEGORIES) }).parse(d))
  .handler(async ({ data }) => {
    const rows = await withAdmin((db) =>
      db.select().from(coachTopics).where(eq(coachTopics.category, data.category)).orderBy(asc(coachTopics.sortOrder)),
    );
    return rows.map((t) => ({
      id: t.id,
      category: t.category,
      slug: t.slug,
      title: t.title,
      description: t.description,
      level: t.level,
      access_tier: t.accessTier,
      ai_role: t.aiRole,
      user_role: t.userRole,
      situation: t.situation,
      objective: t.objective,
      opening_message: t.openingMessage,
      instructions: t.instructions,
      follow_up_directions: t.followUpDirections,
      vocabulary_focus: t.vocabularyFocus,
      grammar_focus: t.grammarFocus,
      interview_type: t.interviewType,
      challenge_prompt: t.challengePrompt,
      evaluation_criteria: t.evaluationCriteria,
      time_limit_seconds: t.timeLimitSeconds,
      estimated_minutes: t.estimatedMinutes,
      sort_order: t.sortOrder,
      is_active: t.isActive,
    }));
  });

export const adminSaveCoachTopic = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => topicInput.parse(d))
  .handler(async ({ data }) => {
    const { id, ...fields } = data;
    const values = {
      category: fields.category,
      slug: fields.slug,
      title: fields.title,
      description: fields.description,
      level: fields.level,
      accessTier: fields.access_tier,
      aiRole: fields.ai_role,
      userRole: fields.user_role,
      situation: fields.situation,
      objective: fields.objective,
      openingMessage: fields.opening_message,
      instructions: fields.instructions,
      followUpDirections: fields.follow_up_directions,
      vocabularyFocus: fields.vocabulary_focus,
      grammarFocus: fields.grammar_focus,
      interviewType: fields.interview_type,
      challengePrompt: fields.challenge_prompt,
      evaluationCriteria: fields.evaluation_criteria,
      timeLimitSeconds: fields.time_limit_seconds,
      estimatedMinutes: fields.estimated_minutes,
      sortOrder: fields.sort_order,
      isActive: fields.is_active,
    };
    if (id) {
      await withAdmin((db) => db.update(coachTopics).set(values).where(eq(coachTopics.id, id)));
      return { id };
    }
    const rows = await withAdmin((db) => db.insert(coachTopics).values(values).returning({ id: coachTopics.id }));
    return { id: rows[0]!.id };
  });

export const adminSetCoachTopicActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await withAdmin((db) => db.update(coachTopics).set({ isActive: data.is_active }).where(eq(coachTopics.id, data.id)));
    return { ok: true };
  });

export const adminGetCoachSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => settings());

export const adminSaveCoachSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        free_turn_limit: z.number().int().min(0).max(100),
        premium_monthly_turns: z.number().int().min(0).max(100000),
        pro_monthly_turns: z.number().int().min(0).max(100000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await withAdmin((db) =>
      db
        .update(coachSettings)
        .set({
          freeTurnLimit: data.free_turn_limit,
          premiumMonthlyTurns: data.premium_monthly_turns,
          proMonthlyTurns: data.pro_monthly_turns,
        })
        .where(eq(coachSettings.id, "default")),
    );
    return { ok: true };
  });
