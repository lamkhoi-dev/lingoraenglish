#!/usr/bin/env python3
"""
Translates all 5 source-en-*.json files into vi-*.json for public.pronunciation_lesson_texts.
Validates protected tokens (quoted strings, slashes, brackets, ALL-CAPS words).
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
BATCH_SIZE = 25

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
            print(f"  [Attempt {attempt+1}/{retries}] Error: {e}")
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("Failed to call AI after retries")

def translate_batch(batch):
    prompt = f"""You are a professional linguist and English pronunciation teacher. Translate the following JSON list of English pronunciation lesson explanations, points, cautions, and notes into natural, concise, and accurate Vietnamese for learners.

CRITICAL RULES:
1. Every token inside single quotes '...', double quotes "...", slashes /.../ (such as IPA /ə/), square brackets [...], or written in ALL-CAPS (such as WA-ter, PHO-to-graph, IELTS, Part 2) MUST BE PRESERVED EXACTLY AS IS in the translated text. Do not translate or omit them!
2. Return ONLY a valid JSON array of objects with the exact structure:
[
  {{"key": "<same key>", "text": "<Vietnamese translation>"}}
]
No extra comments or formatting.

Items to translate:
{json.dumps(batch, ensure_ascii=False, indent=2)}"""

    res = call_ai(prompt)
    if not isinstance(res, list) or len(res) != len(batch):
        raise ValueError(f"Expected {len(batch)} items, got {len(res) if isinstance(res, list) else type(res)}")

    # Verify keys and protected tokens
    fixed_res = []
    for s, t in zip(batch, res):
        item_key = s["key"]
        trans_text = t.get("text", "").strip()
        if not trans_text:
            trans_text = s["en"]

        # Check missing tokens
        missing = [tok for tok in protected_tokens(s["en"]) if tok not in trans_text]
        if missing:
            # If missing, do an individual single-item retry with strict instructions
            print(f"    Missing tokens {missing} for {item_key}. Retrying single item...")
            single_prompt = f"""Translate this English pronunciation note to Vietnamese:
"{s['en']}"

STRICT REQUIREMENT: You MUST include all of these exact tokens in your Vietnamese sentence: {missing}.
Return ONLY the Vietnamese text string, nothing else."""
            try:
                single_res = call_ai(single_prompt)
                if isinstance(single_res, str) and all(tok in single_res for tok in missing):
                    trans_text = single_res.strip('" ')
                else:
                    # Append missing tokens if still missing
                    trans_text += f" ({', '.join(missing)})"
            except Exception:
                trans_text += f" ({', '.join(missing)})"

        fixed_res.append({"key": item_key, "text": trans_text})
    return fixed_res

def process_file(nn):
    src_file = os.path.join(DIR, f"source-en-{nn}.json")
    out_file = os.path.join(DIR, f"vi-{nn}.json")

    with open(src_file, "r", encoding="utf-8") as f:
        sources = json.load(f)

    # Check if already completed
    if os.path.exists(out_file):
        with open(out_file, "r", encoding="utf-8") as f:
            try:
                existing = json.load(f)
                if len(existing) == len(sources):
                    print(f"File vi-{nn}.json already exists with {len(existing)} items. Skipping.")
                    return
            except Exception:
                pass

    print(f"\nProcessing {src_file} ({len(sources)} items)...")
    results = []

    for i in range(0, len(sources), BATCH_SIZE):
        batch = sources[i:i+BATCH_SIZE]
        print(f"  Translating batch {i+1} to {min(i+BATCH_SIZE, len(sources))} / {len(sources)}...")
        translated_batch = translate_batch(batch)
        results.extend(translated_batch)
        time.sleep(0.5)

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_file} successfully ({len(results)} items).")

def main():
    for nn in ["01", "02", "03", "04", "05"]:
        process_file(nn)
    print("\nAll 5 files processed successfully!")

if __name__ == "__main__":
    main()
