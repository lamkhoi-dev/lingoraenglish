#!/usr/bin/env python3
"""
Translates source-en-01.json through source-en-05.json (1,170 items per language)
into <lang>-01.json through <lang>-05.json.
Concurrently translates batches and preserves all IPA, quoted words, and ALL-CAPS tokens.
"""
import sys
import os
import json
import time
import urllib.request
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

DIR = os.path.join(os.path.dirname(__file__), "seed", "pronunciation-translations")
BATCH_SIZE = 40
WORKERS = 2

ALL_LANGUAGES = {
    "vi": "Vietnamese",
    "fr": "French",
    "es": "Spanish",
    "pt": "Portuguese",
    "de": "German",
    "it": "Italian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "hi": "Hindi",
    "id": "Indonesian",
    "tr": "Turkish",
    "ru": "Russian",
    "ar": "Arabic",
    "th": "Thai",
    "pl": "Polish",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "nb": "Norwegian",
    "fi": "Finnish",
    "is": "Icelandic",
    "cs": "Czech",
    "sk": "Slovak",
    "hu": "Hungarian",
    "el": "Greek",
    "he": "Hebrew",
    "fa": "Persian",
    "ur": "Urdu",
    "ro": "Romanian",
    "uk": "Ukrainian",
    "bg": "Bulgarian",
    "hr": "Croatian",
    "sr": "Serbian",
    "sl": "Slovenian",
    "lt": "Lithuanian",
    "lv": "Latvian",
    "et": "Estonian",
    "ms": "Malay",
    "fil": "Filipino",
    "bn": "Bengali",
    "pa": "Punjabi",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "si": "Sinhala",
    "ne": "Nepali",
    "my": "Burmese",
    "km": "Khmer"
}

def protected_tokens(en):
    tokens = set()
    for m in re.finditer(r"'([^']{2,40})'|\"([^\"]{2,40})\"|/([^/]{1,30})/|\[([^\]]{1,30})\]", en):
        g = [x for x in m.groups() if x]
        if g:
            tokens.add(g[0])
    for m in re.finditer(r"\b[A-Z]{2,}(?:-[A-Za-z]+)*\b", en):
        tokens.add(m.group(0))
    return [t for t in tokens if re.search(r'[A-Za-z]', t) and t == t.strip()]

def get_env_var(key):
    if key in os.environ:
        return os.environ[key]
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""

GEMINI_KEY = get_env_var("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-flash-latest"

def call_ai(prompt, retries=6):
    for attempt in range(retries):
        try:
            body = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.1
                }
            }
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
            req = urllib.request.Request(
                url,
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json", "X-goog-api-key": GEMINI_KEY}
            )
            res = urllib.request.urlopen(req, timeout=90)
            data = json.loads(res.read().decode("utf-8"))
            raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            return json.loads(raw)
        except urllib.error.HTTPError as e:
            err = e.read().decode('utf-8', errors='ignore')
            print(f"    [AI] HTTP {e.code} (attempt {attempt+1}): {err[:120]}", flush=True)
            time.sleep(4 * (attempt + 1))
        except Exception as e:
            print(f"    [AI] Error (attempt {attempt+1}): {e}", flush=True)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("Failed to call AI after retries")

def translate_batch(batch, target_lang_name):
    prompt = f"""You are a professional linguist and English pronunciation teacher. Translate the following English lesson explanations, points, cautions, and notes into natural, concise, and accurate {target_lang_name} for learners.

CRITICAL RULES:
1. Every token inside single quotes '...', double quotes "...", slashes /.../ (such as IPA /ə/), square brackets [...], or written in ALL-CAPS (such as WA-ter, PHO-to-graph, IELTS, PTE) MUST BE PRESERVED EXACTLY AS IS in the translated text. Do not translate or omit them!
2. Return ONLY a valid JSON array of objects:
[
  {{"key": "<same key>", "text": "<translated text in {target_lang_name}>"}}
]

Items:
{json.dumps(batch, ensure_ascii=False, indent=2)}"""

    res = call_ai(prompt)
    if not isinstance(res, list) or len(res) != len(batch):
        raise ValueError(f"Expected {len(batch)} items, got {len(res) if isinstance(res, list) else type(res)}")

    fixed = []
    for s, t in zip(batch, res):
        item_key = s["key"]
        trans_text = t.get("text", "").strip() if isinstance(t, dict) else ""
        if not trans_text:
            trans_text = s["en"]

        # Token verification
        needed = protected_tokens(s["en"])
        for tok in needed:
            if tok not in trans_text:
                trans_text += f" ({tok})"

        fixed.append({"key": item_key, "text": trans_text})
    return fixed

def translate_file(code, nn, lang_name):
    src_file = os.path.join(DIR, f"source-en-{nn}.json")
    out_file = os.path.join(DIR, f"{code}-{nn}.json")

    with open(src_file, "r", encoding="utf-8") as f:
        sources = json.load(f)

    if os.path.exists(out_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if len(existing) == len(sources):
                    print(f"  [{code}-{nn}] already exists ({len(existing)} items), skipping", flush=True)
                    return True
        except Exception:
            pass

    batches = []
    for i in range(0, len(sources), BATCH_SIZE):
        batches.append((i, sources[i:i+BATCH_SIZE]))

    results_by_idx = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(translate_batch, b[1], lang_name): b[0] for b in batches}
        for future in as_completed(futures):
            start_idx = futures[future]
            res = future.result()
            results_by_idx[start_idx] = res
            print(f"  [{code}-{nn}] batch {start_idx}/{len(sources)} done", flush=True)

    # Sort in original order
    ordered = []
    for i in range(0, len(sources), BATCH_SIZE):
        ordered.extend(results_by_idx[i])

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False)
    print(f"  [{code}-{nn}] saved {len(ordered)} items", flush=True)
    return True

def translate_language(code):
    lang_name = ALL_LANGUAGES.get(code)
    if not lang_name:
        return False
    print(f"=== Translating lessons for {code} ({lang_name}) ===", flush=True)
    t0 = time.time()
    for nn in ["01", "02", "03", "04", "05"]:
        translate_file(code, nn, lang_name)
    print(f"  OK {code} (5 files, 1170 texts) in {time.time() - t0:.1f}s", flush=True)
    return True

def main():
    args = sys.argv[1:]
    if not args or "--all" in args:
        targets = list(ALL_LANGUAGES.keys())
    else:
        targets = [c for c in args if c in ALL_LANGUAGES]

    print(f"Translating lessons for {len(targets)} languages...", flush=True)
    for c in targets:
        try:
            translate_language(c)
        except Exception as e:
            print(f"Error on {c}: {e}", flush=True)

if __name__ == "__main__":
    main()
