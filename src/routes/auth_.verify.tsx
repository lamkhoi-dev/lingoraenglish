import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/lily/app-shell";
import { useAuth } from "@/lib/auth";
import { verifyEmail } from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth_/verify")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { token } = Route.useSearch();
  const verify = useServerFn(verifyEmail);
  const [error, setError] = useState<string | null>(null);
  // Same double-invoke guard as auth_.google-callback.tsx — a verification
  // token can only be consumed once.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!token) {
      setError(t("common.somethingWrong"));
      return;
    }
    void verify({ data: { token } })
      .then(async () => {
        // verifyEmail just wrote a new session cookie — the AuthProvider
        // context (mounted once at the app root) doesn't know about it yet,
        // and /dashboard redirects unauthenticated visitors straight back
        // to /auth, so it must be refreshed before navigating there.
        await refreshProfile();
        void navigate({ to: "/dashboard", replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("common.somethingWrong"));
      });
  }, [token, verify, navigate, refreshProfile, t]);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        {error ? (
          <>
            <p className="text-sm text-danger">{error}</p>
            <a href="/auth" className="text-sm font-semibold text-brass-soft hover:text-brass">
              {t("auth.tryAgain")}
            </a>
          </>
        ) : (
          <>
            <Loader2 className="size-6 animate-spin text-brass-soft" />
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
