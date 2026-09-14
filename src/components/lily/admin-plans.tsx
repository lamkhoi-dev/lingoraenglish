import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PanelCard, ScoreStat } from "./score-panel";
import { adminListPlans, adminUpdatePlan } from "@/lib/plan-admin.functions";
import { useI18n } from "@/lib/i18n";

type PlanRow = {
  plan_key: string;
  tier: string;
  name: string;
  limits: Record<string, number>;
  trial_enabled: boolean;
  trial_days: number;
  is_active: boolean;
};

type Draft = Record<
  string,
  { limits: Record<string, number>; trialEnabled: boolean; trialDays: number; isActive: boolean }
>;

/** Admin panel: configurable free / Premium / IELTS Pro allowances. */
export function AdminPlansPanel() {
  const { t, formatPercent } = useI18n();
  const load = useServerFn(adminListPlans);
  const save = useServerFn(adminUpdatePlan);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => load({ data: undefined as never }),
  });

  useEffect(() => {
    if (!query.data) return;
    const next: Draft = {};
    for (const plan of query.data.plans as unknown as PlanRow[]) {
      next[plan.plan_key] = {
        limits: { ...(plan.limits ?? {}) },
        trialEnabled: plan.trial_enabled,
        trialDays: plan.trial_days,
        isActive: plan.is_active,
      };
    }
    setDraft(next);
  }, [query.data]);

  const stats = query.data?.stats;
  const limitKeys = query.data?.limitKeys ?? [];

  const persist = async (planKey: string) => {
    const entry = draft[planKey];
    if (!entry) return;
    setBusy(planKey);
    try {
      await save({
        data: {
          planKey,
          limits: entry.limits,
          trialEnabled: entry.trialEnabled,
          trialDays: entry.trialDays,
          isActive: entry.isActive,
        },
      });
      toast.success(t("adminLimits.saved"));
      await query.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PanelCard title={t("adminLimits.users")}>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ScoreStat label="Learners" value={stats?.learners ?? 0} suffix="" />
          <ScoreStat label="Free" value={stats?.free ?? 0} suffix="" />
          <ScoreStat label="Premium" value={stats?.premium ?? 0} suffix="" />
          <ScoreStat label="IELTS Pro" value={stats?.ieltsPro ?? 0} suffix="" />
          <ScoreStat label="Trialing" value={stats?.trialing ?? 0} suffix="" />
          <ScoreStat label="Canceled" value={stats?.canceled ?? 0} suffix="" />
          <ScoreStat label="Failed payments" value={stats?.failed ?? 0} suffix="" />
          <div>
            <div className="font-display text-3xl text-brass-soft">
              {formatPercent(stats?.conversion ?? 0, 1)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("adminLimits.conversion")}</p>
          </div>
        </div>
      </PanelCard>

      <PanelCard title={t("adminLimits.title")}>
        <p className="mt-1 text-xs text-muted-foreground">{t("adminLimits.sub")}</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {((query.data?.plans ?? []) as unknown as PlanRow[]).map((plan) => {
            const entry = draft[plan.plan_key];
            if (!entry) return null;
            return (
              <div key={plan.plan_key} className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
                <h3 className="font-display text-base text-foreground">{plan.name}</h3>
                <div className="mt-3 space-y-2">
                  {limitKeys.map((key) => (
                    <label key={key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
                      <input
                        type="number"
                        min={0}
                        value={entry.limits[key] ?? 0}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [plan.plan_key]: {
                              ...entry,
                              limits: { ...entry.limits, [key]: Number(e.target.value) },
                            },
                          }))
                        }
                        className="w-24 rounded-lg bg-surface-3 px-2 py-1 text-right text-foreground outline-none ring-1 ring-border focus:ring-brass"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={entry.trialEnabled}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [plan.plan_key]: { ...entry, trialEnabled: e.target.checked },
                        }))
                      }
                    />
                    {t("adminLimits.trialEnabled")}
                  </label>
                  <label className="flex items-center justify-between gap-2 text-muted-foreground">
                    {t("adminLimits.trialDays")}
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={entry.trialDays}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [plan.plan_key]: { ...entry, trialDays: Number(e.target.value) },
                        }))
                      }
                      className="w-24 rounded-lg bg-surface-3 px-2 py-1 text-right text-foreground outline-none ring-1 ring-border focus:ring-brass"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={entry.isActive}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [plan.plan_key]: { ...entry, isActive: e.target.checked },
                        }))
                      }
                    />
                    {t("adminLimits.active")}
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void persist(plan.plan_key)}
                  disabled={busy === plan.plan_key}
                  className="mt-4 w-full rounded-full bg-brass py-2 text-xs font-semibold text-plum-deep disabled:opacity-50"
                >
                  {t("adminLimits.save")}
                </button>
              </div>
            );
          })}
        </div>
      </PanelCard>
    </div>
  );
}
