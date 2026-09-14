import { Loader2, Pause, Play, RotateCcw, Square, Volume2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type VoiceButtonProps = {
  /** The complete text to speak — never a fragment. */
  text: string;
  play: (text: string) => Promise<void> | void;
  stop: () => void;
  pause?: () => void;
  resume?: () => void;
  /** Text currently being spoken by the global player, or null. */
  speaking: string | null;
  paused?: boolean;
  loading?: boolean;
  label?: string;
  replayLabel?: string;
  /** Show pause/stop controls while this text is playing. */
  controls?: boolean;
  className?: string;
  compact?: boolean;
};

const base =
  "inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-surface-3 disabled:opacity-50";

/**
 * Shared listen / play-again control used by every voice feature.
 * Replays the exact stored text — it never regenerates a new response.
 */
export function VoiceButton({
  text,
  play,
  stop,
  pause,
  resume,
  speaking,
  paused,
  loading,
  label,
  replayLabel,
  controls = false,
  className,
  compact,
}: VoiceButtonProps) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("common.listen");
  const resolvedReplayLabel = replayLabel ?? t("listen.replay");
  const isThis = speaking === text;
  const isPausedHere = Boolean(paused) && isThis;
  const busy = Boolean(loading) && isThis;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => void play(text)}
        disabled={busy}
        aria-label={isThis ? resolvedReplayLabel : resolvedLabel}
        className={base}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isThis ? (
          <Volume2 className="size-3.5 animate-pulse text-brass" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
        {!compact && (busy ? t("app.voice.loading") : isThis ? resolvedReplayLabel : resolvedLabel)}
      </button>

      {controls && (isThis || isPausedHere) && (
        <>
          {isPausedHere ? (
            <button type="button" onClick={() => resume?.()} aria-label={t("app.voice.resume")} className={base}>
              <Play className="size-3.5" />
            </button>
          ) : (
            <button type="button" onClick={() => pause?.()} aria-label={t("app.voice.pause")} className={base}>
              <Pause className="size-3.5" />
            </button>
          )}
          <button type="button" onClick={stop} aria-label={t("app.voice.stop")} className={base}>
            <Square className="size-3.5" />
          </button>
          <button type="button" onClick={() => void play(text)} aria-label={resolvedReplayLabel} className={base}>
            <RotateCcw className="size-3.5" />
          </button>
        </>
      )}
    </span>
  );
}
