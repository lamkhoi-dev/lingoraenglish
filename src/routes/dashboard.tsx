import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { PanelCard } from "@/components/lily/score-panel";
import { SubscriptionSummary } from "@/components/lily/subscription-summary";
import { AiUsagePanel, ProgressSummaryPanel } from "@/components/lily/usage-progress";
import { useBilling } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getTodayCompletion } from "@/lib/progress.functions";
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
  const getTodayCompletionFn = useServerFn(getTodayCompletion);
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
        {/* Yêu cầu 13: /progress is the single progress-tracking page — this is
            a summary that links there, sharing its data so they cannot differ. */}
        <ProgressSummaryPanel />

        <AiUsagePanel />
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
