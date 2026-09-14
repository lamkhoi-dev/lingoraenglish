import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/lily/app-shell";
import { useAuth } from "@/lib/auth";
import { googleOAuthCallback } from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth_/google-callback")({
  validateSearch: (search: Record<string, unknown>): { code?: string; error?: string; state?: string } => ({
    ...(typeof search["code"] === "string" ? { code: search["code"] } : {}),
    ...(typeof search["error"] === "string" ? { error: search["error"] } : {}),
    ...(typeof search["state"] === "string" ? { state: search["state"] } : {}),
  }),
  component: GoogleCallbackPage,
});

function GoogleCallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const { code, error: oauthError, state } = Route.useSearch();
  const callback = useServerFn(googleOAuthCallback);
  const [error, setError] = useState<string | null>(null);
  // React 18/19 dev double-invokes effects (Strict Mode) — a Google
  // authorization code can only be exchanged once, so guard against a
  // second call racing the first (matches the reference implementation's
  // window.__googleCallbackHandled guard, done here with a ref instead of
  // a global so it doesn't leak across unrelated mounts).
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (oauthError) {
      setError(oauthError);
      return;
    }
    if (!code) {
      setError("missing_code");
      return;
    }

    void callback({ data: { code, redirectUri: `${window.location.origin}/auth/google-callback` } })
      .then(async () => {
        // Same reason as auth_.verify.tsx: a new session cookie now exists
        // but the AuthProvider context hasn't seen it yet.
        await refreshProfile();
        const next = state && state.startsWith("/") ? state : "/dashboard";
        void navigate({ to: next, replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("auth.googleFailed"));
      });
  }, [code, oauthError, state, callback, navigate, refreshProfile, t]);

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
