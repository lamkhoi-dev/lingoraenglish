/**
 * Mục 3.2 "Tạo sẵn âm thanh cho nội dung cố định" — the requirement calls this
 * the single biggest cost saving in the product.
 *
 * Fixed content (Shadowing sentences, Listening scripts, Vocabulary words,
 * Pronunciation words/sentences) never changes per learner, so its audio is
 * generated once here, in the background, in batches — instead of the first
 * learner to press play paying the latency and the call. Everything lands in
 * the same `tts_cache` rows `speak()` reads, under the same cache key, so no
 * app code changes: already-cached items are skipped, and anything this script
 * misses still falls back to generate-on-demand exactly as before.
 *
 * Run (no bun on the Windows dev box — same pattern as the typecheck command):
 *   docker run --rm --env-file .env -v "<repo>:/app" -w /app oven/bun:1-alpine \
 *     sh -c "bun run scripts/pregenerate-audio.ts --dry-run"
 *
 * Flags:
 *   --dry-run    count what is missing and estimate the cost, generate nothing
 *   --limit=N    stop after N generations (resumable — just run it again)
 *   --only=X     one source only: shadowing | listening | vocabulary | pronunciation
 */
import { eq, inArray } from "drizzle-orm";

import { rawSql, withAdmin } from "../src/db";
import {
  listeningLessons,
  shadowingSentences,
  ttsCache,
  vocabularyWords,
} from "../src/db/schema/schema";
import { currentAudioProvider, currentTtsModel, synthesise } from "../src/lib/ai-providers.server";
import { priceCall } from "../src/lib/ai-cost.server";

const DEFAULT_VOICE = "shimmer";
/** Matches speak() in lily.functions.ts exactly — a different key would
 * generate a second copy instead of serving the learner's request. */
const cacheKey = (text: string, voice: string) =>
  `${currentAudioProvider()}::${voice}::${text.trim().toLowerCase()}`;

type Item = { text: string; voice: string; source: string };

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}
const dryRun = process.argv.includes("--dry-run");
const limit = Number(arg("limit") ?? 0);
const only = arg("only");

async function collect(): Promise<Item[]> {
  const items: Item[] = [];
  const want = (source: string) => !only || only === source;

  if (want("shadowing")) {
    const rows = await withAdmin((db) =>
      db
        .select({ sentence: shadowingSentences.sentence, voice: shadowingSentences.speakerVoice })
        .from(shadowingSentences)
        .where(eq(shadowingSentences.status, "published")),
    );
    for (const r of rows) {
      if (r.sentence.trim())
        items.push({ text: r.sentence, voice: r.voice || DEFAULT_VOICE, source: "shadowing" });
    }
  }

  if (want("listening")) {
    const rows = await withAdmin((db) =>
      db
        .select({ script: listeningLessons.script })
        .from(listeningLessons)
        .where(eq(listeningLessons.status, "published")),
    );
    for (const r of rows) {
      const lines = Array.isArray(r.script) ? (r.script as { line?: string }[]) : [];
      for (const line of lines) {
        if (line?.line?.trim())
          items.push({ text: line.line, voice: DEFAULT_VOICE, source: "listening" });
      }
    }
  }

  if (want("vocabulary")) {
    const rows = await withAdmin((db) =>
      db
        .select({ word: vocabularyWords.word })
        .from(vocabularyWords)
        .where(eq(vocabularyWords.status, "published")),
    );
    for (const r of rows) {
      if (r.word.trim()) items.push({ text: r.word, voice: DEFAULT_VOICE, source: "vocabulary" });
    }
  }

  if (want("pronunciation")) {
    const { PHONEMES } = await import("../src/lib/pronunciation-sounds.server");
    for (const p of PHONEMES) {
      for (const w of p.words ?? []) {
        if (typeof w === "string" && w.trim())
          items.push({ text: w, voice: DEFAULT_VOICE, source: "pronunciation" });
      }
      for (const s of p.sentences ?? []) {
        if (typeof s === "string" && s.trim())
          items.push({ text: s, voice: DEFAULT_VOICE, source: "pronunciation" });
      }
    }
  }

  // The same sentence can appear in several places; generate it once.
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = cacheKey(i.text, i.voice);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main() {
  const items = await collect();

  // Which of these already have audio — checked in chunks so the IN list
  // cannot outgrow what Postgres will accept.
  const cached = new Set<string>();
  const keys = items.map((i) => cacheKey(i.text, i.voice));
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    const rows = await withAdmin((db) =>
      db
        .select({ cacheKey: ttsCache.cacheKey })
        .from(ttsCache)
        .where(inArray(ttsCache.cacheKey, chunk)),
    );
    for (const r of rows) cached.add(r.cacheKey);
  }

  const missing = items.filter((i) => !cached.has(cacheKey(i.text, i.voice)));
  const perSource = (list: Item[]) =>
    list.reduce<Record<string, number>>(
      (acc, i) => ({ ...acc, [i.source]: (acc[i.source] ?? 0) + 1 }),
      {},
    );

  console.log("Fixed content found:", perSource(items), `total ${items.length}`);
  console.log("Already cached:", items.length - missing.length);
  console.log("To generate:", perSource(missing), `total ${missing.length}`);
  const estimate = (priceCall(currentTtsModel(), 0, 0) * missing.length) / 1_000_000;
  console.log(`Estimated cost: $${estimate.toFixed(2)}`);

  if (dryRun) {
    console.log("\n--dry-run: nothing generated.");
    await rawSql.end();
    return;
  }

  const todo = limit > 0 ? missing.slice(0, limit) : missing;
  let done = 0;
  let failed = 0;

  for (const item of todo) {
    try {
      const { base64, mime } = await synthesise(item.text, item.voice);
      await withAdmin((db) =>
        db
          .insert(ttsCache)
          .values({
            cacheKey: cacheKey(item.text, item.voice),
            textContent: item.text,
            voice: item.voice,
            audioBase64: base64,
            mimeType: mime,
          })
          .onConflictDoNothing({ target: ttsCache.cacheKey }),
      );
      done += 1;
      if (done % 25 === 0) console.log(`  ${done}/${todo.length} generated…`);
    } catch (error) {
      failed += 1;
      console.error(
        `  FAILED (${item.source}): ${item.text.slice(0, 60)}`,
        error instanceof Error ? error.message : error,
      );
      // A provider hiccup should not throw away the work already done — the
      // script is resumable, so keep going and report at the end.
    }
  }

  console.log(`\nGenerated ${done}, failed ${failed}, remaining ${missing.length - done}.`);
  if (failed > 0) console.log("Re-run to retry the failures (cached items are skipped).");
  await rawSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
