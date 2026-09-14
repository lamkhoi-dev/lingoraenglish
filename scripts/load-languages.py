#!/usr/bin/env python3
"""Load interface languages + their full translation dictionaries in
scripts/seed/languages into the database.

Usage: python3 scripts/load-languages.py

One file per language, named <code>.json — the language code comes from the
filename, not from inside the JSON, so there's no way for a file to be
loaded under the wrong code by mistake (same convention as
load-pronunciation-lessons.py's skill-by-filename rule).

Each file is {"nativeName", "englishName", "flag", "direction" ("ltr"|"rtl"),
"intlTag", "translations": {key: value, ...}}. This is the whole mechanism
behind Yêu cầu 8's "add a language without touching source code": running
this script (or using the admin "Register a new language" form + editing
keys by hand) is the entire step, no rebuild/redeploy required for the
language to appear and work everywhere. Re-running is safe: the language row
upserts on `code`, translation rows upsert on `(locale, translation_key)`.
"""
import glob
import json
import os
import re
import subprocess
import sys

CODE_RE = re.compile(r"^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$")
DIRECTIONS = {"ltr", "rtl"}


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


languages = []
problems = []
warnings = []
for path in sorted(glob.glob("scripts/seed/languages/*.json")):
    code = os.path.splitext(os.path.basename(path))[0]
    if not CODE_RE.match(code):
        problems.append(f"{path}: filename '{code}' doesn't look like a BCP-47 code")
        continue
    doc = json.load(open(path, encoding="utf-8"))
    where = path
    if not doc.get("nativeName", "").strip():
        problems.append(f"{where}: missing nativeName")
    if not doc.get("englishName", "").strip():
        problems.append(f"{where}: missing englishName")
    if doc.get("direction", "ltr") not in DIRECTIONS:
        problems.append(f"{where}: bad direction {doc.get('direction')}")
    if not doc.get("intlTag", "").strip():
        problems.append(f"{where}: missing intlTag")
    translations = doc.get("translations", {})
    if not translations:
        problems.append(f"{where}: no translations")
    for key, value in translations.items():
        if not isinstance(value, str) or not value.strip():
            problems.append(f"{where}: empty translation for key '{key}'")
    if len(translations) < 1000:
        warnings.append(f"{where}: only {len(translations)} keys (source dictionary has ~1,198)")
    doc["code"] = code
    languages.append(doc)

if problems:
    print("Refusing to load — fix these first:")
    for p in problems:
        print(" -", p)
    sys.exit(1)
if warnings:
    print("Warnings (loading anyway):")
    for w in warnings:
        print(" -", w)

lang_rows = []
translation_rows = []
for lang in languages:
    lang_rows.append(
        "("
        + ", ".join(
            [
                q(lang["code"]),
                q(lang["nativeName"]),
                q(lang["englishName"]),
                q(lang.get("flag", "")),
                q(lang.get("direction", "ltr")),
                q(lang.get("intlTag")),
            ]
        )
        + ")"
    )
    for key, value in lang["translations"].items():
        translation_rows.append("(" + ", ".join([q(lang["code"]), q(key), q(value)]) + ")")

lang_sql = (
    "INSERT INTO public.ui_languages (code, native_name, english_name, flag, direction, intl_tag) VALUES\n"
    + ",\n".join(lang_rows)
    + "\nON CONFLICT (code) DO UPDATE SET native_name = EXCLUDED.native_name, "
    "english_name = EXCLUDED.english_name, flag = EXCLUDED.flag, direction = EXCLUDED.direction, "
    "intl_tag = EXCLUDED.intl_tag, updated_at = now();"
)

BATCH = 500
translation_sql_statements = []
for i in range(0, len(translation_rows), BATCH):
    batch = translation_rows[i : i + BATCH]
    translation_sql_statements.append(
        "INSERT INTO public.ui_translations (locale, translation_key, value) VALUES\n"
        + ",\n".join(batch)
        + "\nON CONFLICT (locale, translation_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();"
    )

url = os.environ.get("SUPABASE_DB_URL")
if not url:
    print("SUPABASE_DB_URL is not set — printing SQL instead.")
    print(lang_sql)
    for stmt in translation_sql_statements:
        print(stmt)
    sys.exit(0)

proc = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-c", lang_sql], capture_output=True, text=True)
if proc.returncode != 0:
    print(proc.stderr.strip())
    sys.exit(proc.returncode)

for i, stmt in enumerate(translation_sql_statements):
    proc = subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-c", stmt], capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"Failed on translation batch {i}:")
        print(proc.stderr.strip())
        sys.exit(proc.returncode)

print(f"Loaded {len(languages)} languages, {len(translation_rows)} translation rows total.")
for lang in languages:
    print(f"  {lang['code']} ({lang['englishName']}): {len(lang['translations'])} keys")
