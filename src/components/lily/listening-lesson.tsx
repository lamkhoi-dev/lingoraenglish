import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronRight, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DictationStrategy,
  DontWorryCard,
  HowDoesThisWorkButton,
  HowItWorksGuide,
  StageHeader,
  StageProgress,
  Tip,
  QuestionTypeHint,
  useGuidePreference,
} from "@/components/lily/listening-guide";
import { ListeningPlayer } from "@/components/lily/listening-player";
import { ListeningTranscript } from "@/components/lily/listening-transcript";
import { useAuth } from "@/lib/auth";
import {
  buildDictationParts,
  formatDuration,
  gradeDictation,
  percent,
  strengthsFrom,
  weakAreasFrom,
  type ListeningLesson,
  type ListeningProgressRow,
} from "@/lib/listening-content";
import { saveListeningProgress } from "@/lib/listening.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** 0 = the "how it works" briefing, then Listen → Understand → Dictation → Review. */
type Stage = 0 | 1 | 2 | 3 | 4;

export type ListeningLessonViewProps = {
  lesson: ListeningLesson;
  onSaved?: ((row: ListeningProgressRow) => void) | undefined;
  onNext?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
};

/**
 * One Listening Lab lesson: How it works → Listen → Understand → Dictation →
 * Review. Comprehension and dictation are scored from the learner's real
 * answers and the result is saved to their own account row.
 */
export function ListeningLessonView({ lesson, onSaved, onNext, onBack }: ListeningLessonViewProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { hidden, setHidden } = useGuidePreference();
  const saveProgress = useServerFn(saveListeningProgress);
  const [stage, setStage] = useState<Stage>(0);
  const [seconds, setSeconds] = useState(0);
  const [heardOnce, setHeardOnce] = useState(false);

  const [answers, setAnswers] = useState<(string | null)[]>(() => lesson.questions.map(() => null));
  const [revealed, setRevealed] = useState<boolean[]>(() => lesson.questions.map(() => false));

  const [typed, setTyped] = useState<string[][]>(() => lesson.dictation.map((d) => d.blanks.map(() => "")));
  const [checked, setChecked] = useState<boolean[]>(() => lesson.dictation.map(() => false));

  const [saving, setSaving] = useState(false);

  /** Learners who chose "Don't show this again" go straight to listening. */
  useEffect(() => {
    if (hidden === true) setStage((prev) => (prev === 0 ? 1 : prev));
  }, [hidden]);


  const dictationResults = useMemo(
    () => lesson.dictation.map((item, i) => (checked[i] ? gradeDictation(item, typed[i] ?? []) : [])),
    [checked, lesson.dictation, typed],
  );

  const correctAnswers = lesson.questions.filter((q, i) => answers[i] === q.answer).length;
  const comprehensionScore = percent(correctAnswers, lesson.questions.length);

  const totalBlanks = lesson.dictation.reduce((sum, item) => sum + item.blanks.length, 0);
  const correctBlanks = dictationResults.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const dictationScore = percent(correctBlanks, totalBlanks);
  const overallScore = Math.round((comprehensionScore + dictationScore) / 2);

  const allAnswered = answers.every((a) => a !== null);
  const allChecked = checked.every(Boolean);

  const weakAreas = weakAreasFrom(lesson.questions, answers, lesson.dictation, dictationResults);
  const strengths = strengthsFrom(lesson.questions, answers);

  const restart = () => {
    setAnswers(lesson.questions.map(() => null));
    setRevealed(lesson.questions.map(() => false));
    setTyped(lesson.dictation.map((d) => d.blanks.map(() => "")));
    setChecked(lesson.dictation.map(() => false));
    setStage(1);
  };

  const finish = async () => {
    setStage(4);
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveProgress({
        data: {
          lessonId: lesson.id,
          comprehensionScore,
          dictationScore,
          overallScore,
          secondsListened: seconds || lesson.duration_seconds,
          weakAreas,
        },
      });
      onSaved?.({ ...(saved as ListeningProgressRow), weak_areas: weakAreas });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("listen.error.couldNotSaveProgress"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="lounge-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground sm:text-2xl">{lesson.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {lesson.level} · {lesson.category} · {lesson.topic} · {formatDuration(lesson.duration_seconds)}
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full bg-surface-2 px-3.5 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-border hover:text-foreground"
          >
            {t("listen.backToLab")}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <StageProgress stage={stage} />
        {stage > 0 && <HowDoesThisWorkButton onClick={() => setStage(0)} />}
      </div>

      {stage === 0 && (
        <div className="mt-5">
          <HowItWorksGuide
            onStart={() => setStage(1)}
            defaultOpen
            hidden={Boolean(hidden)}
            onHiddenChange={setHidden}
          />
        </div>
      )}

      {stage > 0 && (
        <div className="mt-5">
          <ListeningPlayer
            script={lesson.script}
            durationSeconds={lesson.duration_seconds}
            accent={lesson.accent}
            compact={stage !== 1}
            onListened={(s) => {
              setSeconds((prev) => prev + s);
              setHeardOnce(true);
            }}
          />
          {stage >= 2 && <ListeningTranscript script={lesson.script} connectedSpeech={lesson.connected_speech} />}
        </div>
      )}

      {stage === 1 && (
        <div className="mt-6 border-t border-border pt-5">
          <StageHeader
            title={t("listen.stage1.title")}
            instruction={t("listen.stage1.instruction")}
            listFor={[t("listen.stage1.who"), t("listen.stage1.where"), t("listen.stage1.what")]}
          />
          <Tip>{t("listen.stage1.tip")}</Tip>

          {heardOnce ? (
            <div className="mt-4 rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
              <p className="text-sm font-semibold text-foreground">{t("listen.stage1.howDidItFeel")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("listen.stage1.dontNeedEverything")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStage(2)}
                  className="inline-flex items-center gap-2 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
                >
                  {t("listen.stage1.continueMainIdea")} <ChevronRight className="size-4" />
                </button>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-4 py-2.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
                  <RotateCcw className="size-3.5" /> {t("listen.stage1.needAnotherListen")}
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStage(2)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
            >
              {t("listen.stage1.continueToComprehension")} <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      )}

      {stage === 2 && (
        <div className="mt-6 border-t border-border pt-5">
          <StageHeader
            title={t("listen.stage2.title")}
            instruction={t("listen.stage2.instruction")}
            listTitle={t("listen.stage2.beforeAnswering")}
            listFor={[
              t("listen.stage2.think"),
              t("listen.stage2.listenForKey"),
              t("listen.stage2.whoSaidWhat"),
              t("listen.stage2.dontGuess"),
            ]}
          />
          <Tip>{t("listen.stage2.tip")}</Tip>

          <div className="mt-4 space-y-5">
            {lesson.questions.map((question, qi) => {
              const chosen = answers[qi];
              const isRevealed = revealed[qi];
              return (
                <div key={qi} className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
                  <p className="text-sm font-semibold text-foreground">
                    {qi + 1}. {question.prompt}
                  </p>
                  <QuestionTypeHint skill={question.skill} />

                  <div className="mt-3 grid gap-2">
                    {question.options.map((option) => {
                      const picked = chosen === option;
                      const right = option === question.answer;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={isRevealed}
                          onClick={() => {
                            setAnswers((prev) => prev.map((a, i) => (i === qi ? option : a)));
                            setRevealed((prev) => prev.map((r, i) => (i === qi ? true : r)));
                          }}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm ring-1 ring-border transition-colors",
                            isRevealed && right && "bg-emerald-500/15 text-foreground",
                            isRevealed && picked && !right && "bg-red-500/15 text-foreground",
                            !isRevealed && "bg-surface-3 text-foreground hover:bg-surface-2",
                            isRevealed && !right && !picked && "bg-surface-3/60 text-muted-foreground",
                          )}
                        >
                          <span>{option}</span>
                          {isRevealed && right && <Check className="size-4 text-emerald-400" />}
                          {isRevealed && picked && !right && <X className="size-4 text-red-400" />}
                        </button>
                      );
                    })}
                  </div>
                  {isRevealed && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      <span className={cn("font-semibold", chosen === question.answer ? "text-emerald-400" : "text-red-400")}>
                        {chosen === question.answer ? t("listen.stage2.correct") : t("listen.stage2.notQuite")}
                      </span>{" "}
                      {question.explanation}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {allAnswered && (
            <div className="mt-5 rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
              <p className="font-display text-lg text-foreground">
                {t("listen.stage2.comprehensionResult", { score: comprehensionScore })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("listen.stage2.correctSummary", { correct: correctAnswers, remaining: lesson.questions.length - correctAnswers })}
                {weakAreas.length ? t("listen.stage2.reviewAreas", { areas: weakAreas.join(", ") }) : ""}
              </p>
              <button
                type="button"
                onClick={() => setStage(3)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
              >
                {t("listen.stage2.continueToDictation")} <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {stage === 3 && (
        <div className="mt-6 border-t border-border pt-5">
          <StageHeader
            title={t("listen.stage3.title")}
            instruction={t("listen.stage3.instruction")}
            listTitle={t("listen.stage3.listenThinkTypeCheck")}
            listFor={[t("listen.stage3.replayAsOften"), t("listen.stage3.typeExactly")]}
          />
          <DictationStrategy />


          <div className="mt-4 space-y-4">
            {lesson.dictation.map((item, di) => {
              const parts = buildDictationParts(item);
              const results = dictationResults[di] ?? [];
              const isChecked = checked[di];
              return (
                <div key={di} className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-mist">
                    {parts.map((part, pi) =>
                      part.blankIndex === null ? (
                        <span key={pi}>{part.text}</span>
                      ) : (
                        <input
                          key={pi}
                          value={typed[di]?.[part.blankIndex] ?? ""}
                          disabled={isChecked}
                          onChange={(event) =>
                            setTyped((prev) =>
                              prev.map((row, i) =>
                                i === di
                                  ? row.map((word, wi) => (wi === part.blankIndex ? event.target.value : word))
                                  : row,
                              ),
                            )
                          }
                          aria-label={t("listen.stage3.missingWordAria", { n: part.blankIndex + 1 })}
                          className={cn(
                            "w-28 rounded-lg bg-surface-3 px-2 py-1 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass/60",
                            isChecked && results[part.blankIndex] && "ring-emerald-500/60",
                            isChecked && results[part.blankIndex] === false && "ring-red-500/60",
                          )}
                        />
                      ),
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-semibold text-brass-soft ring-1 ring-border">
                      {t(`listen.challenge.${item.challenge}` as never)}
                    </span>
                    {!isChecked && (
                      <button
                        type="button"
                        onClick={() => setChecked((prev) => prev.map((c, i) => (i === di ? true : c)))}
                        className="rounded-full bg-surface-3 px-3.5 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
                      >
                        {t("listen.stage3.check")}
                      </button>
                    )}
                  </div>

                  {isChecked && (
                    <div className="mt-3 space-y-1 text-xs">
                      <p className="text-muted-foreground">
                        {t("listen.stage3.youWrote")}{" "}
                        <span className="text-foreground">
                          {(typed[di] ?? []).map((w) => w || "—").join(" · ")}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {t("listen.stage3.correctLabel")}{" "}
                        {item.blanks.map((blank, bi) => (
                          <span
                            key={bi}
                            className={cn("mr-2", results[bi] ? "text-emerald-400" : "text-red-400 font-semibold")}
                          >
                            {blank}
                          </span>
                        ))}
                      </p>
                      {item.explanation && <p className="text-muted-foreground">{item.explanation}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {allChecked && (
            <div className="mt-5 rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
              <p className="font-display text-lg text-foreground">
                {t("listen.stage3.dictationResult", { score: dictationScore })}
              </p>
              <button
                type="button"
                onClick={() => void finish()}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
              >
                {t("listen.stage3.seeResults")} <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {stage === 4 && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-display text-xl text-foreground">{t("listen.stage4.title")}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: t("listen.stage4.comprehension"), value: comprehensionScore },
              { label: t("listen.stage4.dictation"), value: dictationScore },
              { label: t("listen.stage4.overall"), value: overallScore },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-surface-2/70 p-4 ring-1 ring-border">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-1 font-display text-2xl text-brass-soft">{stat.value}%</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("listen.stage4.whatYouDidWell")}</h4>
              <ul className="mt-2 space-y-1 text-sm text-mist">
                {(strengths.length ? strengths : [t("listen.stage4.finishingWholeLesson")]).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border">
              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("listen.stage4.review")}</h4>
              <ul className="mt-2 space-y-1 text-sm text-mist">
                {(weakAreas.length ? weakAreas : [t("listen.stage4.cleanRun")]).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>

          {!user && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t("listen.stage4.signInToSave")}
            </p>
          )}
          {saving && (
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("listen.stage4.saving")}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restart}
              className="rounded-full bg-surface-2 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
            >
              {t("listen.tryAgain")}
            </button>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                className="rounded-full bg-brass px-4 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
              >
                {t("listen.nextLesson")}
              </button>
            )}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-full bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-border hover:text-foreground"
              >
                {t("listen.backToLab")}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
