import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AdminBankTransfers } from "@/components/lily/admin-bank-transfers";
import { PanelCard, ScoreStat } from "@/components/lily/score-panel";
import { adminRevokeBankTransferOrder } from "@/lib/bank-transfer.functions";
import {
  adminBillingOverview,
  grantComplimentaryAccess,
  revokeComplimentaryAccess,
} from "@/lib/billing-admin.functions";
import { useI18n } from "@/lib/i18n";
import { formatMoney, minorToMajor } from "./billing-ui";

const SUBSCRIPTIONS_PAGE_SIZE = 20;

/** Admin view of subscriptions, revenue and complimentary access. */
export function AdminBillingPanel() {
  const { t, locale } = useI18n();
  const load = useServerFn(adminBillingOverview);
  const grant = useServerFn(grantComplimentaryAccess);
  const revoke = useServerFn(revokeComplimentaryAccess);
  const revokeBankOrder = useServerFn(adminRevokeBankTransferOrder);
  const queryClient = useQueryClient();
  // Two-step revoke: the first click arms the row, the second one (labelled "Confirm") does it.
  const [revokeArmedId, setRevokeArmedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<"premium" | "ielts_pro">("premium");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [subPage, setSubPage] = useState(0);

  const overview = useQuery({
    queryKey: ["admin-billing"],
    queryFn: () => load({ data: undefined as never }),
  });

  const allSubscriptions = overview.data?.subscriptions ?? [];
  const subPageCount = Math.max(1, Math.ceil(allSubscriptions.length / SUBSCRIPTIONS_PAGE_SIZE));
  const currentSubPage = Math.min(subPage, subPageCount - 1);
  const visibleSubscriptions = allSubscriptions.slice(
    currentSubPage * SUBSCRIPTIONS_PAGE_SIZE,
    (currentSubPage + 1) * SUBSCRIPTIONS_PAGE_SIZE,
  );

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

  const submitRevokeBankOrder = async (orderId: string) => {
    setRevokingId(orderId);
    try {
      await revokeBankOrder({ data: { orderId } });
      toast.success("Plan revoked — the learner no longer has access from this payment.");
      setRevokeArmedId(null);
      // Show it at once: flip the row in the cached table now, then let the refresh below confirm it with
      // the server (no waiting, no F5).
      const nowIso = new Date().toISOString();
      queryClient.setQueryData(["admin-billing"], (old: typeof overview.data) =>
        old
          ? {
              ...old,
              subscriptions: old.subscriptions.map((row) =>
                row.bank_order_id === orderId
                  ? { ...row, status: "canceled", cancel_at_period_end: true, current_period_end: nowIso }
                  : row,
              ),
            }
          : old,
      );
      // Everything that shows plans or orders: this table, the orders/SePay panel, the members list, and
      // the learner-side billing data cached in this browser.
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const head = String(q.queryKey[0] ?? "");
          return head.startsWith("admin-") || head === "my-billing" || head === "my-payments";
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setRevokingId(null);
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

      <AdminBankTransfers />

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
                <th className="py-2">User</th>
                <th className="py-2">{t("adminBilling.plan")}</th>
                <th className="py-2">{t("billing.status")}</th>
                <th className="py-2">{t("billing.total")}</th>
                <th className="py-2">{t("adminBilling.renews")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleSubscriptions.map((row, index) => (
                <tr key={`${row.user_id}-${currentSubPage}-${index}`} className="border-t border-border/60">
                  <td className="py-2 text-muted-foreground">{row.email || row.user_id.slice(0, 8)}</td>
                  <td className="py-2 text-foreground">{row.price_id}</td>
                  <td className="py-2 text-muted-foreground">
                    {row.status}
                    {row.payment_method === "bank_transfer" ? (
                      // Bank-transfer plans are one period only: they never auto-renew, so "cancelling" was misleading.
                      <span> · bank transfer, no auto-renew</span>
                    ) : row.cancel_at_period_end ? (
                      ` · ${t("adminBilling.cancelling")}`
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {formatMoney(minorToMajor(row.amount ?? 0, row.currency || "USD"), row.currency || "USD", locale)}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.current_period_end ? row.current_period_end.slice(0, 10) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {row.bank_order_id &&
                      (row.status !== "canceled" ||
                        (row.current_period_end !== null && new Date(row.current_period_end).getTime() > Date.now())) &&
                      (revokeArmedId === row.bank_order_id ? (
                        <span className="inline-flex gap-1.5">
                          <button
                            type="button"
                            disabled={revokingId === row.bank_order_id}
                            onClick={() => void submitRevokeBankOrder(row.bank_order_id!)}
                            className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
                          >
                            {revokingId === row.bank_order_id ? t("common.loading") : "Confirm revoke"}
                          </button>
                          <button
                            type="button"
                            disabled={revokingId === row.bank_order_id}
                            onClick={() => setRevokeArmedId(null)}
                            className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-border"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevokeArmedId(row.bank_order_id)}
                          title="Ends this bank-transfer plan right now (use when the payment was never received)"
                          className="rounded-full bg-surface-3 px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
                        >
                          Revoke
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Page {currentSubPage + 1} of {subPageCount} · showing {allSubscriptions.length} of{" "}
            {totals?.subscriptions ?? allSubscriptions.length} subscriptions
            {(totals?.subscriptions ?? 0) > allSubscriptions.length ? " (list is capped at the 200 newest)" : ""}
          </span>
          {subPageCount > 1 && (
            <span className="flex gap-2">
              <button
                type="button"
                disabled={currentSubPage === 0}
                onClick={() => setSubPage(currentSubPage - 1)}
                className="rounded-full bg-surface-3 px-3 py-1 font-semibold text-foreground ring-1 ring-border disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={currentSubPage >= subPageCount - 1}
                onClick={() => setSubPage(currentSubPage + 1)}
                className="rounded-full bg-surface-3 px-3 py-1 font-semibold text-foreground ring-1 ring-border disabled:opacity-50"
              >
                Next
              </button>
            </span>
          )}
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
