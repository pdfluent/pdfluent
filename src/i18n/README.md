# PDFluent i18n — translator guide

Self-contained briefing for translating PDFluent's UI into a new language.
No prior context needed.

## What you're translating

- `src/i18n/locales/en.json` — master (English)
- `src/i18n/locales/nl.json` — Dutch reference
- 765 keys, organised into namespaces (`common`, `topbar`, `viewer`, `review`,
  `forms`, `protect`, `signature`, `ocr`, `tasks`, etc.)
- All keys are flat strings or `"{{placeholder}} text"` templates — no nested
  ICU plurals or arrays.

## Automated translation (recommended)

Use the batch translation script to generate all locales via Claude Haiku:

```bash
# Install Anthropic SDK first
pip install anthropic

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Translate all 25 missing languages (< $0.50 for the full batch)
python scripts/translate_locales.py

# Or translate specific languages only
python scripts/translate_locales.py --lang de fr es

# See which languages are done vs. missing
python scripts/translate_locales.py --list

# Re-translate a language you want to redo
python scripts/translate_locales.py --lang de --force
```

The script automatically updates `src/i18n/index.ts` with all present locales
when it finishes. Run `npm run typecheck` + `npm test` afterwards to verify.

## Adding a language manually

1. **Copy** `en.json` to `<lang>.json` (e.g. `de.json` for German). Use
   ISO 639-1 codes; use `zh-CN` / `zh-TW` / `pt-BR` for regional variants.
2. **Translate every value**, preserving:
   - `{{placeholder}}` substitutions exactly (don't translate variable names
     like `name`, `count`, `value`)
   - Punctuation: ellipses `…`, em-dashes `—`, keyboard hints `⌘S` / `⌘⇧Z`
   - Sentence case where English uses it; title case is rare in this UI
   - Pluralisation: `_plural` keys follow i18next English style. Add
     `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` forms as needed.
3. **Register** — run `python scripts/translate_locales.py --update-index`
   to regenerate `src/i18n/index.ts` automatically, or edit it by hand:
   ```ts
   import de from './locales/de.json';
   export const SUPPORTED_LANGUAGES = ['en', 'nl', 'de', ...] as const;
   export const LANGUAGE_NAMES = { ..., de: 'Deutsch' };
   // and add to resources: { ..., de: { translation: de } }
   ```
4. **Verify** with the symmetry check below.

## Fallback behaviour

`fallbackLng: 'en'` is set in `src/i18n/index.ts`. If a key is missing in
the active language, i18next returns the English value. So translating
incrementally is safe — partially-translated locales still work.

## Symmetry check (mandatory before commit)

```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('src/i18n/locales').filter(f => f.endsWith('.json'));
const ref = require('./src/i18n/locales/en.json');
function flat(o, p='') { const r={}; for(const[k,v] of Object.entries(o)){const pk=p?p+'.'+k:k; if(v&&typeof v==='object')Object.assign(r,flat(v,pk));else r[pk]=v;} return r; }
const refKeys = new Set(Object.keys(flat(ref)));
for (const f of files) {
  const d = require('./src/i18n/locales/' + f);
  const k = new Set(Object.keys(flat(d)));
  const missing = [...refKeys].filter(x => !k.has(x));
  const extra   = [...k].filter(x => !refKeys.has(x));
  console.log(f + ': ' + k.size + ' keys; missing ' + missing.length + ', extra ' + extra.length);
  if (missing.length) console.log('  MISSING:', missing.slice(0,5).join(', '));
  if (extra.length)   console.log('  EXTRA:  ', extra.slice(0,5).join(', '));
}
"
```

Every locale should report the same key count as `en.json` and zero
missing/extra.

## Key naming conventions

| Suffix | Meaning |
|---|---|
| `*AriaLabel` | Screen-reader-only text on a control |
| `*Tooltip` | Native `title=` attribute |
| `*Placeholder` | `<input>` placeholder |
| `*Title` | Heading / dialog title |
| `*Hint` | Inline help text below a control |
| `*Btn` | Button label (less common — prefer the bare verb) |

Group keys by feature/surface, not by string type. Example:
```jsonc
"topbar": {
  "openPdf": "Open PDF",          // primary button label
  "openPdfFile": "Choose a PDF…", // aria-label for hidden file input
  "saveTooltip": "Save (⌘S)",     // native tooltip
  "saved": "All changes saved"     // status text
}
```

## What NOT to translate

- Brand names: `PDFluent`, `JetBrains`, `Tauri`, `OCR`, `PDF`, `PDF/A`,
  `XFA`
- File format names: `Markdown`, `JSON`, `DOCX`, `XLSX`, `PPTX`
- Keyboard hints in `{{}}` placeholders — translate the surrounding
  sentence, leave the placeholder as-is

## Languages currently in the repo

- `en.json` — English (master, 802 keys)
- `nl.json` — Nederlands (Dutch, 802 keys, full coverage)

**Target languages ready to generate** (run the script above):
ar, cs, da, de, el, es, fi, fr, hi, hu, id, it, ja, ko, nb, pl, pt, ro, ru, sv, th, tr, vi, zh-CN, zh-TW

Anything else is fair game.
