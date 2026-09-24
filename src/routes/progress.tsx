import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Headphones, Mic, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { PanelCard, ScoreBar, ScoreStat } from "@/components/lily/score-panel";
import { SpeakingFeedback } from "@/components/lily/speaking-feedback";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { generateLearningPlan, type LearningPlan } from "@/lib/lily.functions";
import {
  getMyProgressHistory,
  getProgressOverview,
  getTodayLearningLog,
  type ProgressSessionRow,
  type ProgressSoundRow,
  type ProgressSpeakingRow,
  type TodayLearningSummary,
} from "@/lib/progress.functions";
import { cn } from "@/lib/utils";
import { fetchSpeakingTests, fetchTestProgress, progressSummary } from "@/lib/speaking-test-library";
import { en } from "@/locales/en";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      NOINDEX_META,
      { title: en["progress.meta.title"] },
      { name: "description", content: en["progress.meta.description"] },
      { property: "og:title", content: en["progress.meta.title"] },
      { property: "og:description", content: en["progress.meta.description"] },
    ],
  }),
  component: ProgressPage,
});

/** One labelled number in a Yêu cầu 13 detail section. */
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-lg text-foreground">{value}</dd>
    </div>
  );
}

function tone(score: number) {
  if (score >= 85) return { dot: "bg-brass", label: "progress.good" as const };
  if (score >= 70) return { dot: "bg-brass-soft/60", label: "progress.practiceMore" as const };
  return { dot: "bg-plum-soft", label: "progress.needsWork" as const };
}

function ProgressPage() {
  const { t, locale, englishOnly, formatDate } = useI18n();
  const lang = englishOnly ? "en" : locale;
  const { user, profile } = useAuth();
  const requestPlan = useServerFn(generateLearningPlan);
  const getMyProgressHistoryFn = useServerFn(getMyProgressHistory);
  const getProgressOverviewFn = useServerFn(getProgressOverview);
  const getTodayLearningLogFn = useServerFn(getTodayLearningLog);

  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getProgressOverview>> | null>(null);
  const [todayLog, setTodayLog] = useState<TodayLearningSummary | null>(null);
  const [speaking, setSpeaking] = useState<ProgressSpeakingRow[]>([]);
  const [sessions, setSessions] = useState<ProgressSessionRow[]>([]);
  const [sounds, setSounds] = useState<ProgressSoundRow[]>([]);
  const [lessons, setLessons] = useState(0);
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSummary, setTestSummary] = useState<ReturnType<typeof progressSummary> | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void getProgressOverviewFn().then(setOverview).catch(() => setOverview(null));
    void getTodayLearningLogFn().then(setTodayLog).catch(() => setTodayLog(null));
    void (async () => {
      const history = await getMyProgressHistoryFn();
      setSpeaking(history.speaking);
      setSessions(history.sessions);
      setSounds(history.sounds);
      setLessons(history.lessonsCount);

      try {
        const [tests, rows] = await Promise.all([fetchSpeakingTests(), fetchTestProgress(user.id)]);
        setTestSummary(progressSummary(tests, Object.fromEntries(rows.map((r) => [r.test_id, r]))));
      } catch {
        setTestSummary(null);
      }
    })();
  }, [user, getMyProgressHistoryFn, getProgressOverviewFn, getTodayLearningLogFn]);

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      setPlan(await requestPlan({ data: { lang } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  const scored = speaking.filter((s) => s.overall !== null);
  const average = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + (s.overall ?? 0), 0) / scored.length) * 10) / 10
    : null;
  // Yêu cầu 13: a signed-in learner never sees sample data — an empty list is
  // shown as an empty state instead (this used to fall back to DEMO_SOUND_PROGRESS).
  const formatListeningTime = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    return minutes < 60
      ? t("common.minutes", { count: minutes })
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  if (!user) {
    return (
      <AppShell>
        <SectionHeading eyebrow={t("nav.progress")} title={t("progress.title")} description={t("progress.sub")} />
        <div className="lounge-panel mt-8 p-6">
          <p className="text-sm text-mist">{t("common.signInRequired")}</p>
          <Link
            to="/auth"
            className="mt-4 inline-block rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep hover:bg-brass-soft"
          >
            {t("common.signIn")}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <SectionHeading eyebrow={t("nav.progress")} title={t("progress.title")} description={t("progress.sub")} />

      {/* ── Hoạt động hôm nay / Today's Practice Log ─────────────────── */}
      <div className="mt-8">
        <PanelCard title={locale === "vi" ? "Hôm nay bạn đã học gì?" : "Today's Learning Activity"}>
          {todayLog && todayLog.hasActivity ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Volume2 className="size-3.5 text-brass" />
                    <span>{locale === "vi" ? "Phát âm hôm nay" : "Pronunciation"}</span>
                  </dt>
                  <dd className="mt-1 font-display text-lg text-foreground">
                    {todayLog.stats.pronunciationCount} {locale === "vi" ? "lượt" : "times"}
                  </dd>
                  {todayLog.stats.pronunciationSounds.length > 0 && (
                    <p className="mt-1 truncate font-mono text-xs text-brass-soft">
                      {todayLog.stats.pronunciationSounds.join("  ")}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BookOpen className="size-3.5 text-brass" />
                    <span>{locale === "vi" ? "Từ vựng đã học" : "Vocabulary"}</span>
                  </dt>
                  <dd className="mt-1 font-display text-lg text-foreground">
                    {todayLog.stats.vocabularyCount} {locale === "vi" ? "từ mới" : "words"}
                  </dd>
                </div>

                <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mic className="size-3.5 text-brass" />
                    <span>{locale === "vi" ? "Nói & Shadowing" : "Speaking & Shadowing"}</span>
                  </dt>
                  <dd className="mt-1 font-display text-lg text-foreground">
                    {todayLog.stats.speakingCount + todayLog.stats.shadowingCount + todayLog.stats.coachCount} {locale === "vi" ? "bài luyện" : "exercises"}
                  </dd>
                </div>

                <div className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Headphones className="size-3.5 text-brass" />
                    <span>{locale === "vi" ? "Luyện nghe" : "Listening"}</span>
                  </dt>
                  <dd className="mt-1 font-display text-lg text-foreground">
                    {todayLog.stats.listeningCount} {locale === "vi" ? "bài nghe" : "lessons"}
                  </dd>
                </div>
              </div>

              {/* Chi tiết hoạt động hôm nay */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {locale === "vi" ? "Chi tiết các hoạt động trong ngày" : "Activities completed today"}
                </h4>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {todayLog.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between rounded-lg bg-surface-2/60 px-3 py-2 text-sm ring-1 ring-border"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            it.type === "pronunciation" && "bg-brass/20 text-brass-soft",
                            it.type === "vocabulary" && "bg-blue-500/20 text-blue-300",
                            it.type === "shadowing" && "bg-emerald-500/20 text-emerald-300",
                            it.type === "speaking" && "bg-purple-500/20 text-purple-300",
                            it.type === "coach" && "bg-amber-500/20 text-amber-300",
                            it.type === "listening" && "bg-sky-500/20 text-sky-300",
                          )}
                        >
                          {it.type === "pronunciation"
                            ? (locale === "vi" ? "Phát âm" : "Pron")
                            : it.type === "vocabulary"
                            ? (locale === "vi" ? "Từ vựng" : "Vocab")
                            : it.type === "shadowing"
                            ? "Shadowing"
                            : it.type === "speaking"
                            ? (locale === "vi" ? "Nói" : "Speech")
                            : it.type === "coach"
                            ? "Coach AI"
                            : (locale === "vi" ? "Nghe" : "Listen")}
                        </span>
                        <span className="font-medium text-foreground">{it.title}</span>
                        {it.subtitle && <span className="text-xs text-muted-foreground">({it.subtitle})</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {it.score !== null && it.score !== undefined && (
                          <span
                            className={cn(
                              "font-semibold",
                              it.score >= 85 ? "text-brass" : it.score >= 70 ? "text-brass-soft" : "text-plum-soft",
                            )}
                          >
                            {it.score >= 10 ? `${Math.round(it.score)}%` : `${it.score}/10`}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {new Date(it.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-surface-2 p-5 text-center">
              <p className="text-sm text-muted-foreground">
                {locale === "vi"
                  ? "Hôm nay bạn chưa có hoạt động học nào. Hãy bắt đầu luyện tập để ghi nhận tiến độ hôm nay!"
                  : "No learning activity recorded yet today. Complete a practice exercise to log today's progress!"}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                <Link
                  to="/pronunciation"
                  className="rounded-full bg-brass px-4 py-1.5 text-xs font-semibold text-plum-deep hover:bg-brass-soft"
                >
                  {locale === "vi" ? "Luyện phát âm 44 âm" : "Practice Pronunciation"}
                </Link>
                <Link
                  to="/vocabulary"
                  className="rounded-full bg-surface-3 px-4 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
                >
                  {locale === "vi" ? "Học từ vựng" : "Vocabulary"}
                </Link>
                <Link
                  to="/ai-speaking"
                  className="rounded-full bg-surface-3 px-4 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
                >
                  {locale === "vi" ? "Luyện nói với AI" : "AI Speaking Coach"}
                </Link>
              </div>
            </div>
          )}
        </PanelCard>
      </div>

      {overview && !overview.hasData && (

        <div className="lounge-panel mt-8 p-6">
          <h3 className="font-display text-lg text-foreground">{t("progress.emptyTitle")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("progress.emptyBody")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/ai-speaking"
              className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep hover:bg-brass-soft"
            >
              {t("nav.coach")}
            </Link>
            <Link
              to="/listening-lab"
              className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border"
            >
              {t("nav.listeningLab")}
            </Link>
          </div>
        </div>
      )}

      {overview?.hasData && (
        <>
          <div className="mt-8">
            <PanelCard title={t("progress.overview")}>
            <div className="mt-4 space-y-4">
              <ScoreBar label={t("progress.sectionSpeaking")} value={overview.skills.speaking} max={100} />
              <ScoreBar label={t("progress.sectionListening")} value={overview.skills.listening} max={100} />
              <ScoreBar
                label={t("progress.sectionPronunciation")}
                value={overview.skills.pronunciation}
                max={100}
              />
              <ScoreBar label={t("progress.sectionVocabulary")} value={overview.skills.vocabulary} max={100} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("progress.completionNote")}</p>
            </PanelCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <PanelCard title={t("progress.sectionSpeaking")}>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <Metric label={t("progress.coachSessions")} value={overview.speaking.coachSessions} />
                <Metric
                  label={t("progress.shadowingCompleted")}
                  value={`${overview.speaking.shadowingCompleted} / ${overview.speaking.shadowingTotal}`}
                />
                <Metric
                  label={t("progress.testsCompleted")}
                  value={`${overview.speaking.testsCompleted} / ${overview.speaking.testsTotal}`}
                />
                <Metric
                  label={t("progress.averageScore")}
                  value={overview.speaking.averageScore === null ? "—" : `${overview.speaking.averageScore}/10`}
                />
              </dl>
            </PanelCard>

            <PanelCard title={t("progress.sectionListening")}>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <Metric
                  label={t("progress.lessonsCompleted")}
                  value={`${overview.listening.lessonsCompleted} / ${overview.listening.lessonsTotal}`}
                />
                <Metric
                  label={t("progress.comprehension")}
                  value={overview.listening.comprehension === null ? "—" : `${overview.listening.comprehension}%`}
                />
                <Metric
                  label={t("progress.dictation")}
                  value={overview.listening.dictation === null ? "—" : `${overview.listening.dictation}%`}
                />
                <Metric
                  label={t("progress.listeningTime")}
                  value={formatListeningTime(overview.listening.secondsListened)}
                />
              </dl>
            </PanelCard>

            <PanelCard title={t("progress.sectionPronunciation")}>
              <p className="mt-3 font-display text-2xl text-foreground">
                {t("progress.soundsMastered", {
                  mastered: overview.pronunciation.mastered,
                  total: overview.pronunciation.total,
                })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{t("progress.masteryNote")}</p>
            </PanelCard>

            <PanelCard title={t("progress.sectionVocabulary")}>
              <p className="mt-3 font-display text-2xl text-foreground">
                {t("progress.wordsLearned", { count: overview.vocabulary.learned })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("progress.wordsOfTotal", { total: overview.vocabulary.total })}
              </p>
            </PanelCard>
          </div>
        </>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lounge-panel p-5">
          <ScoreStat label={t("progress.streak")} value={profile?.streak_days ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("progress.practiceMinutes")} value={profile?.practice_minutes ?? 0} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("progress.lessons")} value={lessons} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("progress.avgSpeaking")} value={average} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <PanelCard
            title={t("progress.plan")}
            actions={
              <button
                type="button"
                onClick={() => void generate()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-brass px-3.5 py-1.5 text-xs font-semibold text-plum-deep hover:bg-brass-soft disabled:opacity-60"
              >
                <Sparkles className="size-3.5" />
                {busy ? t("common.loading") : t("progress.generatePlan")}
              </button>
            }
          >
            <p className="text-sm text-muted-foreground">{t("progress.planIntro")}</p>
            {plan && (
              <>
                <ol className="mt-4 space-y-2">
                  {plan.tasks.map((task, i) => (
                    <li key={i} className="rounded-xl bg-surface-2 p-3 text-sm text-foreground ring-1 ring-border">
                      <span className="mr-2 text-brass-soft">{i + 1}.</span>
                      {task.label}
                      <span className="ml-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">{task.area}</span>
                    </li>
                  ))}
                </ol>
                {plan.insights.length > 0 && (
                  <div className="mt-5">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                      {t("progress.insights")}
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-sm text-mist">
                      {plan.insights.map((insight, i) => (
                        <li key={i}>• {insight}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </PanelCard>

          <PanelCard title="Speaking Tests progress">
            {!testSummary || testSummary.completed === 0 ? (
              <p className="text-sm text-muted-foreground">
                No speaking tests completed yet.{" "}
                <Link to="/speaking-tests" className="text-brass-soft hover:text-brass">
                  Start with the free tests
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-border">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Tests completed</p>
                    <p className="mt-1 font-display text-lg text-foreground">
                      {testSummary.completed} / {testSummary.total}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-border">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Average band</p>
                    <p className="mt-1 font-display text-lg text-foreground">{testSummary.averageBand ?? "—"}</p>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-border">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Best band</p>
                    <p className="mt-1 font-display text-lg text-foreground">{testSummary.bestBand ?? "—"}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Part 1: {testSummary.part1} completed · Part 2: {testSummary.part2} completed · Part 3:{" "}
                  {testSummary.part3} completed
                </p>
                {testSummary.topics.length > 0 && (
                  <p className="mt-2 text-sm text-mist">Topics practised: {testSummary.topics.join(", ")}</p>
                )}
              </>
            )}
          </PanelCard>


          <PanelCard title={t("progress.speakingHistory")}>
            {speaking.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("progress.empty")}</p>
            ) : (
              <ul className="space-y-3">
                {speaking.map((row) => {
                  const expanded = expandedId === row.id;
                  const hasDetail = row.fluency !== null && row.grammar !== null && row.vocabulary !== null;
                  return (
                    <li key={row.id} className="rounded-xl bg-surface-2 p-4 ring-1 ring-border">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{row.question_text}</p>
                        <span className="shrink-0 font-display text-base text-brass-soft">{row.overall ?? "—"}/10</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.created_at)}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-mist">{row.transcript}</p>
                      {row.feedback && !expanded && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.feedback}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hasDetail && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className="inline-block rounded-full bg-surface-3 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border"
                          >
                            {expanded ? t("common.hideDetails") : t("common.viewDetails")}
                          </button>
                        )}
                        <Link
                          to="/ai-speaking"
                          className="inline-block rounded-full bg-surface-3 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border"
                        >
                          {t("speaking.practiceAgain")}
                        </Link>
                      </div>
                      {expanded && hasDetail && (
                        <div className="mt-4 border-t border-border pt-4">
                          <SpeakingFeedback
                            transcript={row.transcript}
                            analysis={{
                              fluency: row.fluency!,
                              grammar: row.grammar!,
                              vocabulary: row.vocabulary!,
                              overall: row.overall ?? 0,
                              mistakes: row.mistakes ?? [],
                              corrections: row.corrections ?? [],
                              better_vocabulary: row.better_vocabulary ?? [],
                              natural_answer: row.natural_answer ?? "",
                              feedback: row.feedback,
                            }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelCard>

          <PanelCard title={t("progress.conversationHistory")}>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("progress.empty")}</p>
            ) : (
              <ul className="space-y-3">
                {sessions.map((row) => (
                  <li key={row.id} className="rounded-xl bg-surface-2 p-4 ring-1 ring-border">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{row.topic}</p>
                      <span className="text-sm text-brass-soft">
                        {t("progress.performance")}: {row.performance ?? "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(row.created_at)} · {t("progress.duration")}{" "}
                      {t("common.minutes", { count: Math.max(1, Math.round(row.duration_seconds / 60)) })}
                    </p>
                    {row.feedback && <p className="mt-2 text-sm text-mist">{row.feedback}</p>}
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </div>

        <aside>
          <PanelCard title={t("progress.pronProgress")}>
            {sounds.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("progress.noSoundsYet")}</p>
            )}
            <ul className="space-y-3">
              {sounds.map((row) => {
                const info = tone(row.score);
                return (
                  <li key={row.sound}>
                    <Link to="/pronunciation" className="block">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 font-display text-base text-foreground">
                          <span className={`size-2 rounded-full ${info.dot}`} />
                          {row.sound}
                        </span>
                        <span className="text-sm text-brass-soft">{row.score}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-brass" style={{ width: `${row.score}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t(info.label)}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </PanelCard>
        </aside>
      </div>
    </AppShell>
  );
}
