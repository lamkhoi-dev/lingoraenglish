import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminGetCoachSettings,
  adminListCoachTopics,
  adminSaveCoachSettings,
  adminSetCoachTopicActive,
  COACH_CATEGORIES,
  type CoachCategory,
} from "@/lib/coach.functions";
import { cn } from "@/lib/utils";

type TopicRow = {
  id: string;
  slug: string;
  title: string;
  level: string;
  access_tier: string;
  is_active: boolean;
  sort_order: number;
};

const LABELS: Record<CoachCategory, string> = {
  free: "Free Conversation",
  daily: "Daily Conversation",
  roleplay: "Role-play",
  interview: "Interview",
  challenge: "Challenge",
};

/** Admin control for coach topics and speaking-turn limits. */
export function AdminCoachPanel() {
  const listTopics = useServerFn(adminListCoachTopics);
  const setActive = useServerFn(adminSetCoachTopicActive);
  const getSettings = useServerFn(adminGetCoachSettings);
  const saveSettings = useServerFn(adminSaveCoachSettings);

  const [category, setCategory] = useState<CoachCategory>("free");
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limits, setLimits] = useState({ free_turn_limit: 4, premium_monthly_turns: 0, pro_monthly_turns: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
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

  const toggle = async (row: TopicRow) => {
    try {
      await setActive({ data: { id: row.id, is_active: !row.is_active } });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update topic");
    }
  };

  const persist = async () => {
    setSaving(true);
    try {
      await saveSettings({ data: limits });
      toast.success("Speaking limits saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save limits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="lounge-panel p-5">
        <h2 className="font-display text-lg text-foreground">Speaking turn limits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Free students get a fixed number of speaking turns in total. Use 0 for unlimited on paid plans.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["free_turn_limit", "Free student turns (total)"],
              ["premium_monthly_turns", "Premium turns / month"],
              ["pro_monthly_turns", "IELTS Pro turns / month"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs text-muted-foreground">
              {label}
              <input
                type="number"
                min={0}
                value={limits[key]}
                onChange={(e) => setLimits((p) => ({ ...p, [key]: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass/40"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void persist()}
          disabled={saving}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save limits
        </button>
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
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.level} · {r.access_tier} · {r.slug}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void toggle(r)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-border",
                    r.is_active ? "bg-brass/15 text-brass-soft" : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {r.is_active ? "Active" : "Hidden"}
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="py-4 text-sm text-muted-foreground">No topics in this category.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
