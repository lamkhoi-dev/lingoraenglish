#!/usr/bin/env python3
"""
Translates pronunciation lesson texts from source-en-*.json into <locale>-*.json
Supports batching, concurrent requests, and strict validation of protected tokens.
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
API_KEY = "sk-b221307da90641a38cc95b9699be5796"
BATCH_SIZE = 25

LANGUAGES = {
    "vi": "Vietnamese",
    "es": "Spanish",
    "pt": "Portuguese",
    "fr": "French",
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
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("Failed to call AI after retries")

def translate_batch(batch, target_lang_name):
    prompt = f"""You are a professional linguist and English pronunciation teacher. Translate the following JSON list of English pronunciation lesson explanations, points, cautions, and notes into natural, concise, and accurate {target_lang_name} for learners.

CRITICAL RULES:
1. Every token inside single quotes '...', double quotes "...", slashes /.../ (such as IPA /ə/), square brackets [...], or written in ALL-CAPS (such as WA-ter, PHO-to-graph, IELTS, Part 2) MUST BE PRESERVED EXACTLY AS IS in the translated text. Do not translate or omit them!
2. Return ONLY a valid JSON array of objects with the exact structure:
[
  {{"key": "<same key>", "text": "<{target_lang_name} translation>"}}
]
No extra comments or formatting.

Items to translate:
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

        missing = [tok for tok in protected_tokens(s["en"]) if tok not in trans_text]
        if missing:
            single_prompt = f"""Translate this English pronunciation note to {target_lang_name}:
"{s['en']}"

STRICT REQUIREMENT: You MUST include all of these exact tokens in your sentence: {missing}.
Return ONLY the translation text string, nothing else."""
            try:
                single_res = call_ai(single_prompt)
                if isinstance(single_res, str) and all(tok in single_res for tok in missing):
                    trans_text = single_res.strip('" ')
                else:
                    trans_text += f" ({', '.join(missing)})"
            except Exception:
                trans_text += f" ({', '.join(missing)})"

        fixed_res.append({"key": item_key, "text": trans_text})
    return fixed_res

def translate_single_file(code, nn, lang_name):
    src_file = os.path.join(DIR, f"source-en-{nn}.json")
    out_file = os.path.join(DIR, f"{code}-{nn}.json")

    with open(src_file, "r", encoding="utf-8") as f:
        sources = json.load(f)

    if os.path.exists(out_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if len(existing) == len(sources):
                    return True
        except Exception:
            pass

    results = []
    for i in range(0, len(sources), BATCH_SIZE):
        batch = sources[i:i+BATCH_SIZE]
        translated = translate_batch(batch, lang_name)
        results.extend(translated)
        time.sleep(0.2)

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    return True

def translate_language(code):
    lang_name = LANGUAGES.get(code)
    if not lang_name:
        print(f"Unknown language code: {code}")
        return False
    print(f"--- Starting {code} ({lang_name}) ---")
    start = time.time()
    for nn in ["01", "02", "03", "04", "05"]:
        translate_single_file(code, nn, lang_name)
    print(f"Completed {code} ({lang_name}) in {time.time() - start:.1f}s")
    return True

def main():
    args = sys.argv[1:]
    if not args or "--help" in args:
        print("Usage: python scripts/translate_pronunciation_batch.py <code> [code2 ...] | --all")
        sys.exit(0)

    if "--all" in args:
        targets = list(LANGUAGES.keys())
    else:
        targets = [c for c in args if c in LANGUAGES]

    print(f"Target languages ({len(targets)}): {' '.join(targets)}")
    for c in targets:
        try:
            translate_language(c)
        except Exception as e:
            print(f"Error on {c}: {e}")

if __name__ == "__main__":
    main()
