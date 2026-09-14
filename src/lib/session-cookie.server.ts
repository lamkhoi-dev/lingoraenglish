import { createServerOnlyFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE_NAME = "lily_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const readSessionCookie = createServerOnlyFn((): string | undefined => {
  return getCookie(COOKIE_NAME);
});

export const writeSessionCookie = createServerOnlyFn((sessionId: string): void => {
  setCookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
});

export const clearSessionCookie = createServerOnlyFn((): void => {
  deleteCookie(COOKIE_NAME, { path: "/" });
});
