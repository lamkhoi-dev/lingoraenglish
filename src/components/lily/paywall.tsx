import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { useI18n } from "@/lib/i18n";

/** Which upgrade story to tell. The real gate always lives on the server. */
export type PaywallFeature =
  | "speaking"
  | "conversation"
  | "pronunciation"
  | "ielts"
  | "lesson"
  | "generic";

const COPY: Record<PaywallFeature, { title: string; body: string; ielts?: boolean }> = {
  speaking: { title: "paywall.speakingTitle", body: "paywall.speakingBody" },
  conversation: { title: "paywall.conversationTitle", body: "paywall.conversationBody" },
  pronunciation: { title: "paywall.pronunciationTitle", body: "paywall.pronunciationBody" },
  ielts: { title: "paywall.ieltsTitle", body: "paywall.ieltsBody", ielts: true },
  lesson: { title: "paywall.lessonTitle", body: "paywall.lessonBody" },
  generic: { title: "paywall.limitTitle", body: "paywall.limitBody" },
};

/**
 * Professional upgrade screen shown when the backend refuses an action for
 * plan reasons. `message` is the server's own explanation, when present.
 */
export function FeaturePaywall({
  feature = "generic",
  message,
  signedIn = true,
}: {
  feature?: PaywallFeature;
  message?: string | null;
  signedIn?: boolean;
}) {
  const { t } = useI18n();
  const copy = COPY[feature];

  return (
    <div className="rounded-3xl border border-brass/30 bg-surface-2/60 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brass/15 text-brass-soft">
          <Lock className="size-4" />
        </span>
        <h3 className="font-display text-xl text-foreground sm:text-2xl">{t(copy.title as never)}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {message || t(copy.body as never)}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {!signedIn ? (
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
          >
            {t("paywall.signInFirst")}
          </Link>
        ) : (
          <Link
            to="/pricing"
            search={{ plan: copy.ielts ? "ielts_pro" : "premium" } as never}
            className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
          >
            {copy.ielts ? t("paywall.upgradeIelts") : t("paywall.upgradePremium")}
          </Link>
        )}
        <Link
          to="/pricing"
          className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
        >
          {t("paywall.allPlans")}
        </Link>
        <Link
          to="/dashboard"
          className="rounded-full px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {t("paywall.stayFree")}
        </Link>
      </div>
    </div>
  );
}

/** Small "3 / 5 left" meter used on the dashboard and feature pages. */
export function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const { t } = useI18n();
  const unlimited = limit >= 100000;
  const left = Math.max(0, limit - used);
  const pct = unlimited ? 100 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  return (
    <div className="rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {unlimited ? t("dash.unlimited") : t("dash.remainingOf", { left, total: limit })}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full ${left === 0 && !unlimited ? "bg-destructive" : "bg-brass"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Lock badge for previewable premium lessons. */
export function PremiumBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brass/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-soft">
      <Lock className="size-3" /> {t("paywall.locked")}
    </span>
  );
}
