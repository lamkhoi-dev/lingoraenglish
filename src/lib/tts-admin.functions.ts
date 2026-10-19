/**
 * Admin-only "Tạo bản mới" for every spoken clip on the site (not AI Coach replies, which are different
 * every turn). Same three steps as the Sounds tool: listen to the clip that is currently saved, generate a
 * fresh candidate WITHOUT touching the cache, and save the candidate over the saved one. Every handler
 * checks the caller is an admin on the server first; students never reach these functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { withAdmin } from "@/db";
import { ttsCache } from "@/db/schema/schema";
import { synthesise, ttsCacheKey } from "@/lib/ai-providers.server";
import { requireAdmin } from "@/lib/require-auth";

const itemInput = z.object({
  text: z.string().min(1).max(1200),
  voice: z.string().min(1).max(24).default("shimmer"),
});
const itemsInput = z.object({ items: z.array(itemInput).min(1).max(12) });

/** The clips currently saved for these texts (null when nothing is saved yet). */
export const adminTtsGetSaved = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => itemsInput.parse(d))
  .handler(async ({ data }) => {
    const keys = data.items.map((i) => ttsCacheKey(i.voice, i.text));
    const rows = await withAdmin((db) =>
      db
        .select({ cacheKey: ttsCache.cacheKey, audioBase64: ttsCache.audioBase64, mimeType: ttsCache.mimeType })
        .from(ttsCache)
        .where(inArray(ttsCache.cacheKey, keys)),
    );
    const byKey = new Map(rows.map((r) => [r.cacheKey, r]));
    return {
      clips: data.items.map((item) => {
        const row = byKey.get(ttsCacheKey(item.voice, item.text));
        return { text: item.text, voice: item.voice, audioBase64: row?.audioBase64 ?? null, mime: row?.mimeType ?? null };
      }),
    };
  });

/** Generates a fresh take for each text with the normal AI chain, WITHOUT saving anything. */
export const adminTtsGenerate = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => itemsInput.parse(d))
  .handler(async ({ data }) => {
    const clips: { text: string; voice: string; audioBase64: string; mime: string }[] = [];
    // One at a time: a clip is at most a few chunks, and parallel calls would only burn rate limit faster.
    for (const item of data.items) {
      const { base64, mime } = await synthesise(item.text, item.voice);
      clips.push({ text: item.text, voice: item.voice, audioBase64: base64, mime });
    }
    return { clips };
  });

const saveInput = z.object({
  items: z
    .array(
      z.object({
        text: z.string().min(1).max(1200),
        voice: z.string().min(1).max(24).default("shimmer"),
        audioBase64: z.string().min(64),
        mimeType: z.string().min(3).max(60).default("audio/wav"),
      }),
    )
    .min(1)
    .max(12),
});

/** Overwrites the saved clip for each text with the take the admin just approved. Students' next listen is
 * then a cache hit on this take (same key formula as speak(), so nothing can drift). */
export const adminTtsSave = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data }) => {
    for (const item of data.items) {
      await withAdmin((db) =>
        db
          .insert(ttsCache)
          .values({
            cacheKey: ttsCacheKey(item.voice, item.text),
            textContent: item.text,
            voice: item.voice,
            audioBase64: item.audioBase64,
            mimeType: item.mimeType,
          })
          .onConflictDoUpdate({
            target: ttsCache.cacheKey,
            set: { textContent: item.text, audioBase64: item.audioBase64, mimeType: item.mimeType, hits: 0 },
          }),
      );
    }
    return { ok: true, saved: data.items.length };
  });
