#!/usr/bin/env python3
"""Load an AI Speaking Coach topic JSON file into the database.

Usage: python3 scripts/load-coach-topics.py scripts/seed/coach/free.json

JSON shape:
{
  "category": "free",           # free | daily | roleplay | interview | challenge
  "topics": [
    {
      "slug": "favourite-place",
      "title": "My favourite place",
      "description": "Talk about a place you love and why.",
      "level": "A2",            # A1 A2 B1 B2 C1
      "access_tier": "free",    # free | premium
      "ai_role": "",
      "user_role": "",
      "situation": "",
      "objective": "",
      "opening_message": "Let's talk about your favourite place. Where do you like to go?",
      "instructions": "",
      "follow_up_directions": ["who they go with", "how often"],
      "vocabulary_focus": "",
      "grammar_focus": "",
      "interview_type": "",
      "challenge_prompt": "",
      "evaluation_criteria": "",
      "time_limit_seconds": 0,
      "estimated_minutes": 5
    }
  ]
}
"""
import json
import os
import subprocess
import sys

path = sys.argv[1]
doc = json.load(open(path))
category = doc["category"]
rows = doc["topics"]
assert category in {"free", "daily", "roleplay", "interview", "challenge"}, category
assert len(rows) >= 50, f"{path}: only {len(rows)} topics"

LEVELS = {"A1", "A2", "B1", "B2", "C1"}
TIERS = {"free", "premium", "ielts_pro"}


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def arr(vs):
    inner = ",".join('"' + str(v).replace('"', '\\"').replace("\\", "\\\\") + '"' for v in vs)
    return q("{" + inner + "}") + "::text[]"


sql = ["begin;"]
seen = set()
for i, t in enumerate(rows, start=1):
    slug = t["slug"].strip()
    assert slug and slug not in seen, f"duplicate slug: {slug}"
    seen.add(slug)
    assert t["level"] in LEVELS, t
    tier = t.get("access_tier", "free")
    assert tier in TIERS, t
    assert t.get("opening_message", "").strip(), f"{slug}: opening_message required"
    sql.append(
        "insert into public.coach_topics (category,slug,title,description,level,access_tier,ai_role,"
        "user_role,situation,objective,opening_message,instructions,follow_up_directions,vocabulary_focus,"
        "grammar_focus,interview_type,challenge_prompt,evaluation_criteria,time_limit_seconds,"
        "estimated_minutes,sort_order) values ("
        f"{q(category)},{q(slug)},{q(t['title'])},{q(t.get('description',''))},{q(t['level'])},{q(tier)},"
        f"{q(t.get('ai_role',''))},{q(t.get('user_role',''))},{q(t.get('situation',''))},"
        f"{q(t.get('objective',''))},{q(t['opening_message'])},{q(t.get('instructions',''))},"
        f"{arr(t.get('follow_up_directions',[]))},{q(t.get('vocabulary_focus',''))},"
        f"{q(t.get('grammar_focus',''))},{q(t.get('interview_type',''))},{q(t.get('challenge_prompt',''))},"
        f"{q(t.get('evaluation_criteria',''))},{int(t.get('time_limit_seconds',0))},"
        f"{int(t.get('estimated_minutes',5))},{i}) on conflict (slug) do nothing;"
    )
sql.append("commit;")

out = subprocess.run(
    ["psql", os.environ["SUPABASE_DB_URL"], "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
    input="\n".join(sql),
    capture_output=True,
    text=True,
)
print(out.stdout[-2000:], out.stderr[-2000:])
sys.exit(out.returncode)
