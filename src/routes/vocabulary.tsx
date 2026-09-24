import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock, Mic, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { FeatureTour, ViewGuideButton, useFeatureTour } from "@/components/lily/feature-tour";
import { LockedContentList } from "@/components/lily/locked-content";
import { VocabSpeakPractice } from "@/components/lily/vocab-speak";
import { SectionHeading } from "@/components/lily/brand";
import { useBilling } from "@/hooks/use-billing";
import { useSpeak } from "@/hooks/use-speak";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { PREMIUM_ONLY_VOCAB_CATEGORIES, VOCAB_CATEGORIES } from "@/lib/ipa-data";
import { canonicalLink } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  getMyVocabularyProgress,
  getVocabularyTranslations,
  getVocabularyWords,
  toggleVocabularyWordKnown,
} from "@/lib/vocabulary.functions";
import { en } from "@/locales/en";

export const Route = createFileRoute("/vocabulary")({
  head: () => ({
    meta: [
      { title: en["vocab.meta.title"] },
      { name: "description", content: en["vocab.meta.description"] },
      { property: "og:title", content: en["vocab.meta.title"] },
      { property: "og:description", content: en["vocab.meta.description"] },
    ],
    links: [canonicalLink("/vocabulary")],
  }),
  component: VocabularyPage,
});

type Word = {
  id: string;
  word: string;
  ipa: string;
  meaningEn: string;
  meaningVi: string;
  category: string;
  level: string;
  exampleSentence: string;
  exampleVi: string;
  usageContext: string;
  synonyms: string[];
  antonyms: string[];
};

function VocabularyPage() {
  const { t, locale, languageName } = useI18n();
  const { user } = useAuth();
  const { data: billing } = useBilling();
  const isPaid = billing?.entitlement?.tier === "premium" || billing?.entitlement?.tier === "ielts_pro";
  const { play, stop: stopVoice, pause, resume, speaking, paused, loading: voiceLoading } = useSpeak();

  const getVocabularyWordsFn = useServerFn(getVocabularyWords);
  const getVocabularyTranslationsFn = useServerFn(getVocabularyTranslations);
  const getMyVocabularyProgressFn = useServerFn(getMyVocabularyProgress);
  const toggleVocabularyWordKnownFn = useServerFn(toggleVocabularyWordKnown);

  const [category, setCategory] = useState<string>(VOCAB_CATEGORIES[0] ?? "all");
  const [words, setWords] = useState<Word[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState<Record<string, { meaning: string; example: string }>>({});
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const [speakWord, setSpeakWord] = useState<Word | null>(null);

  useEffect(() => {
    setWords([]);
    setOffset(0);
    setHasMore(true);
  }, [category]);

  useEffect(() => {
    if (!hasMore && offset > 0) return;
    void (async () => {
      setLoading(true);
      try {
        const rows = await getVocabularyWordsFn({ data: { category: category === "all" ? undefined : category, offset } });
        if (offset === 0) setWords(rows);
        else setWords(prev => [...prev, ...rows]);
        if (rows.length < 50) setHasMore(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [category, offset, getVocabularyWordsFn, hasMore]);

  useEffect(() => {
    if (words.length === 0 || locale === "en") return;
    const missingIds = words.map((w) => w.id).filter(id => !translations[id]);
    if (missingIds.length === 0) return;
    
    void (async () => {
      const rows = await getVocabularyTranslationsFn({
        data: { locale, wordIds: missingIds.slice(0, 200) },
      });
      setTranslations((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.wordId] = { meaning: row.meaning, example: row.exampleTranslation };
        // Mark missing ones as empty so we don't refetch
        missingIds.forEach(id => { if (!next[id]) next[id] = { meaning: "", example: "" }; });
        return next;
      });
    })();
  }, [words, locale, getVocabularyTranslationsFn, translations]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const rows = await getMyVocabularyProgressFn();
      const map: Record<string, boolean> = {};
      for (const row of rows) map[row.wordId] = row.mastered;
      setKnown(map);
    })();
  }, [user, getMyVocabularyProgressFn]);

  const toggleKnown = async (wordId: string) => {
    if (!user) return;
    const next = !known[wordId];
    setKnown((prev) => ({ ...prev, [wordId]: next }));
    try {
      await toggleVocabularyWordKnownFn({ data: { wordId, mastered: next } });
    } catch {
      toast.error(t("common.somethingWrong"));
    }
  };

  const localMeaning = (w: Word) =>
    locale === "en" ? "" : (translations[w.id]?.meaning ?? (locale === "vi" ? w.meaningVi : ""));
  const localExample = (w: Word) =>
    locale === "en" ? "" : (translations[w.id]?.example ?? (locale === "vi" ? w.exampleVi : ""));

  const tour = useFeatureTour(
    "vocabulary",
    [
      {
        target: '[data-tour="vocab-categories"]',
        title: t("tour.vocab.step1.title"),
        content: t("tour.vocab.step1.content"),
        placement: "auto",
      },
      {
        target: '[data-tour="vocab-first-card"]',
        title: t("tour.vocab.step2.title"),
        content: t("tour.vocab.step2.content"),
        placement: "auto",
      },
    ],
    words.length > 0,
  );

  return (
    <AppShell>
      <FeatureTour run={tour.run} steps={tour.steps} handleEvent={tour.handleEvent} />
      <div className="grid items-center gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading eyebrow={t("nav.vocabulary")} title={t("vocab.title")} description={t("vocab.sub")} />
          <ViewGuideButton onClick={tour.restart} />
        </div>
        <div className="hidden lg:block overflow-hidden rounded-3xl border border-border shadow-lg">
          <img
            src="/images/vocabulary-cards.jpg"
            alt="English Vocabulary & Flashcards"
            className="h-44 w-full object-cover transition-transform duration-500 hover:scale-105"
          />
        </div>
      </div>

      <div data-tour="vocab-categories" className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-border ${
            category === "all" ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("common.all")}
        </button>
        {VOCAB_CATEGORIES.map((c) => {
          const isPremiumOnly = !isPaid && PREMIUM_ONLY_VOCAB_CATEGORIES.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-border transition-colors",
                category === c ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{c}</span>
              {isPremiumOnly && <Lock className="size-3 text-brass-soft" />}
            </button>
          );
        })}
      </div>

      {speakWord && (
        <div className="mt-8">
          <VocabSpeakPractice
            wordId={speakWord.id}
            word={speakWord.word}
            exampleSentence={speakWord.exampleSentence}
          />
          <button
            type="button"
            onClick={() => setSpeakWord(null)}
            className="mt-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Close speaking practice
          </button>
        </div>
      )}

      {words.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">{t("common.none")}</p>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {words.map((w, i) => (
            <article
              key={w.id}
              data-tour={i === 0 ? "vocab-first-card" : undefined}
              className="lounge-panel animate-rise p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-foreground">{w.word}</h2>
                  <p className="mt-0.5 text-sm text-brass-soft">{w.ipa}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void play(`"${w.word}"`)}
                    aria-label={t("common.listen")}
                    className="grid size-9 place-items-center rounded-full bg-surface-2 text-foreground ring-1 ring-border hover:bg-surface-3"
                  >
                    {/* Quoted so the AI voice reads exactly this word instead of treating a bare
                        greeting like "hello" as something to respond to conversationally. */}
                    <Volume2 className={speaking === `"${w.word}"` ? "size-4 animate-pulse text-brass" : "size-4"} />
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={() => void toggleKnown(w.id)}
                      aria-label={known[w.id] ? t("vocab.known") : t("vocab.learning")}
                      className={`grid size-9 place-items-center rounded-full ring-1 ring-border ${
                        known[w.id] ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:bg-surface-3"
                      }`}
                    >
                      <Check className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.1em] text-muted-foreground">
                {w.category} · {w.level}
              </p>

              <div className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">{t("vocab.definition")}</h3>
                <p className="mt-1 text-sm text-mist">{w.meaningEn}</p>
              </div>

              {localMeaning(w) && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                    {t("vocab.meaning", { language: languageName })}
                  </h3>
                  <p className="mt-1 text-sm text-mist">{localMeaning(w)}</p>
                </div>
              )}

              <div className="mt-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">{t("vocab.example")}</h3>
                <p className="mt-1 text-sm text-foreground">{w.exampleSentence}</p>
                {localExample(w) && <p className="mt-1 text-sm text-muted-foreground">{localExample(w)}</p>}
                <button
                  type="button"
                  onClick={() => void play(w.exampleSentence)}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border transition-colors",
                    speaking === w.exampleSentence
                      ? "bg-brass text-plum-deep shadow-brass"
                      : "bg-surface-2 text-foreground hover:bg-surface-3"
                  )}
                >
                  <Volume2 className={cn("size-3.5", speaking === w.exampleSentence && "animate-pulse")} />
                  {t("common.listen")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpeakWord(w);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="ml-2 mt-2 inline-flex items-center gap-1.5 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep"
                >
                  <Mic className="size-3.5" />
                  Use it in speaking
                </button>
              </div>

              {w.usageContext && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">{t("vocab.context")}</h3>
                  <p className="mt-1 text-sm text-mist">{w.usageContext}</p>
                </div>
              )}

              {(w.synonyms?.length > 0 || w.antonyms?.length > 0) && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {w.synonyms?.length > 0 && (
                    <p className="text-sm text-mist">
                      <span className="mr-2 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                        {t("vocab.synonyms")}
                      </span>
                      {w.synonyms.join(", ")}
                    </p>
                  )}
                  {w.antonyms?.length > 0 && (
                    <p className="text-sm text-mist">
                      <span className="mr-2 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                        {t("vocab.antonyms")}
                      </span>
                      {w.antonyms.join(", ")}
                    </p>
                  )}
                </div>
              )}

              <Link
                to="/pronunciation"
                className="mt-4 inline-block rounded-full bg-surface-2 px-4 py-2 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                {t("vocab.practicePron")}
              </Link>
            </article>
          ))}
        </div>
      )}

      {words.length > 0 && hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => setOffset(o => o + 50)}
            className="rounded-full bg-surface-2 px-6 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3 disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("common.loadMore")}
          </button>
        </div>
      )}

      <LockedContentList kind="vocabulary" />
    </AppShell>
  );
}
