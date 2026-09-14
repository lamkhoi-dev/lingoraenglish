#!/usr/bin/env python3
"""Load the TOEFL and PTE speaking test library in scripts/seed/exam-tests.

Usage: python3 scripts/load-exam-tests.py

Each file is {"tests": [ { exam, slug, task_type, task_label, topic, difficulty,
instructions, prepare_seconds, speak_seconds, questions[], sort_order } ]}.

Tests are numbered per exam by sort_order; the first three of each exam are
free, everything after that is premium. Re-running is safe (matched on slug).
"""
import glob
import json
import os
import subprocess
import sys

DIFFICULTIES = {"Beginner", "Intermediate", "Upper-Intermediate", "Advanced"}
FREE_TESTS = 3
EXAMS = {"toefl", "pte"}


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def jsonb(v):
    return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"


tests = []
for path in sorted(glob.glob("scripts/seed/exam-tests/*.json")):
    doc = json.load(open(path))
    for test in doc["tests"]:
        test["_file"] = path
        tests.append(test)

problems = []
seen = set()
for test in tests:
    where = f"{test['_file']}:{test.get('slug')}"
    if test.get("slug") in seen:
        problems.append(f"{where}: duplicate slug")
    seen.add(test.get("slug"))
    if test.get("exam") not in EXAMS:
        problems.append(f"{where}: bad exam {test.get('exam')}")
    if test.get("difficulty") not in DIFFICULTIES:
        problems.append(f"{where}: bad difficulty {test.get('difficulty')}")
    if not test.get("task_type") or not test.get("task_label"):
        problems.append(f"{where}: missing task type/label")
    if not (2 <= len(test.get("questions", [])) <= 6):
        problems.append(f"{where}: needs 2-6 prompts")

if problems:
    print("Refusing to load — fix these first:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

rows = []
for exam in sorted(EXAMS):
    group = [t for t in tests if t["exam"] == exam]
    group.sort(key=lambda t: (t.get("sort_order", 0), t["slug"]))
    for index, test in enumerate(group, start=1):
        rows.append(
            "("
            + ", ".join(
                [
                    q(exam),
                    "0",
                    q(test["slug"]),
                    q(test["topic"]),
                    q(test["difficulty"]),
                    q(test["task_type"]),
                    q(test["task_label"]),
                    q(test.get("instructions", "")),
                    jsonb(test["questions"]),
                    "''",
                    "'{}'::text[]",
                    str(int(test.get("prepare_seconds", 0))),
                    str(int(test.get("speak_seconds", 40))),
                    str(index),
                    "true" if index <= FREE_TESTS else "false",
                    str(int(test.get("sort_order", index))),
                    "'published'",
                ]
            )
            + ")"
        )

sql = (
    "INSERT INTO public.speaking_tests (exam, part, slug, topic, difficulty, task_type, task_label, "
    "instructions, questions, cue_card, cue_points, preparation_time, speaking_time, test_number, "
    "is_free, sort_order, status) VALUES\n"
    + ",\n".join(rows)
    + "\nON CONFLICT (slug) DO UPDATE SET "
    "exam = EXCLUDED.exam, topic = EXCLUDED.topic, difficulty = EXCLUDED.difficulty, "
    "task_type = EXCLUDED.task_type, task_label = EXCLUDED.task_label, instructions = EXCLUDED.instructions, "
    "questions = EXCLUDED.questions, preparation_time = EXCLUDED.preparation_time, "
    "speaking_time = EXCLUDED.speaking_time, test_number = EXCLUDED.test_number, "
    "is_free = EXCLUDED.is_free, sort_order = EXCLUDED.sort_order, status = EXCLUDED.status;"
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
print(f"Loaded {len(rows)} TOEFL/PTE tests ({FREE_TESTS} free per exam).")
