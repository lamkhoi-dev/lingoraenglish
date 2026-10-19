/**
 * Remembers the clip(s) the learner-facing player most recently asked the server for, so the admin-only
 * "Tạo bản mới" bar can act on exactly what was just heard. Each item is one cached clip: the exact text
 * and voice sent to speak(), i.e. the same pair the tts_cache key is built from.
 *
 * Call sites record only fixed content (vocabulary, lessons, shadowing, tests...). AI Coach replies are
 * never recorded: they differ every turn, so there is no saved clip worth replacing.
 */
export type AdminTtsItem = { text: string; voice: string };

const EMPTY: AdminTtsItem[] = [];
let current: AdminTtsItem[] = EMPTY;
const listeners = new Set<() => void>();

export const ttsAdminStore = {
  record(items: AdminTtsItem[]): void {
    const clean = items.filter((i) => i.text.trim());
    // Nothing changed (the same line replayed): keep the same reference so subscribers do not re-render.
    if (
      clean.length === current.length &&
      clean.every((c, i) => c.text === current[i]!.text && c.voice === current[i]!.voice)
    ) {
      return;
    }
    current = clean.length ? clean : EMPTY;
    for (const l of listeners) l();
  },
  get(): AdminTtsItem[] {
    return current;
  },
  getServer(): AdminTtsItem[] {
    return EMPTY;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
