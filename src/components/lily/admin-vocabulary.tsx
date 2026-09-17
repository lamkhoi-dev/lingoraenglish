import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { VOCAB_CATEGORIES } from "@/lib/ipa-data";
import {
  adminListVocabularyWords,
  adminSaveVocabularyWord,
  adminSetVocabularyWordStatus,
} from "@/lib/vocabulary-admin.functions";
import { cn } from "@/lib/utils";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const TIERS = ["free", "premium", "ielts_pro"] as const;

type WordRow = {
  id: string;
  category: string;
  word: string;
  ipa: string;
  meaning_en: string;
  meaning_vi: string;
  example_sentence: string;
  example_vi: string;
  usage_context: string;
  level: string;
  synonyms: string[];
  antonyms: string[];
  access_tier: string;
  sort_order: number;
  status: string;
};
type Tally = Record<string, { total: number; free: number }>;

type Draft = {
  word: string;
  ipa: string;
  meaningEn: string;
  meaningVi: string;
  exampleSentence: string;
  exampleVi: string;
  usageContext: string;
  level: (typeof LEVELS)[number];
  synonymsText: string;
  antonymsText: string;
  accessTier: (typeof TIERS)[number];
};

const emptyDraft = (): Draft => ({
  word: "",
  ipa: "",
  meaningEn: "",
  meaningVi: "",
  exampleSentence: "",
  exampleVi: "",
  usageContext: "",
  level: "B1",
  synonymsText: "",
  antonymsText: "",
  accessTier: "premium",
});

const toDraft = (w: WordRow): Draft => ({
  word: w.word,
  ipa: w.ipa,
  meaningEn: w.meaning_en,
  meaningVi: w.meaning_vi,
  exampleSentence: w.example_sentence,
  exampleVi: w.example_vi,
  usageContext: w.usage_context,
  level: w.level as Draft["level"],
  synonymsText: w.synonyms.filter(Boolean).join(", "),
  antonymsText: w.antonyms.filter(Boolean).join(", "),
  accessTier: w.access_tier as Draft["accessTier"],
});

/** Admin control for the Vocabulary word library (100 words/category,
 * easy → hard) — same inline-accordion pattern as AdminPronunciationPanel,
 * grouped by the 18 fixed VOCAB_CATEGORIES instead of the 8 skill ids. */
export function AdminVocabularyPanel() {
  const listWords = useServerFn(adminListVocabularyWords);
  const saveWord = useServerFn(adminSaveVocabularyWord);
  const setStatus = useServerFn(adminSetVocabularyWordStatus);

  const [words, setWords] = useState<WordRow[]>([]);
  const [tally, setTally] = useState<Tally>({});
  const [loading, setLoading] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void listWords({ data: undefined as never })
      .then((res) => {
        setWords(res.words as unknown as WordRow[]);
        setTally(res.tally as Tally);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load the word list"))
      .finally(() => setLoading(false));
  }, [listWords]);

  useEffect(refresh, [refresh]);

  const startEdit = (word: WordRow) => {
    setEditingId(word.id);
    setDraft(toDraft(word));
  };

  const startNew = (category: string) => {
    setOpenCategory(category);
    setEditingId("new");
    setDraft(emptyDraft());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const save = async (category: string, existing: WordRow | null) => {
    if (!draft.word.trim() || !draft.meaningEn.trim() || !draft.exampleSentence.trim()) {
      toast.error("Word, meaning and example sentence are required.");
      return;
    }
    setSaving(true);
    try {
      const categoryWords = words.filter((w) => w.category === category);
      const sortOrder = existing?.sort_order ?? categoryWords.length + 1;
      await saveWord({
        data: {
          id: existing?.id,
          category,
          word: draft.word.trim(),
          ipa: draft.ipa.trim(),
          meaningEn: draft.meaningEn.trim(),
          meaningVi: draft.meaningVi.trim(),
          exampleSentence: draft.exampleSentence.trim(),
          exampleVi: draft.exampleVi.trim(),
          usageContext: draft.usageContext.trim(),
          level: draft.level,
          synonyms: draft.synonymsText.split(",").map((s) => s.trim()).filter(Boolean),
          antonyms: draft.antonymsText.split(",").map((s) => s.trim()).filter(Boolean),
          accessTier: existing?.access_tier as (typeof TIERS)[number] | undefined ?? draft.accessTier,
          sortOrder,
          status: "published",
        },
      });
      toast.success(existing ? "Word updated" : "Word added");
      cancelEdit();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the word");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (word: WordRow) => {
    const nextStatus = word.status === "published" ? "draft" : "published";
    try {
      await setStatus({ data: { id: word.id, status: nextStatus } });
      setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, status: nextStatus } : w)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading the library…
        </p>
      )}

      {VOCAB_CATEGORIES.map((category) => {
        const categoryWords = words.filter((w) => w.category === category);
        const t = tally[category] ?? { total: 0, free: 0 };
        const open = openCategory === category;
        return (
          <div key={category} className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenCategory(open ? null : category)}
                className="flex-1 text-left text-sm font-semibold text-foreground"
              >
                {category}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t.total} words · {t.free} free (target: 100 · free count set in the "Plans" tab)
                </span>
              </button>
            </div>

            {open && (
              <div className="mt-4 space-y-2">
                <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                  {categoryWords.map((w) => (
                    <div key={w.id} className="rounded-xl bg-surface-3 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-8 text-muted-foreground">#{w.sort_order}</span>
                        <span className="min-w-[120px] flex-1 font-semibold text-foreground">{w.word}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground ring-1 ring-border">
                          {w.level}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-semibold ring-1 ring-border",
                            w.access_tier === "free" ? "bg-brass/20 text-brass-soft" : "text-muted-foreground",
                          )}
                        >
                          {w.access_tier.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(w)}
                          className={cn(
                            "rounded-full px-2 py-0.5 font-semibold ring-1 ring-border",
                            w.status === "published" ? "bg-brass/20 text-brass-soft" : "text-muted-foreground",
                          )}
                        >
                          {w.status === "published" ? "Visible" : "Hidden"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(w)}
                          className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
                        >
                          Edit
                        </button>
                      </div>

                      {editingId === w.id && (
                        <WordEditor
                          draft={draft}
                          setDraft={setDraft}
                          onCancel={cancelEdit}
                          onSave={() => void save(category, w)}
                          saving={saving}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {editingId === "new" && openCategory === category ? (
                  <div className="rounded-xl bg-surface-3 px-3 py-2 text-xs">
                    <p className="mb-2 font-semibold text-foreground">New word — {category}</p>
                    <WordEditor
                      draft={draft}
                      setDraft={setDraft}
                      onCancel={cancelEdit}
                      onSave={() => void save(category, null)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startNew(category)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep"
                  >
                    <Plus className="size-3.5" /> Add word
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

function WordEditor({
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
      <div className="flex flex-wrap gap-2">
        <input
          value={draft.word}
          onChange={(e) => setDraft((d) => ({ ...d, word: e.target.value }))}
          placeholder="Word"
          className="min-w-[140px] flex-1 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          value={draft.ipa}
          onChange={(e) => setDraft((d) => ({ ...d, ipa: e.target.value }))}
          placeholder="IPA, e.g. /həˈloʊ/"
          className="w-40 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
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
      </div>
      <textarea
        value={draft.meaningEn}
        onChange={(e) => setDraft((d) => ({ ...d, meaningEn: e.target.value }))}
        placeholder="Meaning (English)"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        value={draft.meaningVi}
        onChange={(e) => setDraft((d) => ({ ...d, meaningVi: e.target.value }))}
        placeholder="Meaning (Vietnamese)"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        value={draft.exampleSentence}
        onChange={(e) => setDraft((d) => ({ ...d, exampleSentence: e.target.value }))}
        placeholder="Example sentence (English)"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        value={draft.exampleVi}
        onChange={(e) => setDraft((d) => ({ ...d, exampleVi: e.target.value }))}
        placeholder="Example sentence (Vietnamese)"
        rows={2}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <textarea
        value={draft.usageContext}
        onChange={(e) => setDraft((d) => ({ ...d, usageContext: e.target.value }))}
        placeholder="Usage context (e.g. 'Informal, used with close friends')"
        rows={1}
        className="w-full rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
      />
      <div className="flex flex-wrap gap-2">
        <input
          value={draft.synonymsText}
          onChange={(e) => setDraft((d) => ({ ...d, synonymsText: e.target.value }))}
          placeholder="Synonyms, comma-separated"
          className="min-w-[160px] flex-1 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
        <input
          value={draft.antonymsText}
          onChange={(e) => setDraft((d) => ({ ...d, antonymsText: e.target.value }))}
          placeholder="Antonyms, comma-separated"
          className="min-w-[160px] flex-1 rounded-lg bg-surface-3 px-2 py-1 text-foreground ring-1 ring-border"
        />
      </div>

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
