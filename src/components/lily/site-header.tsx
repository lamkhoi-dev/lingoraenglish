import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { LilyLogo } from "./brand";
import { LanguageSelector } from "./language-selector";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/locales/en";

export const NAV_ITEMS: { to: string; key: TranslationKey }[] = [
  { to: "/", key: "nav.home" },
  { to: "/ai-speaking", key: "nav.coach" },
  { to: "/shadowing", key: "nav.shadowing" },
  { to: "/listening-lab", key: "nav.listeningLab" },
  { to: "/speaking-tests", key: "nav.tests" },
  { to: "/pronunciation", key: "nav.pronunciation" },
  { to: "/vocabulary", key: "nav.vocabulary" },
  { to: "/progress", key: "nav.progress" },
];

/** Links that only make sense for a signed-in learner. */
const ACCOUNT_ITEMS: { to: string; key: TranslationKey }[] = [
  { to: "/dashboard", key: "nav.dashboard" },
  { to: "/progress", key: "nav.myLearning" },
  { to: "/account", key: "nav.profile" },
  { to: "/billing", key: "nav.billing" },
];

export function SiteHeader() {
  const { t } = useI18n();
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    setOpen(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/", replace: true });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 shadow-[0_1px_0_0_var(--color-border)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] flex-nowrap items-center gap-2 px-5 sm:px-6 2xl:gap-4 2xl:px-8">
        <div className="shrink-0">
          <LilyLogo />
        </div>

        <nav className="hidden min-w-0 flex-1 flex-nowrap items-center justify-center gap-0.5 xl:flex 2xl:gap-1.5">
          {NAV_ITEMS.slice(1, 9).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{
                className: "bg-surface-2 text-brass-soft ring-1 ring-brass/25",
              }}
              className="whitespace-nowrap rounded-full px-2 py-2 text-[12.5px] font-medium leading-none text-muted-foreground transition-colors hover:bg-surface-2/70 hover:text-foreground 2xl:px-3.5 2xl:text-[13px]"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
          <LanguageSelector />
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden whitespace-nowrap rounded-full bg-surface-2 px-3 py-2 text-xs font-semibold leading-none text-foreground ring-1 ring-border transition-colors hover:bg-surface-3 sm:block"
            >
              {t("nav.admin")}
            </Link>
          )}

          {user ? (
            <>
              <Link
                to="/dashboard"
                className="hidden whitespace-nowrap rounded-full bg-brass px-4 py-2 text-[13px] font-semibold leading-none text-plum-deep shadow-brass transition-opacity hover:opacity-90 sm:block"
              >
                {t("nav.dashboard")}
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="hidden whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:text-foreground lg:block"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signin" } as never}
                className="hidden whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium leading-none text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                {t("nav.login")}
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" } as never}
                className="hidden whitespace-nowrap rounded-full bg-brass px-4 py-2 text-[13px] font-semibold leading-none text-plum-deep shadow-brass transition-opacity hover:opacity-90 sm:block"
              >
                {t("nav.createFree")}
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t("nav.menu")}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground ring-1 ring-border transition-colors hover:bg-surface-3 xl:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border bg-surface xl:hidden">
          <nav className="mx-auto grid max-w-6xl gap-1 px-5 py-4 sm:grid-cols-2 sm:px-8">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                activeProps={{ className: "bg-surface-2 text-brass-soft" }}
                className="rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {t(item.key)}
              </Link>
            ))}

            {user ? (
              <>
                {ACCOUNT_ITEMS.map((item) => (
                  <Link
                    key={`account-${item.to}`}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-surface-2"
                  >
                    {t(item.key)}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-xl px-3 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-foreground hover:bg-surface-2"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup" } as never}
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-brass px-3 py-3 text-center text-sm font-semibold text-plum-deep"
                >
                  {t("nav.createFree")}
                </Link>
              </>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                {t("nav.admin")}
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
