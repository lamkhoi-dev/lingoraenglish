import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Search, Shuffle, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { MicRecorder } from "@/components/lily/mic-recorder";
import { VoiceButton } from "@/components/lily/voice-button";
import { PanelCard, ScoreBar, ScoreStat } from "@/components/lily/score-panel";
import { SpeakingFeedback } from "@/components/lily/speaking-feedback";
import { usePaywall } from "@/hooks/use-paywall";
import type { Recording } from "@/hooks/use-recorder";
import { useSpeak } from "@/hooks/use-speak";
import { useAuth } from "@/lib/auth";
import { saveIeltsAttempt, savePronunciationAttempt, saveSpeakingAttempt } from "@/lib/attempts.functions";
import { DEMO_IELTS } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";
import {
  analysePronunciation,
  analyseSpeaking,
  evaluateIelts,
  transcribeAudio,
  type IeltsEvaluation,
  type PronunciationResult,
  type SpeakingAnalysis,
} from "@/lib/lily.functions";
import { PremiumBadge } from "@/components/lily/paywall";
import {
  DEFAULT_FILTERS,
  DIFFICULTIES,
  buildMockTest,
  canBuildMockTest,
  durationLabelKey,
  fetchSpeakingTests,
  fetchTestProgress,
  filterTests,
  partLabelKey,
  progressSummary,
  recordTestAttempt,
  taskFormats,
  testPrompts,
  type LibraryFilters,
  type SpeakingTest,
  type TestProgress,
} from "@/lib/speaking-test-library";
import { hreflangLinks } from "@/lib/seo";
import { cn } from "@/lib/utils";

const TITLE = "IELTS, TOEFL & PTE Speaking Practice — Lingora English";
const DESCRIPTION =
  "Practise IELTS Speaking Parts 1-3, TOEFL speaking tasks and PTE speaking tasks with recording, timers and AI estimated scores, corrections and model answers.";

export const Route = createFileRoute("/speaking-tests")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    links: hreflangLinks("/speaking-tests"),
  }),
  component: SpeakingTestsPage,
});

type Exam = "ielts" | "toefl" | "pte";

function SpeakingTestsPage() {
  const { t } = useI18n();
  const [exam, setExam] = useState<Exam>("ielts");

  return (
    <AppShell>
      <SectionHeading
        eyebrow={t("tests.hero.eyebrow")}
        title={t("tests.hero.title")}
        description={t("tests.hero.description")}
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {(
          [
            { id: "ielts", label: t("tests.exam.ielts.label"), blurb: t("tests.exam.ielts.blurb") },
            { id: "toefl", label: t("tests.exam.toefl.label"), blurb: t("tests.exam.toefl.blurb") },
            { id: "pte", label: t("tests.exam.pte.label"), blurb: t("tests.exam.pte.blurb") },
          ] as { id: Exam; label: string; blurb: string }[]
        ).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setExam(e.id)}
            className={cn(
              "rounded-2xl p-4 text-left ring-1 transition-transform hover:-translate-y-0.5",
              exam === e.id ? "bg-brass/15 ring-brass/40" : "bg-surface-2 ring-border hover:bg-surface-3",
            )}
          >
            <p className={cn("text-sm font-semibold", exam === e.id ? "text-brass-soft" : "text-foreground")}>{e.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{e.blurb}</p>
          </button>
        ))}
      </div>

      <div className="mt-8">
        {exam === "ielts" ? <IeltsPractice /> : <ExamLibrary exam={exam} />}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-plum-soft">
        {t("tests.footer.disclaimer")}
        <span className="font-semibold"> {t("tests.footer.disclaimerEmphasis")}</span> {t("tests.footer.disclaimerSuffix")}
      </p>
    </AppShell>
  );
}

/* ---------------------------------- IELTS ---------------------------------- */

function IeltsPractice() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tests, setTests] = useState<SpeakingTest[]>([]);
  const [progress, setProgress] = useState<Record<string, TestProgress>>({});
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [openTest, setOpenTest] = useState<SpeakingTest | null>(null);
  const [mockQueue, setMockQueue] = useState<SpeakingTest[]>([]);
  const [mockStep, setMockStep] = useState(0);
  const [mockBands, setMockBands] = useState<number[]>([]);

  const reloadProgress = async () => {
    if (!user) {
      setProgress({});
      return;
    }
    const rows = await fetchTestProgress(user.id);
    setProgress(Object.fromEntries(rows.map((r) => [r.test_id, r])));
  };

  useEffect(() => {
    void fetchSpeakingTests()
      .then(setTests)
      .catch(() => toast.error(t("tests.runner.loadErrorIelts")));
  }, [user?.id]);

  useEffect(() => {
    void reloadProgress();
  }, [user?.id]);

  const visible = filterTests(tests, filters, progress);
  const summary = progressSummary(tests, progress);
  const inMock = mockQueue.length > 0;
  const current = inMock ? (mockQueue[mockStep] ?? null) : openTest;
  // True before the library has loaded too, so the pre-load click still
  // falls through to the "still loading" toast below instead of flashing
  // the locked state for everyone during the initial fetch.
  const mockReady = tests.length === 0 || canBuildMockTest(tests);

  const startMock = () => {
    const queue = buildMockTest(tests);
    if (queue.length < 3) {
      toast.error(t("tests.runner.mockLibraryLoading"));
      return;
    }
    setOpenTest(null);
    setMockQueue(queue);
    setMockStep(0);
    setMockBands([]);
  };

  const exitTest = () => {
    setOpenTest(null);
    setMockQueue([]);
    setMockStep(0);
    setMockBands([]);
    void reloadProgress();
  };

  if (current) {
    return (
      <TestRunner
        test={current}
        mock={
          inMock
            ? {
                step: mockStep,
                total: mockQueue.length,
                bands: mockBands,
                next: (band) => {
                  setMockBands((prev) => (band === null ? prev : [...prev, band]));
                  setMockStep((s) => s + 1);
                },
              }
            : null
        }
        onExit={exitTest}
        onSaved={reloadProgress}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("tests.stat.testsInLibrary")} value={`${summary.total}`} />
        <StatTile label={t("tests.stat.testsCompleted")} value={`${summary.completed} / ${summary.total}`} />
        <StatTile label={t("tests.stat.averageBand")} value={summary.averageBand !== null ? `${summary.averageBand}` : "—"} />
        <StatTile label={t("tests.stat.bestBand")} value={summary.bestBand !== null ? `${summary.bestBand}` : "—"} />
      </div>

      {summary.completed > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("tests.partProgress", { p1: summary.part1, p2: summary.part2, p3: summary.part3 })}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: t("tests.filter.allParts") },
            { id: "1", label: t("tests.filter.part1") },
            { id: "2", label: t("tests.filter.part2") },
            { id: "3", label: t("tests.filter.part3") },
          ] as { id: LibraryFilters["part"]; label: string }[]
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, part: option.id }))}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-border",
              filters.part === option.id
                ? "bg-brass text-plum-deep"
                : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
        {mockReady ? (
          <button
            type="button"
            onClick={startMock}
            className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
          >
            {t("tests.filter.fullMockTest")}
          </button>
        ) : (
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-muted-foreground ring-1 ring-border hover:bg-surface-3"
          >
            {t("tests.filter.fullMockTest")}
            <PremiumBadge />
          </Link>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2">
          <span className="sr-only">{t("tests.filter.searchTopics")}</span>
          <div className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 ring-1 ring-border">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder={t("tests.filter.searchIeltsPlaceholder")}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </label>
        <SelectFilter
          label={t("tests.filter.difficulty")}
          value={filters.difficulty}
          onChange={(v) => setFilters((f) => ({ ...f, difficulty: v as LibraryFilters["difficulty"] }))}
          options={[{ value: "all", label: t("tests.filter.allDifficulties") }, ...DIFFICULTIES.map((d) => ({ value: d, label: d }))]}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectFilter
            label={t("tests.filter.access")}
            value={filters.access}
            onChange={(v) => setFilters((f) => ({ ...f, access: v as LibraryFilters["access"] }))}
            options={[
              { value: "all", label: t("tests.filter.allAccess") },
              { value: "free", label: t("tests.filter.free") },
              { value: "premium", label: t("tests.filter.premium") },
            ]}
          />
          <SelectFilter
            label={t("tests.filter.status")}
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v as LibraryFilters["status"] }))}
            options={[
              { value: "all", label: t("tests.filter.allTests") },
              { value: "completed", label: t("tests.filter.completed") },
              { value: "todo", label: t("tests.filter.notCompleted") },
            ]}
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {t("tests.showingIelts", { visible: visible.length, total: tests.length })}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((test) => {
          const row = progress[test.id];
          const done = Boolean(row?.completed_at);
          return (
            <article key={test.id} className="flex flex-col rounded-2xl bg-surface-2 p-5 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {t("tests.card.ieltsNumber", { number: test.test_number })}
                  </p>
                  <h3 className="mt-1 font-display text-lg text-foreground">{test.topic}</h3>
                </div>
                {test.is_free ? (
                  <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-soft">
                    {t("tests.filter.free")}
                  </span>
                ) : (
                  <PremiumBadge />
                )}
              </div>

              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>{t(partLabelKey(test.part))} · {test.difficulty}</div>
                <div>{t("tests.card.durationLabel", { duration: t(durationLabelKey(test)) })}</div>
                <div>
                  {done
                    ? row?.best_band
                      ? t("tests.card.completedWithBand", { band: row.best_band })
                      : t("tests.card.completed")
                    : t("tests.card.notCompleted")}
                </div>
              </dl>

              <div className="mt-4 pt-1">
                {test.unlocked ? (
                  <button
                    type="button"
                    onClick={() => setOpenTest(test)}
                    className="w-full rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass"
                  >
                    {t("tests.card.startTest")}
                  </button>
                ) : (
                  <Link
                    to="/pricing"
                    className="block w-full rounded-full bg-surface-3 px-4 py-2 text-center text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
                  >
                    {t("tests.card.unlockWithPremium")}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="mt-6 rounded-2xl bg-surface-2 p-5 text-sm text-muted-foreground ring-1 ring-border">
          {t("tests.empty.noMatchPart")}
        </p>
      )}
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl text-foreground">{value}</p>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full bg-surface-2 px-4 py-2 text-sm text-foreground ring-1 ring-border outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One test: its questions, timers, recording, AI band and feedback. */
function TestRunner({
  test,
  mock,
  onExit,
  onSaved,
}: {
  test: SpeakingTest;
  mock: { step: number; total: number; bands: number[]; next: (band: number | null) => void } | null;
  onExit: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t, locale, englishOnly } = useI18n();
  const lang = englishOnly ? "en" : locale;
  const { user } = useAuth();
  const transcribe = useServerFn(transcribeAudio);
  const evaluate = useServerFn(evaluateIelts);
  const saveAttempt = useServerFn(saveIeltsAttempt);
  const { paywall, handleError, clearPaywall } = usePaywall("ielts");

  const prompts = testPrompts(test);
  const [index, setIndex] = useState(0);
  const [prep, setPrep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(IeltsEvaluation & { transcript: string }) | undefined>();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prompt = prompts[index % Math.max(1, prompts.length)] ?? test.cue_card;

  useEffect(() => {
    setIndex(0);
    setResult(undefined);
  }, [test.id]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startPrep = (seconds = test.preparation_time || 60) => {
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

  const submit = async (recording: Recording) => {
    if (!user) return;
    clearPaywall();
    setBusy(true);
    try {
      const { transcript } = await transcribe({
        data: { audioBase64: recording.base64, mimeType: recording.mimeType },
      });
      if (!transcript.trim()) {
        toast.error(t("tests.runner.couldNotHear"));
        return;
      }
      const evaluation = await evaluate({
        data: {
          testId: test.id,
          part: test.part,
          question: prompt,
          transcript,
          lang,
          audioBase64: recording.base64,
          mimeType: recording.mimeType,
        },
      });
      setResult({ ...evaluation, transcript });
      await saveAttempt({
        data: {
          part: test.part,
          questionText: prompt,
          transcript,
          fluencyCoherence: evaluation.fluency_coherence,
          lexicalResource: evaluation.lexical_resource,
          grammaticalRange: evaluation.grammatical_range,
          pronunciation: evaluation.pronunciation,
          estimatedBand: evaluation.estimated_band,
          feedback: evaluation.feedback,
          correctedAnswer: evaluation.corrected_answer,
          naturalAnswer: evaluation.natural_answer,
          band6Version: evaluation.band6_version,
          band7Version: evaluation.band7_version,
          band8Version: evaluation.band8_version,
        },
      });
      await recordTestAttempt(user.id, test.id, evaluation.estimated_band);
      await onSaved();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const shown = user && result ? result : { ...DEMO_IELTS, transcript: DEMO_IELTS.transcript };
  const mockAverage =
    mock && mock.bands.length > 0
      ? Math.round((mock.bands.reduce((a, b) => a + b, 0) / mock.bands.length) * 2) / 2
      : null;

  return (
    <>
      {paywall}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
        >
          <ArrowLeft className="size-4" />
          {mock ? t("tests.runner.leaveMock") : t("tests.runner.backToLibrary")}
        </button>
        <p className="text-xs text-muted-foreground">
          {mock
            ? `${t("tests.runner.mockStatus", { part: t(partLabelKey(test.part)), step: mock.step + 1, total: mock.total })}${
                mockAverage !== null ? t("tests.runner.mockAverageSoFar", { average: mockAverage }) : ""
              }`
            : t("tests.runner.ieltsStatus", { number: test.test_number, part: t(partLabelKey(test.part)), difficulty: test.difficulty })}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <PanelCard
          title={test.part === 2 ? t("tests.runner.cueCard") : t("tests.runner.partQuestion", { part: t(partLabelKey(test.part)) })}
          demo={!user || !result}
          actions={
            prompts.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setIndex((i) => (i + 1) % prompts.length);
                  setResult(undefined);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                <Shuffle className="size-3.5" />
                {t("tests.runner.nextQuestion")}
              </button>
            ) : null
          }
        >
          <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
            {test.topic}
            {prompts.length > 1 ? t("tests.runner.questionOf", { current: index + 1, total: prompts.length }) : ""}
          </p>
          <p className="mt-2 font-display text-xl text-foreground">{prompt}</p>

          {test.part === 2 && test.cue_points.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-xl bg-surface-2 p-4 text-sm text-mist ring-1 ring-border">
              {test.cue_points.map((cue) => (
                <li key={cue}>• {cue}</li>
              ))}
            </ul>
          )}

          {test.preparation_time > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => startPrep(test.preparation_time)}
                className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                <Timer className="size-4" />
                {test.preparation_time === 60 ? t("tests.runner.prep1Min") : t("tests.runner.prepSeconds", { seconds: test.preparation_time })}
              </button>
              {prep !== null && (
                <span className="font-display text-lg text-brass-soft">
                  {Math.floor(prep / 60)}:{String(prep % 60).padStart(2, "0")}
                </span>
              )}
            </div>
          )}

          <div className="mt-6">
            <MicRecorder
              onSubmit={submit}
              busy={busy}
              busyLabel={t("tests.runner.busyMarking")}
              disabled={!user}
              hint={test.part === 2 ? t("tests.runner.hintPart2") : t("tests.runner.hintDefault")}
              disabledReason={
                <Link to="/auth" className="text-brass-soft hover:text-brass">
                  {t("tests.runner.signInToRecord")}
                </Link>
              }
            />
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <ScoreStat label={t("tests.score.aiEstimated")} value={shown.estimated_band} suffix="/9.0" />
              <p className="text-xs text-plum-soft">{t("ielts.disclaimer")}</p>
            </div>

            <div className="mt-5 space-y-3">
              <ScoreBar label={t("tests.score.fluencyCoherence")} value={shown.fluency_coherence} max={9} />
              <ScoreBar label={t("tests.score.lexicalResource")} value={shown.lexical_resource} max={9} />
              <ScoreBar label={t("tests.score.grammaticalRange")} value={shown.grammatical_range} max={9} />
              <ScoreBar label={t("tests.score.pronunciationHint")} value={shown.pronunciation} max={9} />
            </div>

            <div className="mt-6 space-y-5">
              {[
                { label: t("tests.block.yourAnswer"), value: shown.transcript },
                { label: t("tests.block.corrected"), value: shown.corrected_answer },
                { label: t("tests.block.moreNatural"), value: shown.natural_answer },
                { label: t("tests.block.band6"), value: shown.band6_version },
                { label: t("tests.block.band7"), value: shown.band7_version },
                { label: t("tests.block.band8"), value: shown.band8_version },
                { label: t("tests.block.examinerFeedback"), value: shown.feedback },
              ].map((block) => (
                <div key={block.label}>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{block.label}</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-mist">{block.value}</p>
                </div>
              ))}
            </div>

            {result && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setResult(undefined)}
                  className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
                >
                  {t("tests.action.tryAgain")}
                </button>
                {mock && mock.step + 1 < mock.total && (
                  <button
                    type="button"
                    onClick={() => {
                      mock.next(result.estimated_band);
                      setResult(undefined);
                    }}
                    className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                  >
                    {t("tests.action.continueNextPart")}
                  </button>
                )}
                <Link
                  to="/pronunciation"
                  className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                >
                  {t("tests.action.practisePronunciation")}
                </Link>
              </div>
            )}
          </div>
        </PanelCard>

        <aside className="lounge-panel h-fit p-5">
          <h2 className="font-display text-base text-foreground">{t("tests.sidebar.howPartsWork")}</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">{t("tests.sidebar.part1Title")}</span> — {t("tests.sidebar.part1Body")}
            </li>
            <li>
              <span className="font-semibold text-foreground">{t("tests.sidebar.part2Title")}</span> — {t("tests.sidebar.part2Body")}
            </li>
            <li>
              <span className="font-semibold text-foreground">{t("tests.sidebar.part3Title")}</span> — {t("tests.sidebar.part3Body")}
            </li>
          </ul>
          <Link
            to="/shadowing"
            className="mt-5 block rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border hover:bg-surface-3"
          >
            {t("tests.sidebar.shadowBand8")}
          </Link>
        </aside>
      </div>
    </>
  );
}


/* ------------------------------ TOEFL and PTE ------------------------------ */

const READ_BACK_TASKS = new Set(["read-aloud", "repeat-sentence", "listen-repeat"]);

/** Browseable TOEFL or PTE library: same shape as the IELTS one, task-based. */
function ExamLibrary({ exam }: { exam: "toefl" | "pte" }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tests, setTests] = useState<SpeakingTest[]>([]);
  const [progress, setProgress] = useState<Record<string, TestProgress>>({});
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [openTest, setOpenTest] = useState<SpeakingTest | null>(null);

  const reloadProgress = async () => {
    if (!user) {
      setProgress({});
      return;
    }
    const rows = await fetchTestProgress(user.id);
    setProgress(Object.fromEntries(rows.map((r) => [r.test_id, r])));
  };

  useEffect(() => {
    setTests([]);
    setOpenTest(null);
    setFilters(DEFAULT_FILTERS);
    void fetchSpeakingTests(exam)
      .then(setTests)
      .catch(() => toast.error(t("tests.runner.loadErrorExam")));
  }, [exam, user?.id]);

  useEffect(() => {
    void reloadProgress();
  }, [user?.id]);

  const visible = filterTests(tests, filters, progress);
  const formats = taskFormats(tests);
  const completed = tests.filter((t) => progress[t.id]?.completed_at).length;

  if (openTest) {
    return (
      <TaskPractice
        exam={exam}
        test={openTest}
        onExit={() => {
          setOpenTest(null);
          void reloadProgress();
        }}
        onSaved={reloadProgress}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("tests.stat.testsInLibrary")} value={`${tests.length}`} />
        <StatTile label={t("tests.stat.testsCompleted")} value={`${completed} / ${tests.length}`} />
        <StatTile label={t("tests.stat.taskFormats")} value={`${formats.length}`} />
        <StatTile label={t("tests.stat.freeTests")} value={`${tests.filter((x) => x.is_free).length}`} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, task: "all" }))}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-border",
            filters.task === "all" ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
          )}
        >
          {t("tests.filter.allTasks")}
        </button>
        {formats.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, task: format.id }))}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-border",
              filters.task === format.id
                ? "bg-brass text-plum-deep"
                : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {format.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2">
          <span className="sr-only">{t("tests.filter.searchTopics")}</span>
          <div className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 ring-1 ring-border">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder={t("tests.filter.searchExamPlaceholder")}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </label>
        <SelectFilter
          label={t("tests.filter.difficulty")}
          value={filters.difficulty}
          onChange={(v) => setFilters((f) => ({ ...f, difficulty: v as LibraryFilters["difficulty"] }))}
          options={[{ value: "all", label: t("tests.filter.allDifficulties") }, ...DIFFICULTIES.map((d) => ({ value: d, label: d }))]}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectFilter
            label={t("tests.filter.access")}
            value={filters.access}
            onChange={(v) => setFilters((f) => ({ ...f, access: v as LibraryFilters["access"] }))}
            options={[
              { value: "all", label: t("tests.filter.allAccess") },
              { value: "free", label: t("tests.filter.free") },
              { value: "premium", label: t("tests.filter.premium") },
            ]}
          />
          <SelectFilter
            label={t("tests.filter.status")}
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v as LibraryFilters["status"] }))}
            options={[
              { value: "all", label: t("tests.filter.allTests") },
              { value: "completed", label: t("tests.filter.completed") },
              { value: "todo", label: t("tests.filter.notCompleted") },
            ]}
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {t("tests.showingExam", { visible: visible.length, total: tests.length, exam: exam.toUpperCase() })}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((test) => {
          const row = progress[test.id];
          const done = Boolean(row?.completed_at);
          return (
            <article key={test.id} className="flex flex-col rounded-2xl bg-surface-2 p-5 ring-1 ring-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {t("tests.card.examNumber", { exam: exam.toUpperCase(), number: test.test_number })}
                  </p>
                  <h3 className="mt-1 font-display text-lg text-foreground">{test.topic}</h3>
                </div>
                {test.is_free ? (
                  <span className="rounded-full bg-brass/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-soft">
                    {t("tests.filter.free")}
                  </span>
                ) : (
                  <PremiumBadge />
                )}
              </div>

              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>{test.task_label} · {test.difficulty}</div>
                <div>{t("tests.card.speakForAbout", { seconds: test.speaking_time })}</div>
                <div>{done ? t("tests.card.completedAttempts", { attempts: row?.attempts ?? 1 }) : t("tests.card.notCompleted")}</div>
              </dl>

              <div className="mt-4 pt-1">
                {test.unlocked ? (
                  <button
                    type="button"
                    onClick={() => setOpenTest(test)}
                    className="w-full rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass"
                  >
                    {t("tests.card.startTest")}
                  </button>
                ) : (
                  <Link
                    to="/pricing"
                    className="block w-full rounded-full bg-surface-3 px-4 py-2 text-center text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
                  >
                    {t("tests.card.unlockWithPremium")}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="mt-6 rounded-2xl bg-surface-2 p-5 text-sm text-muted-foreground ring-1 ring-border">
          {t("tests.empty.noMatchTask")}
        </p>
      )}
    </>
  );
}

function TaskPractice({
  exam,
  test,
  onExit,
  onSaved,
}: {
  exam: "toefl" | "pte";
  test: SpeakingTest;
  onExit: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t, locale, englishOnly } = useI18n();
  const lang = englishOnly ? "en" : locale;
  const { user, profile } = useAuth();
  const transcribe = useServerFn(transcribeAudio);
  const analyse = useServerFn(analyseSpeaking);
  const analysePron = useServerFn(analysePronunciation);
  const saveSpeaking = useServerFn(saveSpeakingAttempt);
  const savePronunciation = useServerFn(savePronunciationAttempt);
  const { play, stop: stopVoice, pause, resume, speaking, paused, loading: voiceLoading } = useSpeak();
  const { paywall, handleError, clearPaywall } = usePaywall("speaking");

  const [promptIndex, setPromptIndex] = useState(0);
  const [prep, setPrep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<{ analysis: SpeakingAnalysis; transcript: string } | null>(null);
  const [accuracy, setAccuracy] = useState<PronunciationResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const task = {
    id: test.task_type,
    label: test.task_label,
    instructions: test.instructions,
    prepSeconds: test.preparation_time,
    speakSeconds: test.speaking_time,
    prompts: testPrompts(test),
  };
  const prompt = task.prompts[promptIndex % Math.max(1, task.prompts.length)] ?? "";
  const isReadBack = READ_BACK_TASKS.has(task.id);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startPrep = () => {
    const seconds = task.prepSeconds || 20;
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

  const submit = async (recording: Recording) => {
    if (!user) return;
    clearPaywall();
    setBusy(true);
    setAnalysis(null);
    setAccuracy(null);
    try {
      const { transcript } = await transcribe({
        data: { audioBase64: recording.base64, mimeType: recording.mimeType },
      });
      if (!transcript.trim()) {
        toast.error(t("tests.runner.couldNotHear"));
        return;
      }
      if (isReadBack) {
        const res = await analysePron({
          data: {
            testId: test.id,
            target: prompt,
            transcript,
            lang,
            audioBase64: recording.base64,
            mimeType: recording.mimeType,
          },
        });
        setAccuracy(res);
        await savePronunciation({
          data: {
            mode: `${exam}-${task.id}`,
            target: prompt,
            targetSound: null,
            transcript,
            accuracy: res.wordAccuracy,
            feedback: res.feedback,
            isDemo: !res.acoustic,
          },
        });
      } else {
        const res = await analyse({
          data: { testId: test.id, question: prompt, transcript, lang, level: profile?.english_level ?? "B1" },
        });
        setAnalysis({ analysis: res, transcript });
        await saveSpeaking({
          data: {
            questionText: `${exam.toUpperCase()} ${task.label}: ${prompt}`.slice(0, 500),
            transcript,
            fluency: res.fluency,
            grammar: res.grammar,
            vocabulary: res.vocabulary,
            overall: res.overall,
            mistakes: res.mistakes,
            corrections: res.corrections,
            betterVocabulary: res.better_vocabulary,
            naturalAnswer: res.natural_answer,
            feedback: res.feedback,
          },
        });
      }
      await recordTestAttempt(user.id, test.id, null);
      await onSaved();
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {paywall}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
        >
          <ArrowLeft className="size-3.5" />
          {t("tests.runner.backToExamLibrary", { exam: exam.toUpperCase() })}
        </button>
        <span className="text-xs text-muted-foreground">
          {t("tests.runner.examStatus", { exam: exam.toUpperCase(), number: test.test_number, task: test.task_label, difficulty: test.difficulty })}
        </span>
      </div>


      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <PanelCard
          title={`${test.topic} — ${task.label}`}
          demo={!user}
          actions={
            <button
              type="button"
              onClick={() => {
                setPromptIndex((i) => i + 1);
                setAnalysis(null);
                setAccuracy(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
            >
              <Shuffle className="size-3.5" />
              {t("tests.runner.nextPrompt", { current: (promptIndex % Math.max(1, task.prompts.length)) + 1, total: task.prompts.length })}
            </button>
          }
        >
          <p className="text-sm text-muted-foreground">{task.instructions}</p>
          <p className="mt-3 font-display text-xl leading-relaxed text-foreground">{prompt}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isReadBack && (
              <VoiceButton
                text={prompt}
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
            {task.prepSeconds > 0 && (
              <button
                type="button"
                onClick={startPrep}
                className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                <Timer className="size-4" />
                {t("tests.runner.prepSeconds", { seconds: task.prepSeconds })}
              </button>
            )}
            {prep !== null && <span className="font-display text-lg text-brass-soft">0:{String(prep).padStart(2, "0")}</span>}
            <span className="text-xs text-muted-foreground">{t("tests.card.speakForAbout", { seconds: task.speakSeconds })}</span>
          </div>

          <div className="mt-6">
            <MicRecorder
              onSubmit={submit}
              busy={busy}
              busyLabel={t("tests.runner.busyScoring")}
              disabled={!user}
              hint={isReadBack ? t("tests.runner.hintReadBack") : t("tests.runner.hintOpenTask")}
              disabledReason={
                <Link to="/auth" className="text-brass-soft hover:text-brass">
                  {t("tests.runner.signInToRecord")}
                </Link>
              }
            />
          </div>

          {accuracy && (
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="font-display text-lg text-foreground">{t("tests.score.aiEstimatedScore")}</h3>
              <div className="mt-4 space-y-3">
                <ScoreBar label={t("tests.score.accuracyAgainstTarget")} value={accuracy.wordAccuracy} max={100} />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("tests.block.whatWeHeard")}</h4>
                  <p className="mt-1.5 text-sm text-mist">{accuracy.readBack}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("tests.block.wordsToFix")}</h4>
                  <p className="mt-1.5 text-sm text-mist">
                    {accuracy.missed.length > 0 ? accuracy.missed.join(", ") : t("tests.block.noneWellDone")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground">{accuracy.feedback}</p>
            </div>
          )}

          {analysis && (
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="font-display text-lg text-foreground">{t("tests.score.aiEstimatedScore")}</h3>
              <div className="mt-4">
                <SpeakingFeedback
                  analysis={analysis.analysis}
                  transcript={analysis.transcript}
                  onRetry={() => setAnalysis(null)}
                />
              </div>
            </div>
          )}
        </PanelCard>

        <aside className="lounge-panel h-fit p-5">
          <h2 className="font-display text-base text-foreground">{t("tests.sidebar.thisTest")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">{task.label}</span> — {task.speakSeconds}{t("tests.sidebar.responseSuffix")}
            </li>
            <li>{task.prepSeconds > 0 ? t("tests.runner.prepTimeSeconds", { seconds: task.prepSeconds }) : t("tests.runner.noPrepTime")}</li>
            <li>{t("tests.runner.promptCount", { count: task.prompts.length })}</li>
          </ul>
          <Link
            to="/ai-speaking"
            className="mt-5 block rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border hover:bg-surface-3"
          >
            {t("tests.sidebar.warmUpWithCoach")}
          </Link>
        </aside>
      </div>
    </>
  );
}
