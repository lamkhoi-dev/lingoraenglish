import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getAiCostReport, updateAiCostSettings } from "@/lib/admin.functions";

type Report = Awaited<ReturnType<typeof getAiCostReport>>;

const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const usdFull = (n: number) => `$${n.toFixed(4)}`;
const vnd = (usdVal: number) => `${Math.round(usdVal * 25400).toLocaleString("vi-VN")}đ`;

const FEATURE_NAMES: Record<string, string> = {
  coach_turn: "Speaking Coach (Hội thoại cùng LiLy)",
  pronunciation_feedback: "Phát âm (Pronunciation & IPA)",
  speaking_analysis: "Luyện nói tự do (Speaking analysis)",
  ielts_evaluation: "Chấm thi chứng chỉ (IELTS / TOEFL / PTE)",
  learning_plan: "Lộ trình học AI (Learning Plan)",
  tts: "Đọc mẫu âm thanh (Text-to-Speech)",
  stt: "Chuyển giọng nói thành chữ (Speech-to-Text)",
};

/**
 * Mục 3.2 "Theo dõi và kiểm soát chi phí" — the admin side of ai-cost.server.ts.
 */
export function AdminAiCostPanel() {
  const getReport = useServerFn(getAiCostReport);
  const saveSettings = useServerFn(updateAiCostSettings);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("80");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    void getReport({ data: undefined as never })
      .then((res) => {
        setReport(res);
        setBudgetInput(res.today.budgetUsd === null ? "" : String(res.today.budgetUsd));
        setThresholdInput(String(res.today.alertThresholdPercent));
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not load the AI cost report"),
      )
      .finally(() => setLoading(false));
  }, [getReport]);

  useEffect(refresh, [refresh]);

  const save = async () => {
    const budget = budgetInput.trim() === "" ? null : Number(budgetInput);
    const threshold = Number(thresholdInput);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      toast.error("Daily budget must be empty (no limit) or a number ≥ 0.");
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      toast.error("Alert threshold must be a whole number between 1 and 100.");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        data: { dailyBudgetUsd: budget, alertThresholdPercent: Math.round(threshold) },
      });
      toast.success("Saved.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="lounge-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-foreground">Theo dõi & Kiểm soát Chi phí AI (Mục 3.2)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Chi phí được hệ thống ghi nhận chính xác theo số token thực tế của DeepSeek và lượt gọi API Gemini tại thời điểm gọi.
            </p>
          </div>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {report && (
          <>
            {/* KPI Summary Cards */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
                <p className="text-xs font-medium text-muted-foreground">Tổng lượt gọi AI (30 ngày)</p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {report.summary.totalCalls.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">tất cả tính năng kết hợp</p>
              </div>

              <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
                <p className="text-xs font-medium text-muted-foreground">Tổng chi phí AI (30 ngày)</p>
                <p className="mt-2 text-2xl font-bold text-brass-soft">
                  {usd(report.summary.totalCostUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">~{vnd(report.summary.totalCostUsd)}</p>
              </div>

              <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
                <p className="text-xs font-medium text-muted-foreground">Chi phí TB / Học viên</p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {usd(report.summary.avgCostPerUser)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ~{vnd(report.summary.avgCostPerUser)} / tháng ({report.summary.activeUsers} học viên hoạt động)
                </p>
              </div>

              <div className="rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
                <p className="text-xs font-medium text-muted-foreground">Tiết kiệm từ Cache TTS</p>
                <p className="mt-2 text-2xl font-bold text-emerald-400">
                  {report.summary.cacheHits.toLocaleString()} lượt
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  tiết kiệm ~{usd(report.summary.cacheSavedUsd)} ({vnd(report.summary.cacheSavedUsd)})
                </p>
              </div>
            </div>

            {/* Daily Budget & Safety Controls */}
            <div className="mt-6 rounded-xl bg-surface-2/60 p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-foreground">Chi tiêu hôm nay (Today's spend)</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    (~{vnd(report.today.spentUsd)})
                  </span>
                </div>
                <span
                  className={
                    report.today.overBudget
                      ? "text-sm font-semibold text-destructive"
                      : report.today.alerting
                        ? "text-sm font-semibold text-brass-soft"
                        : "text-sm text-foreground"
                  }
                >
                  {usd(report.today.spentUsd)}
                  {report.today.budgetUsd !== null
                    ? ` / ${usd(report.today.budgetUsd)}`
                    : " (chưa đặt hạn mức)"}
                </span>
              </div>
              {report.today.overBudget && (
                <p className="mt-2 text-xs font-medium text-destructive">
                  Đã chạm hạn mức ngân sách ngày — các lệnh gọi AI mới tạm dừng để tránh phát sinh chi phí cho đến 00:00 UTC.
                </p>
              )}
              {!report.today.overBudget && report.today.alerting && (
                <p className="mt-2 text-xs text-brass-soft">
                  Cảnh báo: Đã vượt ngưỡng {report.today.alertThresholdPercent}% ngân sách ngày.
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Hạn mức chi tiêu ngày (USD, để trống = không giới hạn)
                  <input
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    placeholder="để trống = không giới hạn"
                    className="mt-1.5 w-full rounded-lg bg-surface-3 px-2.5 py-1.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Ngưỡng cảnh báo (% ngân sách)
                  <input
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="mt-1.5 w-full rounded-lg bg-surface-3 px-2.5 py-1.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="mt-3 rounded-full bg-brass px-4 py-2 text-sm font-semibold text-plum-deep disabled:opacity-60 transition hover:bg-brass-soft"
              >
                {saving ? "Đang lưu…" : "Lưu cài đặt ngân sách"}
              </button>
            </div>

            {/* Detailed Breakdown Tables */}
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brass-soft">
                  Chi tiết chi phí 30 ngày qua — Theo từng tính năng & Model AI
                </h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-2/80 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Tính năng</th>
                        <th className="px-3 py-2">Mô hình AI (Model)</th>
                        <th className="px-3 py-2 text-right">Lượt gọi</th>
                        <th className="px-3 py-2 text-right">Tokens (In / Out)</th>
                        <th className="px-3 py-2 text-right">Chi phí (USD)</th>
                        <th className="px-3 py-2 text-right">Quy đổi VNĐ</th>
                        <th className="px-3 py-2 text-right">TB / Lượt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {report.byFeature.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                            Chưa có dữ liệu gọi AI trong 30 ngày qua.
                          </td>
                        </tr>
                      )}
                      {report.byFeature.map((row) => (
                        <tr key={`${row.capability}-${row.model}`} className="hover:bg-surface-2/40 transition-colors">
                          <td className="px-3 py-2.5 font-medium text-foreground">
                            {FEATURE_NAMES[row.capability] ?? row.capability}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono">
                              {row.provider}/{row.model}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">
                            {row.calls.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground font-mono">
                            {row.inputTokens > 0 || row.outputTokens > 0
                              ? `${row.inputTokens.toLocaleString()} / ${row.outputTokens.toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-foreground">
                            {usd(row.costUsd)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-brass-soft">
                            {vnd(row.costUsd)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                            {usdFull(row.avgCostPerCall)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brass-soft">
                  Biến động chi phí theo ngày — 30 ngày gần nhất
                </h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-2/80 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Ngày</th>
                        <th className="px-3 py-2 text-right">Số lượt gọi</th>
                        <th className="px-3 py-2 text-right">Chi phí (USD)</th>
                        <th className="px-3 py-2 text-right">Quy đổi VNĐ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {report.byDay.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                            Chưa có dữ liệu gọi AI trong 30 ngày qua.
                          </td>
                        </tr>
                      )}
                      {[...report.byDay].reverse().map((row) => (
                        <tr key={row.day} className="hover:bg-surface-2/40 transition-colors">
                          <td className="px-3 py-2 text-foreground font-mono text-xs">{row.day}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{row.calls}</td>
                          <td className="px-3 py-2 text-right font-medium text-foreground">{usd(row.costUsd)}</td>
                          <td className="px-3 py-2 text-right text-xs text-brass-soft">{vnd(row.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
