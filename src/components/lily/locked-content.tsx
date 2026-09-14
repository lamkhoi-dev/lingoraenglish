import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";

import { getContentCatalogue, type CatalogueItem } from "@/lib/content-catalogue.functions";
import { useI18n } from "@/lib/i18n";
import { rememberReturnPath } from "@/lib/upgrade-return";

export type CatalogueKind = "vocabulary" | "grammar" | "listening";
export type { CatalogueItem };

/**
 * Titles of every published item plus whether the learner's plan includes it.
 * Locked bodies are never sent to the browser — row policies withhold them.
 */
export function useContentCatalogue(kind: CatalogueKind) {
  const fetchCatalogue = useServerFn(getContentCatalogue);
  return useQuery({
    queryKey: ["content-catalogue", kind],
    queryFn: () => fetchCatalogue({ data: { kind } }),
    staleTime: 60 * 1000,
  });
}

function TierBadge({ tier }: { tier: string }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brass/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brass-soft">
      <Lock className="size-3" />
      {tier === "ielts_pro" ? t("plan.ieltsPro") : t("plan.premium")}
    </span>
  );
}

/** Preview list of the material this learner's plan does not include yet. */
export function LockedContentList({ kind, title }: { kind: CatalogueKind; title?: string }) {
  const { t } = useI18n();
  const { data } = useContentCatalogue(kind);
  const locked = (data ?? []).filter((item) => !item.unlocked);
  if (locked.length === 0) return null;

  return (
    <section className="mt-10 rounded-3xl border border-brass/25 bg-surface-2/50 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">{title ?? t("locked.title")}</h3>
        <Link
          to="/pricing"
          onClick={() => rememberReturnPath()}
          className="rounded-full bg-brass px-4 py-2 text-xs font-semibold text-plum-deep shadow-brass"
        >
          {t("locked.unlock")}
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("locked.sub", { count: String(locked.length) })}</p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {locked.slice(0, 12).map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-2xl bg-surface-1/70 px-4 py-3 ring-1 ring-border"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground/80">{item.title}</span>
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {[item.level, item.category].filter(Boolean).join(" · ")}
              </span>
            </span>
            <TierBadge tier={item.access_tier} />
          </li>
        ))}
      </ul>
    </section>
  );
}
