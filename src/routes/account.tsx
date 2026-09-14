import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { MembershipPanel, PaymentHistoryPanel } from "@/components/lily/membership-panel";
import { PanelCard } from "@/components/lily/score-panel";
import { deleteMyAccountData, getMyAccountProfile, updateMyAccountProfile } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, useI18n, type LocaleCode } from "@/lib/i18n";
import { en } from "@/locales/en";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: en["account.meta.title"] },
      { name: "description", content: en["account.meta.description"] },
      { property: "og:title", content: en["account.meta.title"] },
      { property: "og:description", content: en["account.meta.description"] },
    ],
  }),
  component: AccountPage,
});

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const GOALS = [
  "confidence",
  "pronunciation",
  "work",
  "travel",
  "ielts",
  "toeic",
  "study",
  "daily",
  "business",
  "interview",
] as const;
const VOICES = ["shimmer", "alloy", "nova", "verse"];
const MINUTES = [5, 10, 15, 20, 30, 45, 60];

function AccountPage() {
  const { t, locale, setLocale, languages, englishOnly, setEnglishOnly } = useI18n();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const getMyAccountProfileFn = useServerFn(getMyAccountProfile);
  const updateMyAccountProfileFn = useServerFn(updateMyAccountProfile);
  const deleteMyAccountDataFn = useServerFn(deleteMyAccountData);

  const [fullName, setFullName] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState<string>("en");
  const [level, setLevel] = useState<string>("B1");
  const [targetLevel, setTargetLevel] = useState<string>("C1");
  const [goal, setGoal] = useState<string>("confidence");
  const [minutes, setMinutes] = useState(15);
  const [voice, setVoice] = useState("shimmer");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const data = await getMyAccountProfileFn();
      if (!data) return;
      setFullName(data.fullName ?? "");
      setNativeLanguage(data.nativeLanguage || "en");
      setLevel(data.englishLevel ?? "B1");
      setTargetLevel(data.targetLevel ?? "C1");
      setGoal(data.learningGoal || "confidence");
      setMinutes(data.dailyGoalMinutes ?? 15);
      setVoice(data.voicePreference || "shimmer");
    })();
  }, [user, getMyAccountProfileFn]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateMyAccountProfileFn({
        data: {
          fullName,
          nativeLanguage,
          englishLevel: level as "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
          targetLevel: targetLevel as "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
          learningGoal: goal,
          dailyGoalMinutes: minutes,
          englishOnlyMode: englishOnly,
          voicePreference: voice,
          interfaceLanguage: locale,
        },
      });
      await refreshProfile();
      toast.success(t("common.saved"));
    } catch {
      toast.error(t("common.somethingWrong"));
    } finally {
      setSaving(false);
    }
  };

  const deleteData = async () => {
    if (!user) return;
    if (!window.confirm(t("account.deleteConfirm"))) return;
    try {
      await deleteMyAccountDataFn();
      toast.success(t("account.deleted"));
    } catch {
      toast.error(t("common.somethingWrong"));
    }
  };

  if (!user) {
    return (
      <AppShell>
        <SectionHeading eyebrow={t("nav.account")} title={t("account.title")} description={t("account.sub")} />
        <div className="lounge-panel mt-8 p-6">
          <p className="text-sm text-mist">{t("common.signInRequired")}</p>
          <Link
            to="/auth"
            className="mt-4 inline-block rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep hover:bg-brass-soft"
          >
            {t("common.signIn")}
          </Link>
        </div>
      </AppShell>
    );
  }

  const labelClass = "text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft";
  const fieldClass =
    "mt-1.5 w-full rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass";

  return (
    <AppShell>
      <SectionHeading eyebrow={t("nav.account")} title={t("account.title")} description={t("account.sub")} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <MembershipPanel />
        <PaymentHistoryPanel />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <PanelCard title={t("account.profile")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>{t("account.fullName")}</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className={labelClass}>{t("auth.email")}</span>
              <input value={profile?.email ?? user.email ?? ""} readOnly className={`${fieldClass} opacity-70`} />
            </label>
            <label className="block">
              <span className={labelClass}>{t("lang.interface")}</span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as LocaleCode)}
                className={fieldClass}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.native}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("account.nativeLanguage")}</span>
              <select value={nativeLanguage} onChange={(e) => setNativeLanguage(e.target.value)} className={fieldClass}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.native}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("account.englishLevel")}</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className={fieldClass}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`level.${l}` as const)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("account.targetLevel")}</span>
              <select value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} className={fieldClass}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`level.${l}` as const)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("account.goal")}</span>
              <select value={goal} onChange={(e) => setGoal(e.target.value)} className={fieldClass}>
                {GOALS.map((g) => (
                  <option key={g} value={g}>
                    {t(`goal.${g}` as const)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("account.dailyGoal")}</span>
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={fieldClass}>
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {t("common.minutes", { count: m })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>{t("account.voice")}</span>
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className={fieldClass}>
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
            <h4 className={labelClass}>{t("account.learningMode")}</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEnglishOnly(false)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-border ${
                  englishOnly ? "bg-surface-3 text-muted-foreground" : "bg-brass text-plum-deep"
                }`}
              >
                {t("account.mode.bilingual")}
              </button>
              <button
                type="button"
                onClick={() => setEnglishOnly(true)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-border ${
                  englishOnly ? "bg-brass text-plum-deep" : "bg-surface-3 text-muted-foreground"
                }`}
              >
                {t("account.mode.englishOnly")}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("account.mode.englishOnlyHint")}</p>
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-6 rounded-full bg-brass px-5 py-2.5 text-sm font-semibold text-plum-deep hover:bg-brass-soft disabled:opacity-60"
          >
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </PanelCard>

        <aside className="space-y-6">
          <PanelCard title={t("account.privacy")}>
            <p className="text-sm leading-relaxed text-mist">{t("account.privacyBody")}</p>
            <button
              type="button"
              onClick={() => void deleteData()}
              className="mt-4 w-full rounded-full bg-plum/20 px-4 py-2.5 text-sm font-semibold text-plum-soft ring-1 ring-border hover:bg-plum/30"
            >
              {t("account.deleteRecordings")}
            </button>
          </PanelCard>

          <div className="lounge-panel p-5">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/" });
              }}
              className="w-full rounded-full bg-surface-2 px-4 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-surface-3"
            >
              {t("common.signOut")}
            </button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
