import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Headphones, Lock, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import {
  DontWorryCard,
  HowDoesThisWorkButton,
  HowItWorksGuide,
  useGuidePreference,
} from "@/components/lily/listening-guide";
import { ListeningLessonView } from "@/components/lily/listening-lesson";
import { useI18n } from "@/lib/i18n";

import { useAuth } from "@/lib/auth";
import { getListeningCatalogue, getListeningLesson, getMyListeningProgress } from "@/lib/listening.functions";
import {
  DURATION_FILTERS,
  LISTENING_CATEGORIES,
  LISTENING_LEVELS,
  difficultyKey,
  formatDuration,
  formatMinutes,
  recommendations,
  type ListeningLesson,
  type ListeningLessonCard,
  type ListeningLevel,
  type ListeningProgressRow,
} from "@/lib/listening-content";
import { hreflangLinks } from "@/lib/seo";
import { cn } from "@/lib/utils";

const TITLE = "Listening Lab — Lingora English";
const DESCRIPTION =
  "Train your ears to understand real English. Listen to realistic conversations, test your comprehension, and practise dictation on the English people actually use.";

export const Route = createFileRoute("/listening-lab")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: hreflangLinks("/listening-lab"),
  }),
  component: ListeningLabPage,
});

type StatusFilter = "all" | "new" | "in_progress" | "completed";

function ListeningLabPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { hidden, setHidden } = useGuidePreference();
  const fetchCatalogue = useServerFn(getListeningCatalogue);
  const fetchProgress = useServerFn(getMyListeningProgress);
  const fetchLesson = useServerFn(getListeningLesson);
  const [showGuide, setShowGuide] = useState(false);
  const [level, setLevel] = useState<ListeningLevel | "all">("all");

  const [category, setCategory] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<"all" | "gentle" | "steady" | "fast">("all");
  const [duration, setDuration] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<Record<string, ListeningProgressRow>>({});

  /** First-time learners see the full guide; after that it stays collapsed. */
  useEffect(() => {
    if (hidden === false) setShowGuide(true);
  }, [hidden]);



  const cardsQuery = useQuery({
    queryKey: ["listening-catalogue"],
    queryFn: (): Promise<ListeningLessonCard[]> => fetchCatalogue() as unknown as Promise<ListeningLessonCard[]>,
  });

  const progressQuery = useQuery({
    queryKey: ["listening-progress", user?.id],
    enabled: Boolean(user),
    queryFn: (): Promise<ListeningProgressRow[]> => fetchProgress() as unknown as Promise<ListeningProgressRow[]>,
  });

  const cards = cardsQuery.data ?? [];

  const progress = useMemo(() => {
    const map = new Map<string, ListeningProgressRow>();
    for (const row of progressQuery.data ?? []) map.set(row.lesson_id, row);
    for (const row of Object.values(localProgress)) map.set(row.lesson_id, row);
    return map;
  }, [progressQuery.data, localProgress]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (level !== "all" && card.level !== level) return false;
      if (category !== "all" && card.category !== category) return false;
      if (difficulty === "gentle" && card.difficulty > 3) return false;
      if (difficulty === "steady" && (card.difficulty < 4 || card.difficulty > 6)) return false;
      if (difficulty === "fast" && card.difficulty < 7) return false;
      if (duration === "short" && card.duration_seconds >= 45) return false;
      if (duration === "medium" && (card.duration_seconds < 45 || card.duration_seconds > 90)) return false;
      if (duration === "long" && card.duration_seconds <= 90) return false;
      const row = progress.get(card.id);
      if (status === "completed" && !row?.completed_at) return false;
      if (status === "in_progress" && (!row || row.completed_at)) return false;
      if (status === "new" && row) return false;
      if (q && !`${card.title} ${card.topic} ${card.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, category, difficulty, duration, level, progress, query, status]);

  const openCard = cards.find((c) => c.id === openId) ?? null;

  const lessonQuery = useQuery({
    queryKey: ["listening-lesson", openId],
    enabled: Boolean(openId && openCard?.unlocked),
    queryFn: (): Promise<ListeningLesson | null> =>
      fetchLesson({ data: { id: openId! } }) as unknown as Promise<ListeningLesson | null>,
  });

  /* ------------------------------ progress stats ----------------------------- */

  const done = cards.filter((c) => progress.get(c.id)?.completed_at);
  const avg = (values: (number | null | undefined)[]) => {
    const nums = values.filter((v): v is number => typeof v === "number");
    if (!nums.length) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  };
  const comprehensionAvg = avg(done.map((c) => progress.get(c.id)?.comprehension_score));
  const dictationAvg = avg(done.map((c) => progress.get(c.id)?.dictation_score));
  const overallAvg = avg(done.map((c) => progress.get(c.id)?.overall_score));
  const secondsListened = [...progress.values()].reduce((sum, row) => sum + (row.seconds_listened ?? 0), 0);
  const weakAreas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of progress.values()) {
      for (const area of row.weak_areas ?? []) counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label);
  }, [progress]);

  const advice = useMemo(() => recommendations(cards, progress), [cards, progress]);

  const nextLesson = () => {
    if (!openCard) return;
    const at = cards.findIndex((c) => c.id === openCard.id);
    const next = cards.slice(at + 1).find((c) => c.unlocked);
    setOpenId(next?.id ?? null);
  };

  return (
    <AppShell>
      <SectionHeading
        eyebrow={t("listen.page.eyebrow")}
        title={t("listen.page.title")}
        description={t("listen.page.description")}
      />

      {openCard && openCard.unlocked ? (
        <div className="mt-8">
          {lessonQuery.isLoading && <p className="text-sm text-muted-foreground">{t("listen.loadingLesson")}</p>}
          {lessonQuery.data && (
            <ListeningLessonView
              lesson={lessonQuery.data}
              onBack={() => setOpenId(null)}
              onNext={nextLesson}
              onSaved={(row) => setLocalProgress((prev) => ({ ...prev, [row.lesson_id]: row }))}
            />
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            {showGuide ? (
              <HowItWorksGuide
                onStart={() => setShowGuide(false)}
                startLabel={t("listen.guide.gotIt")}
                defaultOpen
                hidden={Boolean(hidden)}
                onHiddenChange={(value) => {
                  setHidden(value);
                  if (value) setShowGuide(false);
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <HowDoesThisWorkButton onClick={() => setShowGuide(true)} />
                <span className="text-xs text-muted-foreground">
                  {t("listen.guide.strategyHint")}
                </span>
              </div>
            )}
            <DontWorryCard />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">

            <div className="lounge-panel p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-full bg-brass/15 text-brass-soft">
                  <Headphones className="size-4" />
                </span>
                <h2 className="font-display text-lg text-foreground">{t("listen.progress.title")}</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {[
                  { label: t("listen.progress.lessonsCompleted"), value: `${done.length} / ${cards.length}` },
                  { label: t("listen.progress.comprehension"), value: `${comprehensionAvg}%` },
                  { label: t("listen.progress.dictation"), value: `${dictationAvg}%` },
                  { label: t("listen.progress.listeningTime"), value: formatMinutes(secondsListened) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-surface-2/70 p-3.5 ring-1 ring-border">
                    <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 font-display text-xl text-brass-soft">{stat.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("listen.progress.overallScore")} <span className="text-foreground">{overallAvg}%</span>
                {weakAreas.length ? t("listen.progress.weakAreas", { areas: weakAreas.join(", ") }) : ""}
              </p>
            </div>

            <div className="lounge-panel p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brass-soft" />
                <h2 className="font-display text-lg text-foreground">{t("listen.next.title")}</h2>
              </div>
              <p className="mt-2 text-sm text-mist">{advice.message}</p>
              <div className="mt-3 grid gap-2">
                {advice.lessons.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setOpenId(card.id)}
                    className="rounded-xl bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                  >
                    {card.level} · {card.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* filters */}
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              {[{ id: "all" as const, key: "listen.filter.allLevels" as const }, ...LISTENING_LEVELS.map((l) => ({ id: l.id, key: `listen.level.${l.id}` as const }))].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLevel(item.id as ListeningLevel | "all")}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ring-border",
                    level === item.id ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(item.key as never)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {["all", ...LISTENING_CATEGORIES].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 ring-border",
                    category === item ? "bg-brass/20 text-brass-soft" : "bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "all" ? t("listen.filter.allTopics") : item}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
                className="rounded-full bg-surface-2 px-3 py-2 text-xs text-foreground ring-1 ring-border"
                aria-label={t("listen.filter.difficultyLabel")}
              >
                <option value="all">{t("listen.filter.anyDifficulty")}</option>
                <option value="gentle">{t("listen.filter.gentle")}</option>
                <option value="steady">{t("listen.filter.steady")}</option>
                <option value="fast">{t("listen.filter.fast")}</option>
              </select>

              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="rounded-full bg-surface-2 px-3 py-2 text-xs text-foreground ring-1 ring-border"
                aria-label={t("listen.filter.durationLabel")}
              >
                {DURATION_FILTERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(`listen.filter.duration.${item.id}` as never)}
                  </option>
                ))}
              </select>

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
                className="rounded-full bg-surface-2 px-3 py-2 text-xs text-foreground ring-1 ring-border"
                aria-label={t("listen.filter.statusLabel")}
              >
                <option value="all">{t("listen.filter.status.all")}</option>
                <option value="new">{t("listen.filter.status.new")}</option>
                <option value="in_progress">{t("listen.filter.status.in_progress")}</option>
                <option value="completed">{t("listen.filter.status.completed")}</option>
              </select>

              <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full bg-surface-2 px-3 py-2 ring-1 ring-border">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("listen.filter.searchPlaceholder")}
                  className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
          </div>

          {/* lesson cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cardsQuery.isLoading && <p className="text-sm text-muted-foreground">{t("listen.loadingLibrary")}</p>}
            {!cardsQuery.isLoading && !filtered.length && (
              <p className="text-sm text-muted-foreground">{t("listen.noMatches")}</p>
            )}
            {filtered.map((card) => {
              const row = progress.get(card.id);
              return (
                <article key={card.id} className="lounge-panel flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base text-foreground">{card.title}</h3>
                    {card.unlocked ? (
                      card.is_free ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                          {t("listen.card.free")}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-brass/15 px-2.5 py-1 text-[10px] font-semibold text-brass-soft">
                          {t("listen.card.premium")}
                        </span>
                      )
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
                        <Lock className="size-3" /> {t("listen.card.premium")}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {card.level} · {card.category} · {card.topic}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`listen.difficulty.${difficultyKey(card.difficulty)}` as never)} · {formatDuration(card.duration_seconds)} ·{" "}
                    {t("listen.card.questionsAndDictation", { questions: card.question_count, dictation: card.dictation_count })}
                  </p>

                  <p className="mt-3 text-xs">
                    {row?.completed_at ? (
                      <span className="text-emerald-300">
                        {t("listen.card.completed", { score: row.overall_score ?? 0 })}
                      </span>
                    ) : row ? (
                      <span className="text-brass-soft">{t("listen.card.inProgress")}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("listen.card.notStarted")}</span>
                    )}
                  </p>

                  <div className="mt-4">
                    {card.unlocked ? (
                      <button
                        type="button"
                        onClick={() => setOpenId(card.id)}
                        className="w-full rounded-full bg-brass px-4 py-2.5 text-sm font-semibold text-plum-deep shadow-brass"
                      >
                        {t("listen.card.start")}
                      </button>
                    ) : (
                      <Link
                        to="/pricing"
                        className="block w-full rounded-full bg-surface-2 px-4 py-2.5 text-center text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                      >
                        {t("listen.card.unlockPremium")}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {!user && (
            <p className="mt-6 text-sm text-muted-foreground">
              <Link to="/auth" className="text-brass-soft hover:text-brass">
                {t("listen.signIn")}
              </Link>{" "}
              {t("listen.signInToPlaySave")}
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}
