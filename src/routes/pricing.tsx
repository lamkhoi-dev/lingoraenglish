import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { formatMoney, BillingCard } from "@/components/lily/billing-ui";
import { useBilling, usePlans, type PlanRecord } from "@/hooks/use-billing";
import { useAuth } from "@/lib/auth";
import { recordBillingEvent, validateCoupon } from "@/lib/billing.functions";
import { useI18n } from "@/lib/i18n";
import { getPaddlePriceId, initializePaddle } from "@/lib/paddle";
import { hreflangLinks } from "@/lib/seo";
import { en } from "@/locales/en";

export const Route = createFileRoute("/pricing")({
  validateSearch: z.object({
    plan: z.string().optional(),
    interval: z.enum(["month", "year"]).optional(),
    checkout: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: en["pricing.meta.title"] },
      { name: "description", content: en["pricing.meta.description"] },
      { property: "og:title", content: en["pricing.meta.title"] },
      { property: "og:description", content: en["pricing.meta.description"] },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: hreflangLinks("/pricing"),
  }),
  component: PricingPage,
});

type Interval = "month" | "year";

function PricingPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const plans = usePlans();
  const billing = useBilling();

  const search = useSearch({ from: "/pricing" });
  const [interval, setInterval] = useState<Interval>(search.interval ?? "month");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const checkCoupon = useServerFn(validateCoupon);
  const logEvent = useServerFn(recordBillingEvent);

  useEffect(() => {
    if (!user) return;
    void logEvent({ data: { event: "pricing_viewed" } }).catch(() => undefined);
  }, [user, logEvent]);

  const currentTier = billing.data?.entitlement.tier ?? "free";
  const currentSub = billing.data?.subscription as
    | { cancel_at_period_end: boolean; current_period_end: string | null }
    | null
    | undefined;
  const endingOn = currentSub?.cancel_at_period_end ? currentSub.current_period_end : null;

  const rows = useMemo(() => plans.data ?? [], [plans.data]);

  const priceFor = (plan: PlanRecord) =>
    interval === "month" ? plan.monthly_amount : plan.yearly_amount;
  const priceIdFor = (plan: PlanRecord) =>
    interval === "month" ? plan.monthly_price_id : plan.yearly_price_id;

  const applyCoupon = async (plan: PlanRecord) => {
    const code = couponInput.trim();
    if (!code) return;
    if (!user) {
      void navigate({ to: "/auth", search: { mode: "signup", next: "/pricing" } as never });
      return;
    }
    setCheckingCoupon(true);
    try {
      const result = await checkCoupon({ data: { code, priceId: priceIdFor(plan) } });
      if (!result.valid) {
        setCoupon(null);
        toast.error(t(`billing.coupon.${result.reason}` as never) || t("billing.coupon.unknown"));
        return;
      }
      setCoupon(result.code);
      toast.success(t("billing.coupon.applied"));
    } catch {
      toast.error(t("common.somethingWrong"));
    } finally {
      setCheckingCoupon(false);
    }
  };

  const startCheckout = async (plan: PlanRecord) => {
    if (plan.tier === "free") {
      void navigate(
        user
          ? { to: "/dashboard" }
          : { to: "/auth", search: { mode: "signup", next: "/dashboard" } as never },
      );
      return;
    }
    // Payment always requires an account: send the visitor to sign up and come
    // straight back to this plan afterwards.
    if (!user) {
      void navigate({
        to: "/auth",
        search: { mode: "signup", plan: plan.plan_key, interval } as never,
      });
      return;
    }

    setBusyPlan(plan.plan_key);
    try {
      await logEvent({
        data: { event: "plan_selected", planKey: plan.plan_key, intervalKey: interval },
      }).catch(() => undefined);

      await initializePaddle();
      const providerPriceId = await getPaddlePriceId(priceIdFor(plan));

      await logEvent({
        data: { event: "checkout_started", planKey: plan.plan_key, intervalKey: interval },
      }).catch(() => undefined);

      window.Paddle.Checkout.open({
        items: [{ priceId: providerPriceId, quantity: 1 }],
        customer: user.email ? { email: user.email } : undefined,
        customData: { userId: user.id, planKey: plan.plan_key },
        ...(coupon ? { discountCode: coupon } : {}),
        settings: {
          displayMode: "overlay",
          variant: "one-page",
          allowLogout: false,
          locale: locale === "zh-CN" || locale === "zh-TW" ? "zh-Hans" : locale,
          successUrl: `${window.location.origin}/billing/success`,
        },
      });
    } catch (error) {
      await logEvent({
        data: { event: "checkout_failed", planKey: plan.plan_key, intervalKey: interval },
      }).catch(() => undefined);
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusyPlan(null);
    }
  };

  // Returning from sign-up/sign-in with a plan chosen: continue to checkout.
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (resumed || !user || search.checkout !== "1" || !search.plan) return;
    const target = rows.find((row) => row.plan_key === search.plan);
    if (!target) return;
    setResumed(true);
    void startCheckout(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, rows, search.checkout, search.plan, resumed]);

  return (
    <AppShell>
      <SectionHeading title={t("pricing.title")} description={t("pricing.sub")} />

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-card p-1">
          {(["month", "year"] as Interval[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                interval === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "month" ? t("pricing.monthly") : t("pricing.yearly")}
            </button>
          ))}
        </div>
        {interval === "year" && (
          <span className="text-xs font-medium text-accent">{t("pricing.yearlySaving")}</span>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">{t("pricing.taxNote")}</p>

      {plans.isLoading && <p className="mt-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {rows.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const amount = priceFor(plan);
          return (
            <BillingCard
              key={plan.plan_key}
              className={plan.badge ? "border-primary/50 shadow-lg" : ""}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                </div>
                {plan.badge && (
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-foreground">
                  {amount === 0 ? t("pricing.free") : formatMoney(amount / 100, plan.currency, locale)}
                </span>
                {amount > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {interval === "month" ? t("pricing.perMonth") : t("pricing.perYear")}
                  </span>
                )}
              </div>

              {plan.trial_enabled && plan.tier !== "free" && (
                <p className="mt-2 text-xs font-medium text-accent">
                  {t("pricing.trial", { count: String(plan.trial_days) })}
                </p>
              )}

              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden className="text-accent">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrent && plan.tier !== "free" ? (
                <div className="mt-6">
                  {endingOn && (
                    <p className="mb-2 text-center text-xs font-medium text-accent">
                      {t("billing.endsOn", { date: formatDate(endingOn, locale) })}
                    </p>
                  )}
                  <Link
                    to="/billing"
                    className="block w-full rounded-full border border-primary px-5 py-3 text-center text-sm font-semibold text-primary transition hover:bg-primary/10"
                  >
                    {t("billing.manage")}
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busyPlan === plan.plan_key || isCurrent}
                  onClick={() => void startCheckout(plan)}
                  className="mt-6 w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {isCurrent
                    ? t("pricing.currentPlan")
                    : plan.tier === "free"
                      ? t("pricing.startFree")
                      : busyPlan === plan.plan_key
                        ? t("common.loading")
                        : t("pricing.choose", { plan: plan.name })}
                </button>
              )}

              {plan.tier !== "free" && (
                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={`coupon-${plan.plan_key}`}>
                    {t("billing.couponLabel")}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id={`coupon-${plan.plan_key}`}
                      value={couponInput}
                      onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                      placeholder={t("billing.couponPlaceholder")}
                      className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={checkingCoupon}
                      onClick={() => void applyCoupon(plan)}
                      className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
                    >
                      {t("billing.couponApply")}
                    </button>
                  </div>
                  {coupon && <p className="mt-1 text-xs text-accent">{t("billing.couponActive", { code: coupon })}</p>}
                </div>
              )}
            </BillingCard>
          );
        })}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <BillingCard>
          <h3 className="text-base font-semibold text-foreground">{t("pricing.compare")}</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">{t("pricing.allowance")}</th>
                  {rows.map((plan) => (
                    <th key={plan.plan_key} className="py-2">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allowanceKeys(rows).map((key) => (
                  <tr key={key} className="border-t border-border/60">
                    <td className="py-2 text-muted-foreground">{t(`billing.limit.${key}` as never) || key}</td>
                    {rows.map((plan) => (
                      <td key={plan.plan_key} className="py-2 text-foreground">
                        {plan.limits[key] ? plan.limits[key] : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BillingCard>

        <BillingCard>
          <h3 className="text-base font-semibold text-foreground">{t("pricing.faq")}</h3>
          <dl className="mt-3 space-y-3 text-sm">
            {(["cancel", "tax", "currency", "trial", "refund"] as const).map((key) => (
              <div key={key}>
                <dt className="font-medium text-foreground">{t(`pricing.faq.${key}.q` as never)}</dt>
                <dd className="text-muted-foreground">{t(`pricing.faq.${key}.a` as never)}</dd>
              </div>
            ))}
          </dl>
          <Link to="/billing" className="mt-4 inline-block text-sm font-medium text-primary underline">
            {t("billing.manage")}
          </Link>
        </BillingCard>
      </div>
    </AppShell>
  );
}

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

function allowanceKeys(plans: PlanRecord[]): string[] {
  const keys = new Set<string>();
  for (const plan of plans) for (const key of Object.keys(plan.limits ?? {})) keys.add(key);
  return [...keys].sort();
}
