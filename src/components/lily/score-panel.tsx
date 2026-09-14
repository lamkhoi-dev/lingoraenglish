import { DemoBadge } from "./brand";
import { useI18n } from "@/lib/i18n";

export function ScoreStat({ label, value, suffix = "/10" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1 font-display text-3xl text-brass-soft">
        {value === null ? <span className="text-2xl text-muted-foreground">—</span> : value}
        {value !== null && <span className="text-base text-muted-foreground">{suffix}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function ScoreBar({ label, value, max = 10 }: { label: string; value: number | null; max?: number }) {
  const pct = value === null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">{value === null ? "—" : value}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brass transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FeedbackRow({ tag, tone = "mist", children }: { tag: string; tone?: "mist" | "plum" | "brass"; children: React.ReactNode }) {
  const toneClass = tone === "plum" ? "text-plum-soft" : tone === "brass" ? "text-brass-soft" : "text-muted-foreground";
  return (
    <p className="text-sm leading-relaxed text-mist">
      <span className={`mr-2 text-xs font-semibold uppercase tracking-[0.1em] ${toneClass}`}>{tag}</span>
      {children}
    </p>
  );
}

export function PanelCard({
  title,
  demo,
  actions,
  children,
}: {
  title: string;
  demo?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="lounge-panel animate-rise p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        <div className="flex items-center gap-2">
          {demo && <DemoBadge />}
          {actions}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function DemoNotice() {
  const { t } = useI18n();
  return (
    <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground ring-1 ring-border">
      {t("common.demoNotice")}
    </p>
  );
}

