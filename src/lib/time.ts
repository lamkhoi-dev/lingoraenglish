/**
 * Returns the ISO string of 00:00:00 (midnight) of the current day in Vietnam time (UTC+7).
 * Daily quotas and limits reset at 00:00 Vietnam time instead of rolling 24 hours.
 */
export function startOfTodayVietnam(): string {
  const now = new Date();
  const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
  const vnDate = new Date(vnMs);
  const y = vnDate.getUTCFullYear();
  const m = vnDate.getUTCMonth();
  const d = vnDate.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - 7 * 60 * 60 * 1000).toISOString();
}
