import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  adminGetCoachSettings,
  adminListCoachTopics,
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

  const [category, setCategory] = useState<CoachCategory>("free");
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limits, setLimits] = useState({ free_turn_limit: 3, premium_monthly_turns: 0, pro_monthly_turns: 0 });

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
