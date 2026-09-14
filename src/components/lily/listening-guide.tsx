import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { type ListeningSkill } from "@/lib/listening-content";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const HIDE_KEY = "lingora.listening.guide.hidden";

/* ------------------------------ shared pieces ----------------------------- */

/** Small amber tip line used across every stage. */
export function Tip({ label, children }: { label?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <p className="mt-3 rounded-xl bg-brass/10 px-3 py-2 text-xs text-mist ring-1 ring-brass/20">
      <span className="font-semibold text-brass-soft">💡 {label ?? t("listen.guide.tipLabel")}:</span> {children}
    </p>
  );
}

function GuideStep({ icon, title, points }: { icon: string; title: string; points: string[] }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-3.5 ring-1 ring-border">
      <p className="text-sm font-semibold text-foreground">
        {icon} {title}
      </p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        {points.map((point) => (
          <li key={point}>• {point}</li>
        ))}
      </ul>
    </div>
  );
}

function useGuideSteps() {
  const { t } = useI18n();
  return [
    {
      icon: "🎧",
      title: t("listen.guide.step1.title"),
      points: [
        t("listen.guide.step1.point1"),
        t("listen.guide.step1.point2"),
        t("listen.guide.step1.point3"),
      ],
    },
    {
      icon: "🧠",
      title: t("listen.guide.step2.title"),
      points: [
        t("listen.guide.step2.point1"),
        t("listen.guide.step2.point2"),
        t("listen.guide.step2.point3"),
      ],
    },
    {
      icon: "⌨️",
      title: t("listen.guide.step3.title"),
      points: [
        t("listen.guide.step3.point1"),
        t("listen.guide.step3.point2"),
        t("listen.guide.step3.point3"),
      ],
    },
    {
      icon: "📊",
      title: t("listen.guide.step4.title"),
      points: [t("listen.guide.step4.point1")],
    },
  ] as const;
}

/** The "Don't worry if..." reassurance card. */
export function DontWorryCard({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("rounded-2xl bg-surface-2/50 p-3.5 ring-1 ring-border", className)}>
      <p className="text-sm font-semibold text-foreground">{t("listen.guide.dontWorryTitle")}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <li>• {t("listen.guide.dontWorry1")}</li>
        <li>• {t("listen.guide.dontWorry2")}</li>
        <li>• {t("listen.guide.dontWorry3")}</li>
      </ul>
    </div>
  );
}

/** The "Before you start" mindset tip. */
export function BeforeYouStartCard() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl bg-brass/10 p-3.5 ring-1 ring-brass/20">
      <p className="text-sm font-semibold text-brass-soft">{t("listen.guide.beforeYouStartTitle")}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-mist">
        <li>• {t("listen.guide.beforeYouStart1")}</li>
        <li>• {t("listen.guide.beforeYouStart2")}</li>
        <li>• {t("listen.guide.beforeYouStart3")}</li>
      </ul>
    </div>
  );
}

/* ------------------------- how-it-works guide panel ----------------------- */

/** Remembers whether the learner asked to stop seeing the full guide. */
export function useGuidePreference() {
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const setHiddenPersisted = useCallback((value: boolean) => {
    setHidden(value);
    try {
      window.localStorage.setItem(HIDE_KEY, value ? "1" : "0");
    } catch {
      /* storage unavailable — the session still works, just without memory */
    }
  }, []);

  return { hidden, setHidden: setHiddenPersisted };
}

export type HowItWorksProps = {
  /** Optional primary action, e.g. "Ready? Let's Listen →". */
  onStart?: (() => void) | undefined;
  startLabel?: string;
  /** Starts collapsed when the learner has already seen the guide. */
  defaultOpen?: boolean;
  showDontShowAgain?: boolean;
  hidden?: boolean;
  onHiddenChange?: ((value: boolean) => void) | undefined;
};

/**
 * "How to Do This Listening Lesson" — the instructional layer a learner sees
 * before they start. It teaches the listening strategy (big picture → details →
 * exact words → review), not just the buttons on screen.
 */
export function HowItWorksGuide({
  onStart,
  startLabel,
  defaultOpen = true,
  showDontShowAgain = true,
  hidden,
  onHiddenChange,
}: HowItWorksProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const guideSteps = useGuideSteps();

  return (
    <section className="rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="font-display text-base text-foreground sm:text-lg">{t("listen.guide.howToTitle")}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {open ? t("listen.guide.hide") : t("listen.guide.show")}
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {open && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("listen.guide.strategyLine")}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {guideSteps.map((step) => (
              <GuideStep key={step.title} icon={step.icon} title={step.title} points={[...step.points]} />
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <BeforeYouStartCard />
            <DontWorryCard />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onStart && (
              <button
                type="button"
                onClick={onStart}
                className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
              >
                {startLabel ?? t("listen.guide.readyToListen")}
              </button>
            )}
            {showDontShowAgain && onHiddenChange && (
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(hidden)}
                  onChange={(event) => onHiddenChange(event.target.checked)}
                  className="size-3.5 accent-[var(--color-brass)]"
                />
                {t("listen.guide.dontShowAgain")}
              </label>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Small always-available button that reopens the instructions. */
export function HowDoesThisWorkButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-border hover:text-foreground"
    >
      <HelpCircle className="size-3.5" /> {t("listen.guide.howDoesThisWork")}
    </button>
  );
}

/* ---------------------------- stage instructions -------------------------- */

/** ✓ done / → current / ○ upcoming progress indicator. */
export function StageProgress({ stage }: { stage: number }) {
  const { t } = useI18n();
  const items = [
    { n: 1, label: t("listen.stage.listen") },
    { n: 2, label: t("listen.stage.understand") },
    { n: 3, label: t("listen.stage.dictation") },
    { n: 4, label: t("listen.stage.review") },
  ];
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={t("listen.stage.progressAriaLabel")}>
      {items.map((item) => {
        const done = stage > item.n;
        const current = stage === item.n;
        return (
          <li
            key={item.n}
            aria-current={current ? "step" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-border",
              current
                ? "bg-brass text-plum-deep"
                : done
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-surface-2 text-muted-foreground",
            )}
          >
            {done ? "✓" : current ? "→" : "○"} {item.n}. {item.label}
          </li>
        );
      })}
    </ol>
  );
}

export function StageHeader({
  title,
  instruction,
  listFor,
  listTitle,
}: {
  title: string;
  instruction: string;
  listFor?: string[];
  listTitle?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
      <h3 className="font-display text-base text-foreground sm:text-lg">{title}</h3>
      <p className="mt-1 text-sm text-mist">{instruction}</p>
      {listFor && listFor.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass-soft">
            {listTitle ?? t("listen.guide.listenFor")}
          </p>
          <ul className="mt-1.5 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {listFor.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Short, per-question-type coaching so learners know how to attack each one. */
export function QuestionTypeHint({ skill }: { skill: ListeningSkill }) {
  const { t } = useI18n();
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      <span className="rounded-full bg-surface-3 px-2 py-0.5 font-semibold text-brass-soft ring-1 ring-border">
        {t(`listen.skill.${skill}` as never)}
      </span>{" "}
      💡 {t(`listen.questionHint.${skill}` as never)}
    </p>
  );
}

/** Compact, collapsible dictation strategy. */
export function DictationStrategy() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-2xl bg-surface-2/60 p-3.5 ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-foreground">{t("listen.dictation.strategyToggle")}</span>
        <span className="text-xs text-muted-foreground">{open ? t("listen.guide.hide") : t("listen.guide.show")}</span>
      </button>
      {open && (
        <>
          <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>1. {t("listen.dictation.step1")}</li>
            <li>2. {t("listen.dictation.step2")}</li>
            <li>3. {t("listen.dictation.step3")}</li>
            <li>4. {t("listen.dictation.step4")}</li>
            <li>5. {t("listen.dictation.step5")}</li>
          </ol>
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("listen.dictation.payAttentionTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("listen.dictation.payAttentionList")}
            </p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("listen.dictation.example", { word: "call" })}
          </p>
        </>
      )}
    </div>
  );
}

/** Guidance shown next to the transcript toggle. */
export function TranscriptGuidance({ open }: { open: boolean }) {
  const { t } = useI18n();
  return open ? (
    <div className="mt-3 rounded-2xl bg-brass/10 p-3.5 ring-1 ring-brass/20">
      <p className="text-sm font-semibold text-brass-soft">{t("listen.transcript.learnFromMissedTitle")}</p>
      <p className="mt-1 text-xs text-mist">
        {t("listen.transcript.learnFromMissedBody")}
      </p>
    </div>
  ) : (
    <div className="mt-3 rounded-2xl bg-surface-2/60 p-3.5 ring-1 ring-border">
      <p className="text-sm font-semibold text-foreground">{t("listen.transcript.whenToUseTitle")}</p>
      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <li>• {t("listen.transcript.whenToUse1")}</li>
        <li>• {t("listen.transcript.whenToUse2")}</li>
        <li>• {t("listen.transcript.whenToUse3")}</li>
      </ul>
    </div>
  );
}
