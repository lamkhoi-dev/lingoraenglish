import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getAuthEventsLog } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

type LogRow = Awaited<ReturnType<typeof getAuthEventsLog>>[number];

const EVENT_LABEL: Record<string, string> = {
  signup: "Signed up",
  signin_success: "Signed in",
  signin_failed: "Sign-in failed",
  signin_rate_limited: "Sign-in rate-limited",
};

const eventTone = (event: string) =>
  event === "signin_failed" || event === "signin_rate_limited"
    ? "text-destructive"
    : event === "signin_success" || event === "signup"
      ? "text-brass-soft"
      : "text-muted-foreground";

/**
 * Mục 3.5 "Ghi nhật ký các sự kiện quan trọng: đăng ký, đăng nhập" — read
 * side of auth_events (getAuthEventsLog in admin.functions.ts). The table
 * was write-only until now: auth.functions.ts has logged every signup/
 * sign-in attempt since migration 0009, but nothing ever displayed it.
 */
export function AdminAuthLogPanel() {
  const getLog = useServerFn(getAuthEventsLog);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void getLog({ data: undefined as never })
      .then(setRows)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load the sign-in log"))
      .finally(() => setLoading(false));
  }, [getLog]);

  useEffect(refresh, [refresh]);

  return (
    <div className="lounge-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-foreground">Sign-in & sign-up log (mục 3.5)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Last 200 events. Failed/rate-limited sign-ins usually show no email — the address is hashed
            before it's used as the rate-limit bucket key, so it's never stored in the clear.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-surface-3 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5">Time</th>
              <th className="py-1.5">Event</th>
              <th className="py-1.5">Account</th>
              <th className="py-1.5">IP</th>
              <th className="py-1.5">Device</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  No events logged yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="py-1.5 whitespace-nowrap text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className={cn("py-1.5 whitespace-nowrap font-medium", eventTone(r.event))}>
                  {EVENT_LABEL[r.event] ?? r.event}
                </td>
                <td className="py-1.5 text-foreground">{r.email ?? "—"}</td>
                <td className="py-1.5 text-muted-foreground">{r.ip || "—"}</td>
                <td className="max-w-xs truncate py-1.5 text-muted-foreground" title={r.user_agent}>
                  {r.user_agent || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
