import { Loader2, Mic, RotateCcw, Send, Square, Volume2 } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Recording } from "@/hooks/use-recorder";
import { useRecorder } from "@/hooks/use-recorder";

function Waveform({ level, active }: { level: number; active: boolean }) {
  const bars = [0, 0.12, 0.24, 0.06, 0.3, 0.18, 0.42, 0.26, 0.36, 0.1, 0.22];
  return (
    <div className="flex h-14 items-end justify-center gap-[3px]">
      {bars.map((delay, i) => (
        <span
          key={i}
          className={cn("w-1 origin-center rounded-full bg-brass-soft", active && "animate-bar")}
          style={{
            height: `${Math.max(6, (active ? level * 44 : 8) + (i % 3) * 6)}px`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export type MicRecorderProps = {
  onSubmit: (recording: Recording) => void | Promise<void>;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  disabledReason?: ReactNode;
  hint?: string;
  /**
   * Send the recording automatically after a natural end-of-speech pause.
   * Short pauses while thinking never end the turn.
   */
  autoSend?: boolean;
  /** True while the AI voice is speaking — the microphone stays closed. */
  aiSpeaking?: boolean;
};

export function MicRecorder({
  onSubmit,
  busy,
  busyLabel,
  disabled,
  disabledReason,
  hint,
  autoSend,
  aiSpeaking,
}: MicRecorderProps) {
  const { t } = useI18n();
  // onSilenceStop fires before `recorder` exists, so route the post-submit
  // reset through a ref that always points at the latest reset().
  const resetRef = useRef<() => void>(() => {});
  const recorder = useRecorder(
    autoSend
      ? {
          silenceStopMs: 2600,
          onSilenceStop: (rec) => {
            void Promise.resolve(onSubmit(rec)).finally(() => resetRef.current());
          },
        }
      : {},
  );
  resetRef.current = recorder.reset;

  const mmss = `${String(Math.floor(recorder.seconds / 60)).padStart(2, "0")}:${String(recorder.seconds % 60).padStart(2, "0")}`;
  const blocked = Boolean(disabled) || Boolean(busy) || Boolean(aiSpeaking);

  const stateLabel = aiSpeaking
    ? t("coach.mic.aiSpeaking")
    : busy
      ? `⏳ ${busyLabel ?? t("common.analysing")}`
      : recorder.isRecording
        ? `🔴 ${t("mic.recording")} · ${mmss}`
        : recorder.recording
          ? `${t("mic.recorded")} · ${recorder.recording.seconds}s`
          : recorder.state === "stopped"
            ? t("coach.mic.speakAgain")
            : t("mic.tapToStart");

  return (
    <div className="flex flex-col items-center">
      <Waveform level={recorder.level} active={recorder.isRecording} />

      <div className="relative mt-2 grid size-24 place-items-center">
        {recorder.isRecording && (
          <>
            <span className="absolute inset-0 animate-glow rounded-full border-2 border-brass-soft/60" />
            <span
              className="absolute inset-0 animate-glow rounded-full border-2 border-brass-soft/60"
              style={{ animationDelay: "1.2s" }}
            />
          </>
        )}
        <button
          type="button"
          disabled={blocked || recorder.state === "requesting"}
          onClick={() => (recorder.isRecording ? void recorder.stop() : void recorder.start())}
          aria-label={recorder.isRecording ? t("mic.stopRecording") : t("mic.startRecording")}
          className="relative grid size-20 place-items-center rounded-full bg-brass text-background shadow-brass ring-1 ring-brass-soft/50 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {recorder.state === "requesting" || busy ? (
            <Loader2 className="size-7 animate-spin" />
          ) : aiSpeaking ? (
            <Volume2 className="size-7 animate-pulse" />
          ) : recorder.isRecording ? (
            <Square className="size-7" />
          ) : (
            <Mic className="size-8" />
          )}
        </button>
      </div>

      <p className="mt-3 text-sm font-semibold text-foreground">{stateLabel}</p>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        {hint ?? t("speaking.hint")}
      </p>
      {autoSend && !aiSpeaking && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {t("coach.mic.takeYourTime")}
        </p>
      )}

      {recorder.error && <p className="mt-3 text-center text-xs text-danger">{recorder.error}</p>}
      {disabled && disabledReason && (
        <div className="mt-3 max-w-sm text-center text-xs text-muted-foreground">{disabledReason}</div>
      )}

      {recorder.recording && (
        <audio controls src={recorder.recording.url} className="mt-4 w-full max-w-xs" />
      )}

      <div className="mt-5 flex w-full max-w-sm gap-2 text-sm">
        <button
          type="button"
          onClick={() => void recorder.stop()}
          disabled={!recorder.isRecording}
          className="flex-1 rounded-full bg-surface-2 py-2.5 font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-3 disabled:opacity-40"
        >
          {t("common.stop")}
        </button>
        <button
          type="button"
          onClick={recorder.reset}
          disabled={recorder.state === "idle" || busy}
          className="flex-1 rounded-full bg-surface-2 py-2.5 font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-3 disabled:opacity-40"
        >
          <RotateCcw className="mr-1 inline size-3.5" />
          {t("common.retry")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!recorder.recording) return;
            void Promise.resolve(onSubmit(recorder.recording)).finally(() => recorder.reset());
          }}
          disabled={!recorder.recording || blocked}
          className="flex-1 rounded-full bg-brass py-2.5 font-semibold text-background ring-1 ring-brass-soft/40 transition-transform hover:-translate-y-0.5 disabled:opacity-40"
        >
          {busy ? (
            <>
              <Loader2 className="mr-1 inline size-3.5 animate-spin" />
              {busyLabel ?? t("common.analysing")}
            </>
          ) : (
            <>
              <Send className="mr-1 inline size-3.5" />
              {t("common.submit")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
