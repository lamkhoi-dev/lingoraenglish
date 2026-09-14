#!/usr/bin/env python3
"""Load the Vocabulary words in scripts/seed/vocabulary into the database.

Usage: python3 scripts/load-vocabulary.py

One file per category, named <slug>.json — the category comes from the
filename via CATEGORY_BY_SLUG below, not from inside the JSON, so there's no
way for a file to be loaded under the wrong category by mistake (same
convention as load-pronunciation-lessons.py's skill-by-filename rule).

Each file is {"words": [ { word, ipa, meaningEn, meaningVi, exampleSentence,
exampleVi, usageContext, level, synonyms[], antonyms[] } ]}. Words are
numbered 1..N within their own category by array order — this is the
"easy -> hard" ordering the spec requires (Yêu cầu 7), and it's also what
free/premium is computed from: the first FREE_COUNT words of each category
are free, matching the 10-free-per-category rule enforced server-side via
vocabulary_words.access_tier. Re-running is safe: rows are matched on
(category, sort_order) — see src/db/schema/0003_vocabulary_content_fields.sql
for that unique constraint (must be applied before this script is run).
"""
import glob
import json
import os
import subprocess
import sys

CATEGORY_BY_SLUG = {
    "everyday-english": "Everyday English",
    "family": "Family",
    "food-drinks": "Food & Drinks",
    "shopping": "Shopping",
    "travel": "Travel",
    "work-office": "Work & Office",
    "school": "School",
    "health": "Health",
    "business-english": "Business English",
    "customer-service": "Customer Service",
    "technology": "Technology",
    "relationships": "Relationships",
    "hobbies": "Hobbies",
    "phrasal-verbs": "Phrasal Verbs",
    "idioms": "Idioms",
    "commonly-confused-words": "Commonly Confused Words",
    "ielts-vocabulary": "IELTS Vocabulary",
    "toeic-vocabulary": "TOEIC Vocabulary",
}
LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
FREE_COUNT = 10
TARGET_PER_CATEGORY = 100


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def textarray(items):
    items = [i for i in (items or []) if i]
    if not items:
        return "'{}'::text[]"
    return "ARRAY[" + ", ".join(q(i) for i in items) + "]::text[]"


rows = []
problems = []
warnings = []
for path in sorted(glob.glob("scripts/seed/vocabulary/*.json")):
    slug = os.path.splitext(os.path.basename(path))[0]
    category = CATEGORY_BY_SLUG.get(slug)
    if category is None:
        problems.append(f"{path}: filename '{slug}' is not a known category slug")
        continue
    doc = json.load(open(path, encoding="utf-8"))
    words = doc["words"]
    if len(words) != TARGET_PER_CATEGORY:
        warnings.append(f"{path}: has {len(words)} words, target is {TARGET_PER_CATEGORY}")
    seen = set()
    for word in words:
        where = f"{path}:{word.get('word')}"
        key = word["word"].strip().lower()
        if key in seen:
            problems.append(f"{where}: duplicate word within this category")
        seen.add(key)
        if not word.get("word", "").strip():
            problems.append(f"{where}: empty word")
        if not word.get("meaningEn", "").strip():
            problems.append(f"{where}: missing meaningEn")
        if not word.get("exampleSentence", "").strip():
            problems.append(f"{where}: missing exampleSentence")
        if word.get("level", "B1") not in LEVELS:
            problems.append(f"{where}: bad level {word.get('level')}")
        word["category"] = category
        rows.append(word)

if problems:
    print("Refusing to load — fix these first:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

by_category = {}
for word in rows:
    by_category.setdefault(word["category"], []).append(word)

sql_rows = []
for category, words in by_category.items():
    for index, word in enumerate(words, start=1):
        sql_rows.append(
            "("
            + ", ".join(
                [
                    q(category),
                    q(word["word"]),
                    q(word.get("ipa", "")),
                    q(word.get("meaningEn", "")),
                    q(word.get("meaningVi", "")),
                    q(word.get("exampleSentence", "")),
                    q(word.get("exampleVi", "")),
                    q(word.get("usageContext", "")),
                    q(word.get("level", "B1")),
                    textarray(word.get("synonyms", [])),
                    textarray(word.get("antonyms", [])),
                    "'free'" if index <= FREE_COUNT else "'premium'",
                    str(index),
                    "'published'",
                ]
            )
            + ")"
        )

sql = (
    "INSERT INTO public.vocabulary_words (category, word, ipa, meaning_en, meaning_vi, "
    "example_sentence, example_vi, usage_context, level, synonyms, antonyms, access_tier, "
    "sort_order, status) VALUES\n" + ",\n".join(sql_rows) + "\n"
    "ON CONFLICT (category, sort_order) DO UPDATE SET "
    "word = EXCLUDED.word, ipa = EXCLUDED.ipa, meaning_en = EXCLUDED.meaning_en, "
    "meaning_vi = EXCLUDED.meaning_vi, example_sentence = EXCLUDED.example_sentence, "
    "example_vi = EXCLUDED.example_vi, usage_context = EXCLUDED.usage_context, "
    "level = EXCLUDED.level, synonyms = EXCLUDED.synonyms, antonyms = EXCLUDED.antonyms, "
    "access_tier = EXCLUDED.access_tier, status = EXCLUDED.status, updated_at = now();"
)

if warnings:
    print("Warnings (loading anyway):")
    for w in warnings:
        print(" -", w)

url = os.environ.get("SUPABASE_DB_URL")
if not url:
    print("SUPABASE_DB_URL is not set — printing SQL instead.")
    print(sql)
    sys.exit(0)

proc = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True)
print(proc.stdout.strip())
if proc.returncode != 0:
    print(proc.stderr.strip())
    sys.exit(proc.returncode)
print(f"Loaded {len(rows)} vocabulary words across {len(by_category)} categories ({FREE_COUNT} free per category).")
for category, words in sorted(by_category.items()):
    print(f"  {category}: {len(words)}")
