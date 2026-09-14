import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Gauge, Loader2, Repeat, Square, Volume2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { MicRecorder } from "@/components/lily/mic-recorder";
import { FeedbackRow, ScoreStat } from "@/components/lily/score-panel";
import type { Recording } from "@/hooks/use-recorder";
import { usePaywall } from "@/hooks/use-paywall";
import { useAuth } from "@/lib/auth";
import { savePronunciationAttempt } from "@/lib/attempts.functions";
import { useI18n } from "@/lib/i18n";
import { analysePronunciation, speak, transcribeAudio, type PronunciationResult } from "@/lib/lily.functions";
import { measureDelivery, PRACTICE_STEPS, type DeliveryMetrics, type SkillId } from "@/lib/pronunciation-content";
import { updatePronunciationSoundScore } from "@/lib/pronunciation.functions";
import { voicePlayer } from "@/lib/voice-player";
import { cn } from "@/lib/utils";

const SPEEDS = [0.6, 0.8, 1];

export type PronPracticeProps = {
  /** The exact line the learner should say. */
  target: string;
  /** IPA symbol when the drill focuses on one sound. */
  targetSound?: string | undefined;
  /** Stored on each attempt so the dashboard can score each skill. */
  mode: SkillId | "shadowing";
  /** SKILL_LESSONS id when this drill is one of the 8 advanced-skill lessons
   * — lets the server re-check the free-example allowance for that lesson. */
  lessonId?: string | undefined;
  /** Visual stress / pause / pitch pattern shown above the recorder. */
  pattern?: string | undefined;
  /** Accent of the model audio. */
  accentLabel?: string | undefined;
  /** Called after a clear attempt so the parent can mark progress. */
  onScored?: ((accuracy: number | null) => void) | undefined;
  /** Sounds mode only: fires after updatePronunciationSoundScore resolves,
   * with the server's authoritative mastered flag — lets the parent's own
   * progress state (the sound-picker's checkmarks, and initialMastered for
   * the next time this sound is opened) stay correct for the rest of this
   * session instead of only updating on the next full page load. mastered
   * can go from true back to false too (non-sticky, see updatePronunciationSoundScore). */
  onSoundMastered?: ((sound: string, mastered: boolean) => void) | undefined;
  /** Sounds mode only: whether this sound was already Mastered from a past
   * session (persisted in pronunciation_scores), so step 8's chip and the
   * clear-run streak pick up where the learner left off instead of
   * resetting to zero every time this component remounts — it's keyed by
   * `target/targetSound`, so switching sounds or reloading the page is a
   * fresh mount. */
  initialMastered?: boolean | undefined;
};

/**
 * The shared 8-step practice card: Listen → Understand → Watch → Repeat →
 * Record → AI feedback → Try again → Mastered.
 *
 * Model audio comes from the platform's own cached text-to-speech voice, which
 * is an American English AI voice — never claimed to be a human recording.
 * Feedback is built from the real speech-to-text read-back plus measurable
 * delivery numbers; nothing acoustic is invented.
 */
export function PronPractice({
  target,
  targetSound,
  mode,
  lessonId,
  pattern,
  accentLabel,
  onScored,
  onSoundMastered,
  initialMastered,
}: PronPracticeProps) {
  const { locale, englishOnly } = useI18n();
  const lang = englishOnly ? "en" : locale;
  const { user } = useAuth();
  const requestSpeech = useServerFn(speak);
  const transcribe = useServerFn(transcribeAudio);
  const analyse = useServerFn(analysePronunciation);
  const saveAttempt = useServerFn(savePronunciationAttempt);
  const updateSoundScore = useServerFn(updatePronunciationSoundScore);
  const { paywall, handleError, clearPaywall } = usePaywall("pronunciation");

  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  /** Steps 2 (Understand), 3 (Watch/learn) and 4 (Repeat) have no automatic
   * signal available in this component — the lesson content they refer to
   * (the "how"/lips-teeth-tongue-jaw text, the mouth diagram) is rendered by
   * the parent page, not here, and "repeat" has no separate recording of its
   * own. Previously all four of steps 1-4 shared the transient `playing`
   * flag, so clicking Listen once lit up all four at once — self-reported
   * via tapping the chip is the honest fix: each step now needs its own
   * explicit action instead of piggy-backing on Listen's. */
  const [ackSteps, setAckSteps] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [clearRuns, setClearRuns] = useState(initialMastered ? 2 : 0);
  const [myAudio, setMyAudio] = useState<string | null>(null);
  const cache = useRef(new Map<string, string>());

  const play = useCallback(
    async (rate: number) => {
      if (!user) {
        toast.error("Sign in to hear the model audio.");
        return;
      }
      try {
        setPlaying(true);
        setHasPlayed(true);
        setSpeed(rate);
        let src = cache.current.get(target);
        if (!src) {
          const res = await requestSpeech({ data: { text: target, voice: "shimmer" } });
          src = `data:${res.mime};base64,${res.audioBase64}`;
          cache.current.set(target, src);
        }
        await voicePlayer.playRaw(src, { rate, loop, label: target });
        setPlaying(false);
      } catch (error) {
        setPlaying(false);
        handleError(error, "Could not play the audio.");
      }
    },
    [handleError, loop, requestSpeech, target, user],
  );

  const stop = () => {
    voicePlayer.stop();
    setPlaying(false);
  };

  const submit = async (recording: Recording) => {
    if (!user) return;
    clearPaywall();
    setBusy(true);
    setMyAudio(recording.url);
    try {
      const { transcript } = await transcribe({
        data: { audioBase64: recording.base64, mimeType: recording.mimeType },
      });
      const analysis = await analyse({
        data: {
          target,
          targetSound: targetSound || undefined,
          transcript,
          lang,
          audioBase64: recording.base64,
          mimeType: recording.mimeType,
          ...(mode !== "sounds" && mode !== "shadowing" ? { lessonId } : {}),
        },
      });
      setResult(analysis);
      setMetrics(measureDelivery(transcript, recording.seconds));
      setAttempts((a) => a + 1);
      const accuracy = analysis.wordAccuracy;
      onScored?.(accuracy);

      await saveAttempt({
        data: {
          mode,
          target,
          targetSound: targetSound || null,
          transcript,
          accuracy,
          feedback: analysis.feedback,
          isDemo: !analysis.acoustic,
        },
      });

      if (targetSound && accuracy !== null) {
        // Persisted (pronunciation_scores) — the server's clearRuns is the
        // source of truth so "Mastered" survives a reload, not just this session.
        const updated = await updateSoundScore({ data: { sound: targetSound, accuracy } });
        setClearRuns(updated.clearRuns);
        onSoundMastered?.(targetSound, updated.mastered);
      } else {
        // No sound to persist against (advanced-skill lesson or shadowing
        // drill) — same streak logic, but session-local as before.
        setClearRuns((c) => (accuracy !== null && accuracy >= 90 ? c + 1 : 0));
      }
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const mastered = clearRuns >= 2;

  return (
    <section className="lounge-panel p-5 sm:p-6">
      {paywall}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">Practice</h2>
        {accentLabel && (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-brass-soft ring-1 ring-border">
            {accentLabel}
          </span>
        )}
      </div>

      {/* steps — each needs its own real signal, not one shared flag (see
          hasPlayed/ackSteps above): 1 Listen requires having actually played
          the audio; 2-4 (Understand/Watch/Repeat) have no automatic signal
          available here, so the learner taps the chip to self-report; 5-8
          come from real recording/scoring state. */}
      <ol className="mt-4 flex flex-wrap gap-1.5">
        {PRACTICE_STEPS.map((step) => {
          const selfReport = step.n >= 2 && step.n <= 4;
          const done =
            (step.n === 1 && hasPlayed) ||
            (selfReport && ackSteps.has(step.n)) ||
            (step.n === 5 && attempts > 0) ||
            (step.n === 6 && !!result) ||
            (step.n === 7 && attempts > 1) ||
            (step.n === 8 && mastered);
          const chipClass = cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-border transition-colors",
            done ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground",
          );
          if (selfReport) {
            return (
              <li key={step.n}>
                <button
                  type="button"
                  title={`${step.hint} Tap once you've done this.`}
                  onClick={() => setAckSteps((s) => new Set(s).add(step.n))}
                  className={cn(chipClass, !done && "hover:bg-surface-3")}
                >
                  {step.n}. {step.label}
                </button>
              </li>
            );
          }
          return (
            <li key={step.n} title={step.hint} className={chipClass}>
              {step.n}. {step.label}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
        <p className="font-display text-lg leading-snug text-foreground">{target}</p>
        {pattern && <p className="mt-1.5 text-sm font-semibold tracking-wide text-brass-soft">{pattern}</p>}
        {targetSound && <p className="mt-1 text-sm text-plum-soft">Focus sound {targetSound}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => void play(rate)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border transition-colors",
                speed === rate && playing ? "bg-brass text-plum-deep" : "bg-surface-3 text-foreground hover:bg-surface-2",
              )}
            >
              <Volume2 className={cn("size-3.5", playing && speed === rate && "animate-pulse")} />
              {rate === 1 ? "Normal" : rate === 0.8 ? "Slower" : "Slow"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border",
              loop ? "bg-brass text-plum-deep" : "bg-surface-3 text-foreground hover:bg-surface-2",
            )}
          >
            <Repeat className="size-3.5" />
            Loop
          </button>
          {playing && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border"
            >
              <Square className="size-3.5" />
              Stop
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Model audio is Lingora&apos;s American English AI voice, not a human recording.
        </p>
      </div>

      <div className="mt-5">
        <MicRecorder
          onSubmit={submit}
          busy={busy}
          disabled={!user}
          hint="Say the line above once, clearly."
          disabledReason={
            <Link to="/auth" className="text-brass-soft hover:text-brass">
              Create a free account to record and get feedback.
            </Link>
          }
        />
      </div>

      {myAudio && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">🎤 Your recording</p>
          <audio controls src={myAudio} className="mt-2 w-full" />
        </div>
      )}

      {busy && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Listening to your recording…
        </p>
      )}

      {result && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-end gap-8">
            <ScoreStat label="Words said clearly" value={result.wordAccuracy} suffix="%" />
            {metrics && <ScoreStat label="Speaking speed (wpm)" value={metrics.wpm} suffix="" />}
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">Lingora heard</h4>
            <p className="mt-1.5 text-sm text-mist">{result.readBack || "—"}</p>
          </div>

          {result.matched.length > 0 && (
            <FeedbackRow tag="Clear" tone="brass">
              {result.matched.join(", ")}
            </FeedbackRow>
          )}
          {result.missed.length > 0 && (
            <FeedbackRow tag="Needs improvement" tone="plum">
              {result.missed.join(", ")}
            </FeedbackRow>
          )}

          <p className="mt-3 text-sm leading-relaxed text-foreground">{result.feedback}</p>

          {metrics && (
            <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-mist ring-1 ring-border">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                <Gauge className="size-3.5" /> Measured delivery
              </p>
              <ul className="mt-2 space-y-1">
                <li>
                  Pace: <span className="text-foreground">{metrics.wpm} words per minute</span> ({metrics.pace}). Natural
                  conversation is about 120–160.
                </li>
                <li>
                  Fillers:{" "}
                  <span className="text-foreground">
                    {metrics.fillerCount === 0
                      ? "none detected"
                      : metrics.fillers.map((f) => `${f.word} ×${f.count}`).join(", ")}
                  </span>
                </li>
                <li>
                  Repeated words:{" "}
                  <span className="text-foreground">
                    {metrics.repeatedWords.length ? metrics.repeatedWords.join(", ") : "none detected"}
                  </span>
                </li>
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Pace, fillers and repetition are counted from your real transcript and recording length. Pitch, loudness
                and silent-pause length are not measured, so we do not score intonation or pauses automatically.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {mastered ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep">
                <CheckCircle2 className="size-3.5" /> Mastered — two clear attempts
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Attempt {attempts} — two clear read-backs in a row marks this line as mastered.
              </span>
            )}
            <Link
              to="/shadowing"
              className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
            >
              Practise this in real speech → Shadowing
            </Link>
            <Link
              to="/ai-speaking"
              className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
            >
              Use it with the Speaking Coach
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
