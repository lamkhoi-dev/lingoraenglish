import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PanelCard, ScoreStat } from "@/components/lily/score-panel";
import {
  adminBillingOverview,
  grantComplimentaryAccess,
  revokeComplimentaryAccess,
} from "@/lib/billing-admin.functions";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "./billing-ui";

/** Admin view of subscriptions, revenue and complimentary access. */
export function AdminBillingPanel() {
  const { t, locale } = useI18n();
  const load = useServerFn(adminBillingOverview);
  const grant = useServerFn(grantComplimentaryAccess);
  const revoke = useServerFn(revokeComplimentaryAccess);

  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<"premium" | "ielts_pro">("premium");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const overview = useQuery({
    queryKey: ["admin-billing"],
    queryFn: () => load({ data: undefined as never }),
  });

  const submitGrant = async () => {
    setBusy(true);
    try {
      await grant({ data: { email: email.trim(), tier, days: Number(days) || 30 } });
      toast.success(t("adminBilling.granted"));
      setEmail("");
      await overview.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  const totals = overview.data?.totals;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.subscribers")} value={totals?.subscribers ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.active")} value={totals?.active ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.freeUsers")} value={totals?.freeUsers ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.trialing")} value={totals?.trialing ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.monthlySubs")} value={totals?.monthly ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.yearlySubs")} value={totals?.yearly ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.pastDue")} value={totals?.failedPayments ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("adminBilling.canceled")} value={totals?.canceled ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("adminBilling.mrr")}</p>
          <p className="mt-1 text-2xl font-semibold text-brass-soft">
            {formatMoney(totals?.mrr ?? 0, "USD", locale)}
          </p>
        </div>
        <div className="lounge-panel p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("adminBilling.totalRevenue")}
          </p>
          <p className="mt-1 text-2xl font-semibold text-brass-soft">
            {formatMoney(totals?.totalRevenue ?? 0, "USD", locale)}
          </p>
        </div>
      </div>

      <PanelCard title={t("adminBilling.recentPayments")}>
        {!(overview.data?.recentPayments ?? []).length && (
          <p className="text-sm text-muted-foreground">{t("billing.noPayments")}</p>
        )}
        <ul className="divide-y divide-border text-sm">
          {(overview.data?.recentPayments ?? []).map((payment, index) => (
            <li key={`${payment.date}-${index}`} className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">{payment.date.slice(0, 10)}</span>
              <span className="text-brass-soft">
                {formatMoney(payment.amount, payment.currency || "USD", locale)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("adminBilling.revenueNote")}</p>
      </PanelCard>

      <PanelCard title={t("adminBilling.subscriptions")}>
        {overview.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">{t("adminBilling.plan")}</th>
                <th className="py-2">{t("billing.status")}</th>
                <th className="py-2">{t("billing.total")}</th>
                <th className="py-2">{t("adminBilling.renews")}</th>
              </tr>
            </thead>
            <tbody>
              {(overview.data?.subscriptions ?? []).map((row, index) => (
                <tr key={`${row.user_id}-${index}`} className="border-t border-border/60">
                  <td className="py-2 text-foreground">{row.price_id}</td>
                  <td className="py-2 text-muted-foreground">
                    {row.status}
                    {row.cancel_at_period_end ? ` · ${t("adminBilling.cancelling")}` : ""}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {formatMoney((row.amount ?? 0) / 100, row.currency || "USD", locale)}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.current_period_end ? row.current_period_end.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard title={t("adminBilling.funnel")}>
        <ul className="divide-y divide-border text-sm">
          {Object.entries(overview.data?.funnel ?? {}).map(([event, count]) => (
            <li key={event} className="flex items-center justify-between py-2">
              <span className="text-foreground">{event.replace(/_/g, " ")}</span>
              <span className="text-brass-soft">{count}</span>
            </li>
          ))}
        </ul>
      </PanelCard>

      <PanelCard title={t("adminBilling.complimentary")}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            {t("admin.email")}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block rounded-full border border-border bg-background px-4 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("adminBilling.plan")}
            <select
              value={tier}
              onChange={(event) => setTier(event.target.value as "premium" | "ielts_pro")}
              className="mt-1 block rounded-full border border-border bg-background px-4 py-2 text-sm"
            >
              <option value="premium">Premium</option>
              <option value="ielts_pro">IELTS Pro</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("adminBilling.days")}
            <input
              value={days}
              onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
              className="mt-1 block w-24 rounded-full border border-border bg-background px-4 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => void submitGrant()}
            className="rounded-full bg-brass px-5 py-2 text-sm font-semibold text-plum-deep disabled:opacity-60"
          >
            {t("adminBilling.grant")}
          </button>
        </div>

        <ul className="mt-4 divide-y divide-border text-sm">
          {(overview.data?.complimentary ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-foreground">
                {row.tier} · {row.expires_at ? row.expires_at.slice(0, 10) : t("adminBilling.noExpiry")}
              </span>
              <button
                type="button"
                className="text-xs font-medium text-destructive underline"
                onClick={() =>
                  void (async () => {
                    try {
                      await revoke({ data: { id: row.id } });
                      toast.success(t("adminBilling.revoked"));
                      await overview.refetch();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
                    }
                  })()
                }
              >
                {t("adminBilling.revoke")}
              </button>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
