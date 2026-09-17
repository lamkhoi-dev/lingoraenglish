import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminListShadowSentences,
  adminListShadowTopics,
  adminSaveShadowDialogue,
  adminSaveShadowSentence,
  adminSaveShadowTopic,
  adminSetShadowTopicActive,
  adminUpdateShadowSentence,
} from "@/lib/shadowing-admin.functions";
import { cn } from "@/lib/utils";

type TopicRow = {
  id: string;
  slug: string;
  name: string;
  topic_group: string;
  blurb: string;
  sort_order: number;
  is_active: boolean;
  total_sentences: number;
  free_sentences: number;
};

type SentenceRow = {
  id: string;
  sort_order: number;
  level: string;
  difficulty: number;
  sentence: string;
  is_free: boolean;
  audio_url: string;
  status: string;
  dialogue_id: string | null;
  speaker_label: string;
};

const LEVELS = ["beginner", "elementary", "intermediate", "advanced"] as const;
const VOICES = ["shimmer", "nova", "alloy", "coral", "sage"] as const;

type DraftTurn = { speaker_label: string; speaker_voice: (typeof VOICES)[number]; sentence: string; is_free: boolean };

const emptyTurn = (voice: (typeof VOICES)[number]): DraftTurn => ({
  speaker_label: "",
  speaker_voice: voice,
  sentence: "",
  is_free: false,
});

/** Admin control for the shadowing library: categories, topics and sentences. */
export function AdminShadowingPanel() {
  const listTopics = useServerFn(adminListShadowTopics);
  const saveTopic = useServerFn(adminSaveShadowTopic);
  const setActive = useServerFn(adminSetShadowTopicActive);
  const listSentences = useServerFn(adminListShadowSentences);
  const saveSentence = useServerFn(adminSaveShadowSentence);
  const updateSentence = useServerFn(adminUpdateShadowSentence);
  const saveDialogue = useServerFn(adminSaveShadowDialogue);

  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sentences, setSentences] = useState<SentenceRow[]>([]);
  const [sentencesLoading, setSentencesLoading] = useState(false);
  const [newTopic, setNewTopic] = useState({ name: "", slug: "", topic_group: "Everyday English" });
  const [newSentence, setNewSentence] = useState("");
  const [dialogueOpenFor, setDialogueOpenFor] = useState<string | null>(null);
  const [dialogueLevel, setDialogueLevel] = useState<(typeof LEVELS)[number]>("beginner");
  const [dialogueTurns, setDialogueTurns] = useState<DraftTurn[]>([emptyTurn("shimmer"), emptyTurn("nova")]);
  const [savingDialogue, setSavingDialogue] = useState(false);

  const refreshTopics = useCallback(() => {
    setLoading(true);
    void listTopics({ data: undefined as never })
      .then((rows) => setTopics(rows as unknown as TopicRow[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load topics"))
      .finally(() => setLoading(false));
  }, [listTopics]);

  useEffect(refreshTopics, [refreshTopics]);

  const openTopic = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setSentencesLoading(true);
    void listSentences({ data: { topic_id: id } })
      .then((rows) => setSentences(rows as unknown as SentenceRow[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load sentences"))
      .finally(() => setSentencesLoading(false));
  };

  const patch = async (row: SentenceRow, fields: Partial<SentenceRow>) => {
    try {
      await updateSentence({ data: { id: row.id, ...fields } as never });
      setSentences((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...fields } : r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const addTopic = async () => {
    if (!newTopic.name.trim() || !newTopic.slug.trim()) return;
    try {
      await saveTopic({
        data: {
          name: newTopic.name.trim(),
          slug: newTopic.slug.trim().toLowerCase(),
          topic_group: newTopic.topic_group,
          blurb: "",
          sort_order: topics.length + 1,
          is_active: true,
        },
      });
      setNewTopic({ name: "", slug: "", topic_group: newTopic.topic_group });
      toast.success("Topic added");
      refreshTopics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the topic");
    }
  };

  const addSentence = async (topic: TopicRow) => {
    if (!newSentence.trim()) return;
    const next = (sentences.at(-1)?.sort_order ?? 0) + 1;
    try {
      await saveSentence({
        data: {
          topic_id: topic.id,
          sentence: newSentence.trim(),
          level: next <= 25 ? "beginner" : next <= 50 ? "elementary" : next <= 75 ? "intermediate" : "advanced",
          difficulty: next <= 25 ? 1 : next <= 50 ? 2 : next <= 75 ? 3 : 4,
          sort_order: next,
          is_free: next <= topic.free_sentences,
        } as never,
      });
      setNewSentence("");
      toast.success("Sentence added");
      openTopic(topic.id);
      openTopic(topic.id);
      refreshTopics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the sentence");
    }
  };

  const saveDraftDialogue = async (topic: TopicRow) => {
    const turns = dialogueTurns.filter((turn) => turn.speaker_label.trim() && turn.sentence.trim());
    if (turns.length < 2) {
      toast.error("A dialogue needs at least 2 turns with a speaker and a line.");
      return;
    }
    setSavingDialogue(true);
    try {
      await saveDialogue({
        data: {
          topic_id: topic.id,
          level: dialogueLevel,
          difficulty: dialogueLevel === "beginner" ? 1 : dialogueLevel === "elementary" ? 2 : dialogueLevel === "intermediate" ? 3 : 4,
          turns: turns.map((turn) => ({
            speaker_label: turn.speaker_label.trim(),
            speaker_voice: turn.speaker_voice,
            sentence: turn.sentence.trim(),
            is_free: turn.is_free,
          })),
        },
      });
      toast.success(`Dialogue saved (${turns.length} turns)`);
      setDialogueTurns([emptyTurn("shimmer"), emptyTurn("nova")]);
      setDialogueOpenFor(null);
      openTopic(topic.id);
      openTopic(topic.id);
      refreshTopics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the dialogue");
    } finally {
      setSavingDialogue(false);
    }
  };

  const groups = [...new Set(topics.map((t) => t.topic_group))];

  return (
    <div className="space-y-6">
      <div className="lounge-panel p-5">
        <h3 className="font-display text-lg text-foreground">Add a shadowing topic</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            value={newTopic.name}
            onChange={(e) => setNewTopic((t) => ({ ...t, name: e.target.value }))}
            placeholder="Topic name"
            className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border"
          />
          <input
            value={newTopic.slug}
            onChange={(e) => setNewTopic((t) => ({ ...t, slug: e.target.value }))}
            placeholder="slug-like-this"
            className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border"
          />
          <input
            value={newTopic.topic_group}
            onChange={(e) => setNewTopic((t) => ({ ...t, topic_group: e.target.value }))}
            placeholder="Category"
            list="shadow-groups"
            className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border"
          />
          <datalist id="shadow-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => void addTopic()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brass px-4 py-2 text-sm font-semibold text-plum-deep"
          >
            <Plus className="size-4" /> Add topic
          </button>
        </div>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading the library…
        </p>
      )}

      {groups.map((g) => (
        <div key={g} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brass-soft">{g}</h3>
          {topics
            .filter((t) => t.topic_group === g)
            .map((t) => (
              <div key={t.id} className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openTopic(t.id)}
                    className="flex-1 text-left text-sm font-semibold text-foreground"
                  >
                    {t.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t.total_sentences} sentences · {t.free_sentences} free · #{t.sort_order}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void setActive({ data: { id: t.id, is_active: !t.is_active } })
                        .then(() => {
                          setTopics((prev) =>
                            prev.map((r) => (r.id === t.id ? { ...r, is_active: !r.is_active } : r)),
                          );
                        })
                        .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"))
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border",
                      t.is_active ? "bg-brass/20 text-brass-soft" : "bg-surface-3 text-muted-foreground",
                    )}
                  >
                    {t.is_active ? "Visible" : "Hidden"}
                  </button>
                </div>

                {openId === t.id && (
                  <div className="mt-4 space-y-2">
                    {sentencesLoading && <p className="text-xs text-muted-foreground">Loading sentences…</p>}
                    <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                      {sentences.map((s) => (
                        <div
                          key={s.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-3 px-3 py-2 text-xs"
                        >
                          {s.speaker_label && (
                            <span className="rounded-full bg-plum/15 px-2 py-1 font-semibold text-plum-soft">
                              💬 {s.speaker_label}
                            </span>
                          )}
                          <input
                            type="number"
                            defaultValue={s.sort_order}
                            onBlur={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isNaN(n) && n !== s.sort_order) void patch(s, { sort_order: n });
                            }}
                            className="w-14 rounded-lg bg-surface-2 px-2 py-1 text-foreground ring-1 ring-border"
                          />
                          <input
                            defaultValue={s.sentence}
                            onBlur={(e) => {
                              if (e.target.value.trim() && e.target.value !== s.sentence)
                                void patch(s, { sentence: e.target.value.trim() });
                            }}
                            className="min-w-[200px] flex-1 rounded-lg bg-surface-2 px-2 py-1 text-foreground ring-1 ring-border"
                          />
                          <select
                            value={s.level}
                            onChange={(e) => void patch(s, { level: e.target.value })}
                            className="rounded-lg bg-surface-2 px-2 py-1 text-foreground ring-1 ring-border"
                          >
                            {LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <input
                            defaultValue={s.audio_url}
                            placeholder="audio URL"
                            onBlur={(e) => {
                              if (e.target.value !== s.audio_url) void patch(s, { audio_url: e.target.value });
                            }}
                            className="w-32 rounded-lg bg-surface-2 px-2 py-1 text-foreground ring-1 ring-border"
                          />
                          <button
                            type="button"
                            onClick={() => void patch(s, { is_free: !s.is_free })}
                            className={cn(
                              "rounded-full px-2 py-1 font-semibold ring-1 ring-border",
                              s.is_free ? "bg-brass/20 text-brass-soft" : "text-muted-foreground",
                            )}
                          >
                            {s.is_free ? "FREE" : "PREMIUM"}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newSentence}
                        onChange={(e) => setNewSentence(e.target.value)}
                        placeholder="New sentence…"
                        className="flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border"
                      />
                      <button
                        type="button"
                        onClick={() => void addSentence(t)}
                        className="rounded-xl bg-brass px-4 py-2 text-sm font-semibold text-plum-deep"
                      >
                        Add
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDialogueOpenFor(dialogueOpenFor === t.id ? null : t.id)}
                      className="text-xs font-semibold text-brass-soft hover:text-brass"
                    >
                      {dialogueOpenFor === t.id ? "Cancel dialogue" : "💬 Compose a dialogue (2+ speakers)"}
                    </button>

                    {dialogueOpenFor === t.id && (
                      <div className="space-y-2 rounded-xl bg-surface-3 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Level for the whole dialogue:</span>
                          <select
                            value={dialogueLevel}
                            onChange={(e) => setDialogueLevel(e.target.value as (typeof LEVELS)[number])}
                            className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-foreground ring-1 ring-border"
                          >
                            {LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>

                        {dialogueTurns.map((turn, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <input
                              value={turn.speaker_label}
                              onChange={(e) =>
                                setDialogueTurns((prev) =>
                                  prev.map((tr, j) => (j === i ? { ...tr, speaker_label: e.target.value } : tr)),
                                )
                              }
                              placeholder="Speaker (e.g. Waiter)"
                              className="w-36 rounded-lg bg-surface-2 px-2 py-1 text-xs text-foreground ring-1 ring-border"
                            />
                            <select
                              value={turn.speaker_voice}
                              onChange={(e) =>
                                setDialogueTurns((prev) =>
                                  prev.map((tr, j) =>
                                    j === i ? { ...tr, speaker_voice: e.target.value as (typeof VOICES)[number] } : tr,
                                  ),
                                )
                              }
                              className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-foreground ring-1 ring-border"
                            >
                              {VOICES.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                            <input
                              value={turn.sentence}
                              onChange={(e) =>
                                setDialogueTurns((prev) =>
                                  prev.map((tr, j) => (j === i ? { ...tr, sentence: e.target.value } : tr)),
                                )
                              }
                              placeholder="Line this speaker says…"
                              className="min-w-[200px] flex-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-foreground ring-1 ring-border"
                            />
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={turn.is_free}
                                onChange={(e) =>
                                  setDialogueTurns((prev) =>
                                    prev.map((tr, j) => (j === i ? { ...tr, is_free: e.target.checked } : tr)),
                                  )
                                }
                              />
                              Free
                            </label>
                            <button
                              type="button"
                              onClick={() => setDialogueTurns((prev) => prev.filter((_, j) => j !== i))}
                              disabled={dialogueTurns.length <= 2}
                              className="rounded-lg p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDialogueTurns((prev) => [
                                ...prev,
                                emptyTurn(prev.length % 2 === 0 ? "shimmer" : "nova"),
                              ])
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border"
                          >
                            <Plus className="size-3.5" /> Add turn
                          </button>
                          <button
                            type="button"
                            disabled={savingDialogue}
                            onClick={() => void saveDraftDialogue(t)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep disabled:opacity-50"
                          >
                            {savingDialogue && <Loader2 className="size-3.5 animate-spin" />}
                            Save dialogue
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
