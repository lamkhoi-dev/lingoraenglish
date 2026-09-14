#!/usr/bin/env python3
"""Load multi-turn Shadowing dialogues into an existing topic.

Usage: python3 scripts/load-shadowing-dialogues.py scripts/seed/shadowing-dialogues/restaurant-coffee-shop.json

Separate from load-shadowing.py (which loads standalone sentences) because
the JSON shape is different (nested turns, not a flat sentence list) and the
100-sentences-minimum / no-duplicate-text guards there don't make sense for
short, legitimately-repeating dialogue lines ("Thank you.", "Here you go.").

JSON shape:
{
  "topic_slug": "restaurant-coffee-shop",
  "dialogues": [
    {
      "level": "beginner", "difficulty": 1, "subcategory": "Ordering",
      "turns": [
        {"speaker_label": "Waiter", "speaker_voice": "nova", "sentence": "...",
         "natural_form": "", "translation": "", "is_free": true},
        {"speaker_label": "Customer", "speaker_voice": "shimmer", "sentence": "...", "is_free": true}
      ]
    }
  ]
}

Each dialogue becomes N rows in shadowing_sentences sharing one fresh
dialogue_id, placed right after the topic's current last sentence — exactly
what admin.saveShadowDialogue() does from the admin UI, so content loaded
here is editable there afterward with no special-casing.
"""
import json
import os
import subprocess
import sys
import uuid

VOICES = {"shimmer", "nova", "alloy", "coral", "sage"}
LEVELS = {"beginner", "elementary", "intermediate", "advanced"}

path = sys.argv[1]
doc = json.load(open(path))
topic_slug = doc["topic_slug"]
dialogues = doc["dialogues"]
assert len(dialogues) >= 1, f"{path}: no dialogues"


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


sql = [
    "begin;",
    # topic_id NOT NULL on shadowing_sentences means a bad slug fails the
    # first insert below loudly (null value in column "topic_id") rather
    # than silently inserting nothing.
    f"select id as _topic_id into temporary _topic from public.shadowing_topics where slug={q(topic_slug)};",
    "select coalesce(max(sort_order), 0) as _max into temporary _sort from public.shadowing_sentences "
    "where topic_id = (select _topic_id from _topic);",
]

next_sort_offset = 0
for d in dialogues:
    level = d.get("level", "beginner")
    assert level in LEVELS, f"bad level: {level}"
    difficulty = int(d.get("difficulty", 1))
    subcategory = d.get("subcategory", "")
    turns = d["turns"]
    assert len(turns) >= 2, f"dialogue needs >=2 turns: {d}"
    dialogue_id = str(uuid.uuid4())
    for i, turn in enumerate(turns, start=1):
        voice = turn.get("speaker_voice", "shimmer")
        assert voice in VOICES, f"bad speaker_voice: {voice}"
        next_sort_offset += 1
        sql.append(
            "insert into public.shadowing_sentences (topic_id,subcategory,level,difficulty,sentence_type,"
            "sentence,natural_form,translation,is_free,sort_order,dialogue_id,turn_number,speaker_label,speaker_voice) "
            "values ((select _topic_id from _topic),"
            f"{q(subcategory)},{q(level)},{difficulty},{q('statement')},{q(turn['sentence'])},"
            f"{q(turn.get('natural_form', ''))},{q(turn.get('translation', ''))},"
            f"{'true' if turn.get('is_free') else 'false'},"
            f"((select _max from _sort) + {next_sort_offset}),"
            f"{q(dialogue_id)},{i},{q(turn['speaker_label'])},{q(voice)}) "
            "on conflict (topic_id,sort_order) do nothing;"
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
