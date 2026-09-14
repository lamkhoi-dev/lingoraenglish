import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/lily/app-shell";
import { useI18n } from "@/lib/i18n";
import { SectionHeading } from "@/components/lily/brand";
import { ShadowPractice } from "@/components/lily/shadow-practice";
import { useAuth } from "@/lib/auth";
import { getMyShadowingProgress, getShadowingSentences, getShadowingTopics } from "@/lib/shadowing.functions";
import {
  SHADOW_GROUP_BLURB_KEY,
  SHADOW_LEVEL_META,
  cefrOf,
  cefrRange,
  dialogueTurnsOf,
  SHADOW_MODES,
  SHADOW_SKILLS,
  SHADOW_STATUS_META,
  dailySet,
  sentenceHasSkill,
  statusOf,
  weakestSkill,
  SKILL_TO_PRON_LESSON,
  type ShadowMode,
  type ShadowProgressRow,
  type ShadowProgressStatus,
  type ShadowSentence,
  type ShadowSentenceLevel,
  type ShadowSkillId,
  type ShadowTopicOverview,
} from "@/lib/shadowing-content";
import { hreflangLinks } from "@/lib/seo";
import { cn } from "@/lib/utils";

const TITLE = "Shadowing Library — Lingora English";
const DESCRIPTION =
  "A progressive shadowing library: hundreds of natural English sentences per topic, from short beginner lines to advanced conversational English. Listen, shadow, record and get AI feedback.";

export const Route = createFileRoute("/shadowing")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: hreflangLinks("/shadowing"),
  }),
  component: ShadowingPage,
});

type StatusFilter = "all" | ShadowProgressStatus;

const STATUS_FILTERS: { id: StatusFilter; labelKey: string }[] = [
  { id: "all", labelKey: "shadow.status.all" },
  { id: "new", labelKey: "shadow.status.new" },
  { id: "in_progress", labelKey: "shadow.status.inProgress" },
  { id: "needs_practice", labelKey: "shadow.status.needsPractice" },
  { id: "strong", labelKey: "shadow.status.strong" },
  { id: "mastered", labelKey: "shadow.status.mastered" },
];

function ShadowingPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const fetchTopics = useServerFn(getShadowingTopics);
  const fetchSentences = useServerFn(getShadowingSentences);
  const fetchProgress = useServerFn(getMyShadowingProgress);
  const [topicSlug, setTopicSlug] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [mode, setMode] = useState<ShadowMode>("continue");
  const [level, setLevel] = useState<ShadowSentenceLevel | "all">("all");
  const [skill, setSkill] = useState<ShadowSkillId>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [access, setAccess] = useState<"all" | "free" | "premium">("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<Record<string, ShadowProgressRow>>({});


  const topicsQuery = useQuery({
    queryKey: ["shadowing-topics"],
    queryFn: (): Promise<ShadowTopicOverview[]> => fetchTopics() as unknown as Promise<ShadowTopicOverview[]>,
  });

  const topics = topicsQuery.data ?? [];
  const slug = topicSlug ?? topics[0]?.slug ?? null;
  const topic = topics.find((t) => t.slug === slug) ?? null;

  const sentencesQuery = useQuery({
    queryKey: ["shadowing-sentences", slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<ShadowSentence[]> => {
      const rows = await fetchSentences({ data: { topicSlug: slug! } });
      return rows.map((row) => ({
        ...(row as unknown as ShadowSentence),
        vocabulary: Array.isArray(row.vocabulary) ? (row.vocabulary as unknown as ShadowSentence["vocabulary"]) : [],
      }));
    },
  });

  const progressQuery = useQuery({
    queryKey: ["shadowing-progress", user?.id],
    enabled: Boolean(user),
    queryFn: (): Promise<ShadowProgressRow[]> => fetchProgress() as unknown as Promise<ShadowProgressRow[]>,
  });

  const sentences = sentencesQuery.data ?? [];

  const progress = useMemo(() => {
    const map = new Map<string, ShadowProgressRow>();
    for (const row of progressQuery.data ?? []) map.set(row.sentence_id, row);
    for (const row of Object.values(localProgress)) map.set(row.sentence_id, row);
    return map;
  }, [progressQuery.data, localProgress]);

  /** The working list: filters first, then the practice mode decides the order. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sentences.filter((s) => {
      if (level !== "all" && s.level !== level) return false;
      if (access === "free" && !s.is_free) return false;
      if (access === "premium" && s.is_free) return false;
      if (!sentenceHasSkill(s, skill)) return false;
      if (status !== "all" && statusOf(s.id, progress) !== status) return false;
      if (q && !s.sentence.toLowerCase().includes(q) && !s.tags.join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    if (mode === "review") list = list.filter((s) => statusOf(s.id, progress) === "needs_practice");
    if (mode === "mastered") list = list.filter((s) => statusOf(s.id, progress) === "mastered");
    if (mode === "random") list = [...list].sort(() => Math.random() - 0.5);
    if (mode === "continue") {
      const firstNew = list.findIndex((s) => statusOf(s.id, progress) === "new" || statusOf(s.id, progress) === "in_progress");
      if (firstNew > 0) list = [...list.slice(firstNew), ...list.slice(0, firstNew)];
    }
    return list;
  }, [sentences, level, access, skill, status, query, mode, progress]);


  const active = filtered.find((s) => s.id === activeId) ?? filtered[0] ?? null;
  const activeIndex = active ? filtered.findIndex((s) => s.id === active.id) : -1;

  const stats = useMemo(() => {
    const rows = sentences.map((s) => progress.get(s.id)).filter(Boolean) as ShadowProgressRow[];
    const scored = rows.filter((r) => r.last_accuracy !== null);
    return {
      practised: rows.length,
      mastered: rows.filter((r) => r.status === "mastered").length,
      needs: rows.filter((r) => r.status === "needs_practice").length,
      attempts: rows.reduce((n, r) => n + r.attempts, 0),
      minutes: Math.round(rows.reduce((n, r) => n + r.seconds_practised, 0) / 60),
      accuracy: scored.length
        ? Math.round(scored.reduce((n, r) => n + (r.last_accuracy ?? 0), 0) / scored.length)
        : null,
    };
  }, [sentences, progress]);

  const weakest = useMemo(() => weakestSkill(sentences, progress), [sentences, progress]);
  const today = useMemo(() => dailySet(sentences, progress, 8), [sentences, progress]);

  const groups = useMemo(() => {
    const map = new Map<string, ShadowTopicOverview[]>();
    for (const t of topics) {
      const list = map.get(t.topic_group) ?? [];
      list.push(t);
      map.set(t.topic_group, list);
    }
    return [...map.entries()];
  }, [topics]);

  const activeGroup = group ?? topics.find((t) => t.slug === slug)?.topic_group ?? groups[0]?.[0] ?? null;
  const groupTopics = groups.find(([g]) => g === activeGroup)?.[1] ?? [];

  return (
    <AppShell>
      <SectionHeading
        eyebrow={t("shadow.page.eyebrow")}
        title={t("shadow.page.title")}
        description={t("shadow.page.description")}
      />

      {/* Categories */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {groups.map(([g, list]) => {
          const total = list.reduce((n, t) => n + t.total_sentences, 0);
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={cn(
                "rounded-3xl p-5 text-left ring-1 transition-transform hover:-translate-y-0.5",
                g === activeGroup ? "bg-brass/15 ring-brass/40" : "bg-surface-2 ring-border hover:bg-surface-3",
              )}
            >
              <h2
                className={cn(
                  "font-display text-lg",
                  g === activeGroup ? "text-brass-soft" : "text-foreground",
                )}
              >
                {g}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {SHADOW_GROUP_BLURB_KEY[g] ? t(SHADOW_GROUP_BLURB_KEY[g] as never) : ""}
              </p>
              <p className="mt-3 text-xs font-semibold text-foreground">
                {t("shadow.groups.topicsCount", { count: list.length, total: total.toLocaleString() })}
              </p>
            </button>
          );
        })}
      </div>

      {/* Topics in the chosen category */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupTopics.map((gt) => (
          <button
            key={gt.slug}
            type="button"
            onClick={() => {
              setTopicSlug(gt.slug);
              setActiveId(null);
            }}
            className={cn(
              "rounded-2xl px-4 py-3 text-left ring-1 transition-transform hover:-translate-y-0.5",
              gt.slug === slug ? "bg-brass/15 ring-brass/40" : "bg-surface-2 ring-border hover:bg-surface-3",
            )}
          >
            <span
              className={cn(
                "block text-sm font-semibold",
                gt.slug === slug ? "text-brass-soft" : "text-foreground",
              )}
            >
              {gt.name}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("shadow.topics.sentencesCefr", { count: gt.total_sentences, range: cefrRange(gt.total_sentences) })}
            </span>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-soft">
              {t("shadow.topics.free", { count: gt.free_sentences })}
            </span>
          </button>
        ))}
        {topicsQuery.isLoading && <p className="text-sm text-muted-foreground">{t("shadow.topics.loading")}</p>}
      </div>


      {/* Progress */}
      {user && stats.practised > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: t("shadow.stats.practised"), value: `${stats.practised} / ${sentences.length}` },
            { label: t("shadow.stats.mastered"), value: String(stats.mastered) },
            { label: t("shadow.stats.needsPractice"), value: String(stats.needs) },
            { label: t("shadow.stats.recordings"), value: String(stats.attempts) },
            { label: t("shadow.stats.practiceTime"), value: t("shadow.stats.practiceTimeValue", { minutes: stats.minutes }) },
            { label: t("shadow.stats.pronunciation"), value: stats.accuracy === null ? "—" : `${stats.accuracy}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 font-display text-xl text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {weakest && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-brass/10 p-4 ring-1 ring-brass/30">
          <Sparkles className="size-4 text-brass-soft" />
          <p className="text-sm text-foreground">
            {t("shadow.weakest.notice", {
              skill: (SHADOW_SKILLS.find((s) => s.id === weakest)?.label ?? "").toLowerCase(),
            })}
          </p>
          <Link
            to="/pronunciation"
            search={{ skill: SKILL_TO_PRON_LESSON[weakest] } as never}
            className="rounded-full bg-brass px-4 py-2 text-xs font-semibold text-plum-deep"
          >
            {t("shadow.weakest.cta")}
          </Link>
        </div>
      )}

      {/* Today's shadowing */}
      {user && today.length > 0 && (
        <div className="mt-6 rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
          <h2 className="font-display text-base text-foreground">{t("shadow.today.heading")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("shadow.today.description")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {today.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                className="max-w-xs truncate rounded-full bg-surface-3 px-3 py-1.5 text-xs text-foreground ring-1 ring-border hover:bg-surface-2"
              >
                {SHADOW_STATUS_META[statusOf(s.id, progress)].icon}{" "}
                {s.sentence || t("shadow.today.sentenceFallback", { n: s.sort_order })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-8 grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2.5 ring-1 ring-border">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("shadow.filters.searchPlaceholder")}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as ShadowMode);
            setActiveId(null);
          }}
          className="rounded-full bg-surface-2 px-4 py-2.5 text-sm text-foreground ring-1 ring-border"
        >
          {SHADOW_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.labelKey as never)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLevel("all")}
          className={cn(
            "rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ring-border",
            level === "all" ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
          )}
        >
          {t("shadow.filters.allLevels")}
        </button>
        {SHADOW_LEVEL_META.map((l) => (
          <button
            key={l.id}
            type="button"
            title={t(l.blurbKey as never)}
            onClick={() => setLevel(l.id)}
            className={cn(
              "rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ring-border",
              level === l.id ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {l.dot} {t(l.labelKey as never)} · {l.range}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {([
          { id: "all", labelKey: "shadow.filters.allSentences" },
          { id: "free", labelKey: "shadow.filters.free" },
          { id: "premium", labelKey: "shadow.filters.premium" },
        ] as const).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAccess(a.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs ring-1 ring-border",
              access === a.id ? "bg-brass/20 text-brass-soft" : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(a.labelKey)}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">

        {SHADOW_SKILLS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSkill(s.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs ring-1 ring-border",
              skill === s.id ? "bg-plum-soft/20 text-brass-soft" : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(s.labelKey as never)}
          </button>
        ))}
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatus(s.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs ring-1 ring-border",
              status === s.id ? "bg-plum-soft/20 text-brass-soft" : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(s.labelKey as never)}
          </button>
        ))}
      </div>

      {/* List + practice */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="lounge-panel h-fit max-h-[70vh] overflow-y-auto p-3">
          <h2 className="px-1 font-display text-base text-foreground">
            {topic?.name ?? t("shadow.topics.fallbackName")}{" "}
            <span className="text-xs text-muted-foreground">({filtered.length})</span>
          </h2>
          {sentencesQuery.isLoading && (
            <p className="mt-3 px-1 text-sm text-muted-foreground">{t("shadow.list.loading")}</p>
          )}
          {!sentencesQuery.isLoading && filtered.length === 0 && (
            <p className="mt-3 px-1 text-sm text-muted-foreground">{t("shadow.list.empty")}</p>
          )}
          <ul className="mt-2 space-y-1">
            {filtered.map((s) => {
              const st = statusOf(s.id, progress);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 ring-border transition-colors",
                      active?.id === s.id ? "bg-brass/15 text-brass-soft" : "bg-surface-2 text-foreground hover:bg-surface-3",
                    )}
                  >
                    <span className="mt-0.5 w-9 shrink-0 text-xs text-muted-foreground">
                      {s.sort_order}/{sentences.length}
                    </span>
                    <span className="flex-1">
                      {s.unlocked ? s.sentence : t("shadow.list.premiumSentence")}
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {s.speaker_label && (
                          <span className="rounded-full bg-plum/15 px-1.5 py-0.5 font-semibold text-plum-soft">
                            💬 {s.speaker_label}
                          </span>
                        )}
                        <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-semibold text-brass-soft">
                          {cefrOf(s.level, s.sort_order)}
                        </span>
                        <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-semibold">
                          {s.is_free ? t("shadow.list.free") : t("shadow.list.premium")}
                        </span>
                        {s.unlocked ? t(SHADOW_STATUS_META[st].labelKey as never) : t("shadow.list.unlockWithPremium")}
                      </span>
                    </span>
                    {!s.unlocked && <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}

                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="space-y-6">
          {!active && !sentencesQuery.isLoading && (
            <div className="lounge-panel p-6 text-sm text-muted-foreground">
              {t("shadow.empty.pickSentence")}
            </div>
          )}

          {active && active.unlocked && (
            <ShadowPractice
              sentence={active}
              progress={progress.get(active.id)}
              dialogueTurns={dialogueTurnsOf(sentences, active)}
              position={t("shadow.position.sentence", {
                n: active.sort_order,
                total: topic?.total_sentences ?? sentences.length,
                cefr: cefrOf(active.level, active.sort_order),
                access: active.is_free ? t("shadow.list.free") : t("shadow.list.premium"),
              })}
              onSaved={(row) => setLocalProgress((p) => ({ ...p, [row.sentence_id]: row }))}
              onNext={() => {
                const next = filtered[activeIndex + 1];
                if (next) setActiveId(next.id);
              }}
            />
          )}

          {active && !active.unlocked && (
            <div className="lounge-panel p-6 text-center">
              <Lock className="mx-auto size-6 text-brass-soft" />
              <h3 className="mt-3 font-display text-xl text-foreground">
                {t("shadow.locked.title", { count: topic?.free_sentences ?? 10 })}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                {t("shadow.locked.description", { total: topic?.total_sentences ?? 100 })}
              </p>

              <Link
                to="/pricing"
                className="mt-5 inline-flex rounded-full bg-brass px-6 py-3 text-sm font-semibold text-plum-deep shadow-brass"
              >
                {t("shadow.locked.cta")}
              </Link>
              {!user && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("shadow.locked.alreadyMember")}{" "}
                  <Link to="/auth" className="text-brass-soft hover:text-brass">
                    {t("shadow.locked.signIn")}
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
