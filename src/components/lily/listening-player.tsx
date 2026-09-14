import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { speak } from "@/lib/lily.functions";
import { PLAYBACK_SPEEDS, accentKey, formatDuration, type ScriptLine } from "@/lib/listening-content";
import { cn } from "@/lib/utils";
import { voicePlayer } from "@/lib/voice-player";

const VOICES = ["shimmer", "alloy", "verse", "sage"];

export type ListeningPlayerProps = {
  script: ScriptLine[];
  durationSeconds: number;
  accent: string;
  /** Called with extra seconds of audio the learner actually listened to. */
  onListened?: ((seconds: number) => void) | undefined;
  compact?: boolean;
};

/**
 * The audio stage of a Listening Lab lesson. Lines are spoken by the
 * platform's own cached voices — one voice per speaker — and played back to
 * back so the learner hears a continuous conversation. Playback speed, pause,
 * resume, replay and volume all act on the real audio element.
 */
export function ListeningPlayer({ script, durationSeconds, accent, onListened, compact }: ListeningPlayerProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const requestSpeech = useServerFn(speak);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const token = useRef(0);
  const listened = useRef(0);

  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [index, setIndex] = useState(0);
  const [lineProgress, setLineProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);

  const speakerVoice = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of script) {
      if (!map.has(line.speaker)) map.set(line.speaker, VOICES[map.size % VOICES.length]!);
    }
    return map;
  }, [script]);

  const hardStop = useCallback(() => {
    token.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setStatus("idle");
    setLineProgress(0);
  }, []);

  useEffect(() => {
    hardStop();
    setIndex(0);
  }, [script, hardStop]);

  useEffect(() => () => hardStop(), [hardStop]);

  useEffect(() => {
    if (status === "idle" && listened.current >= 1) {
      onListened?.(Math.round(listened.current));
      listened.current = 0;
    }
  }, [status, onListened]);

  const fetchLine = useCallback(
    async (line: ScriptLine) => {
      const voice = speakerVoice.get(line.speaker) ?? "shimmer";
      const key = `${voice}::${line.line}`;
      const hit = cache.current.get(key);
      if (hit) return hit;
      const res = await requestSpeech({ data: { text: line.line, voice } });
      const src = `data:${res.mime};base64,${res.audioBase64}`;
      cache.current.set(key, src);
      return src;
    },
    [requestSpeech, speakerVoice],
  );

  const playFrom = useCallback(
    async (from: number) => {
      if (!user) {
        toast.error(t("listen.error.signInToPlay"));
        return;
      }
      voicePlayer.stop();
      token.current += 1;
      const run = token.current;
      setStatus("loading");

      try {
        for (let i = from; i < script.length; i += 1) {
          if (run !== token.current) return;
          setIndex(i);
          const src = await fetchLine(script[i]!);
          if (run !== token.current) return;
          await new Promise<void>((resolve, reject) => {
            const el = new Audio(src);
            el.playbackRate = rate;
            el.volume = volume;
            audioRef.current = el;
            el.ontimeupdate = () => {
              if (el.duration > 0) {
                setLineProgress(el.currentTime / el.duration);
                listened.current += 0.25;
              }
            };
            el.onended = () => resolve();
            el.onerror = () => reject(new Error(t("listen.error.playbackFailed")));
            el.onplay = () => {
              if (run === token.current) setStatus("playing");
            };
            el.play().catch(reject);
          });
        }
        if (run === token.current) {
          setStatus("idle");
          setLineProgress(0);
          setIndex(0);
        }
      } catch (error) {
        if (run === token.current) setStatus("idle");
        toast.error(error instanceof Error ? error.message : t("listen.error.couldNotPlay"));
      }
    },
    [fetchLine, rate, script, user, volume],
  );

  const pause = () => {
    audioRef.current?.pause();
    setStatus("paused");
  };

  const resume = () => {
    void audioRef.current?.play();
    setStatus("playing");
  };

  const changeRate = (value: number) => {
    setRate(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };

  const overall = script.length ? ((index + lineProgress) / script.length) * 100 : 0;
  const busy = status === "loading";

  return (
    <div className={cn("rounded-2xl bg-surface-2/70 ring-1 ring-border", compact ? "p-4" : "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("listen.player.audioLabel")}</span>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-surface-3 px-2.5 py-1 ring-1 ring-border">{t(`listen.accent.${accentKey(accent)}` as never)}</span>
          <span className="rounded-full bg-surface-3 px-2.5 py-1 ring-1 ring-border">
            {formatDuration(durationSeconds)}
          </span>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-brass transition-[width]" style={{ width: `${overall}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {status === "idle" ? t("listen.player.ready") : t("listen.player.partOf", { index: index + 1, total: script.length })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status === "playing" ? (
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-2 rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass"
          >
            <Pause className="size-4" /> {t("listen.player.pause")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (status === "paused" ? resume() : void playFrom(0))}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {status === "paused" ? t("listen.player.resume") : t("listen.player.play")}
          </button>
        )}

        <button
          type="button"
          onClick={() => void playFrom(0)}
          className="inline-flex items-center gap-2 rounded-full bg-surface-3 px-3.5 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-surface-2"
        >
          <RotateCcw className="size-4" /> {t("listen.player.replay")}
        </button>

        <button
          type="button"
          onClick={hardStop}
          className="inline-flex items-center gap-2 rounded-full bg-surface-3 px-3.5 py-2 text-sm font-medium text-muted-foreground ring-1 ring-border hover:text-foreground"
        >
          <Square className="size-4" /> {t("listen.player.stop")}
        </button>

        <div className="flex items-center gap-1 rounded-full bg-surface-3 p-1 ring-1 ring-border">
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => changeRate(speed)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                rate === speed ? "bg-brass text-plum-deep" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {speed}x
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="size-4" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
            aria-label={t("listen.player.volumeAria")}
            className="h-1 w-24 accent-[var(--color-brass)]"
          />
        </label>
      </div>

      {!user && (
        <p className="mt-3 text-xs text-muted-foreground">{t("listen.player.signInToPlay")}</p>
      )}
    </div>
  );
}
