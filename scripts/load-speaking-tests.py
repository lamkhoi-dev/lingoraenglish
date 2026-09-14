#!/usr/bin/env python3
"""Load the IELTS speaking test library in scripts/seed/speaking-tests into the database.

Usage: python3 scripts/load-speaking-tests.py

Each file is {"tests": [ { slug, part, topic, difficulty, questions[],
cue_card, cue_points[], preparation_time, speaking_time, sort_order } ]}.

Tests are numbered Part 1 -> Part 2 -> Part 3 by sort_order. The first three
tests overall are free; everything after that is premium. Re-running is safe:
rows are matched on slug.
"""
import glob
import json
import os
import subprocess
import sys

DIFFICULTIES = {"Beginner", "Intermediate", "Upper-Intermediate", "Advanced"}
FREE_TESTS = 3


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def jsonb(v):
    return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def textarray(items):
    if not items:
        return "'{}'::text[]"
    return "ARRAY[" + ", ".join(q(i) for i in items) + "]::text[]"


tests = []
for path in sorted(glob.glob("scripts/seed/speaking-tests/*.json")):
    doc = json.load(open(path))
    for test in doc["tests"]:
        test["_file"] = path
        tests.append(test)

problems = []
seen = set()
for test in tests:
    where = f"{test['_file']}:{test.get('slug')}"
    if test["slug"] in seen:
        problems.append(f"{where}: duplicate slug")
    seen.add(test["slug"])
    if test["part"] not in (1, 2, 3):
        problems.append(f"{where}: bad part {test['part']}")
    if test["difficulty"] not in DIFFICULTIES:
        problems.append(f"{where}: bad difficulty {test['difficulty']}")
    if test["part"] == 2:
        if not test.get("cue_card"):
            problems.append(f"{where}: part 2 needs a cue card")
        if len(test.get("cue_points", [])) < 3:
            problems.append(f"{where}: part 2 needs 3+ cue points")
    else:
        if not (4 <= len(test.get("questions", [])) <= 6):
            problems.append(f"{where}: needs 4-6 questions")

if problems:
    print("Refusing to load — fix these first:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

tests.sort(key=lambda t: (t["part"], t["sort_order"], t["slug"]))
for index, test in enumerate(tests, start=1):
    test["test_number"] = index
    test["is_free"] = index <= FREE_TESTS

rows = []
for test in tests:
    rows.append(
        "("
        + ", ".join(
            [
                "'ielts'",
                str(test["part"]),
                q(test["slug"]),
                q(test["topic"]),
                q(test["difficulty"]),
                jsonb(test.get("questions", [])),
                q(test.get("cue_card", "")),
                textarray(test.get("cue_points", [])),
                str(test.get("preparation_time", 0)),
                str(test.get("speaking_time", 300)),
                str(test["test_number"]),
                "true" if test["is_free"] else "false",
                str(test["sort_order"]),
                "'published'",
            ]
        )
        + ")"
    )

sql = (
    "INSERT INTO public.speaking_tests (exam, part, slug, topic, difficulty, questions, "
    "cue_card, cue_points, preparation_time, speaking_time, test_number, is_free, sort_order, status) "
    "VALUES\n" + ",\n".join(rows) + "\nON CONFLICT (slug) DO UPDATE SET "
    "part = EXCLUDED.part, topic = EXCLUDED.topic, difficulty = EXCLUDED.difficulty, "
    "questions = EXCLUDED.questions, cue_card = EXCLUDED.cue_card, cue_points = EXCLUDED.cue_points, "
    "preparation_time = EXCLUDED.preparation_time, speaking_time = EXCLUDED.speaking_time, "
    "test_number = EXCLUDED.test_number, is_free = EXCLUDED.is_free, sort_order = EXCLUDED.sort_order, "
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
print(f"Loaded {len(tests)} speaking tests ({FREE_TESTS} free).")
