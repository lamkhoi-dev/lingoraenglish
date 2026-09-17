/**
 * The two panels Yêu cầu 12 needs on /account (mục 8 "Mức sử dụng AI" and mục 9
 * "Tiến độ học tập"), shared with /dashboard so both pages read the same
 * numbers from the same server functions instead of drifting apart.
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { UsageMeter } from "@/components/lily/paywall";
import { PanelCard, ScoreBar } from "@/components/lily/score-panel";
import { useBilling } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth";
import { getCoachUsage, type CoachUsage } from "@/lib/coach.functions";
import { useI18n } from "@/lib/i18n";
import { getProgressOverview } from "@/lib/progress.functions";

/**
 * The other 5 official free/premium thresholds (Yêu cầu 10) are fixed
 * content-unlock rules, not depleting monthly counters — shown as a static
 * rule rather than a usage meter. AI Speaking Coach is the only one of the 6
 * that's a real usage meter, since it's the only one counted by turns used
 * rather than by which items are unlocked.
 */
const FIXED_LIMITS: { label: string; freeText: string }[] = [
  { label: "nav.pronunciation", freeText: "dash.limits.pronunciationSounds" },
  { label: "nav.vocabulary", freeText: "dash.limits.vocabulary" },
  { label: "nav.tests", freeText: "dash.limits.speakingTests" },
  { label: "nav.listeningLab", freeText: "dash.limits.listeningLab" },
  {
    label: "dash.limits.pronunciationAdvancedLabel",
    freeText: "dash.limits.pronunciationAdvanced",
  },
];

export function AiUsagePanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const billing = useBilling();
  const getCoachUsageFn = useServerFn(getCoachUsage);
  const [coachUsage, setCoachUsage] = useState<CoachUsage | null>(null);

  useEffect(() => {
    if (!user) return;
    void getCoachUsageFn()
      .then(setCoachUsage)
      .catch(() => setCoachUsage(null));
  }, [user, getCoachUsageFn]);

  const entitlement = billing.data?.entitlement;
  const tier = entitlement?.tier ?? "free";

  return (
    <PanelCard title={t("dash.remaining")}>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("dash.planLabel")}: {entitlement?.planName ?? t("plan.free")}
      </p>
      <div className="mt-4 grid gap-3">
        {coachUsage && !coachUsage.unlimited && (
          <UsageMeter
            label={t("nav.coach")}
            used={coachUsage.tier === "free" ? coachUsage.freeTurnsUsed : coachUsage.monthlyUsed}
            limit={coachUsage.tier === "free" ? coachUsage.freeTurnLimit : coachUsage.monthlyLimit}
          />
        )}
        {coachUsage?.unlimited && (
          <div className="rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{t("nav.coach")}</span>
              <span className="text-xs text-muted-foreground">{t("dash.limits.allUnlocked")}</span>
            </div>
          </div>
        )}

        {/* The other real metered allowance (currently AI learning plans), from
            usage_counters via getEntitlement — used/remaining, like Yêu cầu 12
            mục 8 asks for. */}
        {Object.entries(entitlement?.limits ?? {}).map(([key, limit]) => (
          <UsageMeter
            key={key}
            label={t(`billing.limit.${key}` as never) || key}
            used={entitlement?.usage[key] ?? 0}
            limit={limit}
          />
        ))}
        {FIXED_LIMITS.map((item) => (
          <div key={item.label} className="rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{t(item.label as never)}</span>
              <span className="text-xs text-muted-foreground">
                {tier === "free" ? t(item.freeText as never) : t("dash.limits.allUnlocked")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

/**
 * Yêu cầu 12 mục 9 + Yêu cầu 13: a *summary* that links to /progress, which
 * stays the one and only progress-tracking page. It reads the same
 * getProgressOverview() the full page does, so the bars can never disagree —
 * and they are completion percentages, not the average scores the page used to
 * show (which Yêu cầu 13 rules out). The 5th "grammar" bar is gone with it:
 * the spec lists exactly four skills.
 */
export function ProgressSummaryPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const getProgressOverviewFn = useServerFn(getProgressOverview);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getProgressOverview>> | null>(
    null,
  );

  useEffect(() => {
    if (!user) return;
    void getProgressOverviewFn()
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [user, getProgressOverviewFn]);

  return (
    <PanelCard title={t("dash.journey")}>
      {overview && !overview.hasData ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("progress.emptyBody")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          <ScoreBar label={t("nav.speaking")} value={overview?.skills.speaking ?? 0} max={100} />
          <ScoreBar label={t("nav.listening")} value={overview?.skills.listening ?? 0} max={100} />
          <ScoreBar
            label={t("nav.pronunciation")}
            value={overview?.skills.pronunciation ?? 0}
            max={100}
          />
          <ScoreBar
            label={t("nav.vocabulary")}
            value={overview?.skills.vocabulary ?? 0}
            max={100}
          />
        </div>
      )}
      <Link
        to="/progress"
        className="mt-5 inline-block rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
      >
        {t("account.viewFullProgress")}
      </Link>
    </PanelCard>
  );
}
