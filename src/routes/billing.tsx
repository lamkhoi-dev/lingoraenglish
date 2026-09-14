import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { formatMoney, BillingCard } from "@/components/lily/billing-ui";
import { useBilling, usePlans } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth";
import {
  cancelMySubscription,
  changeMyPlan,
  createPortalSession,
  getInvoiceUrl,
  keepMySubscription,
  listMyPayments,
} from "@/lib/billing.functions";
import { useI18n } from "@/lib/i18n";
import { en } from "@/locales/en";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: en["billing.meta.title"] },
      { name: "description", content: en["billing.meta.description"] },
      { property: "og:title", content: en["billing.meta.title"] },
      { property: "og:description", content: en["billing.meta.description"] },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const billing = useBilling();
  const plans = usePlans();

  const fetchPayments = useServerFn(listMyPayments);
  const openPortal = useServerFn(createPortalSession);
  const cancelSub = useServerFn(cancelMySubscription);
  const keepSub = useServerFn(keepMySubscription);
  const switchPlan = useServerFn(changeMyPlan);
  const invoiceUrl = useServerFn(getInvoiceUrl);

  const [busy, setBusy] = useState(false);

  const payments = useQuery({
    queryKey: ["my-payments", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchPayments({ data: undefined as never }),
  });

  if (!user) {
    return (
      <AppShell>
        <SectionHeading title={t("billing.title")} description={t("billing.sub")} />
        <BillingCard className="mt-6">
          <p className="text-sm text-muted-foreground">{t("common.signInRequired")}</p>
          <Link to="/auth" className="mt-4 inline-block text-sm font-medium text-primary underline">
            {t("common.signIn")}
          </Link>
        </BillingCard>
      </AppShell>
    );
  }

  const entitlement = billing.data?.entitlement;
  const subscription = billing.data?.subscription as
    | {
        status: string;
        billing_interval: string;
        currency: string;
        amount: number | null;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
        trial_ends_at: string | null;
        price_id: string;
      }
    | null
    | undefined;

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

  const otherPaidPlans = (plans.data ?? []).filter(
    (plan) => plan.tier !== "free" && plan.tier !== entitlement?.tier,
  );

  return (
    <AppShell>
      <SectionHeading title={t("billing.title")} description={t("billing.sub")} />

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <BillingCard>
          <h3 className="text-base font-semibold text-foreground">{t("billing.currentPlan")}</h3>
          {billing.isLoading && <p className="mt-2 text-sm text-muted-foreground">{t("common.loading")}</p>}

          {entitlement && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-lg font-semibold text-foreground">{entitlement.planName}</p>
              {entitlement.complimentary && (
                <p className="text-xs font-medium text-accent">{t("billing.complimentary")}</p>
              )}
              {subscription ? (
                <>
                  <p className="text-muted-foreground">
                    {t("billing.status")}: <span className="text-foreground">{t(`billing.state.${subscription.status}` as never) || subscription.status}</span>
                  </p>
                  {subscription.amount ? (
                    <p className="text-muted-foreground">
                      {formatMoney(subscription.amount / 100, subscription.currency, locale)}{" "}
                      {subscription.billing_interval === "year" ? t("pricing.perYear") : t("pricing.perMonth")}
                    </p>
                  ) : null}
                  {subscription.trial_ends_at && (
                    <p className="text-muted-foreground">
                      {t("billing.trialEnds", { date: formatDate(subscription.trial_ends_at, locale) })}
                    </p>
                  )}
                  {subscription.current_period_end && (
                    <p className="text-muted-foreground">
                      {subscription.cancel_at_period_end
                        ? t("billing.endsOn", { date: formatDate(subscription.current_period_end, locale) })
                        : t("billing.renewsOn", { date: formatDate(subscription.current_period_end, locale) })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{t("billing.noSubscription")}</p>
              )}
            </div>
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
                  {t("billing.updatePayment")}
                </button>
                {subscription.cancel_at_period_end ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => keepSub({ data: undefined as never }), t("billing.kept"))}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
                    className="rounded-full border border-destructive/50 px-5 py-2.5 text-sm font-medium text-destructive disabled:opacity-60"
                  >
                    {t("billing.cancelPlan")}
                  </button>
                )}
              </>
            ) : (
              <Link
                to="/pricing"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                {t("billing.seePlans")}
              </Link>
            )}
          </div>

          {subscription && otherPaidPlans.length > 0 && (
            <div className="mt-6 border-t border-border/60 pt-5">
              <h4 className="text-sm font-semibold text-foreground">{t("billing.changePlan")}</h4>
              <div className="mt-3 flex flex-wrap gap-3">
                {otherPaidPlans.map((plan) => (
                  <button
                    key={plan.plan_key}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          switchPlan({
                            data: {
                              priceId:
                                subscription.billing_interval === "year"
                                  ? plan.yearly_price_id
                                  : plan.monthly_price_id,
                            },
                          }),
                        t("billing.planChanged"),
                      )
                    }
                    className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    {t("billing.switchTo", { plan: plan.name })}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("billing.prorationNote")}</p>
            </div>
          )}
        </BillingCard>

        <BillingCard>
          <h3 className="text-base font-semibold text-foreground">{t("billing.usage")}</h3>
          {entitlement ? (
            <ul className="mt-3 space-y-3 text-sm">
              {Object.entries(entitlement.limits).map(([key, limit]) => {
                const used = entitlement.usage[key] ?? 0;
                const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                return (
                  <li key={key}>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t(`billing.limit.${key}` as never) || key}</span>
                      <span className="text-foreground">
                        {used} / {limit}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("billing.usageNote")}</p>
        </BillingCard>
      </div>

      <BillingCard className="mt-5">
        <h3 className="text-base font-semibold text-foreground">{t("billing.history")}</h3>
        {payments.isLoading && <p className="mt-2 text-sm text-muted-foreground">{t("common.loading")}</p>}
        {payments.data && payments.data.payments.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">{t("billing.noPayments")}</p>
        )}
        {payments.data && payments.data.payments.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">{t("common.date")}</th>
                  <th className="py-2">{t("billing.description")}</th>
                  <th className="py-2">{t("billing.tax")}</th>
                  <th className="py-2">{t("billing.total")}</th>
                  <th className="py-2">{t("billing.status")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {payments.data.payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-border/60">
                    <td className="py-2 text-muted-foreground">{formatDate(payment.date, locale)}</td>
                    <td className="py-2 text-foreground">
                      {payment.description}
                      {payment.paymentMethod ? (
                        <span className="block text-xs text-muted-foreground">{payment.paymentMethod}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-muted-foreground">{formatMoney(payment.tax, payment.currency, locale)}</td>
                    <td className="py-2 text-foreground">{formatMoney(payment.total, payment.currency, locale)}</td>
                    <td className="py-2 text-muted-foreground">{payment.status}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary underline"
                        onClick={() =>
                          void (async () => {
                            try {
                              const { url } = await invoiceUrl({ data: { transactionId: payment.id } });
                              window.open(url, "_blank", "noopener");
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
                            }
                          })()
                        }
                      >
                        {t("billing.invoice")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">{t("billing.morNote")}</p>
      </BillingCard>
    </AppShell>
  );
}

function formatDate(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}
