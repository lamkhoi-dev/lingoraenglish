import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminBillingPanel } from "@/components/lily/admin-billing";
import { AdminCoachPanel } from "@/components/lily/admin-coach";
import { AdminShadowingPanel } from "@/components/lily/admin-shadowing";
import { AdminPronunciationPanel } from "@/components/lily/admin-pronunciation";
import { AdminVocabularyPanel } from "@/components/lily/admin-vocabulary";
import { AdminMembers } from "@/components/lily/admin-members";
import { AdminPlansPanel } from "@/components/lily/admin-plans";
import { AppShell } from "@/components/lily/app-shell";
import { SectionHeading } from "@/components/lily/brand";
import { PanelCard, ScoreStat } from "@/components/lily/score-panel";
import {
  adminCreateLanguage,
  getAdminContent,
  getAdminOverview,
  getTranslationOverrides,
  saveTranslationOverride,
  setContentAccessTier,
} from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth";
import { translationCoverage, useI18n, type LocaleCode } from "@/lib/i18n";
import { en, type TranslationKey } from "@/locales/en";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: `${en["admin.title"]} — ${en["brand.name"]}` },
      { name: "description", content: en["admin.sub"] },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: `${en["admin.title"]} — ${en["brand.name"]}` },
      { property: "og:description", content: en["admin.sub"] },
    ],
  }),
  component: AdminPage,
});

type Tab =
  | "students"
  | "members"
  | "content"
  | "translations"
  | "usage"
  | "billing"
  | "plans"
  | "coach"
  | "shadowing"
  | "pronunciation"
  | "vocabulary";
type ContentRow = {
  id: string;
  table: "vocabulary_words" | "grammar_lessons" | "speaking_questions" | "ielts_questions" | "listening_exercises";
  rowId: string;
  label: string;
  status: string;
  access_tier: string;
  updated_at: string;
};

const ACCESS_TIERS = ["free", "premium", "ielts_pro"] as const;

function AdminPage() {
  const { t, formatDate, languages } = useI18n();
  const { isAdmin, loading } = useAuth();
  const getAdminOverviewFn = useServerFn(getAdminOverview);
  const getAdminContentFn = useServerFn(getAdminContent);
  const setContentAccessTierFn = useServerFn(setContentAccessTier);
  const getTranslationOverridesFn = useServerFn(getTranslationOverrides);
  const saveTranslationOverrideFn = useServerFn(saveTranslationOverride);
  const adminCreateLanguageFn = useServerFn(adminCreateLanguage);

  const [tab, setTab] = useState<Tab>("students");
  const [counts, setCounts] = useState({ students: 0, requests: 0, cache: 0, content: 0 });
  const [students, setStudents] = useState<
    { id: string; full_name: string; email: string; english_level: string; created_at: string }[]
  >([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [usage, setUsage] = useState<{ capability: string; count: number }[]>([]);

  const [targetLocale, setTargetLocale] = useState<LocaleCode>("vi");
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newLang, setNewLang] = useState({ code: "", nativeName: "", englishName: "", flag: "", direction: "ltr", intlTag: "" });
  const [addingLang, setAddingLang] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const overview = await getAdminOverviewFn();
      setStudents(overview.students);
      const tally = new Map<string, number>();
      for (const capability of overview.usage) tally.set(capability, (tally.get(capability) ?? 0) + 1);
      setUsage([...tally.entries()].map(([capability, count]) => ({ capability, count })).sort((a, b) => b.count - a.count));
      setCounts((prev) => ({ ...prev, ...overview.counts }));
    })();
  }, [isAdmin, getAdminOverviewFn]);

  /** Content access level. Row policies enforce the same rule for learners. */
  const setAccessTier = async (row: ContentRow, tier: string) => {
    if (row.table === "speaking_questions") return;
    try {
      await setContentAccessTierFn({
        data: { table: row.table, rowId: row.rowId, tier: tier as "free" | "premium" | "ielts_pro" },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.somethingWrong"));
      return;
    }
    setContent((prev) => prev.map((item) => (item.id === row.id ? { ...item, access_tier: tier } : item)));
  };

  useEffect(() => {
    if (!isAdmin || tab !== "content") return;
    void (async () => {
      const { vocab, grammar, speakingQ, ieltsQ, listening } = await getAdminContentFn();
      const rows: ContentRow[] = [
        ...vocab.map((r) => ({ id: `v${r.id}`, table: "vocabulary_words" as const, rowId: r.id, label: `📚 ${r.word}`, status: r.status, access_tier: r.access_tier, updated_at: r.updated_at })),
        ...grammar.map((r) => ({ id: `g${r.id}`, table: "grammar_lessons" as const, rowId: r.id, label: `📖 ${r.title}`, status: r.status, access_tier: r.access_tier, updated_at: r.updated_at })),
        ...speakingQ.map((r) => ({ id: `s${r.id}`, table: "speaking_questions" as const, rowId: r.id, label: `🎤 ${r.prompt}`, status: r.status, access_tier: "free", updated_at: r.updated_at })),
        ...ieltsQ.map((r) => ({ id: `i${r.id}`, table: "ielts_questions" as const, rowId: r.id, label: `🎯 ${r.prompt}`, status: r.status, access_tier: r.access_tier, updated_at: r.updated_at })),
        ...listening.map((r) => ({ id: `l${r.id}`, table: "listening_exercises" as const, rowId: r.id, label: `🎧 ${r.title}`, status: r.status, access_tier: r.access_tier, updated_at: r.updated_at })),
      ];
      setContent(rows);
      setCounts((prev) => ({ ...prev, content: rows.length }));
    })();
  }, [isAdmin, tab, getAdminContentFn]);

  useEffect(() => {
    if (!isAdmin || tab !== "translations") return;
    void (async () => {
      const rows = await getTranslationOverridesFn({ data: { locale: targetLocale } });
      const map: Record<string, string> = {};
      for (const row of rows) map[row.translation_key] = row.value;
      setOverrides(map);
      setDraft({});
    })();
  }, [isAdmin, tab, targetLocale, getTranslationOverridesFn]);

  const coverage = useMemo(() => translationCoverage(targetLocale, overrides as never), [targetLocale, overrides]);

  const keys = useMemo(() => {
    const all = Object.keys(en) as TranslationKey[];
    const missing = new Set<string>(coverage.missing);
    return all.filter((key) => {
      if (missingOnly && !missing.has(key)) return false;
      if (!search) return true;
      const needle = search.toLowerCase();
      return key.toLowerCase().includes(needle) || en[key].toLowerCase().includes(needle);
    });
  }, [coverage.missing, missingOnly, search]);

  const saveKey = async (key: string) => {
    const value = (draft[key] ?? "").trim();
    if (!value) return;
    try {
      await saveTranslationOverrideFn({ data: { locale: targetLocale, key, value } });
    } catch {
      toast.error(t("common.somethingWrong"));
      return;
    }
    setOverrides((prev) => ({ ...prev, [key]: value }));
    toast.success(t("common.saved"));
  };

  /** Registers a language as pure data (ui_languages row) — no code change
   * or redeploy needed for it to show up everywhere languages are picked.
   * Its dictionary is filled in afterwards, either via
   * scripts/load-languages.py or by switching this tab's locale to the new
   * code and saving keys one by one. */
  const addLanguage = async () => {
    if (!newLang.code.trim() || !newLang.nativeName.trim() || !newLang.englishName.trim() || !newLang.intlTag.trim()) {
      toast.error("Code, native name, English name and Intl tag are required.");
      return;
    }
    setAddingLang(true);
    try {
      await adminCreateLanguageFn({
        data: {
          code: newLang.code.trim(),
          nativeName: newLang.nativeName.trim(),
          englishName: newLang.englishName.trim(),
          flag: newLang.flag.trim(),
          direction: newLang.direction as "ltr" | "rtl",
          intlTag: newLang.intlTag.trim(),
        },
      });
      toast.success(`${newLang.nativeName} added`);
      setNewLang({ code: "", nativeName: "", englishName: "", flag: "", direction: "ltr", intlTag: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the language");
    } finally {
      setAddingLang(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <SectionHeading eyebrow={t("nav.admin")} title={t("admin.title")} description={t("admin.onlyAdmins")} />
      </AppShell>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "students", label: t("admin.tab.students") },
    { id: "members", label: t("admin.tab.members") },
    { id: "content", label: t("admin.tab.content") },
    { id: "translations", label: t("admin.tab.translations") },
    { id: "usage", label: t("admin.tab.usage") },
    { id: "billing", label: t("admin.tab.billing") },
    { id: "plans", label: t("admin.tab.plans") },
    { id: "coach", label: "Speaking Coach" },
    { id: "shadowing", label: "Shadowing" },
    { id: "pronunciation", label: "Pronunciation" },
    { id: "vocabulary", label: "Vocabulary" },
  ];


  return (
    <AppShell>
      <SectionHeading eyebrow={t("nav.admin")} title={t("admin.title")} description={t("admin.sub")} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lounge-panel p-5">
          <ScoreStat label={t("admin.totalStudents")} value={counts.students} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("admin.aiRequests")} value={counts.requests} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("admin.ttsCache")} value={counts.cache} suffix="" />
        </div>
        <div className="lounge-panel p-5">
          <ScoreStat label={t("admin.contentItems")} value={counts.content} suffix="" />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-border ${
              tab === item.id ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "students" && (
          <PanelCard title={t("admin.students")}>
            <ul className="divide-y divide-border">
              {students.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.full_name || s.email}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p className="text-brass-soft">{s.english_level}</p>
                    <p>{formatDate(s.created_at, { dateStyle: "medium" })}</p>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        )}

        {tab === "content" && (
          <PanelCard title={t("admin.contentItems")}>
            <ul className="divide-y divide-border">
              {content.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <p className="line-clamp-1 text-sm text-foreground">{row.label}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 ring-1 ring-border">{row.status}</span>
                    {row.table === "speaking_questions" ? null : (
                      <select
                        value={row.access_tier}
                        onChange={(event) => void setAccessTier(row, event.target.value)}
                        className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-foreground ring-1 ring-border"
                      >
                        {ACCESS_TIERS.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier === "ielts_pro" ? t("plan.ieltsPro") : tier === "premium" ? t("plan.premium") : t("plan.free")}
                          </option>
                        ))}
                      </select>
                    )}
                    <span>{formatDate(row.updated_at, { dateStyle: "medium" })}</span>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        )}

        {tab === "translations" && (
          <PanelCard title={t("admin.translations")}>
            <p className="text-sm text-muted-foreground">{t("admin.translationsIntro")}</p>

            <details className="mt-4 rounded-xl bg-surface-2 p-3 ring-1 ring-border">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                + Register a new language ({languages.length} enabled)
              </summary>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Adds the language everywhere it's picked immediately — no code change or redeploy. Its
                dictionary starts empty; fill it in below (pick this code once added) or via
                scripts/load-languages.py.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={newLang.code}
                  onChange={(e) => setNewLang((v) => ({ ...v, code: e.target.value }))}
                  placeholder="Code (th, pl, ...)"
                  className="w-32 rounded-lg bg-surface-3 px-2 py-1.5 text-xs text-foreground ring-1 ring-border"
                />
                <input
                  value={newLang.nativeName}
                  onChange={(e) => setNewLang((v) => ({ ...v, nativeName: e.target.value }))}
                  placeholder="Native name (ไทย)"
                  className="w-40 rounded-lg bg-surface-3 px-2 py-1.5 text-xs text-foreground ring-1 ring-border"
                />
                <input
                  value={newLang.englishName}
                  onChange={(e) => setNewLang((v) => ({ ...v, englishName: e.target.value }))}
                  placeholder="English name (Thai)"
                  className="w-40 rounded-lg bg-surface-3 px-2 py-1.5 text-xs text-foreground ring-1 ring-border"
                />
                <input
                  value={newLang.flag}
                  onChange={(e) => setNewLang((v) => ({ ...v, flag: e.target.value }))}
                  placeholder="🇹🇭"
                  className="w-16 rounded-lg bg-surface-3 px-2 py-1.5 text-xs text-foreground ring-1 ring-border"
                />
                <select
                  value={newLang.direction}
                  onChange={(e) => setNewLang((v) => ({ ...v, direction: e.target.value }))}
                  className="rounded-lg bg-surface-3 px-2 py-1.5 text-xs text-foreground ring-1 ring-border"
                >
                  <option value="ltr">LTR</option>
                  <option value="rtl">RTL</option>
                </select>
                <input
                  value={newLang.intlTag}
                  onChange={(e) => setNewLang((v) => ({ ...v, intlTag: e.target.value }))}
                  placeholder="Intl tag (th-TH)"
                  className="w-32 rounded-lg bg-surface-3 px-2 py-1.5 text-xs text-foreground ring-1 ring-border"
                />
                <button
                  type="button"
                  disabled={addingLang}
                  onClick={() => void addLanguage()}
                  className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-plum-deep disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </details>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                value={targetLocale}
                onChange={(e) => setTargetLocale(e.target.value as LocaleCode)}
                className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.native}
                  </option>
                ))}
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("admin.searchKeys")}
                className="min-w-48 flex-1 rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
              />
              <button
                type="button"
                onClick={() => setMissingOnly((v) => !v)}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold ring-1 ring-border ${
                  missingOnly ? "bg-brass text-plum-deep" : "bg-surface-2 text-muted-foreground"
                }`}
              >
                {t("admin.missingOnly")}
              </button>
              <span className="text-xs text-plum-soft">{t("admin.missingCount", { count: coverage.missing.length })}</span>
            </div>

            <ul className="mt-5 space-y-3">
              {keys.slice(0, 200).map((key) => (
                <li key={key} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
                  <p className="text-xs text-muted-foreground">{key}</p>
                  <p className="mt-1 text-sm text-mist">
                    <span className="mr-2 text-xs font-semibold uppercase tracking-[0.1em] text-brass-soft">
                      {t("admin.sourceEnglish")}
                    </span>
                    {en[key]}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      value={draft[key] ?? overrides[key] ?? ""}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={t("admin.translation")}
                      className="min-w-56 flex-1 rounded-xl bg-surface px-3 py-2 text-sm text-foreground ring-1 ring-border outline-none focus:ring-brass"
                    />
                    <button
                      type="button"
                      onClick={() => void saveKey(key)}
                      className="rounded-full bg-brass px-4 py-2 text-xs font-semibold text-plum-deep hover:bg-brass-soft"
                    >
                      {t("common.save")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>
        )}

        {tab === "usage" && (
          <PanelCard title={t("usage.title")}>
            <ul className="divide-y divide-border">
              {usage.map((row) => (
                <li key={row.capability} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-foreground">{row.capability}</span>
                  <span className="text-brass-soft">{row.count}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("usage.cacheHits")}: {counts.cache}
            </p>
          </PanelCard>
        )}

        {tab === "members" && <AdminMembers />}

        {tab === "billing" && <AdminBillingPanel />}

        {tab === "plans" && <AdminPlansPanel />}

        {tab === "coach" && <AdminCoachPanel />}
        {tab === "shadowing" && <AdminShadowingPanel />}
        {tab === "pronunciation" && <AdminPronunciationPanel />}
        {tab === "vocabulary" && <AdminVocabularyPanel />}

      </div>
    </AppShell>
  );
}
