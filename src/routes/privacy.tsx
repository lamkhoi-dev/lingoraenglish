import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Lingora English" },
      {
        name: "description",
        content:
          "How Ms Thao English handles your account details, voice recordings, transcripts and payment data for Lingora English — and how to delete them.",
      },

      { property: "og:title", content: "Privacy Policy — Lingora English" },
      {
        property: "og:description",
        content: "Your recordings, transcripts and progress stay private to your account. Learn how we store and delete them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Who we are",
    body: "Lingora English is operated by Ms Thao English, which is the data controller for the personal data described in this notice. You can contact us about privacy at support@msthaoenglish.com.",
  },
  {
    title: "2. What we collect and why",
    body: "Account data (name, email, password credentials) to create and secure your account, on the basis of performing our contract with you. Profile data (interface language, optional country and age range) to personalise lessons, on the basis of contract performance. Learning data (recordings, transcripts, scores, progress, conversation history) to deliver and track your practice, on the basis of contract performance. Technical and usage data (device identifiers, IP address, logs, error reports) for security, fraud prevention and improving the product, on the basis of our legitimate interests. Support messages to answer your questions. Marketing emails only where you have consented.",
  },
  {
    title: "3. Voice recordings and transcripts",
    body: "Recordings and transcripts are tied to your account and readable only by you. Row-level security prevents any other learner from reading them, and audio is sent to speech services solely to produce your feedback.",
  },
  {
    title: "4. AI processing",
    body: "Your practice text is sent to AI providers to generate corrections, feedback and spoken replies. We send the minimum needed and do not include your email or payment details.",
  },
  {
    title: "5. Payments",
    body: "Our order process is conducted by our online reseller Paddle.com, which acts as Merchant of Record and handles checkout, billing, tax and invoicing. Card data is collected and processed by Paddle — we never see or store card numbers. We receive only the subscription status and identifiers needed to unlock your plan.",
  },
  {
    title: "6. Who we share data with",
    body: "Service providers and subprocessors that host, secure and operate the platform (cloud hosting, database, authentication, email delivery), AI and speech providers that process your practice content, Paddle.com as Merchant of Record for the sale, subscription management, payments, tax compliance and invoicing, professional advisers such as accountants and lawyers, and public authorities where the law requires it. We do not sell your personal data.",
  },
  {
    title: "7. International transfers",
    body: "Our providers may process data outside your country, including in the United States. Where personal data leaves the UK or EEA we rely on appropriate safeguards such as Standard Contractual Clauses or an adequacy decision.",
  },
  {
    title: "8. Your control and your rights",
    body: "You can edit your profile, change your interface language, delete your practice history from My Account, and cancel your subscription at any time. Subject to local law you also have the right to access, correct, erase, restrict or object to processing of your data, to receive a portable copy, to withdraw consent at any time, and to complain to your data protection authority. Email support@msthaoenglish.com and we will respond within one month.",
  },
  {
    title: "9. Retention",
    body: "Learning data is kept while your account exists so your progress survives plan changes, and is deleted or anonymised when it is no longer needed. Billing records are kept as long as tax law requires.",
  },
  {
    title: "10. Security",
    body: "We use appropriate technical and organisational measures including encryption in transit, hashed credentials, row-level access controls and least-privilege server access to protect your data.",
  },
  {
    title: "11. Cookies",
    body: "We use essential cookies and local storage to keep you signed in and remember your language. We do not use advertising cookies. You can clear or block cookies in your browser, though signing in will not work without the essential ones.",
  },
  {
    title: "12. Children",
    body: "Learners under the minimum age in their country should use the platform with a parent or guardian, which is why we ask for an age range at signup.",
  },
];


function PrivacyPage() {
  const { t, formatDate } = useI18n();
  return (
    <AppShell>
      <SectionHeading
        eyebrow={t("nav.privacy")}
        title={t("legal.privacy.title")}
        description={t("legal.updated", { date: formatDate(new Date("2026-01-01")) })}
      />
      <div className="lounge-panel mt-8 space-y-6 p-6 sm:p-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-lg text-foreground">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
