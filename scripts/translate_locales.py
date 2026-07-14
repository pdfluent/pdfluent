#!/usr/bin/env python3
# Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
#
# This software is proprietary. The PDFluent application is free to use,
# including for commercial purposes. Redistribution, or extraction or reuse
# of its components (including the embedded PDF engine), requires a licence.
# See https://pdfluent.com/license for terms.

"""
translate_locales.py — generate i18n locale files for PDFluent using Claude Haiku.

Usage:
    python scripts/translate_locales.py              # translate all missing languages
    python scripts/translate_locales.py --lang de    # translate only German
    python scripts/translate_locales.py --lang de fr es  # translate specific languages
    python scripts/translate_locales.py --force      # re-translate even if file exists
    python scripts/translate_locales.py --list       # list supported target languages
    python scripts/translate_locales.py --update-index  # only regenerate index.ts

Requirements:
    pip install anthropic

Environment:
    ANTHROPIC_API_KEY  — your Anthropic API key

Model: claude-haiku-4-5  (cheapest, fast, good enough for UI strings)

Cost estimate per full run (all 25 languages):
  ~5 000 input tokens × 25 + ~5 000 output tokens × 25 = ~250k tokens total
  At Haiku pricing: < $0.40 for the full batch.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Target language table
# ---------------------------------------------------------------------------

TARGET_LANGUAGES: dict[str, str] = {
    "de": "Deutsch",
    "fr": "Français",
    "es": "Español",
    "pt": "Português (Brasil)",
    "it": "Italiano",
    "ja": "日本語",
    "ko": "한국어",
    "zh-CN": "中文（简体）",
    "zh-TW": "中文（繁體）",
    "ar": "العربية",
    "ru": "Русский",
    "pl": "Polski",
    "sv": "Svenska",
    "nb": "Norsk (bokmål)",
    "da": "Dansk",
    "fi": "Suomi",
    "tr": "Türkçe",
    "cs": "Čeština",
    "hu": "Magyar",
    "ro": "Română",
    "el": "Ελληνικά",
    "th": "ภาษาไทย",
    "vi": "Tiếng Việt",
    "id": "Bahasa Indonesia",
    "hi": "हिन्दी",
}

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent
LOCALES_DIR = REPO_ROOT / "src" / "i18n" / "locales"
INDEX_TS_PATH = REPO_ROOT / "src" / "i18n" / "index.ts"
SOURCE_LOCALE = LOCALES_DIR / "en.json"

# ---------------------------------------------------------------------------
# Translation prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a professional software localisation engineer.
Your task: translate a JSON locale file for a desktop PDF editor application (PDFluent).

Rules you MUST follow:
1. Return ONLY valid JSON. No markdown fences, no commentary, no extra text.
2. Preserve the EXACT key structure (all keys unchanged, same nesting).
3. Keep these strings UNTRANSLATED exactly as-is:
   - Brand name: PDFluent
   - File types: PDF, DOCX, XLSX, PPTX, XFA, OCR, WASM
   - Keyboard shortcuts: any string containing ⌘, Ctrl+, Alt+, Shift+ (e.g. "⌘S", "Ctrl+Z")
   - Placeholder tokens: {{variable}} — must be kept verbatim inside the translated text
   - URLs and email addresses
4. Translate concisely — UI labels must be short enough to fit in buttons and menu items.
5. Use formal/neutral tone, not casual.
6. For right-to-left languages (Arabic), translate naturally; the app handles RTL layout.
7. Preserve number formatting exactly (e.g. "{{value}}%" stays as "{{value}}%").
"""

USER_PROMPT_TEMPLATE = """Translate the following JSON locale file from English to {language_name} ({lang_code}).

Source JSON:
{source_json}

Return ONLY the translated JSON object. No additional text."""

# ---------------------------------------------------------------------------
# Index.ts template
# ---------------------------------------------------------------------------

INDEX_TS_TEMPLATE = """\
// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import i18n from 'i18next';
import {{ initReactI18next }} from 'react-i18next';
{imports}

export const SUPPORTED_LANGUAGES = [{lang_array}] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {{
{lang_names}
}};

export const LANGUAGE_STORAGE_KEY = 'pdfluent-lang';

function getInitialLanguage(): string {{
  try {{
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {{
      return stored;
    }}
  }} catch {{ /* localStorage unavailable */ }}
  // Default to English
  return 'en';
}}

void i18n
  .use(initReactI18next)
  .init({{
    resources: {{
{resources}
    }},
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    interpolation: {{
      // React already escapes values — no need for i18next escaping
      escapeValue: false,
    }},
  }});

export default i18n;

/** Change language and persist the choice to localStorage. */
export function setLanguage(lang: SupportedLanguage): void {{
  void i18n.changeLanguage(lang);
  try {{
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }} catch {{ /* ignore write errors */ }}
}}
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ALL_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "nl": "Nederlands",
    **TARGET_LANGUAGES,
}


def ts_identifier(lang_code: str) -> str:
    """Convert 'zh-CN' → 'zhCN' for use as a TypeScript variable name."""
    parts = lang_code.replace("-", "_").split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def load_source() -> dict[str, Any]:
    if not SOURCE_LOCALE.exists():
        sys.exit(f"Error: source locale not found at {SOURCE_LOCALE}")
    with SOURCE_LOCALE.open(encoding="utf-8") as f:
        return json.load(f)


def validate_keys(source: dict[str, Any], translated: dict[str, Any], lang: str) -> bool:
    """Check that all top-level keys from source are present in translated."""
    missing = [k for k in source if k not in translated]
    extra = [k for k in translated if k not in source]
    ok = True
    if missing:
        print(f"  [WARN] {lang}: missing top-level keys: {missing}")
        ok = False
    if extra:
        print(f"  [WARN] {lang}: unexpected extra keys: {extra}")
    return ok


def strip_json_fences(raw: str) -> str:
    """Strip markdown code fences if Haiku accidentally included them."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"```\s*$", "", raw, flags=re.MULTILINE)
    return raw.strip()


def translate_one(
    client: Any,
    lang_code: str,
    lang_name: str,
    source_json: str,
    model: str,
    max_retries: int = 3,
) -> dict[str, Any] | None:
    """Call the API and parse the result, with retries."""
    user_prompt = USER_PROMPT_TEMPLATE.format(
        language_name=lang_name,
        lang_code=lang_code,
        source_json=source_json,
    )

    for attempt in range(1, max_retries + 1):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=8192,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw = response.content[0].text
            cleaned = strip_json_fences(raw)
            data = json.loads(cleaned)
            if not isinstance(data, dict):
                raise ValueError("Response is not a JSON object")
            return data
        except json.JSONDecodeError as exc:
            print(f"  [attempt {attempt}/{max_retries}] JSON parse error: {exc}")
            if attempt < max_retries:
                time.sleep(2 ** attempt)
        except Exception as exc:  # noqa: BLE001
            print(f"  [attempt {attempt}/{max_retries}] API error: {exc}")
            if attempt < max_retries:
                time.sleep(2 ** attempt)
            else:
                return None
    return None


def write_locale(lang_code: str, data: dict[str, Any]) -> None:
    out_path = LOCALES_DIR / f"{lang_code}.json"
    LOCALES_DIR.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  Wrote {out_path.relative_to(REPO_ROOT)}")


def build_index_ts(present_langs: list[str]) -> str:
    """Generate index.ts content for the given list of present locales."""
    # Always include en and nl first, then the rest sorted
    order = ["en", "nl"] + [l for l in sorted(present_langs) if l not in ("en", "nl")]

    imports_lines: list[str] = []
    lang_array_parts: list[str] = []
    lang_name_lines: list[str] = []
    resource_lines: list[str] = []

    for lang in order:
        ident = ts_identifier(lang)
        name = ALL_LANGUAGE_NAMES.get(lang, lang)
        imports_lines.append(f"import {ident} from './locales/{lang}.json';")
        lang_array_parts.append(f"'{lang}'")
        lang_name_lines.append(f"  {lang}: '{name}',")
        resource_lines.append(f"      {lang}: {{ translation: {ident} }},")

    return INDEX_TS_TEMPLATE.format(
        imports="\n".join(imports_lines),
        lang_array=", ".join(lang_array_parts),
        lang_names="\n".join(lang_name_lines),
        resources="\n".join(resource_lines),
    )


def update_index_ts(present_langs: list[str]) -> None:
    content = build_index_ts(present_langs)
    with INDEX_TS_PATH.open("w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {INDEX_TS_PATH.relative_to(REPO_ROOT)} ({len(present_langs)} languages)")


def existing_locales() -> list[str]:
    """Return list of locale codes that already have a .json file (including en/nl)."""
    codes: list[str] = []
    for p in LOCALES_DIR.glob("*.json"):
        code = p.stem
        codes.append(code)
    return sorted(codes)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Translate PDFluent locale files using Claude Haiku",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--lang",
        nargs="+",
        metavar="CODE",
        help="Only translate these language codes (e.g. --lang de fr es)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-translate even if locale file already exists",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available target languages and exit",
    )
    parser.add_argument(
        "--update-index",
        action="store_true",
        help="Only regenerate src/i18n/index.ts from existing locale files",
    )
    parser.add_argument(
        "--model",
        default="claude-haiku-4-5",
        help="Anthropic model to use (default: claude-haiku-4-5)",
    )
    args = parser.parse_args()

    if args.list:
        print("Available target languages:")
        for code, name in sorted(TARGET_LANGUAGES.items()):
            exists = (LOCALES_DIR / f"{code}.json").exists()
            mark = "✓" if exists else " "
            print(f"  [{mark}] {code:8s}  {name}")
        sys.exit(0)

    if args.update_index:
        langs = existing_locales()
        update_index_ts(langs)
        sys.exit(0)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit(
            "Error: ANTHROPIC_API_KEY environment variable not set.\n"
            "       export ANTHROPIC_API_KEY=sk-ant-..."
        )

    try:
        import anthropic  # type: ignore[import]
    except ImportError:
        sys.exit("Error: anthropic package not installed.\n       pip install anthropic")

    client = anthropic.Anthropic(api_key=api_key)

    source = load_source()
    source_json = json.dumps(source, ensure_ascii=False, indent=2)

    langs_to_do: dict[str, str]
    if args.lang:
        invalid = [l for l in args.lang if l not in TARGET_LANGUAGES]
        if invalid:
            valid_list = ", ".join(sorted(TARGET_LANGUAGES))
            sys.exit(
                f"Unknown language code(s): {invalid}\nValid codes: {valid_list}"
            )
        langs_to_do = {l: TARGET_LANGUAGES[l] for l in args.lang}
    else:
        langs_to_do = TARGET_LANGUAGES

    print(f"Source locale: {SOURCE_LOCALE.relative_to(REPO_ROOT)} ({len(source)} top-level keys)")
    print(f"Model:         {args.model}")
    print(f"Target languages: {len(langs_to_do)}")
    print()

    success: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    for lang_code, lang_name in langs_to_do.items():
        out_path = LOCALES_DIR / f"{lang_code}.json"
        if out_path.exists() and not args.force:
            print(f"  [{lang_code}] Already exists — skipping (use --force to re-translate)")
            skipped.append(lang_code)
            continue

        print(f"  [{lang_code}] Translating to {lang_name}…")
        data = translate_one(client, lang_code, lang_name, source_json, args.model)

        if data is None:
            print(f"  [{lang_code}] FAILED — skipping")
            failed.append(lang_code)
            continue

        validate_keys(source, data, lang_code)
        write_locale(lang_code, data)
        success.append(lang_code)

        # Brief pause to be polite to the API
        time.sleep(0.5)

    print()
    print("=" * 60)
    print(f"Done.  Success: {len(success)}  Skipped: {len(skipped)}  Failed: {len(failed)}")
    if failed:
        print(f"Failed languages: {failed}")

    # Update index.ts with all locales that now exist on disk
    all_present = existing_locales()
    update_index_ts(all_present)
    print()
    print("Next steps:")
    print("  1. Run: npm run typecheck   (verify all imports are valid)")
    print("  2. Run: npm test            (all tests should still pass)")
    print("  3. git add src/i18n && git commit -m 'i18n: add translations for N languages'")


if __name__ == "__main__":
    main()
