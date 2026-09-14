/**
 * IELTS Speaking test library.
 *
 * The catalogue lives in the database (`speaking_tests`) and is read through the
 * `speaking_test_catalogue()` function, which decides server-side whether the
 * current learner may see a test's questions. The first three tests are free;
 * everything after that needs Premium.
 */
import {
  getMyTestProgress,
  getSpeakingTestCatalogue,
  recordSpeakingTestAttempt,
} from "@/lib/speaking-test-library.functions";

export type Difficulty = "Beginner" | "Intermediate" | "Upper-Intermediate" | "Advanced";

export const DIFFICULTIES: Difficulty[] = [
  "Beginner",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
];

export type SpeakingTest = {
  id: string;
  exam: string;
  part: number;
  slug: string;
  topic: string;
  difficulty: string;
  /** TOEFL/PTE only: which task format this test practises. */
  task_type: string;
  task_label: string;
  instructions: string;
  questions: string[];
  cue_card: string;
  cue_points: string[];
  preparation_time: number;
  speaking_time: number;
  test_number: number;
  is_free: boolean;
  sort_order: number;
  unlocked: boolean;
};

export type TestProgress = {
  test_id: string;
  attempts: number;
  last_band: number | null;
  best_band: number | null;
  completed_at: string | null;
};

/** Whole published library for one exam, with a per-learner unlocked flag. */
export async function fetchSpeakingTests(exam: "ielts" | "toefl" | "pte" = "ielts"): Promise<SpeakingTest[]> {
  const rows = await getSpeakingTestCatalogue({ data: { exam } });
  return rows.map((row) => ({
    ...(row as unknown as SpeakingTest),
    questions: Array.isArray(row.questions) ? row.questions : [],
    cue_points: Array.isArray(row.cue_points) ? row.cue_points : [],
  }));
}

/** userId kept in the signature for call-site compatibility, but the real
 * scoping now comes from the caller's own session (requireAuth), not this
 * argument — every call site already only invokes this for the signed-in user. */
export async function fetchTestProgress(_userId: string): Promise<TestProgress[]> {
  return getMyTestProgress();
}

/** Saves an attempt against a test so My Progress and the library stay in sync. */
export async function recordTestAttempt(_userId: string, testId: string, band: number | null) {
  await recordSpeakingTestAttempt({ data: { testId, band } });
}

/** "3-4 min" / "4-5 min" duration key shown on each test card, translate at render site. */
export function durationLabelKey(test: SpeakingTest): "tests.duration.3to4" | "tests.duration.4to5" {
  if (test.part === 2) return "tests.duration.3to4";
  return "tests.duration.4to5";
}

export function partLabelKey(part: number): "tests.filter.part1" | "tests.filter.part2" | "tests.filter.part3" {
  return (`tests.filter.part${part}`) as "tests.filter.part1" | "tests.filter.part2" | "tests.filter.part3";
}

/** All prompts a test asks, in order. */
export function testPrompts(test: SpeakingTest): string[] {
  if (test.part === 2) return test.cue_card ? [test.cue_card] : [];
  return test.questions;
}

/** Whether the learner has at least one unlocked test in every part — Full
 * Mock Test needs all three legs playable. Since only Part 1 tests are ever
 * free, this is only true for Premium/IELTS Pro; callers should check it
 * before offering the Full Mock Test button (see buildMockTest). */
export function canBuildMockTest(tests: SpeakingTest[]): boolean {
  return [1, 2, 3].every((part) => tests.some((t) => t.part === part && t.unlocked));
}

/** Picks one random unlocked test from each part. Never falls back to a
 * locked test — that would send the learner into a paywall error mid-mock-
 * test instead of failing gracefully up front. Callers should gate the
 * entry point on canBuildMockTest instead of relying on a short queue here. */
export function buildMockTest(tests: SpeakingTest[]): SpeakingTest[] {
  const picks: SpeakingTest[] = [];
  for (const part of [1, 2, 3]) {
    const pool = tests.filter((t) => t.part === part && t.unlocked);
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    picks.push(pick);
  }
  return picks;
}

export type LibraryFilters = {
  part: "all" | "1" | "2" | "3";
  /** TOEFL/PTE task format, e.g. "read-aloud". */
  task: string;
  difficulty: "all" | Difficulty;
  access: "all" | "free" | "premium";
  status: "all" | "completed" | "todo";
  search: string;
};

export const DEFAULT_FILTERS: LibraryFilters = {
  part: "all",
  task: "all",
  difficulty: "all",
  access: "all",
  status: "all",
  search: "",
};

/** Task formats present in a TOEFL/PTE library, in catalogue order. */
export function taskFormats(tests: SpeakingTest[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const test of tests) {
    if (test.task_type && !seen.has(test.task_type)) seen.set(test.task_type, test.task_label || test.task_type);
  }
  return Array.from(seen, ([id, label]) => ({ id, label }));
}

export function filterTests(
  tests: SpeakingTest[],
  filters: LibraryFilters,
  progress: Record<string, TestProgress>,
): SpeakingTest[] {
  const needle = filters.search.trim().toLowerCase();
  return tests.filter((test) => {
    if (filters.part !== "all" && String(test.part) !== filters.part) return false;
    if (filters.task !== "all" && test.task_type !== filters.task) return false;
    if (filters.difficulty !== "all" && test.difficulty !== filters.difficulty) return false;
    if (filters.access === "free" && !test.is_free) return false;
    if (filters.access === "premium" && test.is_free) return false;
    const done = Boolean(progress[test.id]?.completed_at);
    if (filters.status === "completed" && !done) return false;
    if (filters.status === "todo" && done) return false;
    if (needle) {
      const haystack = `${test.topic} ${test.cue_card} ${test.questions.join(" ")}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Summary numbers for the progress dashboard. */
export function progressSummary(tests: SpeakingTest[], progress: Record<string, TestProgress>) {
  const rows = tests.map((t) => ({ test: t, row: progress[t.id] })).filter((x) => x.row?.completed_at);
  const bands = rows.map((x) => Number(x.row?.best_band ?? 0)).filter((b) => b > 0);
  const average = bands.length > 0 ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10 : null;
  return {
    total: tests.length,
    completed: rows.length,
    part1: rows.filter((x) => x.test.part === 1).length,
    part2: rows.filter((x) => x.test.part === 2).length,
    part3: rows.filter((x) => x.test.part === 3).length,
    averageBand: average,
    bestBand: bands.length > 0 ? Math.max(...bands) : null,
    topics: Array.from(new Set(rows.map((x) => x.test.topic))),
  };
}
