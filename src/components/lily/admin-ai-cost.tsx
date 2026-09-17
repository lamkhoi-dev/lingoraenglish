import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getAiCostReport, updateAiCostSettings } from "@/lib/admin.functions";

type Report = Awaited<ReturnType<typeof getAiCostReport>>;

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Mục 3.2 "Theo dõi và kiểm soát chi phí" — the admin side of ai-cost.server.ts.
 * The backend (getAiCostReport / updateAiCostSettings, logUsage's per-call
 * pricing) shipped without this panel wired to it, so the budget/alert an
 * admin set had no screen to set it from. This is that screen.
 */
export function AdminAiCostPanel() {
  const getReport = useServerFn(getAiCostReport);
  const saveSettings = useServerFn(updateAiCostSettings);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("80");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void getReport({ data: undefined as never })
      .then((res) => {
        setReport(res);
        setBudgetInput(res.today.budgetUsd === null ? "" : String(res.today.budgetUsd));
        setThresholdInput(String(res.today.alertThresholdPercent));
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not load the AI cost report"),
      )
      .finally(() => setLoading(false));
  }, [getReport]);

  useEffect(refresh, [refresh]);

  const save = async () => {
    const budget = budgetInput.trim() === "" ? null : Number(budgetInput);
    const threshold = Number(thresholdInput);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      toast.error("Daily budget must be empty (no limit) or a number ≥ 0.");
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      toast.error("Alert threshold must be a whole number between 1 and 100.");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        data: { dailyBudgetUsd: budget, alertThresholdPercent: Math.round(threshold) },
      });
      toast.success("Saved.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lounge-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">AI cost (mục 3.2)</h2>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Estimated from published per-call pricing at the time each call was made — see
        ai-cost.server.ts. Not a substitute for the provider's own invoice.
      </p>

      {report && (
        <>
          <div className="mt-4 rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Today's spend</span>
              <span
                className={
                  report.today.overBudget
                    ? "text-sm font-semibold text-destructive"
                    : report.today.alerting
                      ? "text-sm font-semibold text-brass-soft"
                      : "text-sm text-foreground"
                }
              >
                {usd(report.today.spentUsd)}
                {report.today.budgetUsd !== null
                  ? ` / ${usd(report.today.budgetUsd)}`
                  : " (no limit set)"}
              </span>
            </div>
            {report.today.overBudget && (
              <p className="mt-2 text-xs text-destructive">
                Daily budget reached — new AI calls are being refused until the window rolls over at
                UTC midnight (assertWithinDailyBudget in ai-cost.server.ts).
              </p>
            )}
            {!report.today.overBudget && report.today.alerting && (
              <p className="mt-2 text-xs text-brass-soft">
                Past the {report.today.alertThresholdPercent}% alert threshold.
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Daily budget (USD, empty = no limit)
                <input
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="empty = no limit"
                  className="mt-1.5 w-full rounded-lg bg-surface-3 px-2 py-1.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Alert threshold (% of budget)
                <input
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg bg-surface-3 px-2 py-1.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="mt-3 rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brass-soft">
                Last 30 days — by feature
              </h3>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1">Feature</th>
                    <th className="py-1 text-right">Calls</th>
                    <th className="py-1 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byFeature.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-muted-foreground">
                        No AI calls logged yet.
                      </td>
                    </tr>
                  )}
                  {report.byFeature.map((row) => (
                    <tr key={row.capability} className="border-t border-border/60">
                      <td className="py-1.5 text-foreground">{row.capability}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{row.calls}</td>
                      <td className="py-1.5 text-right text-foreground">{usd(row.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brass-soft">
                Last 30 days — by day
              </h3>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1">Day</th>
                    <th className="py-1 text-right">Calls</th>
                    <th className="py-1 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDay.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-muted-foreground">
                        No AI calls logged yet.
                      </td>
                    </tr>
                  )}
                  {[...report.byDay].reverse().map((row) => (
                    <tr key={row.day} className="border-t border-border/60">
                      <td className="py-1.5 text-foreground">{row.day}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{row.calls}</td>
                      <td className="py-1.5 text-right text-foreground">{usd(row.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
