import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { useI18n } from "@/lib/i18n";
import { canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Lingora English" },
      {
        name: "description",
        content:
          "Ms Thao English offers a 30-day money-back guarantee on Lingora English subscriptions. Learn how to request a refund.",
      },
      { property: "og:title", content: "Refund Policy — Lingora English" },
      {
        property: "og:description",
        content: "30-day money-back guarantee on Lingora English subscriptions, with refunds issued by us.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [canonicalLink("/refunds")],
  }),
  component: RefundsPage,
});

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Who this policy is from",
    body: "This refund policy applies to all subscriptions to Lingora English, sold by Ms Thao English (\"we\", \"us\"). Payments are processed by Stripe; we handle refund and billing questions ourselves.",
  },
  {
    title: "2. 30-day money-back guarantee",
    body: "If you are not satisfied with your purchase, you may request a full refund within 30 days of your order date. This applies to first purchases of Premium and IELTS Pro, on both monthly and yearly billing.",
  },
  {
    title: "3. Renewals",
    body: "Renewal payments are also covered by a 30-day window from the date of the renewal charge. If an unwanted renewal has just been billed, contact us within 30 days and we will arrange a refund.",
  },
  {
    title: "4. How to request a refund",
    body: (
      <>
        Email us at phanthithuthao10081996@gmail.com from the address you used at checkout, and include your invoice
        number if you have it. We will confirm your request and issue the refund, including any tax charged, to the
        original payment method. It typically appears within 5–10 business days, depending on your bank.
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
