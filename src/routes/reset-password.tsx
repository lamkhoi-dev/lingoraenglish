import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/lily/app-shell";
import { resetPassword } from "@/lib/auth.functions";
import { useI18n } from "@/lib/i18n";
import { en } from "@/locales/en";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({
    meta: [
      { title: en["auth.reset.meta.title"] },
      { name: "description", content: en["auth.reset.meta.description"] },
      { property: "og:title", content: en["auth.reset.meta.title"] },
      { property: "og:description", content: en["auth.reset.meta.description"] },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { token } = useSearch({ from: "/reset-password" });
  const resetPasswordFn = useServerFn(resetPassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error(t("auth.resetInvalid"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("auth.passwordWeak"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      await resetPasswordFn({ data: { token, newPassword: password } });
      toast.success(t("auth.passwordUpdated"));
      // resetPassword revokes every existing session (see auth.functions.ts)
      // — the learner signs back in with the new password, not straight
      // into the app.
      void navigate({ to: "/auth", search: { mode: "signin" } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="text-center font-display text-3xl text-foreground">{t("auth.reset")}</h1>
        <form onSubmit={submit} className="lounge-panel mt-8 space-y-4 p-6">
          <label className="block">
            <span className="text-xs font-semibold text-foreground">{t("auth.newPassword")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none ring-1 ring-border focus:ring-brass"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-foreground">{t("auth.confirmPassword")}</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none ring-1 ring-border focus:ring-brass"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full rounded-full bg-brass py-3 text-sm font-semibold text-background shadow-brass disabled:opacity-50"
          >
            {busy && <Loader2 className="mr-2 inline size-4 animate-spin" />}
            {t("auth.setPassword")}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
