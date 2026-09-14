import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { PanelCard, ScoreStat } from "@/components/lily/score-panel";
import { SpeakingFeedback } from "@/components/lily/speaking-feedback";
import { useAuth } from "@/lib/auth";
import { DEMO_SOUND_PROGRESS } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n";
import { generateLearningPlan, type LearningPlan } from "@/lib/lily.functions";
import {
  getMyProgressHistory,
  type ProgressSessionRow,
  type ProgressSoundRow,
  type ProgressSpeakingRow,
} from "@/lib/progress.functions";
import { fetchSpeakingTests, fetchTestProgress, progressSummary } from "@/lib/speaking-test-library";
import { en } from "@/locales/en";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: en["progress.meta.title"] },
      { name: "description", content: en["progress.meta.description"] },
      { property: "og:title", content: en["progress.meta.title"] },
      { property: "og:description", content: en["progress.meta.description"] },
    ],
  }),
  component: ProgressPage,
});

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
  }, [user, getMyProgressHistoryFn]);

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
  const shownSounds = user && sounds.length > 0 ? sounds : DEMO_SOUND_PROGRESS;

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
          <PanelCard title={t("progress.pronProgress")} demo={sounds.length === 0}>
            <ul className="space-y-3">
              {shownSounds.map((row) => {
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
