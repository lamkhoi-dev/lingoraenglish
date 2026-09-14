#!/usr/bin/env python3
"""Load every Listening Lab lesson file in scripts/seed/listening into the database.

Usage: python3 scripts/load-listening.py

Each file is {"lessons": [ { slug, title, level, category, topic, difficulty,
duration_seconds, accent, script[], questions[], dictation[],
connected_speech[] } ]}.

"Chủ đề" in Yêu cầu 3 / Vấn đề 1 of the spec means `category` (the UI's
"chủ đề" filter is literally the category list, see listen.filter.allTopics)
— every lesson in one of the first 6 categories (in CATEGORY_ORDER below) is
free, every lesson in category 7+ is premium. This REPLACES an earlier,
wrong rule ("first 10 lessons overall, ignoring category") that made every
lesson free once there were fewer than 10 categories' worth of lessons in
front of it — with only 5 categories total that meant 99/99 lessons ended
up free, since "chủ đề" was never actually being gated on. A new category
added later needs one line added to CATEGORY_ORDER (unknown categories sort
after all listed ones, i.e. locked, rather than silently free) — no other
code change. Re-running the script is safe: rows are matched on slug.
"""
import glob
import json
import os
import subprocess
import sys

LEVELS = ["A1", "A2", "B1", "B2", "C1"]
SKILLS = {
    "main_idea",
    "details",
    "intention",
    "connected_speech",
    "vocabulary",
    "numbers_dates",
    "fast_speech",
}
CATEGORY_ORDER = [
    "Travel",
    "Everyday Life",
    "Social English",
    "Work & Career",
    "Canadian Life",
    "Academic English",
    "Entertainment & Media",
]
FREE_CATEGORY_COUNT = 6


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def jsonb(v):
    return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"


lessons = []
for path in sorted(glob.glob("scripts/seed/listening/*.json")):
    doc = json.load(open(path))
    for lesson in doc["lessons"]:
        lesson["_file"] = path
        lessons.append(lesson)

problems = []
seen = set()
for lesson in lessons:
    where = f"{lesson['_file']}:{lesson.get('slug')}"
    if lesson["slug"] in seen:
        problems.append(f"{where}: duplicate slug")
    seen.add(lesson["slug"])
    if lesson["level"] not in LEVELS:
        problems.append(f"{where}: bad level {lesson['level']}")
    if lesson["category"] not in CATEGORY_ORDER:
        problems.append(
            f"{where}: category '{lesson['category']}' is not in CATEGORY_ORDER — "
            "add it there first (a new category must have an explicit, deliberate "
            "position, not fall through unnoticed)"
        )
    if len(lesson.get("script", [])) < 4:
        problems.append(f"{where}: script too short")
    lines = " ".join(t["line"] for t in lesson["script"]).lower()
    for question in lesson.get("questions", []):
        if question["answer"] not in question["options"]:
            problems.append(f"{where}: answer not in options -> {question['prompt']}")
        if question.get("skill") not in SKILLS:
            problems.append(f"{where}: bad skill {question.get('skill')}")
    for item in lesson.get("dictation", []):
        if item["sentence"].strip().lower() not in lines:
            problems.append(f"{where}: dictation sentence not in audio -> {item['sentence']}")
        for blank in item["blanks"]:
            if blank.lower() not in item["sentence"].lower():
                problems.append(f"{where}: blank '{blank}' not in its sentence")

if problems:
    print("\n".join(problems[:60]))
    print(f"{len(problems)} problem(s) found — nothing was loaded.")
    sys.exit(1)

lessons.sort(
    key=lambda l: (CATEGORY_ORDER.index(l["category"]), LEVELS.index(l["level"]), l["_file"], l["slug"])
)

sql = ["begin;"]
for order, lesson in enumerate(lessons, start=1):
    is_free = CATEGORY_ORDER.index(lesson["category"]) < FREE_CATEGORY_COUNT
    sql.append(
        "insert into public.listening_lessons (slug,title,level,category,topic,difficulty,"
        "duration_seconds,accent,script,questions,dictation,connected_speech,is_free,sort_order,status) values ("
        f"{q(lesson['slug'])},{q(lesson['title'])},{q(lesson['level'])},{q(lesson['category'])},"
        f"{q(lesson.get('topic', ''))},{int(lesson.get('difficulty', 1))},"
        f"{int(lesson.get('duration_seconds', 30))},{q(lesson.get('accent', 'american'))},"
        f"{jsonb(lesson['script'])},{jsonb(lesson.get('questions', []))},"
        f"{jsonb(lesson.get('dictation', []))},{jsonb(lesson.get('connected_speech', []))},"
        f"{'true' if is_free else 'false'},{order},'published') "
        "on conflict (slug) do update set title=excluded.title, level=excluded.level, "
        "category=excluded.category, topic=excluded.topic, difficulty=excluded.difficulty, "
        "duration_seconds=excluded.duration_seconds, accent=excluded.accent, script=excluded.script, "
        "questions=excluded.questions, dictation=excluded.dictation, "
        "connected_speech=excluded.connected_speech, is_free=excluded.is_free, "
        "sort_order=excluded.sort_order, status='published';"
    )
sql.append("commit;")

if "SUPABASE_DB_URL" not in os.environ:
    print("SUPABASE_DB_URL is not set — printing SQL instead.")
    print("\n".join(sql))
    sys.exit(0)

out = subprocess.run(
    ["psql", os.environ["SUPABASE_DB_URL"], "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    input="\n".join(sql),
    capture_output=True,
    text=True,
)
print(f"{len(lessons)} lessons prepared")
print(out.stdout[-2000:], out.stderr[-2000:])
sys.exit(out.returncode)
