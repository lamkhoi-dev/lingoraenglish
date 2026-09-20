import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminGetCoachSettings,
  adminListCoachTopics,
  adminSaveCoachTopic,
  adminSetCoachTopicActive,
  COACH_CATEGORIES,
  type CoachCategory,
} from "@/lib/coach.functions";
import { cn } from "@/lib/utils";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
const ACCESS_TIERS = ["free", "premium", "ielts_pro"] as const;

type TopicRow = {
  id: string;
  category: CoachCategory;
  slug: string;
  title: string;
  description: string;
  level: string;
  access_tier: string;
  ai_role: string;
  user_role: string;
  situation: string;
  objective: string;
  opening_message: string;
  instructions: string;
  follow_up_directions: string[];
  vocabulary_focus: string;
  grammar_focus: string;
  interview_type: string;
  challenge_prompt: string;
  evaluation_criteria: string;
  time_limit_seconds: number;
  estimated_minutes: number;
  sort_order: number;
  is_active: boolean;
};

const LABELS: Record<CoachCategory, string> = {
  free: "Free Conversation",
  daily: "Daily Conversation",
  roleplay: "Role-play",
  interview: "Interview",
  challenge: "Challenge",
};

type Draft = {
  slug: string;
  title: string;
  description: string;
  level: (typeof LEVELS)[number];
  access_tier: (typeof ACCESS_TIERS)[number];
  ai_role: string;
  user_role: string;
  situation: string;
  objective: string;
  opening_message: string;
  instructions: string;
  follow_up_directions_text: string;
  vocabulary_focus: string;
  grammar_focus: string;
  interview_type: string;
  challenge_prompt: string;
  evaluation_criteria: string;
  time_limit_seconds: number;
  estimated_minutes: number;
};

const emptyDraft = (): Draft => ({
  slug: "",
  title: "",
  description: "",
  level: "B1",
  access_tier: "free",
  ai_role: "",
  user_role: "",
  situation: "",
  objective: "",
  opening_message: "",
  instructions: "",
  follow_up_directions_text: "",
  vocabulary_focus: "",
  grammar_focus: "",
  interview_type: "",
  challenge_prompt: "",
  evaluation_criteria: "",
  time_limit_seconds: 0,
  estimated_minutes: 5,
});

const toDraft = (r: TopicRow): Draft => ({
  slug: r.slug,
  title: r.title,
  description: r.description,
  level: r.level as Draft["level"],
  access_tier: r.access_tier as Draft["access_tier"],
  ai_role: r.ai_role,
  user_role: r.user_role,
  situation: r.situation,
  objective: r.objective,
  opening_message: r.opening_message,
  instructions: r.instructions,
  follow_up_directions_text: r.follow_up_directions.join("\n"),
  vocabulary_focus: r.vocabulary_focus,
  grammar_focus: r.grammar_focus,
  interview_type: r.interview_type,
  challenge_prompt: r.challenge_prompt,
  evaluation_criteria: r.evaluation_criteria,
  time_limit_seconds: r.time_limit_seconds,
  estimated_minutes: r.estimated_minutes,
});

/** Admin control for coach topics and speaking-turn limits. Same
 * inline-accordion create/edit pattern as AdminPronunciationPanel. */
export function AdminCoachPanel() {
  const listTopics = useServerFn(adminListCoachTopics);
  const saveTopic = useServerFn(adminSaveCoachTopic);
  const setActive = useServerFn(adminSetCoachTopicActive);
  const getSettings = useServerFn(adminGetCoachSettings);

  const [category, setCategory] = useState<CoachCategory>("free");
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limits, setLimits] = useState({ free_turn_limit: 3, premium_monthly_turns: 0, pro_monthly_turns: 0 });
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setEditingId(null);
    void listTopics({ data: { category } })
      .then((data) => setRows(data as unknown as TopicRow[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load topics"))
      .finally(() => setLoading(false));
  }, [category, listTopics]);

  useEffect(() => {
    void getSettings({ data: undefined as never })
      .then((s) =>
        setLimits({
          free_turn_limit: s.freeTurnLimit,
          premium_monthly_turns: s.premiumMonthlyTurns,
          pro_monthly_turns: s.proMonthlyTurns,
        }),
      )
      .catch(() => undefined);
  }, [getSettings]);

  const refresh = () => {
    void listTopics({ data: { category } })
      .then((data) => setRows(data as unknown as TopicRow[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load topics"));
  };

  const toggle = async (row: TopicRow) => {
    try {
      await setActive({ data: { id: row.id, is_active: !row.is_active } });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update topic");
    }
  };

  const startEdit = (row: TopicRow) => {
    setEditingId(row.id);
    setDraft(toDraft(row));
  };

  const startNew = () => {
    setEditingId("new");
    setDraft(emptyDraft());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const save = async (existing: TopicRow | null) => {
    if (!draft.slug.trim() || !draft.title.trim() || !draft.opening_message.trim()) {
      toast.error("Slug, title and opening message are required.");
      return;
    }
    setSaving(true);
    try {
      await saveTopic({
        data: {
          id: existing?.id,
          category: existing?.category ?? category,
          slug: draft.slug.trim(),
          title: draft.title.trim(),
          description: draft.description.trim(),
          level: draft.level,
          access_tier: draft.access_tier,
          ai_role: draft.ai_role.trim(),
          user_role: draft.user_role.trim(),
          situation: draft.situation.trim(),
          objective: draft.objective.trim(),
          opening_message: draft.opening_message.trim(),
          instructions: draft.instructions.trim(),
          follow_up_directions: draft.follow_up_directions_text
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 12),
          vocabulary_focus: draft.vocabulary_focus.trim(),
          grammar_focus: draft.grammar_focus.trim(),
          interview_type: draft.interview_type.trim(),
          challenge_prompt: draft.challenge_prompt.trim(),
          evaluation_criteria: draft.evaluation_criteria.trim(),
          time_limit_seconds: draft.time_limit_seconds,
          estimated_minutes: draft.estimated_minutes,
          sort_order: existing?.sort_order ?? rows.length + 1,
          is_active: existing?.is_active ?? true,
        },
      });
      toast.success(existing ? "Topic updated" : "Topic added");
      cancelEdit();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the topic");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="lounge-panel p-5">
        <h2 className="font-display text-lg text-foreground">Speaking turn limits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set in the "Plans" tab now (one shared place for every plan's limits) — shown here read-only.
        </p>
        <div className="mt-4 grid gap-3 text-sm text-foreground sm:grid-cols-3">
          <div>
            <span className="block text-xs text-muted-foreground">Free student turns (total)</span>
            {limits.free_turn_limit}
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Premium turns / month (0 = unlimited)</span>
            {limits.premium_monthly_turns}
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">IELTS Pro turns / month (0 = unlimited)</span>
            {limits.pro_monthly_turns}
          </div>
        </div>
      </div>

      <div className="lounge-panel p-5">
        <div className="flex flex-wrap gap-2">
          {COACH_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold ring-1 ring-border",
                category === c ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
            >
              {LABELS[c]}
            </button>
          ))}
        </div>

        {loading ? (
          <Loader2 className="mt-5 size-5 animate-spin text-brass-soft" />
        ) : (
          <ul className="mt-5 divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.level} · {r.access_tier} · {r.slug}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggle(r)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border",
                        r.is_active ? "bg-brass/15 text-brass-soft" : "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {r.is_active ? "Active" : "Hidden"}
                    </button>
                    <button
                      type="button"
                      onClick={() => (editingId === r.id ? cancelEdit() : startEdit(r))}
                      className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                    >
                      {editingId === r.id ? "Close" : "Edit"}
                    </button>
                  </div>
                </div>

                {editingId === r.id && (
                  <TopicEditor draft={draft} setDraft={setDraft} onCancel={cancelEdit} onSave={() => void save(r)} saving={saving} />
                )}
              </li>
            ))}
            {rows.length === 0 && <li className="py-4 text-sm text-muted-foreground">No topics in this category.</li>}
          </ul>
        )}

        {editingId === "new" ? (
          <div className="mt-4 rounded-xl bg-surface-3 px-3 py-3 text-xs">
            <p className="mb-2 font-semibold text-foreground">New topic — {LABELS[category]}</p>
            <TopicEditor draft={draft} setDraft={setDraft} onCancel={cancelEdit} onSave={() => void save(null)} saving={saving} />
          </div>
        ) : (
          <button
            type="button"
            onClick={startNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep"
          >
            <Plus className="size-3.5" /> Add topic
          </button>
        )}
      </div>
    </div>
  );
}

function TopicEditor({
  draft,
  setDraft,
  onCancel,
  onSave,
  saving,
}: {
  draft: Draft;
  setDraft: (updater: (d: Draft) => Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3 ring-1 ring-border">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          {...field("slug")}
          placeholder="Slug (unique, e.g. hotel-checkin)"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          {...field("title")}
          placeholder="Title"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
      </div>

      <textarea
        {...field("description")}
        placeholder="Description (shown on the topic picker)"
        rows={2}
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
          value={draft.access_tier}
          onChange={(e) => setDraft((d) => ({ ...d, access_tier: e.target.value as Draft["access_tier"] }))}
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        >
          {ACCESS_TIERS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={draft.time_limit_seconds}
          onChange={(e) => setDraft((d) => ({ ...d, time_limit_seconds: Number(e.target.value) }))}
          placeholder="Time limit (sec, 0 = none)"
          className="w-44 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          type="number"
          min={1}
          value={draft.estimated_minutes}
          onChange={(e) => setDraft((d) => ({ ...d, estimated_minutes: Number(e.target.value) }))}
          placeholder="Estimated minutes"
          className="w-36 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          {...field("ai_role")}
          placeholder="AI role (e.g. Hotel receptionist)"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          {...field("user_role")}
          placeholder="Learner role (e.g. Guest checking in)"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
      </div>

      <textarea
        {...field("situation")}
        placeholder="Situation"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        {...field("objective")}
        placeholder="Objective"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        {...field("opening_message")}
        placeholder="Opening message — what the AI says first *"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        {...field("instructions")}
        placeholder="Instructions for the AI (tone, what to steer toward)"
        rows={3}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        {...field("follow_up_directions_text")}
        placeholder="Follow-up directions, one per line (up to 12)"
        rows={3}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          {...field("vocabulary_focus")}
          placeholder="Vocabulary focus"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          {...field("grammar_focus")}
          placeholder="Grammar focus"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          {...field("interview_type")}
          placeholder="Interview type (Interview category only)"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          {...field("challenge_prompt")}
          placeholder="Challenge prompt (Challenge category only)"
          className="rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
      </div>
      <textarea
        {...field("evaluation_criteria")}
        placeholder="Evaluation criteria"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />

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
