#!/usr/bin/env python3
"""Load a shadowing topic JSON file into the database.

Usage: python3 scripts/load-shadowing.py /tmp/shadow/daily-routine.json
JSON shape:
{
  "slug": "daily-routine", "name": "Daily Routine",
  "topic_group": "Everyday English", "blurb": "...", "sort_order": 2,
  "sentences": [
    {"subcategory": "Morning", "level": "beginner", "difficulty": 1,
     "sentence_type": "statement", "sentence": "...", "natural_form": "",
     "accent": "american", "pronunciation_focus": "...", "stress_focus": "...",
     "intonation_focus": "...", "connected_speech_focus": "...",
     "vocabulary": [{"word": "...", "meaning": "..."}],
     "grammar_focus": "...", "tags": ["..."]}
  ]
}
"""
import json
import os
import subprocess
import sys

path = sys.argv[1]
doc = json.load(open(path))
rows = doc["sentences"]
assert len(rows) >= 100, f"{path}: only {len(rows)} sentences"


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


def arr(vs):
    inner = ",".join('"' + str(v).replace('"', '\\"') + '"' for v in vs)
    return q("{" + inner + "}") + "::text[]"


sql = [
    "begin;",
    "insert into public.shadowing_topics (slug,name,topic_group,blurb,sort_order) values "
    f"({q(doc['slug'])},{q(doc['name'])},{q(doc['topic_group'])},{q(doc.get('blurb',''))},{doc.get('sort_order',0)}) "
    "on conflict (slug) do nothing;",
]

FREE_PER_LEVEL = 4  # first 4 sentences of EACH level (A1/A2="beginner" etc.) are
# free within a topic — NOT "first 10 sentences of the topic overall". That
# older rule silently gave free users almost nothing but beginner sentences
# (files list sentences easy -> hard, so position 1-10 was beginner every
# time) and zero elementary, violating "free users must reach multiple
# levels, not just short easy sentences" (Yêu cầu 2, tiêu chí nghiệm thu).

seen = set()
level_counts: dict[str, int] = {}
for i, s in enumerate(rows, start=1):
    key = s["sentence"].strip().lower()
    assert key not in seen, f"duplicate sentence: {s['sentence']}"
    seen.add(key)
    level = s["level"]
    level_counts[level] = level_counts.get(level, 0) + 1
    is_free = level_counts[level] <= FREE_PER_LEVEL
    sql.append(
        "insert into public.shadowing_sentences (topic_id,subcategory,level,difficulty,sentence_type,"
        "sentence,natural_form,translation,accent,pronunciation_focus,stress_focus,intonation_focus,"
        "connected_speech_focus,vocabulary,grammar_focus,tags,is_free,sort_order) values ("
        f"(select id from public.shadowing_topics where slug={q(doc['slug'])}),"
        f"{q(s.get('subcategory',''))},{q(s['level'])},{int(s.get('difficulty',1))},"
        f"{q(s.get('sentence_type','statement'))},{q(s['sentence'])},{q(s.get('natural_form',''))},{q(s.get('translation',''))},"
        f"{q(s.get('accent','american'))},{q(s.get('pronunciation_focus',''))},{q(s.get('stress_focus',''))},"
        f"{q(s.get('intonation_focus',''))},{q(s.get('connected_speech_focus',''))},"
        f"{q(json.dumps(s.get('vocabulary',[])))}::jsonb,{q(s.get('grammar_focus',''))},"
        f"{arr(s.get('tags',[]))},{'true' if is_free else 'false'},{i}) on conflict (topic_id,sort_order) do nothing;"
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
