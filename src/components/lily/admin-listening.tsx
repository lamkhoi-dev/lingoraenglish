import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminListListeningLessons,
  adminSaveListeningLesson,
  adminSetListeningLessonStatus,
} from "@/lib/listening-admin.functions";
import { cn } from "@/lib/utils";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const ACCENTS = ["american", "british", "canadian", "australian"] as const;

type ScriptLine = { speaker: string; line: string };
type LessonRow = {
  id: string;
  slug: string;
  title: string;
  level: string;
  category: string;
  topic: string;
  difficulty: number;
  duration_seconds: number;
  accent: string;
  script: ScriptLine[];
  questions: unknown[];
  dictation: unknown[];
  connected_speech: unknown[];
  is_free: boolean;
  sort_order: number;
  status: string;
};
type Tally = Record<string, { total: number; free: number }>;

type Draft = {
  slug: string;
  title: string;
  level: (typeof LEVELS)[number];
  topic: string;
  difficulty: number;
  durationSeconds: number;
  accent: (typeof ACCENTS)[number];
  script: ScriptLine[];
  questionsJson: string;
  dictationJson: string;
  connectedSpeechJson: string;
};

const emptyDraft = (): Draft => ({
  slug: "",
  title: "",
  level: "A1",
  topic: "",
  difficulty: 1,
  durationSeconds: 30,
  accent: "american",
  script: [{ speaker: "", line: "" }],
  questionsJson: "[]",
  dictationJson: "[]",
  connectedSpeechJson: "[]",
});

const toDraft = (l: LessonRow): Draft => ({
  slug: l.slug,
  title: l.title,
  level: (LEVELS as readonly string[]).includes(l.level) ? (l.level as Draft["level"]) : "A1",
  topic: l.topic,
  difficulty: l.difficulty,
  durationSeconds: l.duration_seconds,
  accent: (ACCENTS as readonly string[]).includes(l.accent)
    ? (l.accent as Draft["accent"])
    : "american",
  script: l.script.length ? l.script : [{ speaker: "", line: "" }],
  questionsJson: JSON.stringify(l.questions ?? [], null, 2),
  dictationJson: JSON.stringify(l.dictation ?? [], null, 2),
  connectedSpeechJson: JSON.stringify(l.connected_speech ?? [], null, 2),
});

/**
 * Listening Lab library editor (mục 4.3). Script lines get a proper row editor;
 * questions/dictation/connected-speech stay as JSON because each entry is a
 * nested shape with its own enums — the server validates them with zod, so a
 * malformed paste is refused with a readable message instead of silently
 * breaking the lesson at practice time.
 */
export function AdminListeningPanel() {
  const listLessons = useServerFn(adminListListeningLessons);
  const saveLesson = useServerFn(adminSaveListeningLesson);
  const setStatus = useServerFn(adminSetListeningLessonStatus);

  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [tally, setTally] = useState<Tally>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void listLessons({ data: undefined as never })
      .then((res) => {
        setLessons(res.lessons as unknown as LessonRow[]);
        setTally(res.tally as Tally);
        setCategories([...res.categories]);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load lessons"))
      .finally(() => setLoading(false));
  }, [listLessons]);

  useEffect(refresh, [refresh]);

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const save = async (category: string, existing: LessonRow | null) => {
    if (!draft.title.trim() || !draft.slug.trim()) {
      toast.error("Slug and title are required.");
      return;
    }
    const lines = draft.script.filter((s) => s.speaker.trim() && s.line.trim());
    if (lines.length === 0) {
      toast.error("At least one script line is required.");
      return;
    }

    let questions: unknown;
    let dictation: unknown;
    let connectedSpeech: unknown;
    try {
      questions = JSON.parse(draft.questionsJson || "[]");
      dictation = JSON.parse(draft.dictationJson || "[]");
      connectedSpeech = JSON.parse(draft.connectedSpeechJson || "[]");
    } catch {
      toast.error("Questions / dictation / connected speech must be valid JSON.");
      return;
    }

    setSaving(true);
    try {
      const inCategory = lessons.filter((l) => l.category === category);
      await saveLesson({
        data: {
          id: existing?.id,
          slug: draft.slug.trim(),
          title: draft.title.trim(),
          level: draft.level,
          category: category as never,
          topic: draft.topic.trim(),
          difficulty: draft.difficulty,
          duration_seconds: draft.durationSeconds,
          accent: draft.accent,
          script: lines.map((s) => ({ speaker: s.speaker.trim(), line: s.line.trim() })),
          questions: questions as never,
          dictation: dictation as never,
          connected_speech: connectedSpeech as never,
          sort_order: existing?.sort_order ?? inCategory.length + 1,
          status: (existing?.status as "published" | "draft") ?? "published",
        },
      });
      toast.success(existing ? "Lesson updated." : "Lesson added.");
      cancelEdit();
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the lesson");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (lesson: LessonRow) => {
    const next = lesson.status === "published" ? "draft" : "published";
    try {
      await setStatus({ data: { id: lesson.id, status: next } });
      toast.success(next === "draft" ? "Lesson hidden." : "Lesson published.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not change the status");
    }
  };

  const field =
    "w-full rounded-lg bg-surface-3 px-2 py-1.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass";

  const renderForm = (category: string, existing: LessonRow | null) => (
    <div className="mt-3 rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Slug
          <input
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Title
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Topic
          <input
            value={draft.topic}
            onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Level
          <select
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: e.target.value as Draft["level"] })}
            className={field}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Accent
          <select
            value={draft.accent}
            onChange={(e) => setDraft({ ...draft, accent: e.target.value as Draft["accent"] })}
            className={field}
          >
            {ACCENTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Difficulty (1-5)
          <input
            type="number"
            min={1}
            max={5}
            value={draft.difficulty}
            onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Duration (seconds)
          <input
            type="number"
            min={5}
            max={1800}
            value={draft.durationSeconds}
            onChange={(e) => setDraft({ ...draft, durationSeconds: Number(e.target.value) })}
            className={field}
          />
        </label>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-brass-soft">
            Script
          </span>
          <button
            type="button"
            onClick={() =>
              setDraft({ ...draft, script: [...draft.script, { speaker: "", line: "" }] })
            }
            className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-xs text-foreground ring-1 ring-border"
          >
            <Plus className="size-3" /> Line
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {draft.script.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder="Speaker"
                value={line.speaker}
                onChange={(e) => {
                  const next = [...draft.script];
                  next[i] = { ...next[i]!, speaker: e.target.value };
                  setDraft({ ...draft, script: next });
                }}
                className={cn(field, "w-32 shrink-0")}
              />
              <input
                placeholder="Line"
                value={line.line}
                onChange={(e) => {
                  const next = [...draft.script];
                  next[i] = { ...next[i]!, line: e.target.value };
                  setDraft({ ...draft, script: next });
                }}
                className={field}
              />
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, script: draft.script.filter((_, j) => j !== i) })
                }
                className="shrink-0 rounded-lg px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {(
        [
          ["Questions (JSON)", "questionsJson"],
          ["Dictation (JSON)", "dictationJson"],
          ["Connected speech (JSON)", "connectedSpeechJson"],
        ] as const
      ).map(([label, key]) => (
        <label key={key} className="mt-4 block text-xs text-muted-foreground">
          {label}
          <textarea
            rows={5}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            className={cn(field, "font-mono text-xs")}
          />
        </label>
      ))}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(category, existing)}
          className="rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep disabled:opacity-60"
        >
          {saving ? "Saving…" : existing ? "Save changes" : "Add lesson"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className="rounded-full bg-surface-3 px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="lounge-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">Listening Lab</h2>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Free/paid split is set in the Plans tab (listening_free_categories), not here.
      </p>

      <div className="mt-4 space-y-2">
        {categories.map((category) => {
          const rows = lessons.filter((l) => l.category === category);
          const count = tally[category] ?? { total: 0, free: 0 };
          const open = openCategory === category;
          return (
            <div key={category} className="rounded-xl bg-surface-2/50 ring-1 ring-border">
              <button
                type="button"
                onClick={() => setOpenCategory(open ? null : category)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-foreground">{category}</span>
                <span className="text-xs text-muted-foreground">
                  {count.total} lessons · {count.free} free
                </span>
              </button>

              {open && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId("new");
                      setDraft(emptyDraft());
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep"
                  >
                    <Plus className="size-3.5" /> New lesson
                  </button>

                  {editingId === "new" && renderForm(category, null)}

                  <ul className="mt-3 space-y-2">
                    {rows.map((lesson) => (
                      <li
                        key={lesson.id}
                        className="rounded-lg bg-surface-3/50 p-3 ring-1 ring-border"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">
                              {lesson.title}{" "}
                              <span className="text-xs text-muted-foreground">
                                · {lesson.level} · {lesson.script.length} lines
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {lesson.slug}
                              {lesson.is_free ? " · free" : ""}
                              {lesson.status !== "published" ? " · hidden" : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(lesson.id);
                                setDraft(toDraft(lesson));
                              }}
                              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-foreground ring-1 ring-border"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleStatus(lesson)}
                              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-foreground ring-1 ring-border"
                            >
                              {lesson.status === "published" ? "Hide" : "Publish"}
                            </button>
                          </div>
                        </div>
                        {editingId === lesson.id && renderForm(category, lesson)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
