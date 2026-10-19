/**
 * Renewal reminder emails for bank-transfer plans — server-only. Bank transfer has no card on file, so
 * those plans never renew by themselves; the learner is emailed 7, 3 and 1 day(s) before the end with a
 * link to renew (the pricing page opens renewal during the last RENEWAL_WINDOW_DAYS, and the new period
 * starts when the current one ends — see activateBankTransferOrder). Card plans are left to Stripe.
 *
 * Runs hourly in the long-running server (started from src/server.ts). Each reminder is sent once:
 * a "renewal_reminder_sent" billing event with a unique key records it. A learner who has already renewed
 * (another plan of the same or a higher tier lasting longer) is skipped.
 */
import { and, eq, gt, like, lte, sql } from "drizzle-orm";

import { withAdmin } from "@/db";
import { billingEvents, billingPlans, complimentaryAccess, profiles, subscriptions } from "@/db/schema/schema";
import { activePaidCoverage } from "./bank-transfer.server";
import { sendEmail } from "./email.server";
import { logBillingEvent, TRIAL_NOTE } from "./entitlements.server";
import { getPaymentsEnv } from "./payments-env";

const DAY_MS = 86_400_000;
/** Reminder points, in days before the plan ends. */
const THRESHOLDS = [1, 3, 7] as const;
const TIER_RANK: Record<string, number> = { free: 0, premium: 1, ielts_pro: 2 };
/** Only email between 08:00 and 21:00 Vietnam time; a reminder that falls outside waits a few hours. */
const SEND_FROM_HOUR = 8;
const SEND_UNTIL_HOUR = 21;

function siteUrl(): string {
  return (process.env["APP_URL"] ?? "https://lingoraenglishai.com").replace(/\/+$/, "");
}

function vietnamHour(date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
}

function formatEnd(ms: number, vi: boolean): string {
  return new Date(ms).toLocaleString(vi ? "vi-VN" : "en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export type ReminderEmail = { subject: string; html: string };

export function buildRenewalReminderEmail(opts: {
  vi: boolean;
  name: string;
  planName: string;
  interval: string;
  endsAt: number;
  daysLeft: number;
  renewUrl: string;
}): ReminderEmail {
  const { vi, planName, renewUrl } = opts;
  const name = escapeHtml(opts.name.trim());
  const plan = escapeHtml(planName);
  const end = formatEnd(opts.endsAt, vi);
  const when = vi
    ? opts.daysLeft <= 1
      ? "trong vòng 24 giờ tới"
      : `sau ${opts.daysLeft} ngày`
    : opts.daysLeft <= 1
      ? "within the next 24 hours"
      : `in ${opts.daysLeft} days`;
  const intervalLabel = vi
    ? opts.interval === "year"
      ? "gói năm"
      : "gói tháng"
    : opts.interval === "year"
      ? "yearly"
      : "monthly";

  const subject = vi
    ? `Gói ${planName} của bạn sẽ hết hạn ${when}`
    : `Your ${planName} plan ends ${when}`;
  const lines = vi
    ? {
        hello: name ? `Chào ${name},` : "Chào bạn,",
        main: `Gói <strong>${plan}</strong> (${intervalLabel}) của bạn sẽ hết hạn vào <strong>${end}</strong>.`,
        why: "Gói thanh toán bằng chuyển khoản không tự gia hạn. Để tiếp tục học không bị gián đoạn, bạn có thể gia hạn ngay bây giờ — thời gian mới được cộng tiếp từ ngày hết hạn, nên bạn không mất ngày nào.",
        button: "Gia hạn gói",
        after:
          "Nếu bạn không gia hạn, bạn không cần làm gì cả: sau ngày hết hạn, tài khoản sẽ chuyển về gói Miễn phí.",
        footer: "Bạn nhận email này vì đang dùng gói trả phí trên Lingora English.",
      }
    : {
        hello: name ? `Hi ${name},` : "Hi there,",
        main: `Your <strong>${plan}</strong> plan (${intervalLabel}) ends on <strong>${end}</strong> (Vietnam time).`,
        why: "Plans paid by bank transfer do not renew by themselves. To keep practising without a break, you can renew now — the new period starts when the current one ends, so you lose no days.",
        button: "Renew my plan",
        after:
          "If you do not want to renew, there is nothing to do: after the end date your account moves to the Free plan.",
        footer: "You are receiving this email because you have a paid plan on Lingora English.",
      };

  const html = `<!DOCTYPE html>
<html lang="${vi ? "vi" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; padding: 32px; border: 1px solid #334155;">
    <p style="font-size: 16px; line-height: 24px; color: #f8fafc; margin-top: 0;">${lines.hello}</p>
    <p style="font-size: 16px; line-height: 24px; color: #cbd5e1;">${lines.main}</p>
    <p style="font-size: 15px; line-height: 23px; color: #cbd5e1;">${lines.why}</p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="${escapeHtml(renewUrl)}" style="background-color: #d97706; color: #ffffff; padding: 14px 32px; font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 9999px; display: inline-block;">${lines.button}</a>
    </div>
    <p style="font-size: 14px; color: #94a3b8; line-height: 20px;">${lines.after}</p>
    <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
    <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">${lines.footer}</p>
  </div>
</body>
</html>`;
  return { subject, html };
}

/** Days before the free trial ends that the learner is emailed. */
const TRIAL_REMINDER_DAYS = 2;

export function buildTrialReminderEmail(opts: {
  vi: boolean;
  name: string;
  endsAt: number;
  upgradeUrl: string;
}): ReminderEmail {
  const { vi, upgradeUrl } = opts;
  const name = escapeHtml(opts.name.trim());
  const end = formatEnd(opts.endsAt, vi);
  const subject = vi
    ? "Thời gian dùng thử Premium của bạn sắp kết thúc"
    : "Your Premium free trial is ending soon";
  const lines = vi
    ? {
        hello: name ? `Chào ${name},` : "Chào bạn,",
        main: `Thời gian dùng thử Premium miễn phí của bạn sẽ kết thúc vào <strong>${end}</strong>.`,
        why: "Nếu bạn đăng ký một gói ngay bây giờ, gói trả phí sẽ bắt đầu sau khi hết dùng thử — bạn không mất ngày dùng thử nào còn lại.",
        button: "Xem các gói",
        after:
          "Nếu bạn không đăng ký, bạn không cần làm gì cả: sau thời điểm trên, tài khoản sẽ tự chuyển về gói Miễn phí và không bị tính phí.",
        footer: "Bạn nhận email này vì đang dùng thử Premium trên Lingora English.",
      }
    : {
        hello: name ? `Hi ${name},` : "Hi there,",
        main: `Your free Premium trial ends on <strong>${end}</strong> (Vietnam time).`,
        why: "If you subscribe to a plan now, your paid period starts after the trial ends — you lose none of the remaining trial days.",
        button: "See the plans",
        after:
          "If you do not subscribe, there is nothing to do: after that time your account moves to the Free plan and you are not charged.",
        footer: "You are receiving this email because you are on a Premium free trial on Lingora English.",
      };

  const html = `<!DOCTYPE html>
<html lang="${vi ? "vi" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; padding: 32px; border: 1px solid #334155;">
    <p style="font-size: 16px; line-height: 24px; color: #f8fafc; margin-top: 0;">${lines.hello}</p>
    <p style="font-size: 16px; line-height: 24px; color: #cbd5e1;">${lines.main}</p>
    <p style="font-size: 15px; line-height: 23px; color: #cbd5e1;">${lines.why}</p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="${escapeHtml(upgradeUrl)}" style="background-color: #d97706; color: #ffffff; padding: 14px 32px; font-weight: 600; font-size: 16px; text-decoration: none; border-radius: 9999px; display: inline-block;">${lines.button}</a>
    </div>
    <p style="font-size: 14px; color: #94a3b8; line-height: 20px;">${lines.after}</p>
    <hr style="border: none; border-top: 1px solid #334155; margin: 24px 0;" />
    <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">${lines.footer}</p>
  </div>
</body>
</html>`;
  return { subject, html };
}

export type ReminderRun = {
  at: string;
  checked: number;
  sent: string[];
  skipped: { key: string; why: string }[];
  errors: string[];
  quietHours: boolean;
};

let lastRun: ReminderRun | null = null;
export function getLastReminderRun(): ReminderRun | null {
  return lastRun;
}

/**
 * Emails learners whose signup free trial ends within TRIAL_REMINDER_DAYS — once per trial, skipping
 * trials that were never longer than that (the mail would fire on day one) and learners who already
 * bought Premium or higher beyond the trial's end.
 */
async function sendDueTrialReminders(
  run: ReminderRun,
  opts: { dryRun?: boolean },
  now: number,
  env: ReturnType<typeof getPaymentsEnv>,
): Promise<void> {
  const due = await withAdmin((db) =>
    db
      .select({
        id: complimentaryAccess.id,
        userId: complimentaryAccess.userId,
        expiresAt: complimentaryAccess.expiresAt,
        createdAt: complimentaryAccess.createdAt,
        email: profiles.email,
        fullName: profiles.fullName,
        interfaceLanguage: profiles.interfaceLanguage,
      })
      .from(complimentaryAccess)
      .innerJoin(profiles, eq(profiles.id, complimentaryAccess.userId))
      .where(
        and(
          eq(complimentaryAccess.note, TRIAL_NOTE),
          eq(complimentaryAccess.revoked, false),
          gt(complimentaryAccess.expiresAt, new Date(now).toISOString()),
          lte(complimentaryAccess.expiresAt, new Date(now + TRIAL_REMINDER_DAYS * DAY_MS).toISOString()),
        ),
      ),
  );
  run.checked += due.length;

  for (const row of due) {
    const key = `trial:${row.id}:${TRIAL_REMINDER_DAYS}d`;
    try {
      const endsAt = Date.parse(row.expiresAt!);
      if (!row.email) {
        run.skipped.push({ key, why: "no email" });
        continue;
      }
      if (endsAt - Date.parse(row.createdAt) <= (TRIAL_REMINDER_DAYS + 0.1) * DAY_MS) {
        run.skipped.push({ key, why: "trial too short for a reminder" });
        continue;
      }
      const bought = (await activePaidCoverage(row.userId, env)).some(
        (c) => (TIER_RANK[c.tier] ?? 1) >= TIER_RANK["premium"]! && (c.endsAt === null || c.endsAt > endsAt + 60_000),
      );
      if (bought) {
        run.skipped.push({ key, why: "already subscribed" });
        continue;
      }
      const already = await withAdmin((db) =>
        db
          .select({ id: billingEvents.id })
          .from(billingEvents)
          .where(
            and(
              eq(billingEvents.event, "trial_reminder_sent"),
              sql`${billingEvents.metadata}->>'key' = ${key}`,
            ),
          )
          .limit(1),
      );
      if (already.length) {
        run.skipped.push({ key, why: "already sent" });
        continue;
      }

      const email = buildTrialReminderEmail({
        vi: row.interfaceLanguage === "vi",
        name: row.fullName ?? "",
        endsAt,
        upgradeUrl: `${siteUrl()}/pricing`,
      });
      if (opts.dryRun) {
        run.sent.push(`${key} → ${row.email} (dry run: "${email.subject}")`);
        continue;
      }
      await sendEmail({ to: row.email, subject: email.subject, html: email.html });
      await logBillingEvent("trial_reminder_sent", {
        userId: row.userId,
        env,
        metadata: { key, daysBefore: TRIAL_REMINDER_DAYS, trialEnd: row.expiresAt },
      });
      run.sent.push(key);
      console.log(`[trial] reminder sent: ${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.errors.push(`${key}: ${message}`);
      console.warn(`[trial] reminder failed for ${key}:`, message);
    }
  }
}

/**
 * Sends every reminder that is due now. `dryRun` reports what would be sent without emailing or recording
 * anything (used to check the job safely on production).
 */
export async function sendDueRenewalReminders(
  opts: { dryRun?: boolean; ignoreQuietHours?: boolean } = {},
): Promise<ReminderRun> {
  const at = new Date();
  const hour = vietnamHour(at);
  const quietHours = hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR;
  const run: ReminderRun = {
    at: at.toISOString(),
    checked: 0,
    sent: [],
    skipped: [],
    errors: [],
    quietHours,
  };
  if (quietHours && !opts.ignoreQuietHours && !opts.dryRun) {
    lastRun = run;
    return run;
  }

  const env = getPaymentsEnv();
  const now = at.getTime();
  const [due, plans] = await withAdmin((db) =>
    Promise.all([
      db
        .select({
          userId: subscriptions.userId,
          providerSubscriptionId: subscriptions.providerSubscriptionId,
          priceId: subscriptions.priceId,
          billingInterval: subscriptions.billingInterval,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          email: profiles.email,
          fullName: profiles.fullName,
          interfaceLanguage: profiles.interfaceLanguage,
        })
        .from(subscriptions)
        .innerJoin(profiles, eq(profiles.id, subscriptions.userId))
        .where(
          and(
            eq(subscriptions.environment, env),
            eq(subscriptions.status, "active"),
            like(subscriptions.providerSubscriptionId, "sepay_%"),
            gt(subscriptions.currentPeriodEnd, new Date(now).toISOString()),
            lte(subscriptions.currentPeriodEnd, new Date(now + 7 * DAY_MS).toISOString()),
          ),
        ),
      db
        .select({
          tier: billingPlans.tier,
          name: billingPlans.name,
          planKey: billingPlans.planKey,
          monthlyPriceId: billingPlans.monthlyPriceId,
          yearlyPriceId: billingPlans.yearlyPriceId,
        })
        .from(billingPlans),
    ]),
  );
  run.checked = due.length;

  for (const sub of due) {
    const endsAt = Date.parse(sub.currentPeriodEnd!);
    const remaining = endsAt - now;
    const threshold = THRESHOLDS.find((t) => remaining <= t * DAY_MS) ?? 7;
    const key = `${sub.providerSubscriptionId}:${sub.currentPeriodEnd!.slice(0, 10)}:${threshold}d`;
    try {
      if (!sub.email) {
        run.skipped.push({ key, why: "no email" });
        continue;
      }
      const plan = plans.find(
        (p) => p.monthlyPriceId === sub.priceId || p.yearlyPriceId === sub.priceId,
      );
      const rank = TIER_RANK[plan?.tier ?? "premium"] ?? 1;
      const renewed = (await activePaidCoverage(sub.userId, env)).some(
        (c) =>
          (TIER_RANK[c.tier] ?? 1) >= rank && (c.endsAt === null || c.endsAt > endsAt + 60_000),
      );
      if (renewed) {
        run.skipped.push({ key, why: "already renewed" });
        continue;
      }
      const already = await withAdmin((db) =>
        db
          .select({ id: billingEvents.id })
          .from(billingEvents)
          .where(
            and(
              eq(billingEvents.event, "renewal_reminder_sent"),
              sql`${billingEvents.metadata}->>'key' = ${key}`,
            ),
          )
          .limit(1),
      );
      if (already.length) {
        run.skipped.push({ key, why: "already sent" });
        continue;
      }

      const vi = sub.interfaceLanguage === "vi";
      const email = buildRenewalReminderEmail({
        vi,
        name: sub.fullName ?? "",
        planName: plan?.name ?? (vi ? "trả phí" : "paid"),
        interval: sub.billingInterval,
        endsAt,
        daysLeft: Math.max(1, Math.ceil(remaining / DAY_MS)),
        renewUrl: `${siteUrl()}/pricing?interval=${sub.billingInterval === "year" ? "year" : "month"}`,
      });
      if (opts.dryRun) {
        run.sent.push(`${key} → ${sub.email} (dry run: "${email.subject}")`);
        continue;
      }
      await sendEmail({ to: sub.email, subject: email.subject, html: email.html });
      await logBillingEvent("renewal_reminder_sent", {
        userId: sub.userId,
        planKey: plan?.planKey ?? "",
        intervalKey: sub.billingInterval,
        env,
        metadata: {
          key,
          subscriptionId: sub.providerSubscriptionId,
          daysBefore: threshold,
          periodEnd: sub.currentPeriodEnd,
        },
      });
      run.sent.push(key);
      console.log(`[renewal] reminder sent: ${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.errors.push(`${key}: ${message}`);
      console.warn(`[renewal] reminder failed for ${key}:`, message);
    }
  }

  try {
    await sendDueTrialReminders(run, opts, now, env);
  } catch (error) {
    run.errors.push(`trial reminders: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!opts.dryRun) lastRun = run;
  return run;
}

const LOOP_MS = 60 * 60_000;
let loopStarted = false;

/** Starts the hourly reminder job once per server process (first run one minute after start). */
export function ensureRenewalReminders(): void {
  if (loopStarted) return;
  loopStarted = true;
  const tick = () => {
    sendDueRenewalReminders().catch((error) =>
      console.warn("[renewal] reminder run failed:", error),
    );
  };
  const first = setTimeout(tick, 60_000);
  (first as { unref?: () => void }).unref?.();
  const timer = setInterval(tick, LOOP_MS);
  (timer as { unref?: () => void }).unref?.();
}
