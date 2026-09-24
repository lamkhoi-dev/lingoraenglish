import { Joyride, STATUS, type Step } from "react-joyride";
import { useCallback, useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";

const SEEN_PREFIX = "lily.tour.seen.";

/**
 * Remembers whether the learner has already seen a given page's guided tour
 * and auto-starts it the first time — same idea as useGuidePreference in
 * listening-guide.tsx, but keyed per feature (coach/shadowing/pronunciation/
 * vocabulary) instead of one shared flag, and driving react-joyride instead
 * of a static instructional card.
 *
 * `ready` gates the auto-start until the page's own target elements actually
 * exist (e.g. after an async catalogue fetch resolves) — react-joyride will
 * also wait up to targetWaitTimeout per step, but starting early just to sit
 * on a loading state looks broken, so the caller controls the real gate.
 */
export function useFeatureTour(tourKey: string, steps: Step[], ready = true) {
  const [run, setRun] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);

  useEffect(() => {
    if (!ready || autoChecked) return;
    setAutoChecked(true);
    let seen = true;
    try {
      seen = window.localStorage.getItem(SEEN_PREFIX + tourKey) === "1";
    } catch {
      seen = true; // storage unavailable — don't force a tour on every load
    }
    if (!seen) setRun(true);
  }, [ready, autoChecked, tourKey]);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_PREFIX + tourKey, "1");
    } catch {
      /* storage unavailable — the tour just won't remember for next time */
    }
  }, [tourKey]);

  const handleEvent = useCallback(
    (data: { status: string }) => {
      if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
        setRun(false);
        markSeen();
      }
    },
    [markSeen],
  );

  const restart = useCallback(() => setRun(true), []);

  return { run, steps, handleEvent, restart };
}

export type FeatureTourHandle = Pick<ReturnType<typeof useFeatureTour>, "run" | "steps" | "handleEvent">;

/** Spotlight walkthrough for a feature page. Steps target real on-screen
 * elements via `data-tour="..."` CSS attribute selectors. */
export function FeatureTour({ run, steps, handleEvent }: FeatureTourHandle) {
  const { t } = useI18n();
  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{
        back: t("tour.back"),
        close: t("tour.close"),
        last: t("tour.done"),
        next: t("tour.next"),
        nextWithProgress: t("tour.nextWithProgress"),
        skip: t("tour.skip"),
      }}
      options={{
        // Without this every step first shows a pulsing dot the learner must
        // click to open the tooltip — a first-time visitor has no way to know
        // that, so the tour would just look like a stray blinking circle.
        skipBeacon: true,
        buttons: ["back", "close", "primary", "skip"],
        showProgress: true,
        primaryColor: "var(--color-brass)",
        overlayColor: "rgba(0, 0, 0, 0.65)",
        arrowColor: "var(--color-surface-2)",
        backgroundColor: "var(--color-surface-2)",
        textColor: "var(--color-foreground)",
        zIndex: 1000,
        spotlightPadding: 6,
        // Phone-sized screens: the default fixed 380px card touches both edges
        // of a 390px viewport, so leave a gutter.
        width: "min(380px, calc(100vw - 32px))",
        // The sticky site header is 64px tall; the default 20px scroll offset
        // parks the highlighted element underneath it.
        scrollOffset: 80,
        // A stray tap on the dark area used to skip a step, and a tap "through"
        // the spotlight could start a coach session (burning one of the 3 free
        // turns) mid-tour — neither is what a finger on a small screen means.
        overlayClickAction: false,
        blockTargetInteraction: true,
        // The corner X should leave the tour, not silently advance to the
        // next step (the library's default for "close").
        closeButtonAction: "skip",
      }}
      styles={{
        // Keep centred titles clear of the corner X.
        tooltipTitle: { paddingInline: 28 },
        // Long translated labels wrap onto a second row instead of overflowing.
        tooltipFooter: { flexWrap: "wrap", rowGap: 8 },
        // ~44px touch targets instead of the default ~32px.
        buttonPrimary: { padding: "14px 16px", whiteSpace: "nowrap" },
        buttonBack: { padding: "14px 12px", whiteSpace: "nowrap" },
        buttonSkip: { padding: "14px 8px", whiteSpace: "nowrap" },
        buttonClose: { padding: 12 },
      }}
    />
  );
}

/** Small button pages place near their heading to re-open the tour any time,
 * not just on the first visit. */
export function ViewGuideButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground ring-1 ring-border hover:bg-surface-3 hover:text-foreground"
    >
      {t("tour.viewGuide")}
    </button>
  );
}
