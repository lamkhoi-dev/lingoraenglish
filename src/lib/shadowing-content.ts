/**
 * Shadowing library helpers.
 *
 * All sentence content lives in the database (`shadowing_topics` /
 * `shadowing_sentences`) so the library can grow to thousands of records
 * without touching the UI. This module only holds the shapes, the level map,
 * the filter definitions and the practice-selection logic.
 */

export type ShadowSentenceLevel = "beginner" | "elementary" | "intermediate" | "advanced";

export type ShadowVocabItem = { word: string; meaning: string };

export type ShadowSentence = {
  id: string;
  sort_order: number;
  level: ShadowSentenceLevel;
  difficulty: number;
  sentence_type: string;
  sentence: string;
  natural_form: string;
  accent: string;
  pronunciation_focus: string;
  stress_focus: string;
  intonation_focus: string;
  connected_speech_focus: string;
  vocabulary: ShadowVocabItem[];
  grammar_focus: string;
  tags: string[];
  is_free: boolean;
  unlocked: boolean;
  /** Groups this row with other rows into one multi-turn dialogue; null for
   * a standalone sentence (the vast majority of rows today). */
  dialogue_id: string | null;
  /** 1-based order within the dialogue; 0/meaningless for standalone rows. */
  turn_number: number;
  /** Who says this line, e.g. "Waiter" — empty for standalone sentences. */
  speaker_label: string;
  /** Which of LILY_VOICES to use for this line's model audio — empty falls
   * back to the site default ("shimmer"). */
  speaker_voice: string;
};

export type ShadowTopicOverview = {
  slug: string;
  name: string;
  topic_group: string;
  blurb: string;
  sort_order: number;
  total_sentences: number;
  free_sentences: number;
};

export type ShadowProgressStatus = "new" | "in_progress" | "needs_practice" | "strong" | "mastered";

export type ShadowProgressRow = {
  sentence_id: string;
  attempts: number;
  clear_attempts: number;
  best_accuracy: number | null;
  last_accuracy: number | null;
  status: Exclude<ShadowProgressStatus, "new">;
  seconds_practised: number;
  last_practised_at: string;
};

/** CEFR label for a sentence, from its level band and position in the topic. */
export function cefrOf(level: ShadowSentenceLevel, sortOrder: number): "A1" | "A2" | "B1" | "B2" | "C1" {
  if (level === "beginner") return "A1";
  if (level === "elementary") return "A2";
  if (level === "intermediate") return "B1";
  return sortOrder >= 91 ? "C1" : "B2";
}

/** Short "A1 → C1" style range for a whole topic. */
export function cefrRange(total: number): string {
  if (total >= 91) return "A1 → C1";
  if (total >= 76) return "A1 → B2";
  if (total >= 51) return "A1 → B1";
  if (total >= 26) return "A1 → A2";
  return "A1";
}

/** All turns of one dialogue, in speaking order — or `null` for a standalone
 * sentence. Used to group the list view and to show "previous line" context
 * while practising one turn. */
export function dialogueTurnsOf(sentences: ShadowSentence[], sentence: ShadowSentence): ShadowSentence[] | null {
  if (!sentence.dialogue_id) return null;
  return sentences.filter((s) => s.dialogue_id === sentence.dialogue_id).sort((a, b) => a.turn_number - b.turn_number);
}

/** Plain-English description of each shadowing category. */
export const SHADOW_GROUP_BLURB: Record<string, string> = {
  "Everyday English":
    "Real-life English for home, shopping, food, travel, health, money, phone calls and free time.",
  "Work & Professional English":
    "Language you can use at work: meetings, presentations, emails, clients, feedback, projects and interviews.",
};

/** i18n key for each category blurb, keyed by the English group name from the DB. */
export const SHADOW_GROUP_BLURB_KEY: Record<string, string> = {
  "Everyday English": "shadow.group.everyday.blurb",
  "Work & Professional English": "shadow.group.work.blurb",
};

export const SHADOW_LEVEL_META: {
  id: ShadowSentenceLevel;
  label: string;
  labelKey: string;
  dot: string;
  range: string;
  blurb: string;
  blurbKey: string;
}[] = [
  {
    id: "beginner",
    label: "Beginner",
    labelKey: "shadow.level.beginner.label",
    dot: "🟢",
    range: "1–25",
    blurb: "Short, common sentences — 5 to 10 words.",
    blurbKey: "shadow.level.beginner.blurb",
  },
  {
    id: "elementary",
    label: "Elementary",
    labelKey: "shadow.level.elementary.label",
    dot: "🟡",
    range: "26–50",
    blurb: "Longer lines with everyday connectors.",
    blurbKey: "shadow.level.elementary.blurb",
  },
  {
    id: "intermediate",
    label: "Intermediate",
    labelKey: "shadow.level.intermediate.label",
    dot: "🟠",
    range: "51–75",
    blurb: "Natural conversation, phrasal verbs, connected speech.",
    blurbKey: "shadow.level.intermediate.blurb",
  },
  {
    id: "advanced",
    label: "Advanced",
    labelKey: "shadow.level.advanced.label",
    dot: "🔴",
    range: "76–100+",
    blurb: "Long, idiomatic, nuanced native English.",
    blurbKey: "shadow.level.advanced.blurb",
  },
];

export type ShadowSkillId =
  | "all"
  | "pronunciation"
  | "stress"
  | "intonation"
  | "connected-speech"
  | "rhythm"
  | "fluency";

export const SHADOW_SKILLS: { id: ShadowSkillId; label: string; labelKey: string }[] = [
  { id: "all", label: "All skills", labelKey: "shadow.skill.all" },
  { id: "pronunciation", label: "Pronunciation", labelKey: "shadow.skill.pronunciation" },
  { id: "stress", label: "Sentence stress", labelKey: "shadow.skill.stress" },
  { id: "intonation", label: "Intonation", labelKey: "shadow.skill.intonation" },
  { id: "connected-speech", label: "Connected speech", labelKey: "shadow.skill.connectedSpeech" },
  { id: "rhythm", label: "Rhythm", labelKey: "shadow.skill.rhythm" },
  { id: "fluency", label: "Fluency", labelKey: "shadow.skill.fluency" },
];

/** Which pronunciation lesson a shadowing skill maps to. */
export const SKILL_TO_PRON_LESSON: Record<Exclude<ShadowSkillId, "all">, string> = {
  pronunciation: "sounds",
  stress: "sentence-stress",
  intonation: "intonation",
  "connected-speech": "connected-speech",
  rhythm: "rhythm",
  fluency: "fluency",
};

export function sentenceHasSkill(s: ShadowSentence, skill: ShadowSkillId): boolean {
  if (skill === "all") return true;
  const tagged = s.tags.some((t) => t.toLowerCase().includes(skill.replace("-", " ")));
  switch (skill) {
    case "pronunciation":
      return Boolean(s.pronunciation_focus) || tagged;
    case "stress":
      return Boolean(s.stress_focus) || tagged;
    case "intonation":
      return Boolean(s.intonation_focus) || tagged;
    case "connected-speech":
      return Boolean(s.connected_speech_focus) || Boolean(s.natural_form) || tagged;
    case "rhythm":
      return Boolean(s.stress_focus) || s.sort_order > 25;
    case "fluency":
      return s.sort_order > 50;
    default:
      return true;
  }
}

export const SHADOW_STATUS_META: Record<
  ShadowProgressStatus,
  { label: string; labelKey: string; icon: string; tone: string }
> = {
  new: { label: "New", labelKey: "shadow.status.new", icon: "•", tone: "text-muted-foreground" },
  in_progress: { label: "In progress", labelKey: "shadow.status.inProgress", icon: "◐", tone: "text-plum-soft" },
  needs_practice: {
    label: "Needs practice",
    labelKey: "shadow.status.needsPractice",
    icon: "🔄",
    tone: "text-danger",
  },
  strong: { label: "Strong", labelKey: "shadow.status.strong", icon: "⭐", tone: "text-brass-soft" },
  mastered: { label: "Mastered", labelKey: "shadow.status.mastered", icon: "✅", tone: "text-brass" },
};

/** Status after an attempt: honest, based only on the measured read-back score. */
export function nextStatus(accuracy: number | null, clearAttempts: number): Exclude<ShadowProgressStatus, "new"> {
  if (accuracy === null) return "in_progress";
  if (clearAttempts >= 2 && accuracy >= 90) return "mastered";
  if (accuracy >= 90) return "strong";
  if (accuracy < 70) return "needs_practice";
  return "in_progress";
}

export const SHADOW_PRACTICE_STEPS = [
  { n: 1, label: "Listen", labelKey: "shadow.practice.step.listen", hint: "Hear the whole sentence at natural speed.", hintKey: "shadow.practice.step.listenHint" },
  { n: 2, label: "Shadow", labelKey: "shadow.practice.step.shadow", hint: "Speak along with the audio, copying the rhythm.", hintKey: "shadow.practice.step.shadowHint" },
  { n: 3, label: "Record", labelKey: "shadow.practice.step.record", hint: "Now say it on your own and record it.", hintKey: "shadow.practice.step.recordHint" },
  { n: 4, label: "AI feedback", labelKey: "shadow.practice.step.feedback", hint: "See what the coach heard and what to fix.", hintKey: "shadow.practice.step.feedbackHint" },
  { n: 5, label: "Try again", labelKey: "shadow.practice.step.tryAgain", hint: "Repeat until it feels easy.", hintKey: "shadow.practice.step.tryAgainHint" },
  { n: 6, label: "Mastered", labelKey: "shadow.practice.step.masteredHint", hint: "Two clear attempts in a row.", hintKey: "shadow.practice.step.masteredHint" },
];

export type ShadowMode = "start" | "continue" | "level" | "random" | "review" | "mastered";

export const SHADOW_MODES: { id: ShadowMode; label: string; labelKey: string; blurb: string }[] = [
  { id: "start", label: "Start from the beginning", labelKey: "shadow.mode.start.label", blurb: "Sentence 1 upwards." },
  { id: "continue", label: "Continue where I left off", labelKey: "shadow.mode.continue.label", blurb: "Your next unpractised sentence." },
  { id: "level", label: "Practise by level", labelKey: "shadow.mode.level.label", blurb: "Only the level you choose." },
  { id: "random", label: "Random practice", labelKey: "shadow.mode.random.label", blurb: "Shuffle the whole topic." },
  { id: "review", label: "Review mistakes", labelKey: "shadow.mode.review.label", blurb: "Sentences marked needs practice." },
  { id: "mastered", label: "Mastered sentences", labelKey: "shadow.mode.mastered.label", blurb: "Keep them fresh." },
];

export function statusOf(
  sentenceId: string,
  progress: Map<string, ShadowProgressRow>,
): ShadowProgressStatus {
  return progress.get(sentenceId)?.status ?? "new";
}

/**
 * Today's recommended set: unfinished work first, then difficult sentences,
 * then the next new ones, finished with one mastered sentence to review.
 */
export function dailySet(
  sentences: ShadowSentence[],
  progress: Map<string, ShadowProgressRow>,
  size = 8,
): ShadowSentence[] {
  const unlocked = sentences.filter((s) => s.unlocked);
  const needs = unlocked.filter((s) => statusOf(s.id, progress) === "needs_practice");
  const inProgress = unlocked.filter((s) => statusOf(s.id, progress) === "in_progress");
  const fresh = unlocked.filter((s) => statusOf(s.id, progress) === "new");
  const mastered = unlocked.filter((s) => statusOf(s.id, progress) === "mastered");

  const picked: ShadowSentence[] = [];
  const push = (list: ShadowSentence[], n: number) => {
    for (const s of list) {
      if (picked.length >= size) return;
      if (!picked.includes(s) && n-- > 0) picked.push(s);
    }
  };
  push(needs, 3);
  push(inProgress, 2);
  push(fresh, size);
  if (picked.length < size) push(mastered, 1);
  return picked.slice(0, size);
}

/** Skill the learner struggles with most, from their own recorded scores. */
export function weakestSkill(
  sentences: ShadowSentence[],
  progress: Map<string, ShadowProgressRow>,
): Exclude<ShadowSkillId, "all"> | null {
  const buckets: Record<string, { total: number; n: number }> = {};
  for (const s of sentences) {
    const row = progress.get(s.id);
    if (!row || row.last_accuracy === null) continue;
    for (const skill of ["pronunciation", "stress", "intonation", "connected-speech"] as const) {
      if (!sentenceHasSkill(s, skill)) continue;
      const b = (buckets[skill] ??= { total: 0, n: 0 });
      b.total += row.last_accuracy;
      b.n += 1;
    }
  }
  const scored = Object.entries(buckets)
    .filter(([, b]) => b.n >= 2)
    .map(([skill, b]) => ({ skill, avg: b.total / b.n }))
    .sort((a, b) => a.avg - b.avg);
  const worst = scored[0];
  if (!worst || worst.avg >= 85) return null;
  return worst.skill as Exclude<ShadowSkillId, "all">;
}
