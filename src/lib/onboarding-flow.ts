/**
 * Client-side glue for the "survey first, then sign up" onboarding flow.
 *
 * A visitor with no account answers the survey on /onboarding, but there is no
 * profile row to write to yet. Their answers are parked here until they have a
 * session (email sign-up, email verification, or Google), and OnboardingGate
 * then saves them with completeOnboarding / skipOnboarding.
 *
 * Kept in localStorage so it survives the full-page redirects of Google OAuth
 * and of the email-verification link. localStorage can be unavailable (private
 * windows, blocked site data), so an in-memory copy covers the client-side
 * navigation from /onboarding to /auth — without it /auth would think the
 * survey was never taken and send the visitor straight back to it.
 */

export type SurveyAnswers = {
  goal: string;
  focusAreas: string[];
  dailyGoalMinutes: number;
  englishLevel: "A1" | "A2" | "B1" | "B2" | "C1";
  instructionLanguage: "en" | "vi";
};

export type PendingSurvey = { skipped: true } | { skipped?: false; answers: SurveyAnswers };

const STORAGE_KEY = "lingora.onboarding.pending";

let memoryCopy: PendingSurvey | null = null;

export function savePendingSurvey(survey: PendingSurvey): void {
  memoryCopy = survey;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(survey));
  } catch {
    // Storage blocked — the in-memory copy still covers SPA navigation.
  }
}

export function readPendingSurvey(): PendingSurvey | null {
  if (memoryCopy) return memoryCopy;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    // Shape is validated for real by completeOnboarding's zod schema on save.
    return parsed as PendingSurvey;
  } catch {
    return null;
  }
}

export function hasPendingSurvey(): boolean {
  return readPendingSurvey() !== null;
}

export function clearPendingSurvey(): void {
  memoryCopy = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export type PostAuthParams = {
  next?: string | undefined;
  plan?: string | undefined;
  interval?: "month" | "year" | undefined;
};

/** Only same-site absolute paths — never an open redirect via `?next=//evil.com`. */
export function safeLocalPath(next: string | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Where to go once auth (+ survey) is done: straight into checkout for the
 * plan the visitor picked on /pricing, otherwise the page they came from. */
export function postAuthNavigation(params: PostAuthParams, fallback: string) {
  if (params.plan) {
    return {
      to: "/pricing",
      search: { plan: params.plan, interval: params.interval ?? "month", checkout: "1" },
    };
  }
  return { to: safeLocalPath(params.next, fallback) };
}
