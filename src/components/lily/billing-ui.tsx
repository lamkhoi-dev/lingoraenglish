import { Link } from "@tanstack/react-router";

import { isTestPayments } from "@/lib/payments-env";
import { useI18n } from "@/lib/i18n";

/** Shown only in builds wired to the payment provider's test environment. */
export function PaymentTestModeBanner() {
  const { t } = useI18n();
  if (!isTestPayments()) return null;

  return (
    <div className="w-full border-b border-accent/40 bg-accent/15 px-4 py-2 text-center text-xs text-accent-foreground sm:text-sm">
      {t("billing.testBanner")}{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline"
      >
        {t("billing.testBannerLink")}
      </a>
    </div>
  );
}

export function formatMoney(amount: number, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/**
 * Rendered when a server function refuses an AI action for plan reasons.
 * Purely presentational — the real gate lives on the server.
 */
export function UpgradeNotice({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
      <p className="text-sm font-medium text-foreground">{t("billing.upgradeNeeded")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Link
        to="/pricing"
        className="mt-4 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
      >
        {t("billing.seePlans")}
      </Link>
    </div>
  );
}

/** Simple surface card used by the billing pages. */
export function BillingCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${className}`}>{children}</div>
  );
}
