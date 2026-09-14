/**
 * "My subscription" panel for the learner dashboard.
 * All values come from the provider-synced subscription row; the buttons call
 * server functions that talk to the payment provider.
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { formatMoney } from "@/components/lily/billing-ui";
import { PanelCard } from "@/components/lily/score-panel";
import { useBilling } from "@/hooks/use-billing";
import {
  cancelMySubscription,
  createPortalSession,
  keepMySubscription,
} from "@/lib/billing.functions";
import { useI18n } from "@/lib/i18n";

type SubscriptionRow = {
  status: string;
  billing_interval: string;
  currency: string;
  amount: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
};

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

export function SubscriptionSummary() {
  const { t, locale } = useI18n();
  const billing = useBilling();
  const openPortal = useServerFn(createPortalSession);
  const cancelSub = useServerFn(cancelMySubscription);
  const keepSub = useServerFn(keepMySubscription);
  const [busy, setBusy] = useState(false);

  const entitlement = billing.data?.entitlement;
  const subscription = billing.data?.subscription as SubscriptionRow | null | undefined;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await billing.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  const rows: { label: string; value: string }[] = [
    { label: t("billing.currentPlan"), value: entitlement?.planName ?? t("pricing.free") },
    {
      label: t("billing.status"),
      value: subscription
        ? t(`billing.state.${subscription.status}` as never) || subscription.status
        : t("billing.noSubscription"),
    },
    {
      label: t("dash.sub.interval"),
      value: subscription
        ? subscription.billing_interval === "year"
          ? t("pricing.yearly")
          : t("pricing.monthly")
        : "—",
    },
    {
      label: t("dash.sub.nextBilling"),
      value: subscription && !subscription.cancel_at_period_end
        ? formatDate(subscription.current_period_end, locale)
        : "—",
    },
    {
      label: t("dash.sub.period"),
      value: subscription
        ? `${formatDate(subscription.current_period_start, locale)} → ${formatDate(subscription.current_period_end, locale)}`
        : "—",
    },
    {
      label: t("billing.total"),
      value: subscription?.amount
        ? `${formatMoney(subscription.amount / 100, subscription.currency, locale)} ${
            subscription.billing_interval === "year" ? t("pricing.perYear") : t("pricing.perMonth")
          }`
        : t("pricing.free"),
    },
  ];

  return (
    <PanelCard title={t("dash.sub.title")}>
      {billing.isLoading && <p className="mt-2 text-sm text-muted-foreground">{t("common.loading")}</p>}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
            <dd className="text-sm text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      {subscription?.status === "past_due" && (
        <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          {t("billing.state.past_due")}
        </p>
      )}

      {subscription?.cancel_at_period_end && subscription.current_period_end && (
        <p className="mt-4 text-sm text-accent">
          {t("billing.endsOn", { date: formatDate(subscription.current_period_end, locale) })}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {subscription ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const session = await openPortal({ data: undefined as never });
                  window.open(session.overviewUrl, "_blank", "noopener");
                }, t("billing.portalOpened"))
              }
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {t("billing.manage")}
            </button>
            {subscription.cancel_at_period_end ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => keepSub({ data: undefined as never }), t("billing.kept"))
                }
                className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep disabled:opacity-60"
              >
                {t("billing.keepPlan")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t("billing.cancelConfirm"))) return;
                  void run(() => cancelSub({ data: undefined as never }), t("billing.cancelled"));
                }}
                className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-destructive disabled:opacity-60"
              >
                {t("billing.cancelPlan")}
              </button>
            )}
          </>
        ) : null}
        <Link
          to="/pricing"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {subscription ? t("billing.changePlan") : t("dash.viewPlans")}
        </Link>
      </div>
    </PanelCard>
  );
}
