import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Search, Send, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { MicRecorder } from "@/components/lily/mic-recorder";
import { VoiceButton } from "@/components/lily/voice-button";
import { PanelCard } from "@/components/lily/score-panel";
import { SpeakingFeedback, type AttemptScores } from "@/components/lily/speaking-feedback";
import { usePaywall } from "@/hooks/use-paywall";
import type { Recording } from "@/hooks/use-recorder";
import { useSpeak } from "@/hooks/use-speak";
import { useAuth } from "@/lib/auth";
import { saveSpeakingAttempt } from "@/lib/attempts.functions";
import {
  coachReply,
  getCoachSession,
  getCoachTopicCatalogue,
  getCoachUsage,
  saveCoachTurnAnalysis,
  startCoachSession,
  type CoachCategory,
  type CoachTopicPublic,
  type CoachUsage,
} from "@/lib/coach.functions";
import { DEMO_SPEAKING } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";
import { analyseSpeaking, transcribeAudio, type SpeakingAnalysis } from "@/lib/lily.functions";
import { hreflangLinks } from "@/lib/seo";
import { cn } from "@/lib/utils";

const TITLE = "AI Speaking Coach — Lingora English";
const DESCRIPTION =
  "Speak English with your AI coach across hundreds of topics: free conversation, daily situations, role-play, interviews and speaking challenges. The coach speaks first and corrects you as you go.";

export const Route = createFileRoute("/ai-speaking")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: hreflangLinks("/ai-speaking"),
  }),
  component: CoachPage,
});

const CATEGORY_IDS: CoachCategory[] = ["free", "daily", "roleplay", "interview", "challenge"];

/** Points at whichever coach session the learner last had open, so reloading
 * the page (or coming back later) restores the conversation instead of
 * losing it — the transcript itself always lives server-side in coach_turns. */
const ACTIVE_SESSION_KEY = "lily.coach.activeSessionId";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;

type Turn = {
  role: "coach" | "you";
  text: string;
  analysis?: SpeakingAnalysis;
  previous?: AttemptScores | null;
};

const toAttemptScores = (a: SpeakingAnalysis): AttemptScores => ({
  fluency: a.fluency,
  grammar: a.grammar,
  vocabulary: a.vocabulary,
  overall: a.overall,
});

function CoachPage() {
  const { t, locale, englishOnly } = useI18n();
  const CATEGORIES: { id: CoachCategory; label: string; blurb: string }[] = CATEGORY_IDS.map((id) => ({
    id,
    label: t(`coach.category.${id}.label` as never),
    blurb: t(`coach.category.${id}.blurb` as never),
  }));
  const lang = englishOnly ? "en" : locale;
  const { user, profile } = useAuth();
  const transcribe = useServerFn(transcribeAudio);
  const analyse = useServerFn(analyseSpeaking);
  const startSession = useServerFn(startCoachSession);
  const restoreSession = useServerFn(getCoachSession);
  const sendTurn = useServerFn(coachReply);
  const saveTurnAnalysis = useServerFn(saveCoachTurnAnalysis);
  const fetchUsage = useServerFn(getCoachUsage);
  const fetchTopics = useServerFn(getCoachTopicCatalogue);
  const saveAttempt = useServerFn(saveSpeakingAttempt);
  const { play, stop: stopVoice, pause, resume, speaking, paused, loading: voiceLoading, isSpeaking } = useSpeak();
  const { paywall, handleError, clearPaywall } = usePaywall("conversation");

  const [category, setCategory] = useState<CoachCategory>("free");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [topic, setTopic] = useState<CoachTopicPublic | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [usage, setUsage] = useState<CoachUsage | null>(null);
  const [prep, setPrep] = useState<number | null>(null);
  const [lastScores, setLastScores] = useState<AttemptScores | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topics = useQuery({
    queryKey: ["coach-topics"],
    queryFn: (): Promise<CoachTopicPublic[]> => fetchTopics({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!user) return;
    void fetchUsage({ data: undefined as never })
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [fetchUsage, user]);

  // Restore whichever conversation was last open, so a reload never loses it.
  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!saved) return;
    let cancelled = false;
    void restoreSession({ data: { sessionId: saved } })
      .then((res) => {
        if (cancelled) return;
        setTopic(res.topic);
        setCategory(res.topic.category as CoachCategory);
        setSessionId(res.sessionId);

        // Re-attach each turn's stored scorecard (if any) and carry the
        // running "previous score" forward across turns, exactly like a
        // live conversation does — so the feedback panel and the
        // score-improved-by-N-points comparison both survive a reload.
        let previous: AttemptScores | null = null;
        const restored: Turn[] = res.turns.map((tn) => {
          if (tn.role === "coach" || !tn.analysis) return { role: tn.role, text: tn.text };
          const turn: Turn = { role: "you", text: tn.text, analysis: tn.analysis, previous };
          previous = toAttemptScores(tn.analysis);
          return turn;
        });
        setTurns(restored);
        setLastScores(previous);
      })
      .catch(() => localStorage.removeItem(ACTIVE_SESSION_KEY));
    return () => {
      cancelled = true;
    };
  }, [restoreSession, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (topics.data ?? []).filter(
      (t) =>
        t.category === category &&
        (level === "all" || t.level === level) &&
        (!q ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.situation.toLowerCase().includes(q) ||
          t.objective.toLowerCase().includes(q)),
    );
  }, [category, level, search, topics.data]);

  const turnsLeftLabel = () => {
    if (!usage) return null;
    if (usage.unlimited) return t("coach.usage.unlimited");
    if (usage.tier === "free")
      return t("coach.usage.freeLeft", {
        left: Math.max(0, usage.freeTurnLimit - usage.freeTurnsUsed),
        limit: usage.freeTurnLimit,
      });
    return t("coach.usage.turnsLeftMonth", { count: usage.turnsLeft ?? 0 });
  };

  const outOfTurns = Boolean(usage && !usage.unlimited && (usage.turnsLeft ?? 0) <= 0);

  const resetConversation = () => {
    setSessionId(null);
    setTurns([]);
    setDraft("");
    setLastScores(null);
    if (timerRef.current) clearInterval(timerRef.current);
    setPrep(null);
  };

  const startPrep = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPrep(seconds);
    timerRef.current = setInterval(() => {
      setPrep((prev) => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sayCoach = async (text: string) => {
    try {
      await play(text);
    } catch {
      toast.error(t("coach.audioPlayError"));
    }
  };

  /** The coach always opens the conversation. */
  const begin = async (chosen: CoachTopicPublic) => {
    if (!user) return;
    clearPaywall();
    setTopic(chosen);
    resetConversation();
    setStarting(true);
    try {
      const res = await startSession({
        data: { topicId: chosen.id, level: (profile?.english_level as never) ?? undefined },
      });
      setSessionId(res.sessionId);
      localStorage.setItem(ACTIVE_SESSION_KEY, res.sessionId);
      setUsage(res.usage);
      setTurns([{ role: "coach", text: res.reply }]);
      if (chosen.time_limit_seconds > 0) startPrep(Math.min(60, chosen.time_limit_seconds));
      await sayCoach(res.reply);
    } catch (error) {
      handleError(error);
    } finally {
      setStarting(false);
    }
  };

  const currentQuestion = () => {
    const lastCoach = [...turns].reverse().find((tn) => tn.role === "coach");
    return lastCoach?.text ?? topic?.title ?? t("coach.speakingPracticeFallback");
  };

  /** Core loop: speak → transcribe → analyse → coach replies → save. */
  const handleAnswer = async (text: string) => {
    if (!user || !sessionId || !text.trim()) return;
    clearPaywall();
    setBusy(true);
    const question = currentQuestion();
    try {
      // The coach reply and the grammar/vocab analysis are independent calls
      // (analysis only needs the question + transcript, not the reply) — run
      // them together instead of back-to-back so each turn isn't paying for
      // two sequential AI round trips.
      const [res, analysis] = await Promise.all([
        sendTurn({ data: { sessionId, transcript: text } }),
        analyse({
          data: { question, transcript: text, lang, level: profile?.english_level ?? "B1" },
        }).catch(() => null),
      ]);
      setUsage(res.usage);

      setTurns((prev) => [
        ...prev,
        ...(analysis ? [{ role: "you" as const, text, analysis, previous: lastScores }] : [{ role: "you" as const, text, previous: lastScores }]),
        { role: "coach", text: res.reply },
      ]);

      if (analysis) {
        setLastScores(toAttemptScores(analysis));
        // Best-effort: this only feeds restoring the feedback panel on a
        // future reload (getCoachSession) — a failure here must never turn
        // into an error toast for a turn that already succeeded.
        void saveTurnAnalysis({ data: { sessionId, turnNumber: res.turnNumber, analysis } }).catch(() => undefined);
        await saveAttempt({
          data: {
            questionText: question.slice(0, 500),
            transcript: text,
            fluency: analysis.fluency,
            grammar: analysis.grammar,
            vocabulary: analysis.vocabulary,
            overall: analysis.overall,
            mistakes: analysis.mistakes,
            corrections: analysis.corrections,
            betterVocabulary: analysis.better_vocabulary,
            naturalAnswer: analysis.natural_answer,
            feedback: analysis.feedback,
          },
        });
      }

      await sayCoach(res.reply);
    } catch (error) {
      handleError(error);
      void fetchUsage({ data: undefined as never })
        .then(setUsage)
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const submitRecording = async (recording: Recording) => {
    if (!user || !sessionId) return;
    setBusy(true);
    try {
      const { transcript } = await transcribe({
        data: { audioBase64: recording.base64, mimeType: recording.mimeType },
      });
      if (!transcript.trim()) {
        toast.error(t("coach.couldNotHear"));
        return;
      }
      await handleAnswer(transcript);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const demoAnalysis: SpeakingAnalysis = DEMO_SPEAKING as unknown as SpeakingAnalysis;

  return (
    <AppShell>
      <SectionHeading
        eyebrow={t("coach.eyebrow")}
        title={t("coach.title")}
        description={t("coach.description")}
      />
      {paywall}

      {/* Category picker */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setCategory(c.id);
              setTopic(null);
              resetConversation();
            }}
            className={cn(
              "rounded-2xl p-4 text-left ring-1 transition-transform hover:-translate-y-0.5",
              category === c.id ? "bg-brass/15 ring-brass/40" : "bg-surface-2 ring-border hover:bg-surface-3",
            )}
          >
            <p className={cn("text-sm font-semibold", category === c.id ? "text-brass-soft" : "text-foreground")}>
              {c.label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.blurb}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("coach.topicsCount", { count: (topics.data ?? []).filter((tp) => tp.category === c.id).length })}
            </p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("coach.searchPlaceholder")}
            className="w-full rounded-full bg-surface-2 py-2.5 pl-10 pr-4 text-sm text-foreground ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-brass/40"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {["all", ...LEVELS].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-semibold ring-1 ring-border",
                level === l ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {l === "all" ? t("coach.levels.all") : l}
            </button>
          ))}
        </div>
      </div>

      {usage && (
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{turnsLeftLabel()}</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Topic library */}
        <aside className="lounge-panel h-fit max-h-[70vh] overflow-y-auto p-4">
          <h2 className="px-1 font-display text-base text-foreground">
            {CATEGORIES.find((c) => c.id === category)?.label}
          </h2>
          {topics.isLoading && <p className="mt-3 px-1 text-sm text-muted-foreground">{t("coach.loadingTopics")}</p>}
          <ul className="mt-3 space-y-1.5">
            {visible.map((tp) => (
              <li key={tp.id}>
                <button
                  type="button"
                  onClick={() => void begin(tp)}
                  disabled={!user || starting}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left ring-1 ring-border transition-colors disabled:opacity-60",
                    topic?.id === tp.id ? "bg-brass/15" : "bg-surface-2 hover:bg-surface-3",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm", topic?.id === tp.id ? "text-brass-soft" : "text-foreground")}>
                      {tp.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {tp.level}
                      </span>
                    </span>
                  </span>
                  {tp.description && <span className="mt-1 block text-xs text-muted-foreground">{tp.description}</span>}
                </button>
              </li>
            ))}
            {!topics.isLoading && visible.length === 0 && (
              <li className="px-1 py-4 text-sm text-muted-foreground">{t("coach.noTopicsMatch")}</li>
            )}
          </ul>
        </aside>

        {/* Conversation */}
        <PanelCard title={topic?.title ?? t("coach.chooseTopicTitle")} demo={!user}>
          {!user ? (
            <div className="rounded-2xl bg-surface-2 p-5 ring-1 ring-border">
              <p className="font-display text-xl text-foreground">{t("coach.signIn.title")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("coach.signIn.description")}
              </p>
              <Link
                to="/auth"
                search={{ mode: "signup" } as never}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brass px-5 py-3 text-sm font-semibold text-plum-deep shadow-brass"
              >
                <Mic className="size-4" />
                {t("coach.signIn.cta")}
              </Link>
            </div>
          ) : turns.length === 0 ? (
            <div className="rounded-2xl bg-surface-2 p-5 ring-1 ring-border">
              <p className="font-display text-xl text-foreground">
                {starting ? t("coach.gettingReady") : t("coach.pickTopicPrompt")}
              </p>
              {topic && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {topic.ai_role
                    ? t("coach.rolePlayRoles", { aiRole: topic.ai_role, userRole: topic.user_role || t("coach.roleYourself") })
                    : topic.objective || topic.description}
                </p>
              )}
              {starting && <Loader2 className="mt-4 size-5 animate-spin text-brass-soft" />}
            </div>
          ) : (
            <div className="space-y-5">
              {topic && (topic.situation || topic.challenge_prompt) && (
                <div className="rounded-2xl bg-surface-2 p-4 text-sm text-mist ring-1 ring-border">
                  {topic.challenge_prompt || topic.situation}
                </div>
              )}
              {turns.map((tn, i) => (
                <div key={i} className={cn(tn.role === "coach" ? "" : "rounded-2xl bg-surface-2 p-4 ring-1 ring-border")}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {tn.role === "coach" ? t("coach.speaker.coach") : t("coach.speaker.you")}
                    </p>
                    {tn.role === "coach" && (
                      <VoiceButton
                        text={tn.text}
                        play={play}
                        stop={stopVoice}
                        pause={pause}
                        resume={resume}
                        speaking={speaking}
                        paused={paused}
                        loading={voiceLoading}
                        controls
                      />
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 leading-relaxed",
                      tn.role === "coach" ? "font-display text-lg text-foreground" : "text-sm text-mist",
                    )}
                  >
                    {tn.text}
                  </p>

                  {tn.analysis && (
                    <div className="mt-5 border-t border-border pt-5">
                      <SpeakingFeedback
                        analysis={tn.analysis}
                        transcript={tn.text}
                        previous={tn.previous ?? null}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          {user && sessionId && turns.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              {outOfTurns ? (
                <p className="text-sm text-muted-foreground">
                  {t("coach.outOfTurns")}{" "}
                  <Link to="/pricing" className="font-semibold text-brass-soft hover:text-brass">
                    {t("coach.upgradeToKeepGoing")}
                  </Link>{" "}
                  {t("coach.upgradeSuffix")}
                </p>
              ) : (
                <>
                  {topic && topic.time_limit_seconds > 0 && (
                    <div className="mb-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startPrep(Math.min(60, topic.time_limit_seconds))}
                        className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                      >
                        <Timer className="size-4" />
                        {t("coach.timerLabel", { seconds: topic.time_limit_seconds })}
                      </button>
                      {prep !== null && (
                        <span className="font-display text-lg text-brass-soft">
                          0:{String(prep).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  )}

                  <MicRecorder
                    onSubmit={submitRecording}
                    busy={busy}
                    busyLabel={t("coach.busyLabel")}
                    autoSend
                    aiSpeaking={isSpeaking}
                    hint={t("coach.answerHint")}
                  />

                  <div className="mt-6 flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={t("coach.typeAnswerPlaceholder")}
                      className="flex-1 rounded-full bg-surface-2 px-4 py-3 text-sm text-foreground ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-brass/40"
                    />
                    <button
                      type="button"
                      disabled={busy || !draft.trim()}
                      onClick={() => {
                        const text = draft;
                        setDraft("");
                        void handleAnswer(text);
                      }}
                      className="grid size-12 place-items-center rounded-full bg-brass text-plum-deep disabled:opacity-40"
                      aria-label={t("coach.sendAnswer")}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </button>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => topic && void begin(topic)}
                className="mt-4 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {t("coach.startTopicAgain")}
              </button>
            </div>
          )}

          {!user && (
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="font-display text-lg text-foreground">{t("coach.exampleFeedback")}</h3>
              <div className="mt-4">
                <SpeakingFeedback analysis={demoAnalysis} transcript={DEMO_SPEAKING.transcript} demo />
              </div>
            </div>
          )}
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="lounge-panel p-5">
          <h2 className="font-display text-base text-foreground">{t("coach.correctionLoop.title")}</h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              t("coach.correctionLoop.step1"),
              t("coach.correctionLoop.step2"),
              t("coach.correctionLoop.step3"),
              t("coach.correctionLoop.step4"),
              t("coach.correctionLoop.step5"),
              t("coach.correctionLoop.step6"),
            ].map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brass/15 text-xs font-semibold text-brass-soft">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="lounge-panel p-5">
          <h2 className="font-display text-base text-foreground">{t("coach.keepImproving.title")}</h2>
          <div className="mt-3 grid gap-2">
            <Link to="/shadowing" className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border hover:bg-surface-3">
              {t("nav.shadowing")}
            </Link>
            <Link to="/pronunciation" className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border hover:bg-surface-3">
              {t("nav.pronunciation")}
            </Link>
            <Link to="/listening-lab" className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border hover:bg-surface-3">
              {t("nav.listeningLab")}
            </Link>
            <Link to="/progress" className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border hover:bg-surface-3">
              {t("nav.progress")}
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
