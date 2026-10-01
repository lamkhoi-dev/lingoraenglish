// Validates translated Pronunciation lesson texts and turns the good ones into
// one SQL upsert for public.pronunciation_lesson_texts.
//
//   node scripts/load-pronunciation-translations.mjs [code ...]
//
// Reads scripts/seed/pronunciation-translations/source-en-NN.json and
// <code>-NN.json, writes scripts/seed/pronunciation-translations/load.sql.
// A language is loaded only if ALL its files pass; failures are listed and
// that language is skipped (nothing partial). Then apply load.sql with psql
// (same way as tour-translations.sql).
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "seed/pronunciation-translations");

const ALL = "vi es pt fr de it ja ko zh-CN zh-TW hi id tr ru ar th pl nl sv da nb fi is cs sk hu el he fa ur ro uk bg hr sr sl lt lv et ms fil bn pa ta te mr gu kn ml si ne my km".split(" ");
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const sources = fs
  .readdirSync(DIR)
  .filter((f) => /^source-en-\d+\.json$/.test(f))
  .sort()
  .map((f) => ({ nn: f.match(/(\d+)/)[1], items: JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) }));

// English tokens that must survive translation: "quoted", /slashed/, [bracketed], ALL-CAPS words.
function protectedTokens(en) {
  const out = new Set();
  for (const m of en.matchAll(/'([^']{2,40})'|"([^"]{2,40})"|\/([^/]{1,30})\/|\[([^\]]{1,30})\]/g)) out.add(m[1] ?? m[2] ?? m[3] ?? m[4]);
  for (const m of en.matchAll(/\b[A-Z]{2,}(?:-[A-Za-z]+)*\b/g)) out.add(m[0]);
  return [...out].filter((t) => /[A-Za-z]/.test(t));
}

const esc = (s) => s.replace(/'/g, "''");
const rows = [];
const report = [];
for (const code of wanted) {
  const problems = [];
  const langRows = [];
  for (const src of sources) {
    const file = path.join(DIR, `${code}-${src.nn}.json`);
    if (!fs.existsSync(file)) {
      problems.push(`missing ${code}-${src.nn}.json`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      problems.push(`${code}-${src.nn}.json: invalid JSON (${e.message})`);
      continue;
    }
    if (!Array.isArray(data) || data.length !== src.items.length) {
      problems.push(`${code}-${src.nn}.json: ${data?.length} items, expected ${src.items.length}`);
      continue;
    }
    src.items.forEach((s, i) => {
      const t = data[i];
      if (t?.key !== s.key) return problems.push(`${code}-${src.nn}#${i}: key mismatch`);
      if (typeof t.text !== "string" || !t.text.trim()) return problems.push(`${code}-${src.nn}#${i}: empty text`);
      const missing = protectedTokens(s.en).filter((tok) => !t.text.includes(tok));
      if (missing.length) return problems.push(`${code}-${src.nn}#${i}: lost English token(s) ${JSON.stringify(missing)}`);
      langRows.push(`('${code}', '${esc(s.key)}', '${esc(t.text.trim())}')`);
    });
  }
  if (problems.length) report.push({ code, problems });
  else rows.push(...langRows);
  if (!problems.length) console.log(`OK   ${code} (${langRows.length} texts)`);
}
for (const r of report) {
  console.log(`SKIP ${r.code}: ${r.problems.length} problem(s)`);
  r.problems.slice(0, 8).forEach((p) => console.log("       " + p));
  if (r.problems.length > 8) console.log(`       ... +${r.problems.length - 8} more`);
}
if (rows.length) {
  const sql =
    "BEGIN;\nINSERT INTO public.pronunciation_lesson_texts (locale, text_key, value) VALUES\n" +
    rows.join(",\n") +
    "\nON CONFLICT (locale, text_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();\nCOMMIT;\n";
  fs.writeFileSync(path.join(DIR, "load.sql"), sql, "utf8");
  console.log(`\nwrote load.sql with ${rows.length} rows`);
} else {
  console.log("\nnothing to load");
}
