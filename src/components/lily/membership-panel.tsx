/**
 * Membership status + payment history for "My Account".
 *
 * Everything shown here comes from server-verified data (the provider-synced
 * subscription row and the provider's own transaction list). Nothing about
 * access is decided in the browser.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { formatMoney } from "@/components/lily/billing-ui";
import { PanelCard } from "@/components/lily/score-panel";
import { useBilling } from "@/hooks/use-billing";
import { createPortalSession, getInvoiceUrl, listMyPayments } from "@/lib/billing.functions";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { rememberReturnPath } from "@/lib/upgrade-return";

function fmtDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

/** Small ⭐ PREMIUM MEMBER / FREE MEMBER pill, reusable anywhere. */
export function MembershipBadge({ tier, planName }: { tier: string; planName?: string | undefined }) {
  const { t } = useI18n();
  const paid = tier !== "free";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
        paid ? "bg-brass text-plum-deep shadow-brass" : "bg-surface-3 text-muted-foreground ring-1 ring-border"
      }`}
    >
      {paid ? "⭐" : null}
      {paid ? (planName ?? t("membership.premiumMember")) : t("membership.freeMember")}
    </span>
  );
}

export function MembershipPanel() {
  const { t, locale } = useI18n();
  const billing = useBilling();
  const openPortal = useServerFn(createPortalSession);
  const [busy, setBusy] = useState(false);

  const entitlement = billing.data?.entitlement;
  const subscription = billing.data?.subscription as
    | {
        status: string;
        billing_interval: string;
        currency: string;
        amount: number | null;
        current_period_start: string | null;
        current_period_end: string | null;
        started_at: string | null;
        created_at: string;
        cancel_at_period_end: boolean;
        trial_ends_at: string | null;
      }
    | null
    | undefined;

  const tier = entitlement?.tier ?? "free";
  const paid = tier !== "free";

  const rows: { label: string; value: string }[] = [
    { label: t("membership.plan"), value: entitlement?.planName ?? t("plan.free") },
    {
      // Yêu cầu 12: the original signup date. current_period_start would be
      // wrong here — the webhook moves it forward on every renewal. created_at
      // covers rows written before started_at was captured.
      label: t("membership.startDate"),
      value: fmtDate(subscription?.started_at ?? subscription?.created_at, locale),
    },
    {
      label: t("membership.expiresOn"),
      value: entitlement?.complimentary
        ? (entitlement.complimentaryExpiresAt
            ? fmtDate(entitlement.complimentaryExpiresAt, locale)
            : t("adminBilling.noExpiry"))
        : fmtDate(subscription?.current_period_end, locale),
    },
    {
      label: t("membership.paymentStatus"),
      value: subscription
        ? t(`billing.state.${subscription.status}` as never) || subscription.status
        : entitlement?.complimentary
          ? t("billing.complimentary")
          : t("billing.noSubscription"),
    },
  ];

  return (
    <PanelCard title={t("membership.title")}>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <MembershipBadge tier={tier} planName={paid ? entitlement?.planName : undefined} />
        {subscription?.cancel_at_period_end && subscription.current_period_end && (
          <span className="text-xs text-accent">
            {t("billing.endsOn", { date: fmtDate(subscription.current_period_end, locale) })}
          </span>
        )}
      </div>

      {billing.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{row.label}</dt>
              <dd className="text-sm text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {subscription?.status === "past_due" && (
        <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          {t("billing.state.past_due")}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {paid ? (
          <>
            <button
              type="button"
              disabled={busy || !subscription}
              onClick={() => {
                setBusy(true);
                void (async () => {
                  try {
                    const session = await openPortal({ data: undefined as never });
                    window.open(session.overviewUrl, "_blank", "noopener");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {t("billing.manage")}
            </button>
            <Link
              to="/billing"
              className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border"
            >
              {t("membership.viewSubscription")}
            </Link>
          </>
        ) : (
          <Link
            to="/pricing"
            onClick={() => rememberReturnPath()}
            className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
          >
            {t("membership.upgrade")}
          </Link>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{t("billing.morNote")}</p>
    </PanelCard>
  );
}

export function PaymentHistoryPanel() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const fetchPayments = useServerFn(listMyPayments);
  const fetchInvoice = useServerFn(getInvoiceUrl);

  const payments = useQuery({
    queryKey: ["my-payments", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchPayments({ data: undefined as never }),
  });

  const rows = payments.data?.payments ?? [];

  const openInvoice = (transactionId: string) => {
    void (async () => {
      try {
        const { url } = await fetchInvoice({ data: { transactionId } });
        window.open(url, "_blank", "noopener");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
      }
    })();
  };

  return (
    <PanelCard title={t("billing.history")}>
      {payments.isLoading && <p className="mt-2 text-sm text-muted-foreground">{t("common.loading")}</p>}
      {payments.data?.stale && (
        <p className="mt-2 text-sm text-muted-foreground">{t("billing.historyOffline")}</p>
      )}
      {!payments.isLoading && !payments.data?.stale && rows.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t("billing.noPayments")}</p>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {rows.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-foreground">{payment.description || t("plan.premium")}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(payment.date, locale)} · {t(`billing.state.${payment.status}` as never) || payment.status}
                </p>
                <p className="truncate text-[11px] text-muted-foreground/80">{payment.id}</p>
              </div>
              <div className="text-right">
                <p className="text-brass-soft">{formatMoney(payment.total, payment.currency, locale)}</p>
                <button
                  type="button"
                  onClick={() => openInvoice(payment.id)}
                  className="text-xs font-medium text-primary underline"
                >
                  {t("billing.invoice")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
