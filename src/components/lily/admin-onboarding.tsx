import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminListOnboardingOptions,
  adminSaveOnboardingOption,
  adminSetOnboardingOptionActive,
} from "@/lib/onboarding-admin.functions";
import type { OnboardingQuestionKey } from "@/lib/onboarding.functions";
import { cn } from "@/lib/utils";

const QUESTIONS: { key: OnboardingQuestionKey; label: string }[] = [
  { key: "goal", label: "Q1 — Main goal" },
  { key: "focus_areas", label: "Q2 — What to improve most" },
  { key: "minutes", label: "Q3 — Practice frequency" },
  { key: "level", label: "Q4 — English level" },
  { key: "instruction_language", label: "Q5 — Instruction language" },
];

type OptionRow = {
  id: string;
  question_key: OnboardingQuestionKey;
  option_value: string;
  label_en: string;
  label_vi: string;
  sort_order: number;
  is_active: boolean;
};

type Draft = { option_value: string; label_en: string; label_vi: string };
const emptyDraft = (): Draft => ({ option_value: "", label_en: "", label_vi: "" });
const toDraft = (r: OptionRow): Draft => ({ option_value: r.option_value, label_en: r.label_en, label_vi: r.label_vi });

/**
 * Admin control for the onboarding survey (mục "cho CRUD để admin sửa" —
 * 2026-09-18). Same accordion-by-fixed-group pattern as
 * AdminPronunciationPanel, grouped by the 5 fixed question_keys instead of 8
 * skills. Only option text/order/visibility is editable here — the question
 * slots themselves are wired to real app fields (see onboarding.tsx) and
 * changing which 5 slots exist needs a code change.
 */
export function AdminOnboardingPanel() {
  const listOptions = useServerFn(adminListOnboardingOptions);
  const saveOption = useServerFn(adminSaveOnboardingOption);
  const setActive = useServerFn(adminSetOnboardingOptionActive);

  const [rows, setRows] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<OnboardingQuestionKey | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void listOptions({ data: undefined as never })
      .then((res) => setRows(res as unknown as OptionRow[]))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load onboarding options"))
      .finally(() => setLoading(false));
  }, [listOptions]);

  useEffect(refresh, [refresh]);

  const startEdit = (row: OptionRow) => {
    setEditingId(row.id);
    setDraft(toDraft(row));
  };
  const startNew = (key: OnboardingQuestionKey) => {
    setOpenQuestion(key);
    setEditingId("new");
    setDraft(emptyDraft());
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const toggle = async (row: OptionRow) => {
    try {
      await setActive({ data: { id: row.id, is_active: !row.is_active } });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update option");
    }
  };

  const save = async (key: OnboardingQuestionKey, existing: OptionRow | null) => {
    if (!draft.option_value.trim() || !draft.label_en.trim()) {
      toast.error("Value and English label are required.");
      return;
    }
    setSaving(true);
    try {
      const questionOptions = rows.filter((r) => r.question_key === key);
      await saveOption({
        data: {
          id: existing?.id,
          question_key: key,
          option_value: draft.option_value.trim(),
          label_en: draft.label_en.trim(),
          label_vi: draft.label_vi.trim(),
          sort_order: existing?.sort_order ?? questionOptions.length + 1,
          is_active: existing?.is_active ?? true,
        },
      });
      toast.success(existing ? "Option updated" : "Option added");
      cancelEdit();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the option");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Only English + Vietnamese labels are editable here — the other 52 interface languages fall back to
        the English label for this screen (same convention used elsewhere when a translation is missing).
      </p>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}

      {QUESTIONS.map((q) => {
        const options = rows.filter((r) => r.question_key === q.key);
        const open = openQuestion === q.key;
        return (
          <div key={q.key} className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
            <button
              type="button"
              onClick={() => setOpenQuestion(open ? null : q.key)}
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-foreground"
            >
              {q.label}
              <span className="text-xs font-normal text-muted-foreground">
                {options.filter((o) => o.is_active).length}/{options.length} active
              </span>
            </button>

            {open && (
              <div className="mt-4 space-y-2">
                <div className="space-y-1.5">
                  {options.map((o) => (
                    <div key={o.id} className="rounded-xl bg-surface-3 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-8 text-muted-foreground">#{o.sort_order}</span>
                        <span className="min-w-[140px] flex-1 font-semibold text-foreground">{o.label_en}</span>
                        <span className="text-muted-foreground">{o.label_vi || "—"}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground ring-1 ring-border">
                          {o.option_value}
                        </span>
                        <button
                          type="button"
                          onClick={() => void toggle(o)}
                          className={cn(
                            "rounded-full px-2 py-0.5 font-semibold ring-1 ring-border",
                            o.is_active ? "bg-brass/20 text-brass-soft" : "text-muted-foreground",
                          )}
                        >
                          {o.is_active ? "Active" : "Hidden"}
                        </button>
                        <button
                          type="button"
                          onClick={() => (editingId === o.id ? cancelEdit() : startEdit(o))}
                          className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                        >
                          {editingId === o.id ? "Close" : "Edit"}
                        </button>
                      </div>

                      {editingId === o.id && (
                        <OptionEditor draft={draft} setDraft={setDraft} onCancel={cancelEdit} onSave={() => void save(q.key, o)} saving={saving} />
                      )}
                    </div>
                  ))}
                  {options.length === 0 && <p className="py-2 text-muted-foreground">No options yet.</p>}
                </div>

                {editingId === "new" && openQuestion === q.key ? (
                  <div className="rounded-xl bg-surface-3 px-3 py-2 text-xs">
                    <p className="mb-2 font-semibold text-foreground">New option — {q.label}</p>
                    <OptionEditor draft={draft} setDraft={setDraft} onCancel={cancelEdit} onSave={() => void save(q.key, null)} saving={saving} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startNew(q.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep"
                  >
                    <Plus className="size-3.5" /> Add option
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

function OptionEditor({
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
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-surface-2 p-3 ring-1 ring-border">
      <input
        value={draft.option_value}
        onChange={(e) => setDraft((d) => ({ ...d, option_value: e.target.value }))}
        placeholder="Stable value (e.g. ielts, speaking, A1) — never shown to learners"
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <input
        value={draft.label_en}
        onChange={(e) => setDraft((d) => ({ ...d, label_en: e.target.value }))}
        placeholder="English label"
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <input
        value={draft.label_vi}
        onChange={(e) => setDraft((d) => ({ ...d, label_vi: e.target.value }))}
        placeholder="Vietnamese label (optional — falls back to English if empty)"
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
