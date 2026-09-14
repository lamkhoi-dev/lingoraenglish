/**
 * Admin → Premium members. One place to see every learner's membership and to
 * grant or remove Premium by hand. All decisions happen on the server.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { formatMoney } from "@/components/lily/billing-ui";
import { PanelCard } from "@/components/lily/score-panel";
import {
  adminListMembers,
  grantComplimentaryAccess,
  revokeMemberComplimentary,
} from "@/lib/billing-admin.functions";
import { useI18n } from "@/lib/i18n";

export function AdminMembers() {
  const { t, locale } = useI18n();
  const listMembers = useServerFn(adminListMembers);
  const grant = useServerFn(grantComplimentaryAccess);
  const revoke = useServerFn(revokeMemberComplimentary);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<"premium" | "ielts_pro">("premium");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);

  const members = useQuery({
    queryKey: ["admin-members", query],
    queryFn: () => listMembers({ data: { search: query } }),
  });

  const fmtDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "—";

  const rows = members.data?.members ?? [];
  const premiumCount = rows.filter((row) => row.tier !== "free").length;

  const runGrant = async () => {
    setBusy(true);
    try {
      await grant({
        data: {
          email: email.trim(),
          tier,
          ...(Number(days) > 0 ? { days: Number(days) } : {}),
          note: "Granted from Premium members panel",
        },
      });
      toast.success(t("adminBilling.granted"));
      setEmail("");
      await members.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  const runRevoke = async (userId: string) => {
    if (!window.confirm(t("adminMembers.removeConfirm"))) return;
    setBusy(true);
    try {
      await revoke({ data: { userId } });
      toast.success(t("adminBilling.revoked"));
      await members.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <PanelCard title={t("adminMembers.grantTitle")}>
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.6fr_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.email")}
            className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
          />
          <select
            value={tier}
            onChange={(event) => setTier(event.target.value as "premium" | "ielts_pro")}
            className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
          >
            <option value="premium">{t("plan.premium")}</option>
            <option value="ielts_pro">{t("plan.ieltsPro")}</option>
          </select>
          <input
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
            placeholder={t("adminBilling.days")}
            className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
          />
          <button
            type="button"
            disabled={busy || email.trim().length < 4}
            onClick={() => void runGrant()}
            className="rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep disabled:opacity-50"
          >
            {t("adminBilling.grant")}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("adminMembers.grantNote")}</p>
      </PanelCard>

      <PanelCard
        title={t("adminMembers.title")}
        actions={
          <span className="text-xs text-muted-foreground">
            {t("adminMembers.count", { premium: String(premiumCount), total: String(rows.length) })}
          </span>
        }
      >
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setQuery(search);
            }}
            placeholder={t("adminMembers.searchPlaceholder")}
            className="min-w-[220px] flex-1 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
          />
          <button
            type="button"
            onClick={() => setQuery(search)}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium"
          >
            {t("adminMembers.search")}
          </button>
        </div>

        {members.isLoading && <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!members.isLoading && rows.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">{t("adminMembers.empty")}</p>
        )}

        {rows.length > 0 && (
          <ul className="mt-4 divide-y divide-border text-sm">
            {rows.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-foreground">
                    <span className="truncate">{member.name || member.email}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        member.tier === "free"
                          ? "bg-surface-3 text-muted-foreground"
                          : "bg-brass text-plum-deep"
                      }`}
                    >
                      {member.tier === "free"
                        ? t("membership.freeMember")
                        : member.tier === "ielts_pro"
                          ? t("plan.ieltsPro")
                          : t("plan.premium")}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("adminMembers.source." + member.source as never) || member.source} ·{" "}
                    {t(`billing.state.${member.status}` as never) || member.status}
                    {member.cancelAtPeriodEnd ? ` · ${t("adminBilling.cancelling")}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    {t("membership.startDate")}: {fmtDate(member.startedAt)}
                  </p>
                  <p>
                    {t("membership.expiresOn")}:{" "}
                    {member.expiresAt ? fmtDate(member.expiresAt) : t("adminBilling.noExpiry")}
                  </p>
                  {member.amount ? (
                    <p className="text-brass-soft">
                      {formatMoney(member.amount / 100, member.currency, locale)}
                      {member.interval === "year" ? "/yr" : "/mo"}
                    </p>
                  ) : null}
                  {member.complimentaryId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runRevoke(member.userId)}
                      className="mt-1 text-xs font-medium text-destructive underline disabled:opacity-50"
                    >
                      {t("adminMembers.remove")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted-foreground">{t("adminMembers.paidNote")}</p>
      </PanelCard>
    </div>
  );
}
