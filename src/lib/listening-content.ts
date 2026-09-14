/**
 * Listening Lab helpers.
 *
 * Every lesson lives in the database (`listening_lessons`) so the library can
 * grow to hundreds of lessons without touching the UI. This module holds the
 * shapes, the level/skill metadata, the filter definitions and the honest
 * scoring logic used by the three lesson stages.
 */

export type ListeningLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type ListeningSkill =
  | "main_idea"
  | "details"
  | "intention"
  | "connected_speech"
  | "vocabulary"
  | "numbers_dates"
  | "fast_speech";

export type ScriptLine = { speaker: string; line: string };

export type ListeningQuestion = {
  type: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  skill: ListeningSkill;
};

export type DictationChallenge =
  | "contraction"
  | "connected_speech"
  | "reduced_form"
  | "weak_form"
  | "fast_speech"
  | "similar_sounds"
  | "numbers"
  | "dates"
  | "expression";

export type DictationItem = {
  sentence: string;
  blanks: string[];
  challenge: DictationChallenge;
  explanation: string;
};

export type ConnectedSpeechNote = { written: string; spoken: string };

export type ListeningLessonCard = {
  id: string;
  slug: string;
  title: string;
  level: ListeningLevel;
  category: string;
  topic: string;
  difficulty: number;
  duration_seconds: number;
  accent: string;
  question_count: number;
  dictation_count: number;
  is_free: boolean;
  sort_order: number;
  unlocked: boolean;
};

export type ListeningLesson = ListeningLessonCard & {
  script: ScriptLine[];
  questions: ListeningQuestion[];
  dictation: DictationItem[];
  connected_speech: ConnectedSpeechNote[];
};

export type ListeningProgressRow = {
  lesson_id: string;
  comprehension_score: number | null;
  dictation_score: number | null;
  overall_score: number | null;
  attempts: number;
  seconds_listened: number;
  weak_areas: string[];
  completed_at: string | null;
};

/* ------------------------------- metadata -------------------------------- */

export const LISTENING_LEVELS: { id: ListeningLevel; label: string; blurb: string }[] = [
  { id: "A1", label: "A1 Beginner", blurb: "Short, clear conversations with very common words." },
  { id: "A2", label: "A2 Elementary", blurb: "Longer everyday conversations, slightly faster speech." },
  { id: "B1", label: "B1 Intermediate", blurb: "Natural speech with contractions and connected speech." },
  { id: "B2", label: "B2 Upper-Intermediate", blurb: "Faster speech, idioms and indirect meaning." },
  { id: "C1", label: "C1 Advanced", blurb: "Fast speech, nuance, implied meaning and rich vocabulary." },
];

export const LISTENING_CATEGORIES = [
  "Everyday Life",
  "Work & Career",
  "Canadian Life",
  "Travel",
  "Social English",
  "Academic English",
  "Entertainment & Media",
] as const;

export const SKILL_LABEL: Record<ListeningSkill, string> = {
  main_idea: "Main idea",
  details: "Specific details",
  intention: "Speaker intention",
  connected_speech: "Connected speech",
  vocabulary: "Meaning in context",
  numbers_dates: "Numbers & dates",
  fast_speech: "Fast speech",
};

export const CHALLENGE_LABEL: Record<DictationChallenge, string> = {
  contraction: "Contraction",
  connected_speech: "Connected speech",
  reduced_form: "Reduced form",
  weak_form: "Weak form",
  fast_speech: "Fast speech",
  similar_sounds: "Similar-sounding words",
  numbers: "Numbers",
  dates: "Dates",
  expression: "Everyday expression",
};

export const LISTENING_STAGES = [
  { n: 1, label: "Listen", icon: "🎧" },
  { n: 2, label: "Understand", icon: "🧠" },
  { n: 3, label: "Dictation", icon: "⌨️" },
  { n: 4, label: "Review", icon: "📊" },
] as const;

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;

export const DURATION_FILTERS: { id: string; label: string; max: number }[] = [
  { id: "all", label: "Any length", max: Number.MAX_SAFE_INTEGER },
  { id: "short", label: "Under 45s", max: 45 },
  { id: "medium", label: "45s – 90s", max: 90 },
  { id: "long", label: "Over 90s", max: Number.MAX_SAFE_INTEGER },
];

/* -------------------------------- helpers -------------------------------- */

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export function formatMinutes(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Returns a translation-key suffix; translate at the render site. */
export function difficultyKey(difficulty: number): "gentle" | "steady" | "fast" | "veryFast" {
  if (difficulty <= 3) return "gentle";
  if (difficulty <= 5) return "steady";
  if (difficulty <= 7) return "fast";
  return "veryFast";
}

/** Returns a translation-key suffix; translate at the render site. */
export function accentKey(accent: string): "british" | "northAmerican" {
  return accent === "british" ? "british" : "northAmerican";
}

/** Normalises a typed word so spelling is judged, not punctuation or case. */
export function normaliseWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .trim();
}

/** Splits a dictation sentence into fixed words and the blanks to be typed. */
export function buildDictationParts(item: DictationItem): { text: string; blankIndex: number | null }[] {
  let pointer = 0;
  return item.sentence.split(/\s+/).map((word) => {
    const blank = item.blanks[pointer];
    if (blank && normaliseWord(word) === normaliseWord(blank)) {
      const index = pointer;
      pointer += 1;
      return { text: word, blankIndex: index };
    }
    return { text: word, blankIndex: null };
  });
}

/** Which typed blanks match the audio, in order. */
export function gradeDictation(item: DictationItem, typed: string[]): boolean[] {
  return item.blanks.map((blank, i) => normaliseWord(typed[i] ?? "") === normaliseWord(blank));
}

export function percent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

/** Skills the learner answered incorrectly most often, best-effort and honest. */
export function weakAreasFrom(
  questions: ListeningQuestion[],
  answers: (string | null)[],
  dictation: DictationItem[],
  dictationResults: boolean[][],
): string[] {
  const counts = new Map<string, number>();
  questions.forEach((question, i) => {
    if (answers[i] !== question.answer) {
      counts.set(SKILL_LABEL[question.skill], (counts.get(SKILL_LABEL[question.skill]) ?? 0) + 1);
    }
  });
  dictation.forEach((item, i) => {
    const results = dictationResults[i] ?? [];
    if (results.some((ok) => !ok)) {
      const label = CHALLENGE_LABEL[item.challenge];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);
}

export function strengthsFrom(questions: ListeningQuestion[], answers: (string | null)[]): string[] {
  const good = new Set<string>();
  questions.forEach((question, i) => {
    if (answers[i] === question.answer) good.add(SKILL_LABEL[question.skill]);
  });
  return [...good].slice(0, 4);
}

/**
 * Short, rule-based next steps built from the learner's own saved scores — no
 * invented claims about skills we did not measure.
 */
export function recommendations(
  cards: ListeningLessonCard[],
  progress: Map<string, ListeningProgressRow>,
): { message: string; lessons: ListeningLessonCard[] } {
  const done = cards.filter((c) => progress.get(c.id)?.completed_at);
  if (!done.length) {
    const first = cards.filter((c) => c.unlocked).slice(0, 3);
    return { message: "Start with a short A1 conversation to find your listening level.", lessons: first };
  }

  const scores = done.map((c) => progress.get(c.id)!.overall_score ?? 0);
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const weak = new Map<string, number>();
  for (const card of done) {
    for (const area of progress.get(card.id)?.weak_areas ?? []) {
      weak.set(area, (weak.get(area) ?? 0) + 1);
    }
  }
  const topWeak = [...weak.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const lastLevel = done[done.length - 1]!.level;
  const order = LISTENING_LEVELS.map((l) => l.id);
  const targetLevel =
    average >= 85 ? (order[Math.min(order.indexOf(lastLevel) + 1, order.length - 1)] as ListeningLevel) : lastLevel;

  const next = cards
    .filter((c) => c.level === targetLevel && !progress.get(c.id)?.completed_at)
    .slice(0, 3);

  const message =
    average >= 85
      ? `You're averaging ${average}%. ${topWeak ? `Keep an eye on ${topWeak.toLowerCase()} and step up to ${targetLevel}.` : `Step up to ${targetLevel}.`}`
      : `You're averaging ${average}%. ${topWeak ? `${topWeak} is costing you the most marks — these ${targetLevel} lessons target it.` : `Stay at ${targetLevel} for a few more lessons.`}`;

  return { message, lessons: next.length ? next : cards.filter((c) => c.unlocked).slice(0, 3) };
}
