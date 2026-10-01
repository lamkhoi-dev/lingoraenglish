// Turns scripts/seed/pronunciation-translations/lines/<code>.txt (400 title
// translations, one per line, same order as source-en-titles.json) into
// <code>-titles.json ({key,text}) for load-pronunciation-translations.mjs.
//   node scripts/build-title-files.mjs [code ...]
import fs from "node:fs";
import path from "node:path";
const DIR = "scripts/seed/pronunciation-translations";
const src = JSON.parse(fs.readFileSync(path.join(DIR, "source-en-titles.json"), "utf8"));
const codes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(path.join(DIR, "lines")).filter((f) => f.endsWith(".txt")).map((f) => f.replace(".txt", ""));
for (const code of codes) {
  const lines = fs.readFileSync(path.join(DIR, "lines", code + ".txt"), "utf8").split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length !== src.length) {
    console.log(`${code}: ${lines.length} lines, expected ${src.length} — skipped`);
    continue;
  }
  fs.writeFileSync(path.join(DIR, `${code}-titles.json`), JSON.stringify(src.map((s, i) => ({ key: s.key, text: lines[i].trim() }))), "utf8");
  console.log(`${code}: ok`);
}
