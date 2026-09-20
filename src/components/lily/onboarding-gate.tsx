import { useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { completeOnboarding, skipOnboarding } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { clearPendingSurvey, readPendingSurvey } from "@/lib/onboarding-flow";

/** Paths a signed-in learner who hasn't done the survey may still open:
 * /auth* and /onboarding run their own post-login redirects, the rest are
 * public/legal or payment-return pages that must never bounce anywhere. */
const EXEMPT_PREFIXES = [
  "/onboarding",
  "/auth",
  "/reset-password",
  "/terms",
  "/privacy",
  "/refunds",
  "/pricing",
  "/checkout",
  "/billing",
  "/api",
];

function isExempt(pathname: string) {
  return (
    pathname === "/" || EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

/**
 * Makes sure every signed-in learner has been through the onboarding survey,
 * whichever way they signed in — email/password, e-mailed verification link or
 * Google (which creates the account with no survey step of its own).
 *
 * - Survey answered before sign-up (see onboarding-flow.ts): save those answers
 *   to the new profile now.
 * - Otherwise, when the profile has no onboarded_at yet: send them to
 *   /onboarding, then back to the page they wanted.
 *
 * Renders nothing; mounted once at the app root.
 */
export function OnboardingGate() {
  const { t } = useI18n();
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const completeOnboardingFn = useServerFn(completeOnboarding);
  const skipOnboardingFn = useServerFn(skipOnboarding);
  // One save at a time — also guards React Strict Mode's double-invoked effects.
  const saving = useRef(false);

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (profile.onboarded_at) {
      // Already onboarded: leftover parked answers are stale — don't let them
      // land on some other account that later signs in from this browser.
      clearPendingSurvey();
      return;
    }

    const pending = readPendingSurvey();
    if (pending) {
      if (saving.current) return;
      saving.current = true;
      const save = pending.skipped
        ? skipOnboardingFn()
        : completeOnboardingFn({ data: pending.answers });
      void save
        .then(async () => {
          // Refresh BEFORE clearing: while pending is still parked this effect
          // keeps waiting; clearing first would let a re-render see "no pending,
          // onboarded_at still null" and bounce the learner back to /onboarding.
          await refreshProfile();
          clearPendingSurvey();
          if (!pending.skipped) toast.success(t("onboarding.done"));
        })
        .catch(() => {
          // Don't retry forever on bad/stale stored answers — drop them and let
          // the learner answer the survey again while signed in.
          clearPendingSurvey();
          toast.error(t("common.somethingWrong"));
          void navigate({
            to: "/onboarding",
            search: { next: isExempt(pathname) ? undefined : pathname } as never,
            replace: true,
          });
        })
        .finally(() => {
          saving.current = false;
        });
      return;
    }

    if (isExempt(pathname)) return;
    void navigate({ to: "/onboarding", search: { next: pathname } as never, replace: true });
  }, [
    loading,
    user,
    profile,
    pathname,
    navigate,
    refreshProfile,
    completeOnboardingFn,
    skipOnboardingFn,
    t,
  ]);

  return null;
}
