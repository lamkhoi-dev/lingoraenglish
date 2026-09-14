import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCcw, Sparkles, TrendingUp, Volume2 } from "lucide-react";

import { ScoreBar } from "./score-panel";
import { useI18n } from "@/lib/i18n";
import type { SpeakingAnalysis } from "@/lib/lily.functions";

export type AttemptScores = { fluency: number; grammar: number; vocabulary: number; overall: number };

/** Any /ipa/ symbol the coach mentioned, so we can offer the matching sound drill. */
function detectSounds(analysis: SpeakingAnalysis): string[] {
  const text = [analysis.feedback, ...analysis.mistakes.map((m) => m.why)].join(" ");
  const found = text.match(/\/[^/\s]{1,4}\//g) ?? [];
  return Array.from(new Set(found)).slice(0, 3);
}

function Delta({ from, to }: { from: number; to: number }) {
  const diff = Math.round((to - from) * 10) / 10;
  if (diff === 0) return null;
  return (
    <span className={diff > 0 ? "text-brass-soft" : "text-muted-foreground"}>
      {diff > 0 ? "+" : ""}
      {diff}
    </span>
  );
}

export function SpeakingFeedback({
  analysis,
  transcript,
  previous,
  onRetry,
  onPractiseAgain,
  demo,
}: {
  analysis: SpeakingAnalysis;
  transcript: string;
  previous?: AttemptScores | null;
  onRetry?: () => void;
  onPractiseAgain?: (prompt: string) => void;
  demo?: boolean;
}) {
  const { t } = useI18n();
  const sounds = detectSounds(analysis);
  const improved = previous ? Math.round((analysis.overall - previous.overall) * 10) / 10 : 0;

  return (
    <div className="space-y-6">
      {demo && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground ring-1 ring-border">
          {t("coach.feedback.demoNotice")}
        </p>
      )}

      {previous && improved > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-brass/12 p-3 text-sm font-semibold text-brass-soft ring-1 ring-brass/25">
          <TrendingUp className="size-4" />
          {t("coach.feedback.scoreImproved", { points: improved })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <ScoreBar label={t("coach.feedback.fluency")} value={analysis.fluency} />
          <ScoreBar label={t("coach.feedback.grammar")} value={analysis.grammar} />
          <ScoreBar label={t("coach.feedback.vocabulary")} value={analysis.vocabulary} />
        </div>
        <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("coach.feedback.overallScore")}</p>
          <p className="mt-1 font-display text-4xl text-brass-soft">
            {analysis.overall}
            <span className="text-lg text-muted-foreground">/10</span>{" "}
            {previous && <Delta from={previous.overall} to={analysis.overall} />}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("coach.feedback.pronunciationNote")}
          </p>
        </div>
      </div>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("coach.feedback.whatYouSaid")}</h4>
        <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-mist ring-1 ring-border">{transcript}</p>
      </section>

      {analysis.mistakes.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("coach.feedback.grammarAccuracy")}</h4>
          <div className="mt-2 space-y-2">
            {analysis.mistakes.map((m, i) => (
              <div key={i} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                <p className="text-sm text-foreground">{m.wrong}</p>
                <p className="mt-1 text-sm text-muted-foreground">{m.why}</p>
                {onPractiseAgain && (
                  <button
                    type="button"
                    onClick={() => onPractiseAgain(`Say a new sentence that fixes this mistake: ${m.wrong}. ${m.why}`)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brass-soft hover:text-brass"
                  >
                    <Sparkles className="size-3.5" />
                    {t("coach.feedback.practiseThisAgain")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {analysis.corrections.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("coach.feedback.corrections")}</h4>
          <div className="mt-2 space-y-1.5">
            {analysis.corrections.map((c, i) => (
              <p key={i} className="text-sm text-mist">
                <span className="text-muted-foreground line-through">{c.from}</span>{" "}
                <span className="text-foreground">→ {c.to}</span>
              </p>
            ))}
          </div>
        </section>
      )}

      {analysis.better_vocabulary.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("coach.feedback.betterVocabulary")}</h4>
          <div className="mt-2 space-y-1.5">
            {analysis.better_vocabulary.map((v, i) => (
              <p key={i} className="text-sm text-mist">
                <span className="text-muted-foreground">{v.instead_of}</span>{" "}
                <span className="text-foreground">→ {v.use}</span>
              </p>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("coach.feedback.moreNatural")}</h4>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{analysis.natural_answer}</p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-brass-soft">{t("coach.feedback.coachFeedback")}</h4>
        <p className="mt-2 text-sm leading-relaxed text-mist">{analysis.feedback}</p>
      </section>

      {sounds.length > 0 && (
        <section className="rounded-2xl bg-plum/20 p-4 ring-1 ring-border">
          <p className="text-sm font-semibold text-foreground">{t("coach.feedback.practiseTheseSounds")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sounds.map((s) => (
              <Link
                key={s}
                to="/pronunciation"
                search={{ sound: s } as never}
                className="inline-flex items-center gap-1.5 rounded-full bg-brass px-3.5 py-2 text-xs font-semibold text-plum-deep"
              >
                <Volume2 className="size-3.5" />
                {t("coach.feedback.practiseSound", { sound: s })}
              </Link>
            ))}
          </div>
        </section>
      )}

      {analysis.fluency < 7 && (
        <section className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
          <p className="text-sm font-semibold text-foreground">{t("coach.feedback.deliverySkills")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["sentence-stress", "connected-speech", "rhythm", "fluency"] as const).map((skill) => (
              <Link
                key={skill}
                to="/pronunciation"
                search={{ skill } as never}
                className="rounded-full bg-surface-3 px-3.5 py-2 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-2"
              >
                {t("coach.feedback.practiseSkill", { skill: skill.replace("-", " ") })}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
          >
            <RefreshCcw className="size-4" />
            {t("coach.feedback.tryAgain")}
          </button>
        )}
        <Link
          to="/pronunciation"
          className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
        >
          <Volume2 className="size-4" />
          {t("coach.feedback.pronunciationCoach")}
        </Link>
        <Link
          to="/progress"
          className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
        >
          {t("coach.feedback.myProgress")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
