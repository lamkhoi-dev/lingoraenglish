import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminListPronunciationLessons,
  adminSavePronunciationLesson,
  adminSetPronunciationFreeCount,
  adminSetPronunciationLessonStatus,
} from "@/lib/pronunciation-admin.functions";
import { cn } from "@/lib/utils";

const SKILLS = [
  { id: "word-stress", label: "Word stress" },
  { id: "sentence-stress", label: "Sentence stress" },
  { id: "intonation", label: "Intonation" },
  { id: "connected-speech", label: "Connected speech" },
  { id: "reductions", label: "Reductions" },
  { id: "rhythm", label: "Rhythm" },
  { id: "chunking", label: "Pausing & chunking" },
  { id: "fluency", label: "Fluency" },
] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const ACCENTS = ["us", "uk"] as const;

type Item = { text: string; pattern?: string; note?: string };
type LessonRow = {
  id: string;
  skill: string;
  title: string;
  level: string;
  difficulty: string;
  accent: string;
  explain: string;
  points: string[];
  items: Item[];
  caution: string;
  is_free: boolean;
  sort_order: number;
  status: string;
};
type Tally = Record<string, { total: number; free: number }>;

type Draft = {
  title: string;
  level: (typeof LEVELS)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  accent: (typeof ACCENTS)[number];
  explain: string;
  pointsText: string;
  items: Item[];
  caution: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  level: "beginner",
  difficulty: "easy",
  accent: "us",
  explain: "",
  pointsText: "",
  items: [{ text: "" }],
  caution: "",
});

const toDraft = (l: LessonRow): Draft => ({
  title: l.title,
  level: l.level as Draft["level"],
  difficulty: l.difficulty as Draft["difficulty"],
  accent: l.accent as Draft["accent"],
  explain: l.explain,
  pointsText: l.points.join(", "),
  items: l.items.length ? l.items : [{ text: "" }],
  caution: l.caution,
});

/** Admin control for the Pronunciation "advanced skills" library — same
 * inline-accordion pattern as AdminShadowingPanel, grouped by the 8 fixed
 * skill ids instead of a dynamic topics table. */
export function AdminPronunciationPanel() {
  const listLessons = useServerFn(adminListPronunciationLessons);
  const saveLesson = useServerFn(adminSavePronunciationLesson);
  const setStatus = useServerFn(adminSetPronunciationLessonStatus);
  const setFreeCount = useServerFn(adminSetPronunciationFreeCount);

  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [tally, setTally] = useState<Tally>({});
  const [loading, setLoading] = useState(false);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void listLessons({ data: undefined as never })
      .then((res) => {
        setLessons(res.lessons as unknown as LessonRow[]);
        setTally(res.tally as Tally);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load lessons"))
      .finally(() => setLoading(false));
  }, [listLessons]);

  useEffect(refresh, [refresh]);

  const startEdit = (lesson: LessonRow) => {
    setEditingId(lesson.id);
    setDraft(toDraft(lesson));
  };

  const startNew = (skill: string) => {
    setOpenSkill(skill);
    setEditingId("new");
    setDraft(emptyDraft());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const save = async (skill: string, existing: LessonRow | null) => {
    if (!draft.title.trim() || draft.items.every((it) => !it.text.trim())) {
      toast.error("A title and at least one item are required.");
      return;
    }
    setSaving(true);
    try {
      const skillLessons = lessons.filter((l) => l.skill === skill);
      const sortOrder = existing?.sort_order ?? skillLessons.length + 1;
      await saveLesson({
        data: {
          id: existing?.id,
          skill: skill as (typeof SKILLS)[number]["id"],
          title: draft.title.trim(),
          level: draft.level,
          difficulty: draft.difficulty,
          accent: draft.accent,
          explain: draft.explain.trim(),
          points: draft.pointsText
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          items: draft.items
            .filter((it) => it.text.trim())
            .map((it) => ({
              text: it.text.trim(),
              ...(it.pattern?.trim() ? { pattern: it.pattern.trim() } : {}),
              ...(it.note?.trim() ? { note: it.note.trim() } : {}),
            })),
          caution: draft.caution.trim(),
          is_free: existing?.is_free ?? false,
          sort_order: sortOrder,
          status: "published",
        },
      });
      toast.success(existing ? "Lesson updated" : "Lesson added");
      cancelEdit();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the lesson");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (lesson: LessonRow) => {
    const nextStatus = lesson.status === "published" ? "draft" : "published";
    try {
      await setStatus({ data: { id: lesson.id, status: nextStatus } });
      setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, status: nextStatus } : l)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const updateItem = (index: number, fields: Partial<Item>) => {
    setDraft((d) => ({ ...d, items: d.items.map((it, i) => (i === index ? { ...it, ...fields } : it)) }));
  };

  return (
    <div className="space-y-4">
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading the library…
        </p>
      )}

      {SKILLS.map((skill) => {
        const skillLessons = lessons.filter((l) => l.skill === skill.id);
        const t = tally[skill.id] ?? { total: 0, free: 0 };
        const open = openSkill === skill.id;
        return (
          <div key={skill.id} className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenSkill(open ? null : skill.id)}
                className="flex-1 text-left text-sm font-semibold text-foreground"
              >
                {skill.label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t.total} lessons · {t.free} free (target: 50, 5 free)
                </span>
              </button>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                Free
                <input
                  type="number"
                  min={0}
                  defaultValue={t.free}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isNaN(n) || n === t.free) return;
                    void setFreeCount({ data: { skill: skill.id, free_count: n } })
                      .then(() => {
                        toast.success("Free preview updated");
                        refresh();
                      })
                      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not update"));
                  }}
                  className="w-16 rounded-lg bg-surface-3 px-2 py-1 text-xs text-foreground ring-1 ring-border"
                />
              </label>
            </div>

            {open && (
              <div className="mt-4 space-y-2">
                <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                  {skillLessons.map((l) => (
                    <div key={l.id} className="rounded-xl bg-surface-3 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-8 text-muted-foreground">#{l.sort_order}</span>
                        <span className="min-w-[160px] flex-1 font-semibold text-foreground">{l.title}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground ring-1 ring-border">
                          {l.level} · {l.difficulty}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-semibold ring-1 ring-border",
                            l.is_free ? "bg-brass/20 text-brass-soft" : "text-muted-foreground",
                          )}
                        >
                          {l.is_free ? "FREE" : "PREMIUM"}
                        </span>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(l)}
                          className={cn(
                            "rounded-full px-2 py-0.5 font-semibold ring-1 ring-border",
                            l.status === "published" ? "bg-brass/20 text-brass-soft" : "text-muted-foreground",
                          )}
                        >
                          {l.status === "published" ? "Visible" : "Hidden"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(l)}
                          className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                        >
                          Edit
                        </button>
                      </div>

                      {editingId === l.id && (
                        <LessonEditor
                          draft={draft}
                          setDraft={setDraft}
                          updateItem={updateItem}
                          onCancel={cancelEdit}
                          onSave={() => void save(skill.id, l)}
                          saving={saving}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {editingId === "new" ? (
                  <div className="rounded-xl bg-surface-3 px-3 py-2 text-xs">
                    <p className="mb-2 font-semibold text-foreground">New lesson — {skill.label}</p>
                    <LessonEditor
                      draft={draft}
                      setDraft={setDraft}
                      updateItem={updateItem}
                      onCancel={cancelEdit}
                      onSave={() => void save(skill.id, null)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startNew(skill.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep"
                  >
                    <Plus className="size-3.5" /> Add lesson
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LessonEditor({
  draft,
  setDraft,
  updateItem,
  onCancel,
  onSave,
  saving,
}: {
  draft: Draft;
  setDraft: (updater: (d: Draft) => Draft) => void;
  updateItem: (index: number, fields: Partial<Item>) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3 ring-1 ring-border">
      <input
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        placeholder="Lesson title"
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={draft.level}
          onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value as Draft["level"] }))}
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={draft.difficulty}
          onChange={(e) => setDraft((d) => ({ ...d, difficulty: e.target.value as Draft["difficulty"] }))}
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={draft.accent}
          onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value as Draft["accent"] }))}
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        >
          {ACCENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={draft.explain}
        onChange={(e) => setDraft((d) => ({ ...d, explain: e.target.value }))}
        placeholder="Explanation (1-2 short sentences)"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <input
        value={draft.pointsText}
        onChange={(e) => setDraft((d) => ({ ...d, pointsText: e.target.value }))}
        placeholder="Points, comma-separated"
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        value={draft.caution}
        onChange={(e) => setDraft((d) => ({ ...d, caution: e.target.value }))}
        placeholder="Caution note (optional — e.g. 'informal only')"
        rows={1}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />

      <p className="pt-1 text-muted-foreground">Items (what the learner says)</p>
      {draft.items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={it.text}
            onChange={(e) => updateItem(i, { text: e.target.value })}
            placeholder="Text the learner says"
            className="min-w-[160px] flex-1 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
          />
          <input
            value={it.pattern ?? ""}
            onChange={(e) => updateItem(i, { pattern: e.target.value })}
            placeholder="Pattern (e.g. WA-ter)"
            className="w-40 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
          />
          <input
            value={it.note ?? ""}
            onChange={(e) => updateItem(i, { note: e.target.value })}
            placeholder="Note (optional)"
            className="w-40 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
          />
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
            disabled={draft.items.length <= 1}
            className="rounded-lg p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { text: "" }] }))}
        className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-2 py-1 font-semibold text-foreground ring-1 ring-border"
      >
        <Plus className="size-3.5" /> Add item
      </button>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 font-semibold text-plum-deep disabled:opacity-50"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-surface-3 px-3 py-1.5 font-semibold text-foreground ring-1 ring-border"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
