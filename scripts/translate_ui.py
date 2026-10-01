#!/usr/bin/env python3
"""
Translates source-en-ui.json (120 items) into <lang>-ui.json for all 53 non-English languages.
Strictly preserves {{placeholders}} like {{count}}, {{skill}}, {{symbol}}.
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
BATCH_SIZE = 60

ALL_LANGUAGES = {
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
    "nb": "Norwegian Bokmål",
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
    "sr": "Serbian (Latin script)",
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
    prompt = f"""You are a professional linguist and UI translator for an English learning app.
Translate the following UI labels, filter buttons, levels, and instructions into natural, concise {target_lang_name}.

CRITICAL RULES:
1. Every placeholder in curly braces such as {{{{count}}}}, {{{{skill}}}}, {{{{symbol}}}} MUST BE PRESERVED EXACTLY AS IS in the translated text. Do not translate or change placeholders!
2. Translate levels and difficulties accurately:
   - "Beginner" -> appropriate word in {target_lang_name}
   - "Intermediate" -> appropriate word in {target_lang_name}
   - "Advanced" -> appropriate word in {target_lang_name}
   - "Gentle" -> appropriate word in {target_lang_name} (easy difficulty)
   - "Steady" -> appropriate word in {target_lang_name} (medium difficulty)
   - "Challenging" -> appropriate word in {target_lang_name} (hard difficulty)
3. Return ONLY a valid JSON array of objects:
[
  {{"key": "<same key>", "text": "<translated UI label in {target_lang_name}>"}}
]

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
        
        # Check required placeholders like {{count}}
        placeholders = re.findall(r"\{\{\w+\}\}", s["en"])
        for p in placeholders:
            if p not in trans_text:
                # restore placeholder
                trans_text += f" {p}"
        fixed_res.append({"key": item_key, "text": trans_text})
    return fixed_res

def translate_language(code):
    lang_name = ALL_LANGUAGES.get(code)
    if not lang_name:
        return False

    out_file = os.path.join(DIR, f"{code}-ui.json")
    src_file = os.path.join(DIR, "source-en-ui.json")

    with open(src_file, "r", encoding="utf-8") as f:
        sources = json.load(f)

    if os.path.exists(out_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if len(existing) == len(sources):
                    print(f"UI for {code} already completed. Skipping.", flush=True)
                    return True
        except Exception:
            pass

    print(f"Translating UI for {code} ({lang_name})...", flush=True)
    results = []
    for i in range(0, len(sources), BATCH_SIZE):
        batch = sources[i:i+BATCH_SIZE]
        translated = translate_batch(batch, lang_name)
        results.extend(translated)
        time.sleep(0.2)

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)
    print(f"  OK {code}-ui.json ({len(results)} items)", flush=True)
    return True

def main():
    args = sys.argv[1:]
    if not args or "--all" in args:
        targets = list(ALL_LANGUAGES.keys())
    else:
        targets = [c for c in args if c in ALL_LANGUAGES]

    print(f"Translating UI for {len(targets)} languages...", flush=True)
    for c in targets:
        try:
            translate_language(c)
        except Exception as e:
            print(f"Error translating UI for {c}: {e}", flush=True)

if __name__ == "__main__":
    main()
