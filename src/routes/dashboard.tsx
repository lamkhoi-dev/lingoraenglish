import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { UsageMeter } from "@/components/lily/paywall";
import { PanelCard, ScoreBar } from "@/components/lily/score-panel";
import { SubscriptionSummary } from "@/components/lily/subscription-summary";
import { useBilling } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth";
import { getCoachUsage, type CoachUsage } from "@/lib/coach.functions";
import { useI18n } from "@/lib/i18n";
import { getDashboardProgress, getTodayCompletion } from "@/lib/progress.functions";
import { en } from "@/locales/en";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: en["dash.meta.title"] },
      { name: "description", content: en["dash.meta.description"] },
      { property: "og:title", content: en["dash.meta.title"] },
      { property: "og:description", content: en["dash.meta.description"] },
    ],
  }),
  component: DashboardPage,
});

type Progress = {
  speaking: number;
  vocabulary: number;
  grammar: number;
  listening: number;
  pronunciation: number;
};

/**
 * The other 5 official free/premium thresholds (Yêu cầu 10) are fixed
 * content-unlock rules, not depleting monthly counters — shown as a static
 * rule rather than a usage meter. AI Speaking Coach is the only one of the 6
 * that's a real usage meter (see coachUsage below), since it's the only one
 * counted by turns used rather than by which items are unlocked.
 */
const FIXED_LIMITS: { label: string; freeText: string }[] = [
  { label: "nav.pronunciation", freeText: "dash.limits.pronunciationSounds" },
  { label: "nav.vocabulary", freeText: "dash.limits.vocabulary" },
  { label: "nav.tests", freeText: "dash.limits.speakingTests" },
  { label: "nav.listeningLab", freeText: "dash.limits.listeningLab" },
  { label: "dash.limits.pronunciationAdvancedLabel", freeText: "dash.limits.pronunciationAdvanced" },
];

const TODAY_TASKS = [
  { to: "/vocabulary" as const, label: "nav.vocabulary" as const },
  { to: "/ai-speaking" as const, label: "nav.coach" as const },
  { to: "/shadowing" as const, label: "nav.shadowing" as const },
  { to: "/listening-lab" as const, label: "nav.listeningLab" as const },
];

function DashboardPage() {
  const { t } = useI18n();
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const billing = useBilling();
  const getDashboardProgressFn = useServerFn(getDashboardProgress);
  const getTodayCompletionFn = useServerFn(getTodayCompletion);
  const getCoachUsageFn = useServerFn(getCoachUsage);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [coachUsage, setCoachUsage] = useState<CoachUsage | null>(null);
  const [doneToday, setDoneToday] = useState<Record<(typeof TODAY_TASKS)[number]["to"], boolean>>({
    "/vocabulary": false,
    "/ai-speaking": false,
    "/shadowing": false,
    "/listening-lab": false,
  });

  // The learner's private dashboard is never rendered for visitors; all data is
  // additionally protected by row-level security on the server.
  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", search: { next: "/dashboard" } as never });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void getDashboardProgressFn().then(setProgress);
  }, [user, getDashboardProgressFn]);

  useEffect(() => {
    if (!user) return;
    void getCoachUsageFn().then(setCoachUsage).catch(() => setCoachUsage(null));
  }, [user, getCoachUsageFn]);

  // "Today's practice" completion: derived from real activity rows created/updated
  // since local midnight, not a separate plan table — no AI call needed.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const today = await getTodayCompletionFn();
      setDoneToday({
        "/vocabulary": today.vocabulary,
        "/ai-speaking": today.aiSpeaking,
        "/shadowing": today.shadowing,
        "/listening-lab": today.listeningLab,
      });
    })();
  }, [user, getTodayCompletionFn]);

  const entitlement = billing.data?.entitlement;
  const tier = entitlement?.tier ?? "free";
  const firstName = (profile?.full_name || user?.email || "").split(/[\s@]/)[0] ?? "";

  return (
    <AppShell>
      <SectionHeading
        eyebrow={t("nav.dashboard")}
        title={t("dash.welcome", { name: firstName })}
        description={t("dash.journey")}
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <PanelCard title={t("dash.journey")}>
          <div className="mt-4 space-y-4">
            <ScoreBar label={t("nav.speaking")} value={progress?.speaking ?? 0} max={100} />
            <ScoreBar label={t("nav.listening")} value={progress?.listening ?? 0} max={100} />
            <ScoreBar label={t("nav.pronunciation")} value={progress?.pronunciation ?? 0} max={100} />
            <ScoreBar label={t("nav.vocabulary")} value={progress?.vocabulary ?? 0} max={100} />
          </div>
        </PanelCard>

        <PanelCard title={t("dash.remaining")}>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("dash.planLabel")}: {entitlement?.planName ?? t("plan.free")}
          </p>
          <div className="mt-4 grid gap-3">
            {/* AI Speaking Coach is the one official limit that's a real usage
                meter (turns used), read from coach_turns via getCoachUsage() —
                not the legacy entitlements.server.ts capability system. */}
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
            {/* The other 5 official limits are fixed content-unlock thresholds,
                not depleting counters, so they're shown as a plain rule. */}
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
      </div>

      <div className="mt-5">
        <SubscriptionSummary />
      </div>



      <PanelCard title={t("dash.today")}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TODAY_TASKS.map((task) => {
            const done = doneToday[task.to];
            return (
              <Link
                key={task.to}
                to={task.to}
                className="relative rounded-2xl bg-surface-2/70 p-4 text-sm font-semibold text-foreground ring-1 ring-border transition hover:bg-surface-3"
              >
                {done && (
                  <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brass text-[10px] text-plum-deep">
                    ✓
                  </span>
                )}
                {t(task.label)}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {done ? t("dash.doneToday") : t("dash.continue")}
                </span>
              </Link>
            );
          })}
        </div>
      </PanelCard>

      {tier === "free" && (
        <div className="mt-5 rounded-3xl border border-brass/25 bg-surface-2/50 p-6">
          <h3 className="font-display text-xl text-foreground">{t("dash.upgradeTitle")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("dash.upgradeBody")}</p>
          <Link
            to="/pricing"
            className="mt-4 inline-flex rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
          >
            {t("dash.viewPlans")}
          </Link>
        </div>
      )}
    </AppShell>
  );
}
