import { Check, Globe, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useI18n, type LocaleCode } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Compact globe button + popover list of every interface language, in native names. */
export function LanguageSelector({ className }: { className?: string }) {
  const { locale, language, languages, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) => l.native.toLowerCase().includes(q) || l.english.toLowerCase().includes(q),
    );
  }, [query, languages]);

  const pick = (code: LocaleCode) => {
    setLocale(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("lang.choose")}
        className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-2 text-xs font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-surface-3"
      >
        <Globe className="size-3.5 text-brass-soft" />
        <span className="hidden sm:inline">{language.native}</span>
        <span className="sm:hidden">{language.code.toUpperCase()}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute end-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("lang.interface")}
              className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto p-1">
            {results.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.code === locale}
                  onClick={() => pick(l.code)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm transition-colors hover:bg-surface-2",
                    l.code === locale ? "text-brass-soft" : "text-foreground",
                  )}
                >
                  <span aria-hidden className="text-base leading-none">
                    {l.flag}
                  </span>
                  <span className="flex-1 font-medium" lang={l.code} dir={l.dir}>
                    {l.native}
                  </span>
                  {l.code === locale && <Check className="size-3.5" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {t("lang.note")}
          </p>
        </div>
      )}
    </div>
  );
}
