import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Lock, Search, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { FeatureTour, ViewGuideButton, useFeatureTour } from "@/components/lily/feature-tour";
import { PremiumBadge } from "@/components/lily/paywall";
import { PronPractice } from "@/components/lily/pron-practice";
import { ScoreBar } from "@/components/lily/score-panel";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { speak } from "@/lib/lily.functions";
import {
  getMyPronunciationProgress,
  getPronunciationFreeCounts,
  getSkillLessonsCatalogue,
  getSoundsCatalogue,
  type SkillLessonCatalogueEntry,
  type SoundCatalogueEntry,
} from "@/lib/pronunciation.functions";
import {
  PHONEME_GROUPS,
  SKILLS,
  type Accent,
  type Difficulty,
  type PronLevel,
  type SkillId,
} from "@/lib/pronunciation-content";
import { canonicalLink } from "@/lib/seo";
import { getWordIpa } from "@/lib/word-ipa";
import { voicePlayer } from "@/lib/voice-player";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/locales/en";

const TITLE = "Pronunciation Coach — 44 sounds, stress, intonation & connected speech";
const DESCRIPTION =
  "Train every English sound plus word stress, sentence stress, intonation, connected speech, reductions, rhythm, chunking and fluency. Listen, record and get honest AI feedback.";

export const Route = createFileRoute("/pronunciation")({
  validateSearch: (search: Record<string, unknown>): { sound?: string; skill?: string } => ({
    ...(typeof search["sound"] === "string" ? { sound: search["sound"] } : {}),
    ...(typeof search["skill"] === "string" ? { skill: search["skill"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [canonicalLink("/pronunciation")],
  }),
  component: PronunciationPage,
});

const LEVELS: { id: PronLevel | "all"; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "pron.filter.allLevels" },
  { id: "beginner", labelKey: "pron.filter.beginner" },
  { id: "intermediate", labelKey: "pron.filter.intermediate" },
  { id: "advanced", labelKey: "pron.filter.advanced" },
];

const DIFFICULTIES: { id: Difficulty | "all"; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "pron.filter.allDifficulties" },
  { id: "easy", labelKey: "pron.filter.gentle" },
  { id: "medium", labelKey: "pron.filter.steady" },
  { id: "hard", labelKey: "pron.filter.challenging" },
];

const ACCENTS: { id: Accent; labelKey: TranslationKey }[] = [
  { id: "us", labelKey: "pron.filter.us" },
  { id: "uk", labelKey: "pron.filter.uk" },
];

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-border transition-colors",
        active ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Simple, honest mouth/tongue diagram driven by the phoneme group. */
function MouthDiagram({ sound }: { sound: SoundCatalogueEntry }) {
  const vowel = sound.group === "short-vowel" || sound.group === "long-vowel" || sound.group === "diphthong";
  const front = ["fricative", "affricate", "plosive"].includes(sound.group);
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-full" role="img" aria-label={`Mouth position for ${sound.symbol}`}>
      <path d="M20 20 Q100 0 180 30 L180 40 Q100 20 24 42 Z" fill="currentColor" className="text-plum-soft/40" />
      <path d="M20 120 Q100 140 180 110 L180 100 Q100 120 24 98 Z" fill="currentColor" className="text-plum-soft/40" />
      <rect x="150" y="40" width="8" height="12" rx="2" className="fill-mist/70" />
      <rect x="150" y="88" width="8" height="12" rx="2" className="fill-mist/70" />
      <path
        d={
          vowel
            ? sound.group === "long-vowel"
              ? "M40 92 Q90 60 150 74"
              : "M40 94 Q95 78 150 84"
            : front
              ? "M40 96 Q100 88 156 54"
              : "M40 96 Q80 92 120 60"
        }
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        className="text-brass"
      />
      <text x="10" y="14" className="fill-current text-[10px] text-muted-foreground">
        lips
      </text>
      <text x="150" y="132" className="fill-current text-[10px] text-muted-foreground">
        tongue
      </text>
    </svg>
  );
}

type Progress = {
  overall: number | null;
  bySkill: Partial<Record<SkillId, number>>;
  weakSounds: string[];
  masteredSounds: Set<string>;
};

function PronunciationPage() {
  const { sound: requestedSound, skill: requestedSkill } = Route.useSearch();
  const { t, locale } = useI18n();
  // Lesson texts (explain / points / caution / item notes) live in English on
  // the lesson row; other languages come from the shared i18n store under
  // "pronlesson.<lessonId>|<part>". t() returns the key itself when nothing
  // is stored, which is the signal to show the English text instead.
  // Level / difficulty are stored as English words (beginner · easy); show them
  // through the same labels the filters already use. Unknown values stay as-is.
  const LEVEL_LABEL: Record<string, TranslationKey> = {
    beginner: "pron.filter.beginner",
    intermediate: "pron.filter.intermediate",
    advanced: "pron.filter.advanced",
  };
  const DIFF_LABEL: Record<string, TranslationKey> = {
    easy: "pron.filter.gentle",
    medium: "pron.filter.steady",
    hard: "pron.filter.challenging",
  };
  const levelLabel = (v: string) => (LEVEL_LABEL[v] ? t(LEVEL_LABEL[v]) : v);
  const diffLabel = (v: string) => (DIFF_LABEL[v] ? t(DIFF_LABEL[v]) : v);
  const lessonText = (lessonId: string, part: string, english: string) => {
    const key = `pronlesson.${lessonId}|${part}`;
    const v = t(key as never);
    return v === key ? english : v;
  };
  const { user } = useAuth();
  const getMyPronunciationProgressFn = useServerFn(getMyPronunciationProgress);
  const getSoundsCatalogueFn = useServerFn(getSoundsCatalogue);
  const getSkillLessonsCatalogueFn = useServerFn(getSkillLessonsCatalogue);
  const getPronunciationFreeCountsFn = useServerFn(getPronunciationFreeCounts);
  const requestSpeech = useServerFn(speak);

  const [skill, setSkill] = useState<SkillId>("sounds");
  const [level, setLevel] = useState<PronLevel | "all">("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [accent, setAccent] = useState<Accent>("us");
  const [query, setQuery] = useState("");
  const [sounds, setSounds] = useState<SoundCatalogueEntry[]>([]);
  const [skillLessons, setSkillLessons] = useState<SkillLessonCatalogueEntry[]>([]);
  const [freeCounts, setFreeCounts] = useState({ sounds: 3, lessonsPerSkill: 5, totalSounds: 44 });
  const [soundSymbol, setSoundSymbol] = useState<string | null>(null);
  const [wordTarget, setWordTarget] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({
    overall: null,
    bySkill: {},
    weakSounds: [],
    masteredSounds: new Set(),
  });

  const soundCache = useRef(new Map<string, string>());

  const playSoundModel = async (textToPlay: string, label: string) => {
    if (!user) {
      toast.error(t("pron.toast.signInModel"));
      return;
    }
    voicePlayer.prime();
    try {
      if (playingSound === label) {
        voicePlayer.stop();
        setPlayingSound(null);
        return;
      }
      setPlayingSound(label);
      let src = soundCache.current.get(textToPlay);
      if (!src) {
        let lastErr: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await requestSpeech({ data: { text: textToPlay, voice: "shimmer" } });
            src = `data:${res.mime};base64,${res.audioBase64}`;
            soundCache.current.set(textToPlay, src);
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
          }
        }
        if (!src) throw lastErr;
      }
      await voicePlayer.playRaw(src, { rate: 0.85, label });
      setPlayingSound(null);
    } catch (error) {
      setPlayingSound(null);
      toast.error(t("pron.toast.playError"));
    }
  };

  /* Redacted server-side per learner's tier — see getSoundsCatalogue. */
  useEffect(() => {
    let alive = true;
    void getSoundsCatalogueFn().then((rows) => {
      if (!alive) return;
      setSounds(rows);
      setSoundSymbol((current) => current ?? rows[0]?.symbol ?? null);
    });
    return () => {
      alive = false;
    };
  }, [getSoundsCatalogueFn]);

  /* Redacted server-side per learner's tier — see getSkillLessonsCatalogue. */
  useEffect(() => {
    let alive = true;
    void getSkillLessonsCatalogueFn().then((rows) => {
      if (!alive) return;
      setSkillLessons(rows);
    });
    return () => {
      alive = false;
    };
  }, [getSkillLessonsCatalogueFn]);

  useEffect(() => {
    let alive = true;
    void getPronunciationFreeCountsFn().then((counts) => {
      if (alive) setFreeCounts(counts);
    });
    return () => {
      alive = false;
    };
  }, [getPronunciationFreeCountsFn]);

  /* deep links from the coach or shadowing: ?sound=/θ/ or ?skill=intonation */
  useEffect(() => {
    if (requestedSkill && SKILLS.some((s) => s.id === requestedSkill)) setSkill(requestedSkill as SkillId);
  }, [requestedSkill]);

  useEffect(() => {
    if (!requestedSound || sounds.length === 0) return;
    const clean = `/${requestedSound.replaceAll("/", "").trim()}/`;
    const found = sounds.find((p) => p.symbol === clean || p.usSymbol === clean);
    if (found) {
      setSkill("sounds");
      setSoundSymbol(found.symbol);
      setWordTarget(null);
    }
  }, [requestedSound, sounds]);

  /* real progress from the learner's own recorded attempts */
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const { attempts, scores } = await getMyPronunciationProgressFn();
      if (!alive) return;
      const buckets = new Map<string, number[]>();
      for (const row of attempts) {
        if (row.accuracy === null) continue;
        const list = buckets.get(row.mode) ?? [];
        list.push(row.accuracy);
        buckets.set(row.mode, list);
      }
      const bySkill: Partial<Record<SkillId, number>> = {};
      for (const [mode, values] of buckets) {
        if (!SKILLS.some((s) => s.id === mode)) continue;
        bySkill[mode as SkillId] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      }
      const all = [...buckets.values()].flat();
      const weakSounds = scores
        .filter((s) => s.score < 80)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((s) => s.sound);
      const masteredSounds = new Set(scores.filter((s) => s.mastered).map((s) => s.sound));
      setProgress({
        overall: all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null,
        bySkill,
        weakSounds,
        masteredSounds,
      });
    })();
    return () => {
      alive = false;
    };
  }, [user, getMyPronunciationProgressFn]);

  const sound = sounds.find((p) => p.symbol === soundSymbol) ?? sounds[0] ?? null;

  const matchesFilters = (item: { level: string; difficulty: string }) =>
    (level === "all" || item.level === level) && (difficulty === "all" || item.difficulty === difficulty);

  // Sounds are never split by Level or Difficulty (Yêu cầu 5: "Không chia
  // thành nhiều Level riêng nữa. Tất cả 44 âm nằm chung trong: Sounds") —
  // only search applies here; the Level/Difficulty filters below are for
  // skill lessons only.
  const filteredSounds = useMemo(
    () =>
      sounds.filter(
        (p) =>
          query.trim() === "" ||
          [p.symbol, p.usSymbol ?? "", p.name, ...p.words.map((w) => w.word)]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [sounds, query],
  );

  const lessons = useMemo(
    () =>
      skillLessons.filter(
        (l) =>
          l.skill === skill &&
          matchesFilters(l) &&
          (query.trim() === "" ||
            [l.title, l.explain, ...l.items.map((i) => i.text)].join(" ").toLowerCase().includes(query.toLowerCase())),
      ),
    [skillLessons, difficulty, level, query, skill],
  );

  const lesson: SkillLessonCatalogueEntry | null =
    skill === "sounds" ? null : (skillLessons.find((l) => l.id === lessonId) ?? lessons[0] ?? null);
  const item = lesson?.items[Math.min(itemIndex, lesson.items.length - 1)] ?? null;

  const accentSymbol = sound ? (accent === "us" ? (sound.usSymbol ?? sound.symbol) : sound.symbol) : "";
  const accentLabel = accent === "us" ? t("pron.filter.us") : t("pron.filter.uk");

  const recommended = useMemo(() => {
    const entries = SKILLS.filter((s) => s.id !== "sounds").map((s) => ({
      id: s.id,
      labelKey: s.labelKey,
      label: s.label,
      score: progress.bySkill[s.id] ?? null,
    }));
    const scored = entries.filter((e) => e.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    const untouched = entries.filter((e) => e.score === null);
    return [...scored.slice(0, 2), ...untouched.slice(0, 2)].slice(0, 3);
  }, [progress.bySkill]);

  // Reductions: the point is saying the casual form, which lives in
  // `pattern` ("I dunno.") — `text` is the full sentence ("I don't know.").
  // So that's what Listen plays and what the recording is scored against
  // (analysePronunciation accepts a reductions item's pattern as target).
  // Every other skill's `pattern` is stress/pitch notation, not a sentence.
  const reducedForm = skill === "reductions" && item?.pattern && item.pattern !== item.text ? item.pattern : null;

  const practiceTarget =
    skill === "sounds"
      ? (wordTarget ?? sound?.words[0]?.word ?? sound?.sentences[0] ?? "")
      : (reducedForm ?? item?.text ?? "");

  // Only set when practiceTarget is one of this sound's own example words (not
  // a sentence or minimal pair already selected) — Listen then models
  // "sound, word, sentence containing that word" instead of just the word.
  const wordSentence =
    skill === "sounds" ? sound?.words.find((w) => w.word === practiceTarget)?.sentence : undefined;

  const tour = useFeatureTour(
    "pronunciation",
    [
      {
        target: '[data-tour="pron-skills"]',
        title: t("tour.pron.step1.title"),
        content: t("tour.pron.step1.content"),
        placement: "auto",
      },
      {
        target: '[data-tour="pron-sound-grid"]',
        title: t("tour.pron.step2.title"),
        content: t("tour.pron.step2.content"),
        placement: "auto",
      },
      {
        target: '[data-tour="pron-practice-panel"]',
        title: t("tour.pron.step3.title"),
        content: t("tour.pron.step3.content"),
        placement: "auto",
      },
    ],
    skill === "sounds" && Boolean(sound) && Boolean(practiceTarget),
  );

  return (
    <AppShell>
      <FeatureTour run={tour.run} steps={tour.steps} handleEvent={tour.handleEvent} />
      <div className="grid items-center gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            eyebrow={t("nav.pronunciation")}
            title={t("pron.hero.title")}
            description={t("pron.hero.description", { count: String(freeCounts.totalSounds) })}
          />
          <ViewGuideButton onClick={tour.restart} />
        </div>
        <div className="hidden lg:block overflow-hidden rounded-3xl border border-border shadow-lg">
          <img
            src="/images/pronunciation-guide.jpg"
            alt={t("pron.imageAlt")}
            className="h-44 w-full object-cover transition-transform duration-500 hover:scale-105"
          />
        </div>
      </div>

      {/* ------------------------------- dashboard ------------------------------ */}
      <section className="lounge-panel mt-8 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg text-foreground">{t("pron.progress.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {user
                ? t("pron.progress.descUser")
                : t("pron.progress.descGuest")}
            </p>
          </div>
          <div className="font-display text-4xl text-brass-soft">
            {progress.overall === null ? <span className="text-2xl text-muted-foreground">—</span> : `${progress.overall}%`}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SKILLS.map((s) => (
            <ScoreBar key={s.id} label={`${s.icon} ${t(s.labelKey)}`} value={progress.bySkill[s.id] ?? null} max={100} />
          ))}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">{t("pron.recommended")}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {recommended.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSkill(r.id);
                  setLessonId(null);
                  setItemIndex(0);
                }}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                {t(r.labelKey)}
                {r.score !== null && <span className="ml-1.5 text-brass-soft">{r.score}%</span>}
              </button>
            ))}
            {progress.weakSounds.map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => {
                  setSkill("sounds");
                  setSoundSymbol(symbol);
                  setWordTarget(null);
                }}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
              >
                {t("pron.soundLabel", { symbol })}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------- filters ------------------------------ */}
      <div className="mt-8 space-y-3">
        <div data-tour="pron-skills" className="flex flex-wrap gap-2">
          {SKILLS.map((s) => (
            <Pill
              key={s.id}
              active={skill === s.id}
              onClick={() => {
                setSkill(s.id);
                setLessonId(null);
                setItemIndex(0);
              }}
            >
              <span className="mr-1">{s.icon}</span>
              {t(s.labelKey)}
            </Pill>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-2 ring-1 ring-border">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pron.filter.searchPlaceholder")}
              className="w-52 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {skill !== "sounds" &&
            LEVELS.map((l) => (
              <Pill key={l.id} active={level === l.id} onClick={() => setLevel(l.id)}>
                {t(l.labelKey)}
              </Pill>
            ))}
          {skill !== "sounds" &&
            DIFFICULTIES.map((d) => (
              <Pill key={d.id} active={difficulty === d.id} onClick={() => setDifficulty(d.id)}>
                {t(d.labelKey)}
              </Pill>
            ))}
          {ACCENTS.map((a) => (
            <Pill key={a.id} active={accent === a.id} onClick={() => setAccent(a.id)}>
              {t(a.labelKey)}
            </Pill>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {skill === "sounds" ? (
            <>
              {/* sound cards grouped by family */}
              <section data-tour="pron-sound-grid" className="lounge-panel p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg text-foreground">
                    {t("pron.sounds.title", { count: String(freeCounts.totalSounds) })}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {t("pron.sounds.shown", { count: String(filteredSounds.length) })}
                  </span>
                </div>
                <div className="mt-4 space-y-4">
                  {PHONEME_GROUPS.map((group) => {
                    const list = filteredSounds.filter((p) => p.group === group.id);
                    if (!list.length) return null;
                    return (
                      <div key={group.id}>
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                          {group.family} · {group.label}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {list.map((p) => (
                            <button
                              key={p.symbol}
                              type="button"
                              onClick={() => {
                                setSoundSymbol(p.symbol);
                                setWordTarget(null);
                              }}
                              className={cn(
                                "min-w-12 rounded-lg px-2.5 py-2 font-display text-sm ring-1 ring-border transition-colors",
                                p.symbol === sound?.symbol
                                  ? "bg-brass text-plum-deep"
                                  : "bg-surface-2 text-mist hover:bg-surface-3",
                                !p.unlocked && "opacity-60",
                              )}
                            >
                              <span className="inline-flex items-center gap-1">
                                {accent === "us" ? (p.usSymbol ?? p.symbol) : p.symbol}
                                {!p.unlocked && <Lock className="size-3" />}
                                {p.unlocked && progress.masteredSounds.has(accent === "us" ? (p.usSymbol ?? p.symbol) : p.symbol) && (
                                  <CheckCircle2 className="size-3 text-brass" />
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* the selected sound's full lesson */}
              {!sound ? (
                <section className="lounge-panel p-5 sm:p-6">
                  <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                </section>
              ) : (
                <section className="lounge-panel p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-2xl text-foreground">
                        {accentSymbol} <span className="text-lg text-muted-foreground">— {sound.name}</span>
                      </h2>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                        {sound.voiced ? t("pron.voicedDesc") : t("pron.voicelessDesc")} ·{" "}
                        {levelLabel(sound.level)} · {diffLabel(sound.difficulty)} · {accentLabel}
                      </p>
                    </div>
                    {!sound.unlocked && <PremiumBadge />}
                  </div>

                  {sound.unlocked && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      {t("pron.soundPracticeHint")}
                    </p>
                  )}

                  {!sound.unlocked ? (
                    <div className="mt-5 rounded-xl bg-surface-2 p-5 text-center ring-1 ring-border">
                      <p className="text-sm text-foreground">
                        {t("pron.paywall.soundLocked")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("pron.paywall.freeLimit", { count: String(freeCounts.sounds) })}
                      </p>
                      <Link
                        to="/pricing"
                        className="mt-4 inline-flex rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass"
                      >
                        {t("pron.paywall.unlockAllSounds")}
                      </Link>
                    </div>
                  ) : (
                    <>
                      <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-foreground ring-1 ring-border">
                        <span className="mr-2 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                          {t("pron.how")}
                        </span>
                        {sound.how}
                      </p>

                      {sound.usSymbol && (
                        <p className="mt-3 text-xs text-plum-soft">
                          British {sound.symbol} · American {sound.usSymbol}
                          {sound.accentNote ? ` — ${sound.accentNote}` : ""}
                        </p>
                      )}
                      {!sound.usSymbol && sound.accentNote && (
                        <p className="mt-3 text-xs text-plum-soft">{sound.accentNote}</p>
                      )}

                      <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr]">
                        <div className="rounded-xl bg-surface-2 p-3 text-brass ring-1 ring-border">
                          <MouthDiagram sound={sound} />
                        </div>
                        <dl className="grid gap-3 text-sm sm:grid-cols-2">
                          {[
                            ["Lips", sound.lips],
                            ["Teeth", sound.teeth],
                            ["Tongue", sound.tongue],
                            ["Jaw", sound.jaw],
                          ].map(([label, text]) => (
                            <div key={label}>
                              <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">{label}</dt>
                              <dd className="mt-1 text-mist">{text}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <div className="mt-5">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-plum-soft">
                          {t("pron.commonMistakes")}
                        </h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist">
                          {sound.mistakes.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                            {t("pron.wordPractice")}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {t("pron.wordPracticeHint")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {sound.words.map((w) => {
                            const ipa = getWordIpa(w.word);
                            const isActive = practiceTarget === w.word;
                            return (
                              <button
                                key={w.word}
                                type="button"
                                onClick={() => {
                                  setWordTarget(w.word);
                                  playSoundModel(w.word, `word-${w.word}`);
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-border transition-colors",
                                  isActive
                                    ? "bg-brass text-plum-deep shadow-brass font-medium"
                                    : "bg-surface-2 text-foreground hover:bg-surface-3",
                                )}
                              >
                                <Volume2
                                  className={cn(
                                    "size-3",
                                    playingSound === `word-${w.word}`
                                      ? "text-plum-deep animate-pulse"
                                      : "text-muted-foreground",
                                  )}
                                />
                                <span className="font-medium">{w.word}</span>
                                {ipa && (
                                  <span
                                    className={cn(
                                      "font-mono text-xs",
                                      isActive ? "text-plum-deep/80" : "text-brass-soft",
                                    )}
                                  >
                                    /{ipa}/
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {wordSentence && (
                          <p className="mt-2 text-sm text-mist">
                            {t("pron.eg")}
                            {wordSentence}
                          </p>
                        )}
                      </div>

                      <div className="mt-5">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                          {t("pron.sentencePractice")}
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {sound.sentences.map((s) => (
                            <li key={s} className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm text-mist">{s}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => playSoundModel(s, `sentence-${s}`)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-border transition",
                                    playingSound === `sentence-${s}` ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <Volume2 className="size-3" />
                                  {playingSound === `sentence-${s}` ? t("pron.playing") : t("pron.listen")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setWordTarget(s)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border",
                                    practiceTarget === s ? "bg-brass text-plum-deep" : "bg-surface-2 text-foreground hover:bg-surface-3"
                                  )}
                                >
                                  {t("pron.practise")}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-5">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                          {t("pron.minimalPairs")}
                        </h3>
                        <ul className="mt-2 space-y-2">
                          {sound.pairs.map((pair) => (
                            <li key={pair.contrast + pair.a} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-display text-base text-foreground">
                                  {pair.a} <span className="text-muted-foreground">/</span> {pair.b}
                                </p>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-brass-soft">{pair.contrast}</span>
                                  <button
                                    type="button"
                                    onClick={() => setWordTarget(`${pair.a}. ${pair.b}.`)}
                                    className="rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep hover:bg-brass-soft"
                                  >
                                    {t("pron.practise")}
                                  </button>
                                </div>
                              </div>
                              <p className="mt-1.5 text-sm text-mist">{pair.note}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          ) : (
            <>
              <section className="lounge-panel p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg text-foreground">
                    {SKILLS.find((s) => s.id === skill)?.icon}{" "}
                    {t(SKILLS.find((s) => s.id === skill)?.labelKey ?? "pron.skill.sounds")}{" "}
                    {t("pron.lessons.title", { skill: "" }).trim()}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {t("pron.sounds.shown", { count: String(lessons.length) })}
                  </span>
                </div>
                {lessons.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("pron.lessons.none")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {lessons.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLessonId(l.id);
                        setItemIndex(0);
                      }}
                      className={cn(
                        "rounded-xl px-3 py-2 text-left text-sm ring-1 ring-border transition-colors",
                        l.id === lesson?.id ? "bg-brass text-plum-deep shadow-brass font-medium" : "bg-surface-2 text-foreground hover:bg-surface-3",
                        !l.unlocked && "opacity-60",
                        l.title === "Practice" && l.id !== lesson?.id && "border-brass/40 bg-brass/10 hover:bg-brass/20",
                      )}
                    >
                      <span className="flex items-center gap-1.5 font-semibold">
                        {l.title === "Practice" ? (
                          <span className="inline-flex items-center gap-1 text-brass-soft font-bold">
                            🎯 Practice
                          </span>
                        ) : (
                          lessonText(l.id, "title", l.title)
                        )}
                        {!l.unlocked && <Lock className="size-3" />}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs opacity-80">
                        {l.title === "Practice" ? (
                          <span className="font-semibold text-brass-soft">
                            {t("pron.drillsCount", { count: "50" })}
                          </span>
                        ) : (
                          `${levelLabel(l.level)} · ${diffLabel(l.difficulty)}`
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {lesson && (
                <section className="lounge-panel p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="font-display text-2xl text-foreground">{lessonText(lesson.id, "title", lesson.title)}</h2>
                    {!lesson.unlocked && <PremiumBadge />}
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                    {levelLabel(lesson.level)} · {diffLabel(lesson.difficulty)} ·{" "}
                    {lesson.accent === "us" ? t("pron.filter.us") : t("pron.filter.uk")}
                  </p>

                  {!lesson.unlocked ? (
                    <div className="mt-5 rounded-xl bg-surface-2 p-5 text-center ring-1 ring-border">
                      <p className="text-sm text-foreground">
                        {t("pron.paywall.lessonLocked")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("pron.paywall.lessonFreeLimit", { count: String(freeCounts.lessonsPerSkill) })}
                      </p>
                      <Link
                        to="/pricing"
                        className="mt-4 inline-flex rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep shadow-brass"
                      >
                        {t("pron.paywall.unlockAllLessons")}
                      </Link>
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 text-sm leading-relaxed text-mist">{lessonText(lesson.id, "explain", lesson.explain)}</p>

                      <ul className="mt-4 flex flex-wrap gap-2">
                        {lesson.points.map((p, pi) => (
                          <li
                            key={p}
                            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-foreground ring-1 ring-border"
                          >
                            {lessonText(lesson.id, `point|${pi}`, p)}
                          </li>
                        ))}
                      </ul>

                      {lesson.caution && (
                        <p className="mt-4 rounded-xl bg-plum/15 p-3 text-xs leading-relaxed text-plum-soft ring-1 ring-border">
                          {lessonText(lesson.id, "caution", lesson.caution)}
                        </p>
                      )}

                      <div className="mt-5 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                          {t("pron.practise")} ({lesson.items.length})
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          {t("pron.itemPracticeHint")}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2 max-h-[700px] overflow-y-auto pr-1">
                        {lesson.items.map((it, i) => {
                          const itemIpa = getWordIpa(it.text);
                          const isSelected = i === itemIndex;
                          return (
                            <button
                              key={it.text + i}
                              type="button"
                              onClick={() => setItemIndex(i)}
                              className={cn(
                                "block w-full rounded-xl px-4 py-3 text-left ring-1 ring-border transition-colors",
                                isSelected ? "bg-brass/15 ring-brass/50 shadow-xs" : "bg-surface-2 hover:bg-surface-3",
                              )}
                            >
                              <div className="flex items-start gap-2.5">
                                <span
                                  className={cn(
                                    "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-mono font-bold mt-0.5",
                                    isSelected ? "bg-brass text-plum-deep" : "bg-surface-3 text-muted-foreground",
                                  )}
                                >
                                  {i + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="block text-sm font-medium text-foreground">{it.text}</span>
                                    {itemIpa && (
                                      <span className="font-mono text-xs text-brass-soft">
                                        /{itemIpa}/
                                      </span>
                                    )}
                                  </div>
                                  {it.pattern && (
                                    <span className="mt-1 block text-sm font-semibold tracking-wide text-brass-soft">
                                      {it.pattern}
                                    </span>
                                  )}
                                  {it.note && (
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                      {lessonText(lesson.id, `note|${i}`, it.note)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      to="/shadowing"
                      className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                    >
                      {t("pron.useInShadowing")}
                    </Link>
                    <Link
                      to="/ai-speaking"
                      className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                    >
                      {t("pron.backToCoach")}
                    </Link>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside data-tour="pron-practice-panel" className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {practiceTarget && (
            <PronPractice
              key={`${skill}-${practiceTarget}`}
              target={practiceTarget}
              targetSound={skill === "sounds" ? accentSymbol : undefined}
              wordSentence={wordSentence}
              mode={skill}
              lessonId={skill === "sounds" ? undefined : (lesson?.id ?? undefined)}
              pattern={skill === "sounds" ? undefined : reducedForm ? item?.text : (item?.pattern ?? undefined)}
              accentLabel={skill === "sounds" ? accentLabel : lesson?.accent === "uk" ? t("pron.filter.uk") : t("pron.filter.us")}
              initialMastered={skill === "sounds" ? progress.masteredSounds.has(accentSymbol) : undefined}
              onSoundMastered={(soundKey, mastered) =>
                setProgress((p) => {
                  const next = new Set(p.masteredSounds);
                  if (mastered) next.add(soundKey);
                  else next.delete(soundKey);
                  return { ...p, masteredSounds: next };
                })
              }
            />
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("pron.practiceHint")}
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
