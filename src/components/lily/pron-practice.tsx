import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Gauge, Loader2, Repeat, Save, Sparkles, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MicRecorder } from "@/components/lily/mic-recorder";
import { FeedbackRow, ScoreStat } from "@/components/lily/score-panel";
import type { Recording } from "@/hooks/use-recorder";
import { usePaywall } from "@/hooks/use-paywall";
import { useAuth } from "@/lib/auth";
import { savePronunciationAttempt } from "@/lib/attempts.functions";
import { useI18n } from "@/lib/i18n";
import { buildSoundScript } from "@/lib/ipa-tts-map";
import { analysePronunciation, speak, transcribeAudio, type PronunciationResult } from "@/lib/lily.functions";
import { measureDelivery, PRACTICE_STEPS, type DeliveryMetrics, type SkillId } from "@/lib/pronunciation-content";
import { adminGenerateSoundTake, adminSaveSoundAudio } from "@/lib/pronunciation-admin.functions";
import { updatePronunciationSoundScore } from "@/lib/pronunciation.functions";
import { voicePlayer } from "@/lib/voice-player";
import { getWordIpa } from "@/lib/word-ipa";
import { cn } from "@/lib/utils";

const SPEEDS = [0.6, 0.8, 1];

export type PronPracticeProps = {
  /** The exact line the learner should say. */
  target: string;
  /** IPA symbol when the drill focuses on one sound. When set, Listen speaks
   * the isolated sound (twice) before the target instead of just the target. */
  targetSound?: string | undefined;
  /** Sounds mode only: set when target is one of the sound's own example
   * words — Listen then adds this word's own example sentence after it, so
   * the model is "sound, word, then a sentence that actually contains it". */
  wordSentence?: string | undefined;
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
  wordSentence,
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
  const { user, isAdmin } = useAuth();
  const requestSpeech = useServerFn(speak);
  const transcribe = useServerFn(transcribeAudio);
  const analyse = useServerFn(analysePronunciation);
  const saveAttempt = useServerFn(savePronunciationAttempt);
  const updateSoundScore = useServerFn(updatePronunciationSoundScore);
  const generateSoundTake = useServerFn(adminGenerateSoundTake);
  const saveSoundAudio = useServerFn(adminSaveSoundAudio);
  const { paywall, handleError, clearPaywall } = usePaywall("pronunciation");

  const wordIpa = getWordIpa(target);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** True while the TTS request is in-flight but audio has not started yet.
   * Keeps the button in a responsive "loading" state so users know the click
   * was registered even before the first byte of audio arrives. */
  const [loadingAudio, setLoadingAudio] = useState(false);
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
  /** Admin-only: true while "Generate new take" / "Save this take" is
   * in flight (see generateTake / saveAudio below). */
  const [generatingTake, setGeneratingTake] = useState(false);
  const [savingAudio, setSavingAudio] = useState(false);
  const cache = useRef(new Map<string, string>());

  // Sounds mode: read the isolated IPA sound (twice) using a TTS-friendly
  // description so the voice produces the actual phoneme instead of
  // spelling out the character name. Then read the example word once, then
  // the example sentence once. Format: [sound] [sound] [word] [sentence]
  // Shared by play() (student path, cache-checked) and saveAudio() (admin
  // path, force-regenerated) so both always agree on exactly the same text
  // — anything that decided the two independently could drift and leave the
  // admin approving audio students would never actually be served.
  const speakText = useMemo(
    () => (targetSound ? buildSoundScript(targetSound, target, wordSentence) : target),
    [target, targetSound, wordSentence],
  );

  const play = useCallback(
    async (rate: number) => {
      if (!user) {
        toast.error("Sign in to hear the model audio.");
        return;
      }
      try {
        setHasPlayed(true);
        setSpeed(rate);
        voicePlayer.prime();
        let src = cache.current.get(speakText);
        if (!src) {
          // Show "loading" immediately while the TTS API is in-flight so the
          // UI reacts on click rather than feeling frozen for several seconds.
          setLoadingAudio(true);
          let lastErr: unknown;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const res = await requestSpeech({ data: { text: speakText, voice: "shimmer" } });
              src = `data:${res.mime};base64,${res.audioBase64}`;
              cache.current.set(speakText, src);
              break;
            } catch (err) {
              lastErr = err;
              if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
            }
          }
          setLoadingAudio(false);
          if (!src) throw lastErr;
        }
        setPlaying(true);
        await voicePlayer.playRaw(src, { rate, loop, label: target });
        setPlaying(false);
      } catch (error) {
        setLoadingAudio(false);
        setPlaying(false);
        handleError(error, "Could not play the audio.");
      }
    },
    [handleError, loop, requestSpeech, speakText, target, user],
  );

  const stop = () => {
    voicePlayer.stop();
    setLoadingAudio(false);
    setPlaying(false);
  };

  // Admin-only: a freshly generated but not-yet-saved candidate take, so the
  // admin can compare it against whatever the ordinary Listen button plays
  // (the current cache, or a first generation of it) before committing.
  // Cleared whenever the sound/word/sentence changes so a candidate for one
  // sound never gets mistaken for — or accidentally saved onto — another.
  const [candidate, setCandidate] = useState<{ audioBase64: string; mime: string; src: string } | null>(null);
  useEffect(() => {
    setCandidate(null);
  }, [speakText]);

  /** Admin-only: generate a fresh candidate take WITHOUT saving it, and play
   * it so the admin can judge it by ear. The ordinary Listen button above is
   * untouched by this — clicking it still plays whatever is currently
   * cached (or generates+caches once, same as for any user), so the admin
   * can A/B "current cache" vs. "this candidate" before deciding. */
  const generateTake = useCallback(async () => {
    if (!targetSound) return;
    setGeneratingTake(true);
    try {
      voicePlayer.prime();
      const res = await generateSoundTake({
        data: { ipaSymbol: targetSound, exampleWord: target, exampleSentence: wordSentence || undefined },
      });
      const src = `data:${res.mime};base64,${res.audioBase64}`;
      setCandidate({ audioBase64: res.audioBase64, mime: res.mime, src });
      setPlaying(true);
      await voicePlayer.playRaw(src, { rate: speed, loop: false, label: target });
      setPlaying(false);
    } catch (error) {
      setPlaying(false);
      handleError(error, "Could not generate a new take.");
    } finally {
      setGeneratingTake(false);
    }
  }, [generateSoundTake, handleError, speed, target, targetSound, wordSentence]);

  /** Admin-only: replay the candidate again without generating another one
   * (each generate call spends real TTS quota; replay is free/local). */
  const replayCandidate = useCallback(async () => {
    if (!candidate) return;
    setPlaying(true);
    await voicePlayer.playRaw(candidate.src, { rate: speed, loop: false, label: target });
    setPlaying(false);
  }, [candidate, speed, target]);

  /** Admin-only: commit the exact candidate the admin just listened to and
   * approved into ttsCache (overwriting any previous take there). Regular
   * users never see any of this UI and never call any of these functions —
   * their Listen button keeps calling plain speak() exactly as before. */
  const saveAudio = useCallback(async () => {
    if (!targetSound || !candidate) return;
    setSavingAudio(true);
    try {
      await saveSoundAudio({
        data: {
          ipaSymbol: targetSound,
          exampleWord: target,
          exampleSentence: wordSentence || undefined,
          audioBase64: candidate.audioBase64,
          mimeType: candidate.mime,
        },
      });
      // Keep this component's own local blob-URL cache in sync, so if the
      // admin clicks the ordinary Listen button right after, they hear the
      // take that was just saved instead of a stale one from earlier.
      cache.current.set(speakText, candidate.src);
      toast.success("Saved — students will now hear this take.");
      setCandidate(null);
    } catch (error) {
      handleError(error, "Could not save the audio.");
    } finally {
      setSavingAudio(false);
    }
  }, [candidate, handleError, saveSoundAudio, speakText, target, targetSound, wordSentence]);

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
        <div className="flex flex-wrap items-baseline gap-2.5">
          <p className="font-display text-xl leading-snug text-foreground">{target}</p>
          {wordIpa && (
            <span className="font-mono text-base font-semibold text-brass-soft">
              /{wordIpa}/
            </span>
          )}
        </div>
        {pattern && <p className="mt-1.5 text-sm font-semibold tracking-wide text-brass-soft">{pattern}</p>}
        {targetSound && <p className="mt-1 text-sm text-plum-soft">Focus sound {targetSound}</p>}
        {wordSentence && <p className="mt-2 text-sm text-mist">e.g. {wordSentence}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => void play(rate)}
              disabled={loadingAudio || playing}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border transition-colors",
                speed === rate && (loadingAudio || playing)
                  ? "bg-brass text-plum-deep"
                  : "bg-surface-3 text-foreground hover:bg-surface-2",
                (loadingAudio || playing) && "cursor-not-allowed opacity-80",
              )}
            >
              {loadingAudio && speed === rate ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Volume2 className={cn("size-3.5", playing && speed === rate && "animate-pulse")} />
              )}
              {loadingAudio && speed === rate
                ? "Loading…"
                : rate === 1
                  ? "Normal"
                  : rate === 0.8
                    ? "Slower"
                    : "Slow"}
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
          {/* Admin-only 3-step tool: nút Listen phía trên = "cache cũ" (đang
              lưu trong DB). Nút này gọi API tạo bản mới, chưa lưu DB — chỉ
              giữ tạm ở state của trình duyệt (candidate bên dưới). Nhãn cố
              tình để tiếng Việt, không qua i18n — chỉ admin (1 người) thấy. */}
          {isAdmin && targetSound && (
            <button
              type="button"
              onClick={() => void generateTake()}
              disabled={generatingTake || loadingAudio || playing}
              title="Chỉ admin thấy: gọi API tạo 1 bản đọc mới, chưa lưu vào DB — so sánh với nút Listen ở trên (đang là bản lưu trong DB)."
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-plum-deep px-3 py-1.5 text-xs font-semibold text-brass-soft ring-1 ring-brass/60 transition-colors hover:bg-plum-deep/80",
                (generatingTake || loadingAudio || playing) && "cursor-not-allowed opacity-80",
              )}
            >
              {generatingTake ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generatingTake ? "Đang tạo…" : "Tạo bản mới"}
            </button>
          )}
          {isAdmin && targetSound && candidate && (
            <>
              {/* Không tốn thêm lượt gọi API — chỉ phát lại bản mới đang giữ
                  tạm ở trình duyệt (candidate), phòng khi bấm "Tạo bản mới"
                  xong rồi mà muốn nghe lại trước khi Lưu. */}
              <button
                type="button"
                onClick={() => void replayCandidate()}
                disabled={playing}
                title="Chỉ admin thấy: nghe lại bản mới vừa tạo (không tốn thêm lượt gọi API)."
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2",
                  playing && "cursor-not-allowed opacity-80",
                )}
              >
                <Volume2 className="size-3.5" />
                Nghe lại bản mới
              </button>
              <button
                type="button"
                onClick={() => void saveAudio()}
                disabled={savingAudio}
                title="Chỉ admin thấy: lưu đúng bản mới đang giữ tạm này vào cache DB cho mọi học viên."
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep ring-1 ring-border transition-colors hover:bg-brass/90",
                  savingAudio && "cursor-not-allowed opacity-80",
                )}
              >
                {savingAudio ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {savingAudio ? "Đang lưu…" : "Lưu bản này"}
              </button>
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Model audio is Lingora&apos;s American English AI voice, not a human recording.
          {targetSound &&
            (wordSentence
              ? " Listen plays the sound twice, then the example word, then a sentence containing it."
              : " Listen plays the sound twice, then the example.")}
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
