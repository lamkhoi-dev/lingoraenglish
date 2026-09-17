import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { clearRateLimit, enforceRateLimit } from "@/lib/rate-limit.server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  createSession,
  destroyAllUserSessions,
  destroySession,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/session.server";
import { withAdmin, withUser } from "@/db";
import {
  authEvents,
  emailVerificationTokensInAuth,
  oauthAccountsInAuth,
  passwordResetTokensInAuth,
  profiles,
  sessionsInAuth,
  userRoles,
  usersInAuth,
} from "@/db/schema/schema";
import { sendEmail } from "@/lib/email.server";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "@/lib/session-cookie.server";

const EMAIL_VERIFY_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 30;

function appUrl(): string {
  const url = process.env["APP_URL"];
  if (!url) throw new Error("APP_URL is not set");
  return url;
}

/**
 * Dev/staging escape hatch for the email-confirm gate, for environments with
 * no SMTP configured yet (so there is no email to click). Guarded on BOTH
 * sides: the flag itself must be explicitly opted into, AND NODE_ENV must
 * not be "production" — so setting this by mistake in a prod env file does
 * nothing, it's not enough on its own to disable the gate. Never document
 * this as something to enable on the real deployment; it exists purely so
 * signup/signin can be exercised end-to-end before SMTP credentials arrive.
 */
function devSkipEmailVerification(): boolean {
  return process.env["AUTH_DEV_SKIP_EMAIL_VERIFICATION"] === "true" && process.env["NODE_ENV"] !== "production";
}

function clientMeta() {
  return {
    userAgent: getRequestHeader("user-agent") ?? "",
    ip: getRequestIP() ?? "",
  };
}

/**
 * Mục 3.5 "ghi nhật ký các sự kiện quan trọng". Never throws: an audit write
 * failing must not be what stops someone signing in.
 */
async function logAuthEvent(event: string, userId: string | null): Promise<void> {
  const meta = clientMeta();
  try {
    await withAdmin((db) =>
      db.insert(authEvents).values({ userId, event, ip: meta.ip, userAgent: meta.userAgent }),
    );
  } catch (error) {
    console.error("auth event log failed", event, error);
  }
}

async function issueEmailVerification(userId: string, email: string): Promise<void> {
  const token = generateToken();
  await withAdmin((db) =>
    db.insert(emailVerificationTokensInAuth).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    }),
  );
  await sendEmail({
    to: email,
    subject: "Confirm your Lingora English account",
    html: `<p>Welcome to Lingora English! Confirm your email to get started:</p>
<p><a href="${appUrl()}/auth/verify?token=${token}">Confirm email</a></p>
<p>This link expires in ${EMAIL_VERIFY_TTL_HOURS} hours.</p>`,
  });
}

/* --------------------------------- sign up -------------------------------- */

const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  ageRange: z.string().max(20).optional(),
  interfaceLanguage: z.string().max(8).optional(),
  acceptedTerms: z.boolean().optional(),
  acceptedPrivacy: z.boolean().optional(),
});

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signUpSchema.parse(d))
  .handler(async ({ data }) => {
    const passwordHash = await hashPassword(data.password);
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    const rawUserMetaData = {
      full_name: fullName,
      interface_language: data.interfaceLanguage ?? "en",
    };

    const userId = await withAdmin(async (db) => {
      const existing = await db
        .select({ id: usersInAuth.id })
        .from(usersInAuth)
        .where(eq(usersInAuth.email, data.email))
        .limit(1);
      if (existing.length > 0) throw new Error("An account with this email already exists.");

      const rows = await db
        .insert(usersInAuth)
        .values({ email: data.email, encryptedPassword: passwordHash, rawUserMetaData })
        .returning({ id: usersInAuth.id });
      const row = rows[0];
      if (!row) throw new Error("Failed to create account");

      // The handle_new_user() trigger (ported from the original Supabase
      // migrations) already inserted a bare profiles row as part of the
      // statement above — fill in the extra signup fields it doesn't know
      // about.
      await db
        .update(profiles)
        .set({
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          country: data.country ?? "",
          ageRange: data.ageRange ?? "",
          interfaceLanguage: data.interfaceLanguage ?? "en",
          termsAcceptedAt: data.acceptedTerms ? new Date().toISOString() : null,
          privacyAcceptedAt: data.acceptedPrivacy ? new Date().toISOString() : null,
        })
        .where(eq(profiles.id, row.id));

      return row.id;
    });

    if (devSkipEmailVerification()) {
      await withAdmin((db) =>
        db.update(usersInAuth).set({ emailConfirmedAt: new Date().toISOString() }).where(eq(usersInAuth.id, userId)),
      );
      const session = await createSession(userId, clientMeta());
      writeSessionCookie(session.id);
      await logAuthEvent("signup", userId);
      return { requiresVerification: false };
    }

    await logAuthEvent("signup", userId);
    await issueEmailVerification(userId, data.email);

    // No session yet — matches the original Supabase project's "confirm
    // email" gate: the account exists but can't sign in until the learner
    // clicks the link in the verification email (see verifyEmail below,
    // which is what actually logs them in the first time).
    return { requiresVerification: true };
  });

/* --------------------------------- sign in -------------------------------- */

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signInSchema.parse(d))
  .handler(async ({ data }) => {
    // Mục 3.1. Per-email stops guessing one account; per-IP stops one host
    // working through many accounts. The IP allowance is higher because real
    // learners can share an address behind NAT. Both windows are short, so a
    // learner locked out by someone else's guessing waits minutes, not hours.
    const ip = getRequestIP() ?? "";
    try {
      await enforceRateLimit([
        { kind: "signin:email", value: data.email, limit: 10, windowSeconds: 900 },
        { kind: "signin:ip", value: ip, limit: 30, windowSeconds: 900 },
      ]);
    } catch (error) {
      await logAuthEvent("signin_rate_limited", null);
      throw error;
    }

    const rows = await withAdmin((db) =>
      db
        .select({
          id: usersInAuth.id,
          encryptedPassword: usersInAuth.encryptedPassword,
          emailConfirmedAt: usersInAuth.emailConfirmedAt,
        })
        .from(usersInAuth)
        .where(eq(usersInAuth.email, data.email))
        .limit(1),
    );
    const user = rows[0];
    // Same error for "no such user" and "wrong password" — don't leak which one.
    const genericError = "Invalid email or password.";
    if (!user) throw new Error(genericError);
    if (!user.encryptedPassword) {
      throw new Error("This account signs in with Google. Use the Google button, or set a password from Account settings.");
    }
    const ok = await verifyPassword(data.password, user.encryptedPassword);
    if (!ok) {
      await logAuthEvent("signin_failed", user.id);
      throw new Error(genericError);
    }
    // Checked after the password so a wrong-password guess on an unverified
    // account still gets the generic error, not a hint that the account exists.
    if (!user.emailConfirmedAt && !devSkipEmailVerification()) {
      throw new Error("Please verify your email before signing in — check your inbox for the confirmation link.");
    }

    // Signed in for real — drop the counters so ordinary use never builds up.
    await clearRateLimit("signin:email", data.email);
    await clearRateLimit("signin:ip", ip);

    const session = await createSession(user.id, clientMeta());
    writeSessionCookie(session.id);
    await logAuthEvent("signin_success", user.id);
    return { userId: user.id };
  });

/* ------------------------------ Google OAuth ------------------------------- */
/**
 * Manual Authorization Code flow, no OAuth library — same 3-part shape as any
 * standard implementation: (1) the button in auth.tsx builds the Google
 * consent URL and redirects the browser there directly, no API call; (2) the
 * browser lands back on /auth/google-callback with a `code` query param,
 * which calls this function; (3) this function exchanges the code for an
 * access token, reads the user's profile, finds-or-creates the local
 * account, and issues our own session — same as email/password sign-in from
 * this point on (httpOnly cookie, not a token handed to the client).
 *
 * No Google ID-token signature verification — the access token is used to
 * call Google's own userinfo endpoint over HTTPS directly, which is exactly
 * as trustworthy as verifying the ID token ourselves and is the common,
 * accepted shortcut for "login with Google" (not applicable if this app
 * ever needs to verify tokens Google issued for some *other* purpose).
 */

type GoogleTokenResponse = { access_token: string };
type GoogleUserInfo = { sub: string; email: string; email_verified: boolean; name?: string; picture?: string };

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<string> {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("Google sign-in is not configured.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as GoogleTokenResponse;
  return data.access_token;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to read Google profile (${res.status})`);
  return (await res.json()) as GoogleUserInfo;
}

const googleCallbackSchema = z.object({ code: z.string().min(1), redirectUri: z.string().url() });

export const googleOAuthCallback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => googleCallbackSchema.parse(d))
  .handler(async ({ data }) => {
    const accessToken = await exchangeGoogleCode(data.code, data.redirectUri);
    const profile = await fetchGoogleUserInfo(accessToken);
    const email = profile.email.toLowerCase().trim();

    const userId = await withAdmin(async (db) => {
      // Already linked — the common case on repeat logins.
      const linked = await db
        .select({ userId: oauthAccountsInAuth.userId })
        .from(oauthAccountsInAuth)
        .where(and(eq(oauthAccountsInAuth.provider, "google"), eq(oauthAccountsInAuth.providerAccountId, profile.sub)))
        .limit(1);
      if (linked[0]) return linked[0].userId;

      // Not linked yet — reuse an existing email/password account if the
      // email matches (lets one person use either sign-in method), else
      // create a fresh Google-only account (no password).
      const existing = await db
        .select({ id: usersInAuth.id })
        .from(usersInAuth)
        .where(eq(usersInAuth.email, email))
        .limit(1);

      const targetUserId =
        existing[0]?.id ??
        (
          await db
            .insert(usersInAuth)
            .values({
              email,
              encryptedPassword: null,
              emailConfirmedAt: profile.email_verified ? new Date().toISOString() : null,
              rawUserMetaData: { full_name: profile.name ?? "" },
            })
            .returning({ id: usersInAuth.id })
        )[0]!.id;

      await db.insert(oauthAccountsInAuth).values({
        userId: targetUserId,
        provider: "google",
        providerAccountId: profile.sub,
      });
      return targetUserId;
    });

    const session = await createSession(userId, clientMeta());
    writeSessionCookie(session.id);
    return { userId };
  });

/* --------------------------------- sign out -------------------------------- */

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const sessionId = readSessionCookie();
  if (sessionId) await destroySession(sessionId);
  clearSessionCookie();
});

/* ------------------------------ current user ------------------------------ */

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const sessionId = readSessionCookie();
  if (!sessionId) return null;

  const user = await withAdmin(async (db) => {
    const sessionRows = await db
      .select({ userId: sessionsInAuth.userId, expiresAt: sessionsInAuth.expiresAt })
      .from(sessionsInAuth)
      .where(eq(sessionsInAuth.id, sessionId))
      .limit(1);
    const session = sessionRows[0];
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
    const userRows = await db
      .select({ id: usersInAuth.id, email: usersInAuth.email })
      .from(usersInAuth)
      .where(eq(usersInAuth.id, session.userId))
      .limit(1);
    return userRows[0] ?? null;
  });
  if (!user) return null;

  // Scoped through withUser (not withAdmin) so the same RLS policies that
  // gated this on Supabase ("own profile read" / "own roles read") still
  // apply — see src/db/index.ts.
  const { profile, isAdmin } = await withUser(user.id, async (db) => {
    const profileRows = await db
      .select({
        id: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
        englishLevel: profiles.englishLevel,
        targetLevel: profiles.targetLevel,
        learningGoal: profiles.learningGoal,
        uiLanguage: profiles.uiLanguage,
        streakDays: profiles.streakDays,
        lastPracticeOn: profiles.lastPracticeOn,
        practiceMinutes: profiles.practiceMinutes,
        interfaceLanguage: profiles.interfaceLanguage,
        englishOnlyMode: profiles.englishOnlyMode,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    const roleRows = await db.select({ role: userRoles.role }).from(userRoles);
    return {
      profile: profileRows[0] ?? null,
      isAdmin: roleRows.some((r) => r.role === "admin"),
    };
  });

  return {
    id: user.id,
    email: user.email,
    // snake_case to match the shape src/lib/auth.tsx's Profile type already
    // exposes to ~25 call sites across the app (was `.from("profiles")`
    // over Supabase's PostgREST, which returns raw column names).
    profile: profile
      ? {
          id: profile.id,
          full_name: profile.fullName,
          email: profile.email,
          english_level: profile.englishLevel,
          target_level: profile.targetLevel,
          learning_goal: profile.learningGoal,
          ui_language: profile.uiLanguage,
          streak_days: profile.streakDays,
          last_practice_on: profile.lastPracticeOn,
          practice_minutes: profile.practiceMinutes,
          interface_language: profile.interfaceLanguage,
          english_only_mode: profile.englishOnlyMode,
        }
      : null,
    isAdmin,
  };
});

/* --------------------------- password reset request ------------------------ */

const requestResetSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => requestResetSchema.parse(d))
  .handler(async ({ data }) => {
    // Mục 3.1: this endpoint sends mail, so without a cap it can be looped to
    // flood a real learner's inbox and burn the SMTP quota. Capped before the
    // lookup, so a blocked caller still cannot tell whether the address exists.
    await enforceRateLimit([
      { kind: "pwreset:email", value: data.email, limit: 3, windowSeconds: 3600 },
      { kind: "pwreset:ip", value: getRequestIP() ?? "", limit: 10, windowSeconds: 3600 },
    ]);

    // Always return the same generic result whether or not the email exists —
    // don't let this endpoint be used to enumerate registered accounts.
    const rows = await withAdmin((db) =>
      db.select({ id: usersInAuth.id }).from(usersInAuth).where(eq(usersInAuth.email, data.email)).limit(1),
    );
    const user = rows[0];
    if (user) {
      const token = generateToken();
      await withAdmin((db) =>
        db.insert(passwordResetTokensInAuth).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString(),
        }),
      );
      await sendEmail({
        to: data.email,
        subject: "Reset your Lingora English password",
        html: `<p>Reset your password:</p>
<p><a href="${appUrl()}/reset-password?token=${token}">Reset password</a></p>
<p>This link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request this, ignore this email.</p>`,
      });
    }
    return { ok: true };
  });

/* -------------------------------- reset password ---------------------------- */

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resetPasswordSchema.parse(d))
  .handler(async ({ data }) => {
    const tokenHash = hashToken(data.token);
    const userId = await withAdmin(async (db) => {
      const rows = await db
        .select({
          id: passwordResetTokensInAuth.id,
          userId: passwordResetTokensInAuth.userId,
          expiresAt: passwordResetTokensInAuth.expiresAt,
          usedAt: passwordResetTokensInAuth.usedAt,
        })
        .from(passwordResetTokensInAuth)
        .where(eq(passwordResetTokensInAuth.tokenHash, tokenHash))
        .limit(1);
      const row = rows[0];
      if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
        throw new Error("This reset link is invalid or has expired.");
      }
      const newHash = await hashPassword(data.newPassword);
      await db.update(usersInAuth).set({ encryptedPassword: newHash }).where(eq(usersInAuth.id, row.userId));
      await db
        .update(passwordResetTokensInAuth)
        .set({ usedAt: new Date().toISOString() })
        .where(eq(passwordResetTokensInAuth.id, row.id));
      return row.userId;
    });

    // Changing the password invalidates every existing session — forces
    // re-login everywhere, including whoever may have had the old password.
    await destroyAllUserSessions(userId);
    return { ok: true };
  });

/* -------------------------------- verify email ------------------------------ */

const verifyEmailSchema = z.object({ token: z.string().min(1) });

export const verifyEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifyEmailSchema.parse(d))
  .handler(async ({ data }) => {
    const tokenHash = hashToken(data.token);
    const userId = await withAdmin(async (db) => {
      const rows = await db
        .select({
          id: emailVerificationTokensInAuth.id,
          userId: emailVerificationTokensInAuth.userId,
          expiresAt: emailVerificationTokensInAuth.expiresAt,
          usedAt: emailVerificationTokensInAuth.usedAt,
        })
        .from(emailVerificationTokensInAuth)
        .where(eq(emailVerificationTokensInAuth.tokenHash, tokenHash))
        .limit(1);
      const row = rows[0];
      if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
        throw new Error("This verification link is invalid or has expired.");
      }
      await db
        .update(usersInAuth)
        .set({ emailConfirmedAt: new Date().toISOString() })
        .where(eq(usersInAuth.id, row.userId));
      await db
        .update(emailVerificationTokensInAuth)
        .set({ usedAt: new Date().toISOString() })
        .where(eq(emailVerificationTokensInAuth.id, row.id));
      return row.userId;
    });

    // Clicking the link proves ownership of the inbox — sign them straight
    // in, same as the original Supabase confirm-email flow did.
    const session = await createSession(userId, clientMeta());
    writeSessionCookie(session.id);
    return { ok: true };
  });

/* ---------------------------- resend verification --------------------------- */

const resendVerificationSchema = z.object({ email: z.string().trim().toLowerCase().email() });

export const resendVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resendVerificationSchema.parse(d))
  .handler(async ({ data }) => {
    // Same mail-flooding cap as requestPasswordReset (mục 3.1).
    await enforceRateLimit([
      { kind: "verify:email", value: data.email, limit: 3, windowSeconds: 3600 },
      { kind: "verify:ip", value: getRequestIP() ?? "", limit: 10, windowSeconds: 3600 },
    ]);

    // Same "don't leak account existence" principle as requestPasswordReset —
    // always return the same generic result either way.
    const rows = await withAdmin((db) =>
      db
        .select({ id: usersInAuth.id, emailConfirmedAt: usersInAuth.emailConfirmedAt })
        .from(usersInAuth)
        .where(eq(usersInAuth.email, data.email))
        .limit(1),
    );
    const user = rows[0];
    if (user && !user.emailConfirmedAt) {
      await issueEmailVerification(user.id, data.email);
    }
    return { ok: true };
  });
