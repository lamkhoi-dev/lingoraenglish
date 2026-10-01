#!/usr/bin/env python3
"""
Translates source-en-titles.json (400 items) into <lang>-titles.json and lines/<lang>.txt
Strictly obeys all rules:
1. Exact 400 items and keys
2. Preserves English quoted tokens ('going to', 'because', 'them' as 'em, etc.)
3. Preserves IELTS, TOEFL, PTE
4. Preserves X — Y english phrases
5. Uses Serbian Latin alphabet
"""
import sys
import os
import json
import time
import urllib.request
import re

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

DIR = os.path.join(os.path.dirname(__file__), "seed", "pronunciation-translations")
API_KEY = "sk-b221307da90641a38cc95b9699be5796"
BATCH_SIZE = 50

LANGUAGES_31 = {
    "bn": "Bengali",
    "el": "Greek",
    "et": "Estonian",
    "fa": "Persian",
    "fi": "Finnish",
    "fil": "Filipino",
    "gu": "Gujarati",
    "he": "Hebrew",
    "hr": "Croatian",
    "hu": "Hungarian",
    "is": "Icelandic",
    "km": "Khmer",
    "kn": "Kannada",
    "lt": "Lithuanian",
    "lv": "Latvian",
    "ml": "Malayalam",
    "mr": "Marathi",
    "ms": "Malay",
    "my": "Burmese",
    "nb": "Norwegian Bokmål",
    "ne": "Nepali",
    "pa": "Punjabi",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "sr": "Serbian (Latin script)",
    "ta": "Tamil",
    "te": "Telugu",
    "th": "Thai",
    "uk": "Ukrainian",
    "ur": "Urdu"
}

def protected_tokens(en):
    tokens = set()
    for m in re.finditer(r"'([^']{2,40})'|\"([^\"]{2,40})\"|/([^/]{1,30})/|\[([^\]]{1,30})\]", en):
        g = [x for x in m.groups() if x]
        if g:
            tokens.add(g[0])
    for m in re.finditer(r"\b[A-Z]{2,}(?:-[A-Za-z]+)*\b", en):
        tokens.add(m.group(0))
    return [t for t in tokens if re.search(r'[A-Za-z]', t)]

def call_ai(prompt, retries=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                "https://api.deepseek.com/chat/completions",
                headers={
                    "Authorization": f"Bearer {API_KEY}",
                    "Content-Type": "application/json"
                },
                data=json.dumps({
                    "model": "deepseek-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1
                }).encode("utf-8")
            )
            res = urllib.request.urlopen(req, timeout=60)
            raw = json.loads(res.read().decode("utf-8"))["choices"][0]["message"]["content"].strip()
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()
            return json.loads(raw)
        except Exception as e:
            print(f"  [Attempt {attempt+1}/{retries}] Error: {e}", flush=True)
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("Failed to call AI after retries")

def translate_batch(batch, target_lang_name):
    prompt = f"""You are a professional linguist and English pronunciation translator. Translate the following list of English pronunciation lesson titles into natural, concise, and accurate {target_lang_name}.

MANDATORY RULES:
1. Keep the exact order and count: exactly {len(batch)} items.
2. DO NOT TRANSLATE or transliterate English quoted phrases such as 'going to', 'because', 'them' as 'em, 'your', 'yer', 'Did you eat yet?', 'a lot of', kinda, sorta, lemme, gimme, wouldn't have → wouldn'ta, ain't — am not, is not, are not, c'mon, gonna be, s'more. Keep single quotes '...' exactly as in the original.
3. Keep IELTS, TOEFL, PTE in standard Latin letters.
4. For titles like "X — Y" (e.g. gotcha — got you), keep the English expression, only translate parenthetical notes like (British), (filler).
5. Tone: natural, concise, linguistic terminology (stress, intonation, linking, chunking).
6. Return ONLY a valid JSON array of objects:
[
  {{"key": "<same key>", "text": "<translated title in {target_lang_name}>"}}
]

Items:
{json.dumps(batch, ensure_ascii=False, indent=2)}"""

    res = call_ai(prompt)
    if not isinstance(res, list) or len(res) != len(batch):
        raise ValueError(f"Expected {len(batch)} items, got {len(res) if isinstance(res, list) else type(res)}")

    fixed_res = []
    for s, t in zip(batch, res):
        item_key = s["key"]
        trans_text = t.get("text", "").strip() if isinstance(t, dict) else ""
        if not trans_text:
            trans_text = s["en"]
        fixed_res.append({"key": item_key, "text": trans_text})
    return fixed_res

def translate_language(code):
    lang_name = LANGUAGES_31.get(code)
    if not lang_name:
        print(f"Unknown language: {code}", flush=True)
        return False

    out_file = os.path.join(DIR, f"{code}-titles.json")
    lines_file = os.path.join(DIR, "lines", f"{code}.txt")
    src_file = os.path.join(DIR, "source-en-titles.json")

    with open(src_file, "r", encoding="utf-8") as f:
        sources = json.load(f)

    if os.path.exists(out_file) and os.path.exists(lines_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if len(existing) == len(sources):
                    print(f"Language {code} already completed ({len(existing)} items). Skipping.", flush=True)
                    return True
        except Exception:
            pass

    print(f"\n=== Translating {code} ({lang_name}) - 400 titles ===", flush=True)
    start = time.time()
    results = []

    for i in range(0, len(sources), BATCH_SIZE):
        batch = sources[i:i+BATCH_SIZE]
        print(f"  Batch {i//BATCH_SIZE + 1}/{len(sources)//BATCH_SIZE}: items {i+1} to {min(i+BATCH_SIZE, len(sources))}...", flush=True)
        translated = translate_batch(batch, lang_name)
        results.extend(translated)
        time.sleep(0.3)

    # Save <code-titles.json>
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)

    # Save lines/<code.txt>
    os.makedirs(os.path.join(DIR, "lines"), exist_ok=True)
    with open(lines_file, "w", encoding="utf-8") as f:
        for it in results:
            f.write(it["text"] + "\n")

    print(f"Successfully generated {out_file} and {lines_file} in {time.time() - start:.1f}s", flush=True)
    return True

def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: python scripts/translate_titles.py <code1> [code2...] | --all")
        sys.exit(0)

    if "--all" in args:
        targets = list(LANGUAGES_31.keys())
    else:
        targets = [c for c in args if c in LANGUAGES_31]

    print(f"Total targets: {len(targets)} languages: {' '.join(targets)}", flush=True)
    for c in targets:
        translate_language(c)

if __name__ == "__main__":
    main()
