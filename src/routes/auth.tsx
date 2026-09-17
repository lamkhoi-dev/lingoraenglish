import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/lily/app-shell";
import { requestPasswordReset, resendVerification, signIn, signUp } from "@/lib/auth.functions";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    next: z.string().optional(),
    mode: z.enum(["signin", "signup", "forgot"]).optional(),
    plan: z.string().optional(),
    interval: z.enum(["month", "year"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Lingora English" },
      {
        name: "description",
        content:
          "Create your free account to practise speaking with Lingora English and keep your progress private and in one place.",
      },
      { property: "og:title", content: "Sign in — Lingora English" },
      {
        property: "og:description",
        content: "Create a free account and start practising English with Lingora English.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

const AGE_RANGES = ["under_16", "16_24", "25_34", "35_49", "50_plus"] as const;

const inputClass =
  "mt-1.5 w-full rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none ring-1 ring-border focus:ring-brass";

function AuthPage() {
  const { t, locale, setLocale } = useI18n();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { next, mode: modeParam, plan, interval } = useSearch({ from: "/auth" });

  const signUpFn = useServerFn(signUp);
  const signInFn = useServerFn(signIn);
  const requestPasswordResetFn = useServerFn(requestPasswordReset);
  const resendVerificationFn = useServerFn(resendVerification);

  const [mode, setMode] = useState<Mode>(modeParam ?? "signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [country, setCountry] = useState("");
  const [ageRange, setAgeRange] = useState<string>("25_34");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  // After signing in, continue straight to the plan the visitor picked.
  const afterAuth = () => {
    if (plan) {
      void navigate({
        to: "/pricing",
        search: { plan, interval: interval ?? "month", checkout: "1" } as never,
      });
      return;
    }
    void navigate({ to: safeNext });
  };

  useEffect(() => {
    if (user) afterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /**
   * Whitelist, not a blocklist: only messages this app itself deliberately
   * wrote in auth.functions.ts are ever shown verbatim. Anything else — a raw
   * driver/SQL error, an unexpected exception message, a future bug — falls
   * back to a generic message instead of reaching the screen. The
   * 2026-09-17 incident was a raw Postgres error ("Failed query: select
   * auth_rate_take($1, $2, $3)...", exposing an internal function name, an
   * email hash and the rate-limit window/threshold) rendered straight into a
   * toast because the old version let anything through except two known
   * phrases.
   */
  const friendlyError = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes("already exists")) return t("auth.emailTaken");
    if (lower.includes("invalid email or password")) return t("auth.badCredentials");
    if (lower.startsWith("too many attempts")) return message; // rate-limit.server.ts's own wording
    if (lower.includes("signs in with google")) return message;
    if (lower.includes("verify your email before signing in")) return message;
    if (lower.includes("reset link is invalid or has expired")) return message;
    if (lower.includes("verification link is invalid or has expired")) return message;
    return t("common.somethingWrong");
  };

  const resend = async () => {
    if (!pendingEmail) return;
    setBusy(true);
    try {
      await resendVerificationFn({ data: { email: pendingEmail } });
      toast.success(t("auth.verificationSent"));
    } catch {
      toast.error(t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup") {
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        toast.error(t("auth.passwordWeak"));
        return;
      }
      if (password !== confirm) {
        toast.error(t("auth.passwordMismatch"));
        return;
      }
      if (!acceptTerms || !acceptPrivacy) {
        toast.error(t("auth.mustAccept"));
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await signUpFn({
          data: {
            email,
            password,
            firstName,
            lastName,
            country,
            ageRange,
            interfaceLanguage: locale,
            acceptedTerms: acceptTerms,
            acceptedPrivacy: acceptPrivacy,
          },
        });
        if (result.requiresVerification) {
          // No session yet — signUp only created the account and sent a
          // verification email; the learner signs in for real once they
          // click the link (see verifyEmail in auth_.verify.tsx).
          setPendingEmail(email);
        } else {
          // AUTH_DEV_SKIP_EMAIL_VERIFICATION is on — signUp already logged
          // them in, same as the pre-fix behavior.
          await refreshProfile();
          toast.success(t("auth.created"));
        }
      } else if (mode === "signin") {
        await signInFn({ data: { email, password } });
        await refreshProfile();
        toast.success(t("auth.welcomeBack"));
      } else {
        await requestPasswordResetFn({ data: { email } });
        toast.success(t("auth.resetSent"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? friendlyError(error.message) : t("common.somethingWrong"),
      );
    } finally {
      setBusy(false);
    }
  };

  // Manual Authorization Code flow — no OAuth library. Builds Google's
  // consent URL ourselves and redirects the whole page there; Google sends
  // the browser back to /auth/google-callback (see that route) with a
  // `code`, which is what actually exchanges for a session.
  const google = () => {
    const clientId = import.meta.env["VITE_GOOGLE_CLIENT_ID"];
    if (!clientId) {
      toast.error(t("auth.googleFailed"));
      return;
    }
    const redirectUri = `${window.location.origin}/auth/google-callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email profile",
      access_type: "offline",
      prompt: "select_account",
      state: safeNext,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  if (pendingEmail) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-display text-3xl text-foreground">{t("auth.verifyTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("auth.verifySub", { email: pendingEmail })}
          </p>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={busy}
            className="mt-6 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3 disabled:opacity-50"
          >
            {t("auth.resendVerification")}
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="text-center font-display text-3xl text-foreground">
          {mode === "signup"
            ? t("auth.create")
            : mode === "forgot"
              ? t("auth.reset")
              : t("auth.welcome")}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {plan ? t("auth.loginRequiredSub") : t("auth.sub")}
        </p>
        {plan && (
          <p className="mt-2 text-center text-xs text-brass-soft">{t("auth.continueToPlan")}</p>
        )}

        <form onSubmit={submit} className="lounge-panel mt-8 space-y-4 p-6">
          {mode === "signup" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    {t("auth.firstName")}
                  </span>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    {t("auth.lastName")}
                  </span>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                    className={inputClass}
                  />
                </label>
              </div>
            </>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-foreground">{t("auth.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />
          </label>

          {mode !== "forgot" && (
            <label className="block">
              <span className="text-xs font-semibold text-foreground">{t("auth.password")}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 8 : 6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className={inputClass}
              />
            </label>
          )}

          {mode === "signup" && (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-foreground">
                  {t("auth.confirmPassword")}
                </span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    {t("auth.interfaceLanguage")}
                  </span>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as never)}
                    className={inputClass}
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.flag} {language.native}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-foreground">
                    {t("auth.ageRange")}
                  </span>
                  <select
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                    className={inputClass}
                  >
                    {AGE_RANGES.map((range) => (
                      <option key={range} value={range}>
                        {range.replace(/_/g, " ").replace("plus", "+")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-foreground">{t("auth.country")}</span>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  autoComplete="country-name"
                  className={inputClass}
                />
              </label>

              <div className="space-y-2 text-xs text-muted-foreground">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("auth.acceptTerms")}{" "}
                    <Link to="/terms" className="underline hover:text-foreground">
                      {t("nav.terms")}
                    </Link>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(e) => setAcceptPrivacy(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("auth.acceptPrivacy")}{" "}
                    <Link to="/privacy" className="underline hover:text-foreground">
                      {t("nav.privacy")}
                    </Link>
                  </span>
                </label>
              </div>
            </>
          )}

          {mode === "signin" && (
            <p className="text-xs text-muted-foreground">{t("auth.rememberMe")}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-brass py-3 text-sm font-semibold text-background shadow-brass disabled:opacity-50"
          >
            {busy && <Loader2 className="mr-2 inline size-4 animate-spin" />}
            {mode === "signup"
              ? t("nav.createFree")
              : mode === "forgot"
                ? t("auth.sendReset")
                : t("common.signIn")}
          </button>

          {mode !== "forgot" && (
            <>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("auth.or")}
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                onClick={google}
                disabled={busy}
                className="w-full rounded-full bg-surface-2 py-3 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3 disabled:opacity-50"
              >
                {t("auth.google")}
              </button>
            </>
          )}
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {mode !== "signup" && (
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="hover:text-foreground"
            >
              {t("auth.createAccount")}
            </button>
          )}
          {mode !== "signin" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="hover:text-foreground"
            >
              {t("auth.haveAccount")}
            </button>
          )}
          {mode !== "forgot" && (
            <button
              type="button"
              onClick={() => setMode("forgot")}
              className="hover:text-foreground"
            >
              {t("auth.forgot")}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
