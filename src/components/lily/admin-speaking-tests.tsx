import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminListSpeakingTests,
  adminSaveSpeakingTest,
  adminSetSpeakingTestStatus,
} from "@/lib/speaking-test-admin.functions";
import { cn } from "@/lib/utils";

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

/** The five buckets the spec counts separately (30 tests each). */
const GROUPS = [
  { key: "ielts:1", label: "IELTS — Part 1", exam: "ielts", part: 1 },
  { key: "ielts:2", label: "IELTS — Part 2 (cue card)", exam: "ielts", part: 2 },
  { key: "ielts:3", label: "IELTS — Part 3", exam: "ielts", part: 3 },
  { key: "toefl", label: "TOEFL", exam: "toefl", part: 0 },
  { key: "pte", label: "PTE", exam: "pte", part: 0 },
] as const;

const REQUIRED_PER_GROUP = 30;

type TestRow = {
  id: string;
  exam: string;
  part: number;
  slug: string;
  topic: string;
  difficulty: string;
  questions: string[];
  cue_card: string;
  cue_points: string[];
  preparation_time: number;
  speaking_time: number;
  test_number: number;
  task_type: string;
  task_label: string;
  instructions: string;
  is_free: boolean;
  sort_order: number;
  status: string;
};
type Tally = Record<string, { total: number; free: number }>;

type Draft = {
  slug: string;
  topic: string;
  difficulty: (typeof DIFFICULTIES)[number];
  questions: string[];
  cueCard: string;
  cuePointsText: string;
  preparationTime: number;
  speakingTime: number;
  taskLabel: string;
  instructions: string;
};

const emptyDraft = (): Draft => ({
  slug: "",
  topic: "",
  difficulty: "Intermediate",
  questions: [""],
  cueCard: "",
  cuePointsText: "",
  preparationTime: 0,
  speakingTime: 300,
  taskLabel: "",
  instructions: "",
});

const toDraft = (t: TestRow): Draft => ({
  slug: t.slug,
  topic: t.topic,
  difficulty: (DIFFICULTIES as readonly string[]).includes(t.difficulty)
    ? (t.difficulty as Draft["difficulty"])
    : "Intermediate",
  questions: t.questions.length ? t.questions : [""],
  cueCard: t.cue_card,
  cuePointsText: (t.cue_points ?? []).join("\n"),
  preparationTime: t.preparation_time,
  speakingTime: t.speaking_time,
  taskLabel: t.task_label,
  instructions: t.instructions,
});

/**
 * Speaking Tests library editor (mục 4.3) — grouped by the five buckets the
 * requirement counts 30 tests in, so a shortfall is visible while editing.
 * Free/paid allocation is not here: Yêu cầu 9 keeps it in the Plans tab.
 */
export function AdminSpeakingTestsPanel() {
  const listTests = useServerFn(adminListSpeakingTests);
  const saveTest = useServerFn(adminSaveSpeakingTest);
  const setStatus = useServerFn(adminSetSpeakingTestStatus);

  const [tests, setTests] = useState<TestRow[]>([]);
  const [tally, setTally] = useState<Tally>({});
  const [loading, setLoading] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void listTests({ data: undefined as never })
      .then((res) => {
        setTests(res.tests as unknown as TestRow[]);
        setTally(res.tally as Tally);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load tests"))
      .finally(() => setLoading(false));
  }, [listTests]);

  useEffect(refresh, [refresh]);

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const save = async (group: (typeof GROUPS)[number], existing: TestRow | null) => {
    const questions = draft.questions.map((q) => q.trim()).filter(Boolean);
    if (!draft.slug.trim() || !draft.topic.trim() || questions.length === 0) {
      toast.error("Slug, topic and at least one question are required.");
      return;
    }
    if (group.exam === "ielts" && group.part === 2 && !draft.cueCard.trim()) {
      toast.error("IELTS Part 2 needs a cue card.");
      return;
    }

    setSaving(true);
    try {
      const inGroup = tests.filter((t) => t.exam === group.exam && t.part === group.part);
      await saveTest({
        data: {
          id: existing?.id,
          exam: group.exam,
          part: group.part,
          slug: draft.slug.trim(),
          topic: draft.topic.trim(),
          difficulty: draft.difficulty,
          questions,
          cue_card: draft.cueCard.trim(),
          cue_points: draft.cuePointsText
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
          preparation_time: draft.preparationTime,
          speaking_time: draft.speakingTime,
          test_number: existing?.test_number ?? inGroup.length + 1,
          task_type: existing?.task_type ?? "",
          task_label: draft.taskLabel.trim(),
          instructions: draft.instructions.trim(),
          sort_order: existing?.sort_order ?? inGroup.length + 1,
          status: (existing?.status as "published" | "draft") ?? "published",
        },
      });
      toast.success(existing ? "Test updated." : "Test added.");
      cancelEdit();
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the test");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (test: TestRow) => {
    const next = test.status === "published" ? "draft" : "published";
    try {
      await setStatus({ data: { id: test.id, status: next } });
      toast.success(next === "draft" ? "Test hidden." : "Test published.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not change the status");
    }
  };

  const field =
    "w-full rounded-lg bg-surface-3 px-2 py-1.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass";

  const renderForm = (group: (typeof GROUPS)[number], existing: TestRow | null) => (
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
          Topic
          <input
            value={draft.topic}
            onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Difficulty
          <select
            value={draft.difficulty}
            onChange={(e) =>
              setDraft({ ...draft, difficulty: e.target.value as Draft["difficulty"] })
            }
            className={field}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Task label
          <input
            value={draft.taskLabel}
            onChange={(e) => setDraft({ ...draft, taskLabel: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Preparation time (s)
          <input
            type="number"
            min={0}
            max={600}
            value={draft.preparationTime}
            onChange={(e) => setDraft({ ...draft, preparationTime: Number(e.target.value) })}
            className={field}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Speaking time (s)
          <input
            type="number"
            min={30}
            max={1800}
            value={draft.speakingTime}
            onChange={(e) => setDraft({ ...draft, speakingTime: Number(e.target.value) })}
            className={field}
          />
        </label>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-brass-soft">
            Questions
          </span>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, questions: [...draft.questions, ""] })}
            className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-xs text-foreground ring-1 ring-border"
          >
            <Plus className="size-3" /> Question
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {draft.questions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={q}
                onChange={(e) => {
                  const next = [...draft.questions];
                  next[i] = e.target.value;
                  setDraft({ ...draft, questions: next });
                }}
                className={field}
              />
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })
                }
                className="shrink-0 rounded-lg px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {group.exam === "ielts" && group.part === 2 && (
        <div className="mt-4 grid gap-3">
          <label className="text-xs text-muted-foreground">
            Cue card
            <textarea
              rows={3}
              value={draft.cueCard}
              onChange={(e) => setDraft({ ...draft, cueCard: e.target.value })}
              className={field}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Cue points (one per line)
            <textarea
              rows={4}
              value={draft.cuePointsText}
              onChange={(e) => setDraft({ ...draft, cuePointsText: e.target.value })}
              className={field}
            />
          </label>
        </div>
      )}

      <label className="mt-4 block text-xs text-muted-foreground">
        Instructions
        <textarea
          rows={2}
          value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          className={field}
        />
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(group, existing)}
          className="rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep disabled:opacity-60"
        >
          {saving ? "Saving…" : existing ? "Save changes" : "Add test"}
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
        <h2 className="font-display text-lg text-foreground">Speaking Tests</h2>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Free/paid split is set in the Plans tab (speaking_tests_free_*), not here.
      </p>

      <div className="mt-4 space-y-2">
        {GROUPS.map((group) => {
          const rows = tests.filter((t) => t.exam === group.exam && t.part === group.part);
          const count = tally[group.key] ?? { total: 0, free: 0 };
          const short = count.total < REQUIRED_PER_GROUP;
          const open = openGroup === group.key;
          return (
            <div key={group.key} className="rounded-xl bg-surface-2/50 ring-1 ring-border">
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : group.key)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-foreground">{group.label}</span>
                <span
                  className={cn("text-xs", short ? "text-destructive" : "text-muted-foreground")}
                >
                  {count.total} / {REQUIRED_PER_GROUP} tests · {count.free} free
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
                    <Plus className="size-3.5" /> New test
                  </button>

                  {editingId === "new" && renderForm(group, null)}

                  <ul className="mt-3 space-y-2">
                    {rows.map((test) => (
                      <li
                        key={test.id}
                        className="rounded-lg bg-surface-3/50 p-3 ring-1 ring-border"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">
                              {test.topic}{" "}
                              <span className="text-xs text-muted-foreground">
                                · {test.questions.length} questions
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {test.slug}
                              {test.is_free ? " · free" : ""}
                              {test.status !== "published" ? " · hidden" : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(test.id);
                                setDraft(toDraft(test));
                              }}
                              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-foreground ring-1 ring-border"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleStatus(test)}
                              className="rounded-full bg-surface-2 px-3 py-1 text-xs text-foreground ring-1 ring-border"
                            >
                              {test.status === "published" ? "Hide" : "Publish"}
                            </button>
                          </div>
                        </div>
                        {editingId === test.id && renderForm(group, test)}
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
