import { Link } from "@tanstack/react-router";

import { LilyLogo } from "./brand";
import { LanguageSelector } from "./language-selector";
import { useI18n } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <LilyLogo />
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            <Link to="/ai-speaking" className="hover:text-foreground">
              {t("nav.coach")}
            </Link>
            <Link to="/shadowing" className="hover:text-foreground">
              {t("nav.shadowing")}
            </Link>
            <Link to="/speaking-tests" className="hover:text-foreground">
              {t("app.footer.ielts")}
            </Link>
            <Link to="/progress" className="hover:text-foreground">
              {t("nav.progress")}
            </Link>
            <Link to="/account" className="hover:text-foreground">
              {t("nav.account")}
            </Link>
            <LanguageSelector />
          </nav>
        </div>
        <nav className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
          <Link to="/pricing" className="hover:text-foreground">
            {t("nav.pricing")}
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            {t("nav.terms")}
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            {t("nav.privacy")}
          </Link>
          <Link to="/refunds" className="hover:text-foreground">
            {t("app.footer.refunds")}
          </Link>
        </nav>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground/80">
          {t("account.privacyBody")} {t("ielts.disclaimer")}
        </p>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          © {new Date().getFullYear()} Ms Thao English — Lingora English
        </p>

      </div>
    </footer>
  );
}
