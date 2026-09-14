/**
 * "Continue where you left off" after an upgrade.
 *
 * When the server refuses a practice for plan reasons we remember the page the
 * learner was on, so the checkout success screen can send them straight back.
 */
const KEY = "lily.upgradeReturnTo";

export function rememberReturnPath(path?: string) {
  if (typeof window === "undefined") return;
  const target = path ?? `${window.location.pathname}${window.location.search}`;
  if (!target.startsWith("/") || target.startsWith("//")) return;
  try {
    window.sessionStorage.setItem(KEY, target);
  } catch {
    /* private mode — non-critical */
  }
}

export function peekReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
  } catch {
    return null;
  }
}

export function clearReturnPath() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const UPGRADE_PREFIX = "UPGRADE_REQUIRED: ";

/** Returns the server's explanation when the error is a plan limit, else null. */
export function parseUpgradeError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const index = message.indexOf(UPGRADE_PREFIX);
  if (index === -1) return null;
  return message.slice(index + UPGRADE_PREFIX.length).trim() || null;
}
