#!/usr/bin/env python3
"""Load the Pronunciation advanced-skill lessons in scripts/seed/pronunciation-lessons
into the database.

Usage: python3 scripts/load-pronunciation-lessons.py

One file per skill, named <skill>.json (word-stress.json, sentence-stress.json,
intonation.json, connected-speech.json, reductions.json, rhythm.json,
chunking.json, fluency.json) — the skill id comes from the filename, not from
inside the JSON, so there's no way for a file to be loaded under the wrong
skill by mistake.

Each file is {"lessons": [ { title, level, difficulty, accent, explain,
points[], items[], caution } ]}. Lessons are numbered 1..N within their own
skill by array order; the first FREE_COUNT of each skill are free, matching
FREE_SKILL_LESSON_COUNT in pronunciation-content.ts (keep the two in sync by
hand — this script doesn't import that .ts file). Re-running is safe: rows
are matched on (skill, sort_order).
"""
import glob
import json
import os
import subprocess
import sys

SKILLS = {
    "word-stress",
    "sentence-stress",
    "intonation",
    "connected-speech",
    "reductions",
    "rhythm",
    "chunking",
    "fluency",
}
LEVELS = {"beginner", "intermediate", "advanced"}
DIFFICULTIES = {"easy", "medium", "hard"}
ACCENTS = {"us", "uk"}
FREE_COUNT = 5


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def jsonb(v):
    return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def textarray(items):
    if not items:
        return "'{}'::text[]"
    return "ARRAY[" + ", ".join(q(i) for i in items) + "]::text[]"


rows = []
problems = []
for path in sorted(glob.glob("scripts/seed/pronunciation-lessons/*.json")):
    skill = os.path.splitext(os.path.basename(path))[0]
    if skill not in SKILLS:
        problems.append(f"{path}: filename '{skill}' is not a known skill id")
        continue
    doc = json.load(open(path))
    seen = set()
    for lesson in doc["lessons"]:
        where = f"{path}:{lesson.get('title')}"
        key = lesson["title"].strip().lower()
        if key in seen:
            problems.append(f"{where}: duplicate title within this skill")
        seen.add(key)
        if lesson.get("level", "beginner") not in LEVELS:
            problems.append(f"{where}: bad level {lesson.get('level')}")
        if lesson.get("difficulty", "easy") not in DIFFICULTIES:
            problems.append(f"{where}: bad difficulty {lesson.get('difficulty')}")
        if lesson.get("accent", "us") not in ACCENTS:
            problems.append(f"{where}: bad accent {lesson.get('accent')}")
        if not lesson.get("items"):
            problems.append(f"{where}: needs at least 1 item")
        lesson["skill"] = skill
        rows.append(lesson)

if problems:
    print("Refusing to load — fix these first:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

by_skill = {}
for lesson in rows:
    by_skill.setdefault(lesson["skill"], []).append(lesson)

sql_rows = []
for skill, lessons in by_skill.items():
    for index, lesson in enumerate(lessons, start=1):
        sql_rows.append(
            "("
            + ", ".join(
                [
                    q(skill),
                    q(lesson["title"]),
                    q(lesson.get("level", "beginner")),
                    q(lesson.get("difficulty", "easy")),
                    q(lesson.get("accent", "us")),
                    q(lesson.get("explain", "")),
                    textarray(lesson.get("points", [])),
                    jsonb(lesson.get("items", [])),
                    q(lesson.get("caution", "")),
                    "true" if index <= FREE_COUNT else "false",
                    str(index),
                    "'published'",
                ]
            )
            + ")"
        )

sql = (
    "INSERT INTO public.pronunciation_lessons (skill, title, level, difficulty, accent, explain, "
    "points, items, caution, is_free, sort_order, status) "
    "VALUES\n" + ",\n".join(sql_rows) + "\nON CONFLICT (skill, sort_order) DO UPDATE SET "
    "title = EXCLUDED.title, level = EXCLUDED.level, difficulty = EXCLUDED.difficulty, "
    "accent = EXCLUDED.accent, explain = EXCLUDED.explain, points = EXCLUDED.points, "
    "items = EXCLUDED.items, caution = EXCLUDED.caution, is_free = EXCLUDED.is_free, "
    "status = EXCLUDED.status;"
)

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
print(f"Loaded {len(rows)} pronunciation lessons across {len(by_skill)} skills ({FREE_COUNT} free per skill).")
for skill, lessons in sorted(by_skill.items()):
    print(f"  {skill}: {len(lessons)}")
