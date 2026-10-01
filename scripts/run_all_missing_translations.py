#!/usr/bin/env python3
import os
import sys
import time

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.translate_lessons import ALL_LANGUAGES, translate_language

DIR = os.path.join(os.path.dirname(__file__), "seed", "pronunciation-translations")

def is_complete(lang):
    for part in ["01", "02", "03", "04", "05"]:
        f = os.path.join(DIR, f"{lang}-{part}.json")
        if not os.path.exists(f) or os.path.getsize(f) == 0:
            return False
    return True

def main():
    missing = [c for c in ALL_LANGUAGES if not is_complete(c)]
    print(f"Total missing languages: {len(missing)} ({', '.join(missing)})", flush=True)

    for i, code in enumerate(missing, 1):
        print(f"\n[{i}/{len(missing)}] Starting {code} ({ALL_LANGUAGES[code]})...", flush=True)
        try:
            translate_language(code)
            print(f"[{i}/{len(missing)}] Successfully finished {code}!", flush=True)
        except Exception as e:
            print(f"[{i}/{len(missing)}] Error on {code}: {e}", flush=True)
        time.sleep(2)

if __name__ == "__main__":
    main()
