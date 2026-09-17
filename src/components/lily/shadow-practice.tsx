import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2, Repeat, Square, Volume2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { MicRecorder } from "@/components/lily/mic-recorder";
import { FeedbackRow, ScoreStat } from "@/components/lily/score-panel";
import { usePaywall } from "@/hooks/use-paywall";
import type { Recording } from "@/hooks/use-recorder";
import { useAuth } from "@/lib/auth";
import { savePronunciationAttempt } from "@/lib/attempts.functions";
import { useI18n } from "@/lib/i18n";
import { analysePronunciation, speak, transcribeAudio, type PronunciationResult } from "@/lib/lily.functions";
import { measureDelivery, type DeliveryMetrics } from "@/lib/pronunciation-content";
import { saveShadowingProgress } from "@/lib/shadowing.functions";
import {
  SHADOW_PRACTICE_STEPS,
  SHADOW_STATUS_META,
  SKILL_TO_PRON_LESSON,
  nextStatus,
  type ShadowProgressRow,
  type ShadowSentence,
} from "@/lib/shadowing-content";
import { cn } from "@/lib/utils";
import { voicePlayer } from "@/lib/voice-player";

const SPEEDS = [0.75, 1, 1.25];

export type ShadowPracticeProps = {
  sentence: ShadowSentence;
  progress?: ShadowProgressRow | undefined;
  onSaved?: ((row: ShadowProgressRow) => void) | undefined;
  onNext?: (() => void) | undefined;
  position?: string | undefined;
  /** All turns of this sentence's dialogue in order, when it's part of one —
   * lets the card show who's speaking and what was just said before it. */
  dialogueTurns?: ShadowSentence[] | null | undefined;
};

/**
 * One shadowing sentence: Listen → Shadow → Record → AI feedback → Try again
 * → Mastered. Model audio is the platform's own cached AI voice; every score
 * comes from the real speech-to-text read-back, never invented.
 */
export function ShadowPractice({ sentence, progress, onSaved, onNext, position, dialogueTurns }: ShadowPracticeProps) {
  const { t, locale, englishOnly } = useI18n();
  const lang = englishOnly ? "en" : locale;
  const { user } = useAuth();
  const requestSpeech = useServerFn(speak);
  const transcribe = useServerFn(transcribeAudio);
  const analyse = useServerFn(analysePronunciation);
  const saveProgress = useServerFn(saveShadowingProgress);
  const saveAttempt = useServerFn(savePronunciationAttempt);
  const { paywall, handleError, clearPaywall } = usePaywall("pronunciation");

  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(true);
  const [showNatural, setShowNatural] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [myAudio, setMyAudio] = useState<string | null>(null);
  const cache = useRef(new Map<string, string>());

  const target = sentence.sentence;
  const status = progress?.status ?? "new";
  const accentLabel =
    sentence.accent === "british" ? t("shadow.practice.accent.british") : t("shadow.practice.accent.american");
  const voice = sentence.speaker_voice || "shimmer";
  const previousTurn = dialogueTurns?.filter((turn) => turn.turn_number < sentence.turn_number).at(-1) ?? null;

  const play = useCallback(
    async (rate: number) => {
      if (!user) {
        toast.error(t("shadow.practice.signInToHear"));
        return;
      }
      try {
        setPlaying(true);
        setSpeed(rate);
        let src = cache.current.get(target);
        if (!src) {
          const res = await requestSpeech({ data: { text: target, voice } });
          src = `data:${res.mime};base64,${res.audioBase64}`;
          cache.current.set(target, src);
        }
        await voicePlayer.playRaw(src, { rate, loop, label: target });
        setPlaying(false);
      } catch (error) {
        setPlaying(false);
        handleError(error, t("shadow.practice.playError"));
      }
    },
    [handleError, loop, requestSpeech, target, user, voice],
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
          sentenceId: sentence.id,
          target,
          transcript,
          lang,
          audioBase64: recording.base64,
          mimeType: recording.mimeType,
        },
      });
      setResult(analysis);
      setMetrics(measureDelivery(transcript, recording.seconds));
      setAttempts((a) => a + 1);

      const accuracy = analysis.wordAccuracy;
      const clear = accuracy !== null && accuracy >= 90 ? (progress?.clear_attempts ?? 0) + 1 : 0;
      const saved = await saveProgress({
        data: {
          sentenceId: sentence.id,
          attempts: (progress?.attempts ?? 0) + 1,
          clearAttempts: clear,
          bestAccuracy:
            accuracy === null ? (progress?.best_accuracy ?? null) : Math.max(accuracy, progress?.best_accuracy ?? 0),
          lastAccuracy: accuracy,
          status: nextStatus(accuracy, clear),
          secondsPractised: (progress?.seconds_practised ?? 0) + recording.seconds,
        },
      });
      onSaved?.(saved as ShadowProgressRow);

      await saveAttempt({
        data: {
          mode: "shadowing",
          target,
          targetSound: null,
          transcript,
          accuracy,
          feedback: analysis.feedback,
          isDemo: !analysis.acoustic,
        },
      });
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const focusRows: { label: string; value: string; skill: keyof typeof SKILL_TO_PRON_LESSON }[] = [
    { label: t("shadow.practice.focus.pronunciation"), value: sentence.pronunciation_focus, skill: "pronunciation" },
    { label: t("shadow.practice.focus.stress"), value: sentence.stress_focus, skill: "stress" },
    { label: t("shadow.practice.focus.intonation"), value: sentence.intonation_focus, skill: "intonation" },
    {
      label: t("shadow.practice.focus.connectedSpeech"),
      value: sentence.connected_speech_focus,
      skill: "connected-speech",
    },
  ];

  return (
    <section className="lounge-panel p-5 sm:p-6">
      {paywall}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg text-foreground">
            {position ?? t("shadow.sentenceFallback", { n: sentence.sort_order })}
          </h2>
          <span className={cn("text-xs font-semibold", SHADOW_STATUS_META[status].tone)}>
            {SHADOW_STATUS_META[status].icon} {t(SHADOW_STATUS_META[status].labelKey as never)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-brass-soft ring-1 ring-border">
            {accentLabel}
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
            {t("shadow.practice.difficulty", { n: sentence.difficulty })}
          </span>
        </div>
      </div>

      <ol className="mt-4 flex flex-wrap gap-1.5">
        {SHADOW_PRACTICE_STEPS.map((step) => {
          const done =
            (step.n <= 2 && playing) ||
            (step.n === 3 && attempts > 0) ||
            (step.n === 4 && !!result) ||
            (step.n === 5 && attempts > 1) ||
            (step.n === 6 && status === "mastered");
          return (
            <li
              key={step.n}
              title={t(step.hintKey as never)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-border",
                done ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground",
              )}
            >
              {step.n}. {t(step.labelKey as never)}
            </li>
          );
        })}
      </ol>

      {sentence.speaker_label && (
        <div className="mt-4 rounded-xl bg-plum/10 p-3 ring-1 ring-border">
          {previousTurn && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">
                {previousTurn.speaker_label || t("shadow.practice.dialogue.someone")}:
              </span>{" "}
              {previousTurn.unlocked ? previousTurn.sentence : t("shadow.list.premiumSentence")}
            </p>
          )}
          <p className="mt-1 text-sm font-semibold text-brass-soft">
            {t("shadow.practice.dialogue.speaking", { speaker: sentence.speaker_label })}
          </p>
        </div>
      )}

      <div className="mt-5 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
        <p
          className={cn(
            "font-display text-xl leading-snug text-foreground",
            !showText && "select-none blur-sm",
          )}
        >
          {target}
        </p>
        {sentence.natural_form && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowNatural((v) => !v)}
              className="text-xs font-semibold text-brass-soft hover:text-brass"
            >
              {showNatural ? t("shadow.practice.hideRelaxed") : t("shadow.practice.showRelaxed")}
            </button>
            {showNatural && (
              <p className="mt-1.5 text-sm text-plum-soft">
                {sentence.natural_form}
                <span className="ml-2 text-[11px] text-muted-foreground">{t("shadow.practice.relaxedHint")}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void play(speed)}
            className="inline-flex items-center gap-2 rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass"
          >
            {playing ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
            {t("shadow.practice.listen")}
          </button>
          {SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => void play(rate)}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-border",
                speed === rate ? "bg-brass text-plum-deep" : "bg-surface-3 text-foreground hover:bg-surface-2",
              )}
            >
              {rate}x
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-border",
              loop ? "bg-brass text-plum-deep" : "bg-surface-3 text-foreground hover:bg-surface-2",
            )}
          >
            <Repeat className="size-3.5" />
            {t("shadow.practice.loop")}
          </button>
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-2 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
          >
            {showText ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showText ? t("shadow.practice.hideText") : t("shadow.practice.showText")}
          </button>
          {playing && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-2 text-xs font-semibold text-foreground ring-1 ring-border"
            >
              <Square className="size-3.5" />
              {t("shadow.practice.stop")}
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("shadow.practice.modelAudioNote", { accent: accentLabel })}
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {focusRows
          .filter((r) => r.value)
          .map((r) => (
            <div key={r.label} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brass-soft">{r.label}</p>
              <p className="mt-1 text-sm text-mist">{r.value}</p>
            </div>
          ))}
      </div>

      {(sentence.vocabulary.length > 0 || sentence.grammar_focus) && (
        <div className="mt-3 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
          {sentence.vocabulary.length > 0 && (
            <ul className="space-y-1.5 text-sm text-mist">
              {sentence.vocabulary.map((v) => (
                <li key={v.word}>
                  <span className="font-semibold text-foreground">{v.word}</span> — {v.meaning}
                </li>
              ))}
            </ul>
          )}
          {sentence.grammar_focus && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("shadow.practice.grammar", { value: sentence.grammar_focus })}
            </p>
          )}
        </div>
      )}

      <div className="mt-5">
        <MicRecorder
          onSubmit={submit}
          busy={busy}
          busyLabel={t("shadow.practice.recorder.busyLabel")}
          disabled={!user}
          hint={t("shadow.practice.recorder.hint")}
          disabledReason={
            <Link to="/auth" className="text-brass-soft hover:text-brass">
              {t("shadow.practice.recorder.signInToRecord")}
            </Link>
          }
        />
      </div>

      {myAudio && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">
            {t("shadow.practice.yourRecording")}
          </p>
          <audio controls src={myAudio} className="mt-1.5 w-full" />
        </div>
      )}

      {result && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap gap-4">
            <ScoreStat label={t("shadow.practice.result.pronunciation")} value={result.wordAccuracy} suffix="%" />
            {metrics && (
              <ScoreStat
                label={t("shadow.practice.result.speakingSpeed")}
                value={metrics.wpm}
                suffix={t("shadow.practice.result.wpm")}
              />
            )}
            {metrics && (
              <ScoreStat label={t("shadow.practice.result.fillerWords")} value={metrics.fillerCount} suffix="" />
            )}
          </div>
          <div className="mt-4 space-y-2">
            <FeedbackRow tag={t("shadow.practice.result.heard")}>{result.readBack}</FeedbackRow>
            {result.missed.length > 0 && (
              <FeedbackRow tag={t("shadow.practice.result.fix")}>{result.missed.join(", ")}</FeedbackRow>
            )}
            <FeedbackRow tag={t("shadow.practice.result.coach")} tone="brass">
              {result.feedback}
            </FeedbackRow>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setMyAudio(null);
              }}
              className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
            >
              {t("shadow.practice.tryAgain")}
            </button>
            {onNext && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setMetrics(null);
                  setMyAudio(null);
                  setAttempts(0);
                  onNext();
                }}
                className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                {t("shadow.practice.nextSentence")}
              </button>
            )}
            {focusRows
              .filter((r) => r.value)
              .slice(0, 2)
              .map((r) => (
                <Link
                  key={r.skill}
                  to="/pronunciation"
                  search={{ skill: SKILL_TO_PRON_LESSON[r.skill] } as never}
                  className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                >
                  {t("shadow.practice.practiseSkill", { skill: r.label.toLowerCase() })}
                </Link>
              ))}
            <Link
              to="/ai-speaking"
              className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
            >
              {t("shadow.practice.useWithCoach")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
