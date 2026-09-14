import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Lingora English" },
      {
        name: "description",
        content:
          "Ms Thao English offers a 30-day money-back guarantee on Lingora English subscriptions. Learn how to request a refund through Paddle.",
      },
      { property: "og:title", content: "Refund Policy — Lingora English" },
      {
        property: "og:description",
        content: "30-day money-back guarantee on Lingora English subscriptions, with refunds handled by Paddle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RefundsPage,
});

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Who this policy is from",
    body: "This refund policy applies to all subscriptions to Lingora English, sold by Ms Thao English (\"we\", \"us\"). Our order process is conducted by our online reseller Paddle.com, which is the Merchant of Record for all our orders and handles all billing, refunds and customer service enquiries relating to payments.",
  },
  {
    title: "2. 30-day money-back guarantee",
    body: "If you are not satisfied with your purchase, you may request a full refund within 30 days of your order date. This applies to first purchases of Premium and IELTS Pro, on both monthly and yearly billing.",
  },
  {
    title: "3. Renewals",
    body: "Renewal payments are also covered by a 30-day window from the date of the renewal charge. If an unwanted renewal has just been billed, contact us or Paddle within 30 days and we will arrange a refund.",
  },
  {
    title: "4. How to request a refund",
    body: (
      <>
        Refunds are processed by our payment provider, Paddle. Visit{" "}
        <a
          href="https://paddle.net"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          paddle.net
        </a>{" "}
        and enter the email address you used at checkout to find your order and request a refund, or email us at
        support@msthaoenglish.com and we will raise the request with Paddle on your behalf. Refunds are returned to
        the original payment method and typically appear within 5–10 business days, depending on your bank.
      </>
    ),
  },
  {
    title: "5. Cancelling instead of refunding",
    body: "You can cancel a subscription at any time from My Subscription in your dashboard. Cancelling stops future charges and keeps your paid access until the end of the period you have already paid for, after which your account returns to the free plan. Cancelling is not the same as requesting a refund — if you also want your money back, use the refund process above.",
  },
  {
    title: "6. Your statutory rights",
    body: "Nothing in this policy limits any consumer rights you have under the law of your country, including any statutory right of withdrawal. Where local law gives you stronger rights than this policy, those rights apply.",
  },
];

function RefundsPage() {
  const { t, formatDate } = useI18n();
  return (
    <AppShell>
      <SectionHeading
        eyebrow="Refund Policy"
        title="Refund Policy"
        description={t("legal.updated", { date: formatDate(new Date("2026-09-02")) })}
      />
      <div className="lounge-panel mt-8 space-y-6 p-6 sm:p-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-lg text-foreground">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
        <p className="text-sm leading-relaxed text-muted-foreground">
          See also our{" "}
          <Link to="/terms" className="text-primary underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}
