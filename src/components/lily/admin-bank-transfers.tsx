import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PanelCard } from "@/components/lily/score-panel";
import {
  adminAttachSepayTransaction,
  adminConfirmBankTransferOrder,
  adminListBankTransferOrders,
  adminReconcileSepayNow,
  adminSepayStatus,
} from "@/lib/bank-transfer.functions";
import { useI18n } from "@/lib/i18n";
import { formatMoney } from "./billing-ui";

const pill = "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-border disabled:opacity-60";
const field = "rounded-full border border-border bg-background px-3 py-1.5 text-xs";

/** Database timestamps ("2026-10-05 02:46:12.3+00") shown in Vietnam time as "2026-10-05 09:46". */
function fmtDb(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 16);
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold ${tone === "warn" ? "text-amber-500" : tone === "ok" ? "text-emerald-500" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * SePay bank transfers, admin side: link health, automatic checks, open orders, and every incoming transfer
 * that did not settle on its own. Settling by hand is done by attaching a real SePay transfer to an order;
 * confirming without one (a transfer SePay never recorded) needs a written reason and is audit-logged.
 * Labels stay in English like the rest of this admin panel.
 */
export function AdminBankTransfers() {
  const { t, locale } = useI18n();
  const loadOrders = useServerFn(adminListBankTransferOrders);
  const loadStatus = useServerFn(adminSepayStatus);
  const reconcileNow = useServerFn(adminReconcileSepayNow);
  const attach = useServerFn(adminAttachSepayTransaction);
  const confirm = useServerFn(adminConfirmBankTransferOrder);

  const orders = useQuery({
    queryKey: ["admin-bank-transfer-orders"],
    queryFn: () => loadOrders(),
    refetchInterval: 15_000,
  });
  const status = useQuery({
    queryKey: ["admin-sepay-status"],
    queryFn: () => loadStatus(),
    refetchInterval: 60_000,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [attachChoice, setAttachChoice] = useState<Record<string, string>>({});

  const refreshAll = async () => {
    await Promise.all([orders.refetch(), status.refetch()]);
  };
  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await action());
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(null);
    }
  };

  const rows = orders.data ?? [];
  const open = rows.filter((r) => r.open);
  const closed = rows.filter((r) => !r.open);
  const s = status.data;
  const lastCheck = s?.last_check ?? null;

  return (
    <PanelCard title="Bank transfers (SePay)">
      <p className="text-xs text-muted-foreground">
        Plans activate automatically: from SePay's webhook, and from a check of SePay's transaction
        list every 2 minutes (and every ~15 seconds while a learner is waiting on the payment page).
        A transfer for an expired order is still honoured for {s?.late_payment_days ?? 7} days.
        Anything that does not settle on its own is listed under "Unmatched transfers" below.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Bank account"
          value={
            s?.account
              ? `${s.account.bankName} ${s.account.accountNumberMasked}`
              : status.isLoading
                ? "…"
                : "—"
          }
          tone={s?.account ? (s.account.active ? "ok" : "warn") : undefined}
        />
        <Stat
          label="SePay's last transfer seen"
          value={s?.account?.lastTransactionAt?.slice(0, 16) ?? "—"}
        />
        <Stat
          label="Last webhook received"
          value={fmtDb(s?.last_webhook_at)}
          tone={s?.last_webhook_at ? "ok" : "warn"}
        />
        <Stat
          label="Last automatic check"
          value={
            lastCheck
              ? `${fmtDb(lastCheck.at)} · ${lastCheck.error ? "failed" : (lastCheck.skipped ?? `${lastCheck.checked} transfers`)}`
              : "—"
          }
          tone={lastCheck?.error ? "warn" : lastCheck ? "ok" : undefined}
        />
      </div>

      {(s?.warnings ?? []).length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          {s!.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy === "reconcile"}
          onClick={() =>
            void run("reconcile", async () => {
              const result = await reconcileNow();
              if (result.error) throw new Error(`SePay check failed: ${result.error}`);
              return result.activated.length
                ? `Activated ${result.activated.join(", ")}.`
                : `Checked ${result.checked} transfers — nothing new to activate.`;
            })
          }
          className={`${pill} bg-brass text-plum-deep`}
        >
          {busy === "reconcile" ? t("common.loading") : "Check SePay now"}
        </button>
      </div>

      {/* ------------------------------------------------------------ open orders */}
      <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Open orders ({open.length})
      </h4>
      {orders.isLoading && (
        <p className="mt-2 text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
      {!orders.isLoading && open.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No order is waiting for a transfer.</p>
      )}
      {open.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Code</th>
                <th className="py-2">User</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Created</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {open.map((row) => (
                <tr key={row.id} className="border-t border-border/60 align-top">
                  <td className="py-2 font-mono text-foreground">{row.reference_code}</td>
                  <td className="py-2 text-muted-foreground">
                    {row.email || row.user_id.slice(0, 8)}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.plan_key} · {row.billing_interval}
                  </td>
                  <td className="py-2 text-brass-soft">
                    {formatMoney(row.amount_vnd, "VND", locale)}
                  </td>
                  <td className="py-2 text-muted-foreground">{fmtDb(row.created_at)}</td>
                  <td className="py-2 text-muted-foreground">
                    {row.status === "expired" ? "expired (late transfer still OK)" : "waiting"}
                    {row.reported_at && (
                      <span className="mt-1 block font-semibold text-amber-500">
                        Learner says paid · {fmtDb(row.reported_at)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {manualFor === row.id ? (
                      <div className="flex min-w-64 flex-col items-end gap-1.5">
                        <input
                          value={manualReason}
                          onChange={(event) => setManualReason(event.target.value)}
                          placeholder="What you checked, e.g. VietinBank statement 05/10 10:12, 255,000đ"
                          className={`${field} w-full`}
                        />
                        <span className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={busy === row.id || manualReason.trim().length < 8}
                            onClick={() =>
                              void run(row.id, async () => {
                                await confirm({
                                  data: { orderId: row.id, reason: manualReason.trim() },
                                });
                                setManualFor(null);
                                setManualReason("");
                                return `${row.reference_code} confirmed — the plan is active.`;
                              })
                            }
                            className={`${pill} bg-brass text-plum-deep`}
                          >
                            {busy === row.id ? t("common.loading") : "Confirm paid"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualFor(null)}
                            className={`${pill} bg-surface-3 text-foreground`}
                          >
                            Cancel
                          </button>
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setManualFor(row.id);
                          setManualReason("");
                        }}
                        title="Only for a transfer SePay never recorded (e.g. sent without SEVQR). If SePay has it, attach it from the list below."
                        className={`${pill} bg-surface-3 text-foreground`}
                      >
                        Confirm manually…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------ unmatched transfers */}
      <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Unmatched transfers ({s?.unmatched.length ?? 0})
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Money SePay recorded in the last 30 days that is not attached to a paid order. Attach it to
        the right order to activate the plan (personal transfers into this account can simply be
        ignored).
      </p>
      {s && s.unmatched.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Every recent transfer is accounted for.
        </p>
      )}
      {s && s.unmatched.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Received</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Transfer note</th>
                <th className="py-2">Why it did not settle</th>
                <th className="py-2">Attach to order</th>
              </tr>
            </thead>
            <tbody>
              {s.unmatched.map((tx) => {
                const chosen = attachChoice[tx.transaction_id] ?? tx.candidates[0]?.order_id ?? "";
                return (
                  <tr key={tx.transaction_id} className="border-t border-border/60 align-top">
                    <td className="py-2 text-muted-foreground">{tx.date.slice(0, 16)}</td>
                    <td className="py-2 text-brass-soft">
                      {formatMoney(tx.amount, "VND", locale)}
                    </td>
                    <td className="max-w-56 break-words py-2 font-mono text-xs text-foreground">
                      {tx.content}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{tx.reason}</td>
                    <td className="py-2">
                      {tx.candidates.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No unpaid order with this amount
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={chosen}
                            onChange={(event) =>
                              setAttachChoice((prev) => ({
                                ...prev,
                                [tx.transaction_id]: event.target.value,
                              }))
                            }
                            className={field}
                          >
                            {tx.candidates.map((c) => (
                              <option key={c.order_id} value={c.order_id}>
                                {c.reference_code} · {c.email || "?"} · {c.plan} · {c.status}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!chosen || busy === tx.transaction_id}
                            onClick={() =>
                              void run(tx.transaction_id, async () => {
                                await attach({
                                  data: { orderId: chosen, transactionId: tx.transaction_id },
                                });
                                return "Transfer attached — the plan is active.";
                              })
                            }
                            className={`${pill} bg-brass text-plum-deep`}
                          >
                            {busy === tx.transaction_id ? t("common.loading") : "Attach"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------- history */}
      {closed.length > 0 && (
        <details className="mt-5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Paid, cancelled and old orders ({closed.length})
          </summary>
          <ul className="mt-2 divide-y divide-border">
            {closed.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="font-mono">{row.reference_code}</span>
                <span>{row.email || row.user_id.slice(0, 8)}</span>
                <span>
                  {row.status}
                  {row.status === "paid"
                    ? row.sepay_transaction_id
                      ? ` · SePay #${row.sepay_transaction_id}`
                      : " · confirmed by hand"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </PanelCard>
  );
}
