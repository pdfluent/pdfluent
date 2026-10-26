#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.
"""Translate the keys listed in src/i18n/untranslated.json.

Published text is written by DeepSeek through OpenRouter, not by Claude (the
standing content rule). Per locale, the listed keys go out in batches; each
answer is checked before it is written:

  * the same {{placeholders}}, HTML tags and %s/%d markers as the English
    string, no more and no fewer;
  * not empty, not still English (unless the English is a name or a unit);
  * the glossary term for "redact" where src/i18n/glossary.json names one.

A batch that fails the check is retried with the failures named; a key that
still fails after the retries is left untranslated and reported, never
written. Afterwards run `node scripts/quality/i18n-parity.mjs --fill` and
`--lower` to rebuild the backlog and the ceiling.

    python3 scripts/i18n/fill_untranslated.py [--lang de fr] [--batch 40] [--dry-run]

The key is read from the macOS keychain (service OPENROUTER_API_KEY, account
pdfluent) or from the OPENROUTER_API_KEY environment variable. It is never
printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "src" / "i18n" / "locales"
UNTRANSLATED = ROOT / "src" / "i18n" / "untranslated.json"
GLOSSARY = ROOT / "src" / "i18n" / "glossary.json"
MODEL = os.environ.get("TRANSLATE_MODEL", "deepseek/deepseek-v4.1-flash")
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

LANGUAGE_NAMES = {
    "ar": "Arabic", "cs": "Czech", "da": "Danish", "de": "German", "el": "Greek",
    "es": "Spanish", "fi": "Finnish", "fr": "French", "hi": "Hindi", "hu": "Hungarian",
    "id": "Indonesian", "it": "Italian", "ja": "Japanese", "ko": "Korean",
    "nb": "Norwegian Bokmål", "nl": "Dutch", "pl": "Polish", "pt": "Brazilian Portuguese",
    "ro": "Romanian", "ru": "Russian", "sv": "Swedish", "th": "Thai", "tr": "Turkish",
    "vi": "Vietnamese", "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese",
}
PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}|%[sd]|</?[a-zA-Z][^>]*>")
KEEP = ("PDFluent", "PDF", "PDF/A", "OCR", "XFA", "AcroForm", "Tesseract", "WebView2")


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if key:
        return key.strip()
    out = subprocess.run(
        ["security", "find-generic-password", "-a", "pdfluent", "-s", "OPENROUTER_API_KEY", "-w"],
        capture_output=True, text=True,
    )
    if out.returncode != 0 or not out.stdout.strip():
        sys.exit("no OpenRouter key: set OPENROUTER_API_KEY or store it in the keychain")
    return out.stdout.strip()


def get(tree: dict, dotted: str):
    node = tree
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def put(tree: dict, dotted: str, value: str) -> None:
    node = tree
    parts = dotted.split(".")
    for part in parts[:-1]:
        node = node[part]
    node[parts[-1]] = value


def markers(text: str) -> list[str]:
    return sorted(PLACEHOLDER.findall(text))


def check(en: str, tr: str, locale: str, glossary: dict, key: str) -> str | None:
    if not isinstance(tr, str) or not tr.strip():
        return "empty"
    if markers(en) != markers(tr):
        return f"placeholders differ: {markers(en)} vs {markers(tr)}"
    letters = re.sub(r"\{\{[^}]+\}\}|[^A-Za-z]", "", en)
    only_names = all(w in KEEP or not w.isalpha() for w in re.findall(r"[A-Za-z/]+", en))
    one_token = len(en.split()) == 1
    if tr.strip() == en.strip() and len(letters) > 3 and not only_names and not one_token:
        return "still English"
    entry = glossary.get("locales", {}).get(locale)
    if entry:
        if key in glossary.get("verbKeys", []) and entry["verb"].lower() not in tr.lower():
            return f"must use the glossary verb {entry['verb']!r}"
        if key in glossary.get("nounKeys", []) and entry["noun"].lower() not in tr.lower():
            return f"must use the glossary noun {entry['noun']!r}"
        for banned in entry.get("banned", []):
            if banned.lower() in tr.lower():
                return f"contains the banned term {banned!r}"
    return None


def ask(key: str, locale: str, items: dict[str, str], notes: list[str]) -> dict[str, str]:
    language = LANGUAGE_NAMES[locale]
    system = (
        f"You translate the user interface of a desktop PDF editor from English into {language}. "
        "Answer with one JSON object: the same keys, each value the translation. No commentary. Rules: "
        "keep every {{placeholder}}, %s, %d and HTML tag exactly as written; keep product and format "
        "names (" + ", ".join(KEEP) + ") untranslated; use the short, plain wording of a native "
        "interface, not a literal one; keep capitalisation style, trailing punctuation and line breaks; "
        "never add or drop a sentence."
    )
    if notes:
        system += " Terminology: " + " ".join(notes)
    body = {
        "model": MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(items, ensure_ascii=False)},
        ],
    }
    request = urllib.request.Request(
        ENDPOINT, data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.load(response)
            text = payload["choices"][0]["message"]["content"]
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
            result = json.loads(text)
            if not isinstance(result, dict):
                raise TypeError("the answer is not an object")
            return result
        except (urllib.error.URLError, json.JSONDecodeError, KeyError, TypeError, AttributeError, TimeoutError) as e:
            wait = 3 * (attempt + 1)
            print(f"    request failed ({type(e).__name__}), retry in {wait}s", file=sys.stderr)
            time.sleep(wait)
    return {}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", nargs="*")
    parser.add_argument("--batch", type=int, default=40)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    en = json.loads((LOCALES / "en.json").read_text())
    listed = json.loads(UNTRANSLATED.read_text())
    glossary = json.loads(GLOSSARY.read_text())
    key = None if args.dry_run else api_key()
    failed: dict[str, list[str]] = {}

    for locale in args.lang or sorted(listed):
        keys = [k for k in listed.get(locale, []) if isinstance(get(en, k), str)]
        if not keys:
            continue
        path = LOCALES / f"{locale}.json"
        tree = json.loads(path.read_text())
        entry = glossary.get("locales", {}).get(locale)
        notes = []
        if entry:
            notes.append(
                f"'redact' (to black out content for good) is {entry['verb']!r} as a verb and "
                f"{entry['noun']!r} as a noun; never use: {', '.join(entry.get('banned', []))}."
            )
        print(f"{locale}: {len(keys)} key(s)")
        if args.dry_run:
            continue
        done = 0
        for start in range(0, len(keys), args.batch):
            batch = {k: get(en, k) for k in keys[start:start + args.batch]}
            pending = dict(batch)
            for attempt in range(3):
                if not pending:
                    break
                hint = notes + ([f"Fix the previous problems: {problems}"] if attempt else [])
                answer = ask(key, locale, pending, hint)
                problems = {}
                for k, source in list(pending.items()):
                    translated = answer.get(k)
                    why = check(source, translated, locale, glossary, k)
                    if why is None:
                        put(tree, k, translated)
                        done += 1
                        del pending[k]
                    else:
                        problems[k] = why
            for k, why in pending.items():
                failed.setdefault(locale, []).append(f"{k}: {why}")
        path.write_text(json.dumps(tree, indent=2, ensure_ascii=False) + "\n")
        print(f"  wrote {done}/{len(keys)}")

    for locale, items in failed.items():
        print(f"{locale}: {len(items)} key(s) left untranslated", file=sys.stderr)
        for line in items[:10]:
            print("   ", line, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
