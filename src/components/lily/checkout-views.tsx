/**
 * Post-checkout screens. Access is only ever shown after the server has
 * re-read the subscription from the payment provider — never because the
 * browser landed on this URL.
 */
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/lily/app-shell";
import { BillingCard } from "@/components/lily/billing-ui";
import { SectionHeading } from "@/components/lily/brand";
import { useAuth } from "@/lib/auth";
import { recordBillingEvent, verifyCheckout } from "@/lib/billing.functions";
import { useI18n } from "@/lib/i18n";
import { clearReturnPath, peekReturnPath } from "@/lib/upgrade-return";

export function CheckoutSuccessView() {
  const { t } = useI18n();
  const { user } = useAuth();
  const verify = useServerFn(verifyCheckout);
  const [state, setState] = useState<"checking" | "confirmed" | "pending">("checking");
  const [planName, setPlanName] = useState("");
  const [status, setStatus] = useState("");
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    setReturnTo(peekReturnPath());
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const transactionId = new URLSearchParams(window.location.search).get("_ptxn");

    const poll = async (attempt: number): Promise<void> => {
      if (cancelled) return;
      try {
        const result = await verify({ data: transactionId ? { transactionId } : {} });
        if (cancelled) return;
        if (result.confirmed) {
          setPlanName(result.entitlement.planName);
          setStatus(result.entitlement.tier);
          setState("confirmed");
          return;
        }
      } catch {
        /* keep polling — the webhook may still be arriving */
      }
      if (attempt >= 6) {
        setState("pending");
        return;
      }
      setTimeout(() => void poll(attempt + 1), 2500);
    };

    void poll(0);
    return () => {
      cancelled = true;
    };
  }, [user, verify]);

  return (
    <AppShell>
      <SectionHeading title={t("checkout.success.title")} description={t("checkout.success.sub")} />
      <BillingCard className="mt-6">
        {state === "checking" && <p className="text-sm text-muted-foreground">{t("checkout.verifying")}</p>}

        {state === "confirmed" && (
          <div>
            <p className="text-sm text-foreground">{t("checkout.confirmed", { plan: planName })}</p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("billing.currentPlan")}
                </dt>
                <dd className="text-foreground">{planName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("billing.status")}
                </dt>
                <dd className="text-foreground">
                  {status === "free" ? t("pricing.free") : t("billing.state.active")}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              {returnTo ? (
                <Link
                  to={returnTo}
                  onClick={clearReturnPath}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  {t("checkout.continueWhere")}
                </Link>
              ) : (
                <Link
                  to="/ai-speaking"
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  {t("checkout.startLearning")}
                </Link>
              )}
              <Link to="/billing" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                {t("billing.manage")}
              </Link>
            </div>
          </div>
        )}

        {state === "pending" && (
          <div>
            <p className="text-sm text-foreground">{t("checkout.pending")}</p>
            <Link to="/billing" className="mt-4 inline-block text-sm font-medium text-primary underline">
              {t("billing.manage")}
            </Link>
          </div>
        )}

        {!user && <p className="text-sm text-muted-foreground">{t("common.signInRequired")}</p>}
      </BillingCard>
    </AppShell>
  );
}

export function CheckoutCancelledView() {
  const { t } = useI18n();
  const { user } = useAuth();
  const logEvent = useServerFn(recordBillingEvent);

  useEffect(() => {
    if (!user) return;
    void logEvent({ data: { event: "checkout_cancelled" } }).catch(() => undefined);
  }, [user, logEvent]);

  return (
    <AppShell>
      <SectionHeading title={t("checkout.cancelled.title")} description={t("checkout.cancelled.sub")} />
      <BillingCard className="mt-6">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/pricing"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {t("billing.seePlans")}
          </Link>
          <Link to="/ai-speaking" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium">
            {t("checkout.keepFree")}
          </Link>
        </div>
      </BillingCard>
    </AppShell>
  );
}
