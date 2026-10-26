# Monochrome migration

The editor used blue (`#0a66ff` / `#4d94ff`) as its main colour: primary
button fills, active tabs, active tools, badges, progress bars, the page
selection overlay. The brand is monochrome. This page records what was blue,
what it became, and the rules that keep it from coming back.

Source of truth: the design system tokens (`colors_and_type.css`: "Brand is
MONOCHROME. Blue is a functional micro-accent only").

## Rules

| Thing | Light | Dark |
| --- | --- | --- |
| Base | `#FFFFFF` / `#FAFAFA`, text `#1A1A1A` | near-black surfaces (`#0E0E12` ... `#303038`), text `#E8E8EC` |
| Primary action | `#1A1A1A` fill, white text (`--emphasis`, `--on-emphasis`) | `#F2F2F2` fill, `#0E0E12` text |
| Active tab / tool / row | neutral tint + near-black text (`--state-active-*`) | white 12% tint + `#F2F2F2` |
| Blue, job 1: focus ring | `#0A66FF` (`--focus-ring`) | `#4D94FF` |
| Blue, job 2: link | `#0A58D8` (`--link`) | `#6BA3FF` |
| Blue, job 3: selection | `#0A66FF` (`--selection*`) | `#4D94FF` |
| Greys | `#5F6370`, `#7B808F` (icons), border `#CCD1DC` | `#A0A4B0`, border `#3A3A44` |
| Status | green `#16A34A`, amber `#D97706`, red `#DC2626` | unchanged hue, lighter |
| Font | Geist | Geist |
| Style | flat, no glow | flat, no glow |

Blue is never a decorative fill, a button fill or an active-tab colour.

## One token file

`src/styles/tokens.css` holds every colour token, light and dark, and is the
only file in `src/` that may contain a blue. It is imported first in
`src/main.tsx`. Dark mode is one block, selected by any of: the OS preference
(unless `.theme-light`), `.theme-dark` on the root, `.dark` (shadcn),
`.pfv3.theme-dark` (v3 shell).

`global.css` keeps geometry, shadows and motion. `magic-patterns.css` bridges
the shadcn names to the same tokens (`--primary: var(--emphasis)`,
`--ring: var(--focus-ring)`). The old `--accent`, `--accent-strong`,
`--accent-soft`, `--accent-line` and `--on-primary` are gone; `--accent` is now
only the neutral shadcn hover grey Tailwind's `bg-accent` always meant.

Page overlays have their own constants (`--selection-on-page*`,
`--focus-ring-on-page`, `--caret-on-page`, `--chrome-hover-on-page`,
`--emphasis-on-page`). A PDF page is white paper in both themes, and `#4D94FF`
on white is only 3.0:1, so overlays drawn on a page keep the light-mode blue in
dark mode.

## Inventory (before)

Counted on `release/editor-next` @ 48ab280e: about 150 blue colour values plus
136 `var(--accent*)` uses, nearly all of them fills or main colours.

### Tokens

| Where | What was blue |
| --- | --- |
| `src/styles/global.css` `:root` | `--accent #0a66ff`, `--accent-strong #0a58d8`, `--accent-soft rgba(10,102,255,.14)` |
| `global.css` Windows | `--accent #0f6cfe` and friends (a second, different blue) |
| `global.css` dark, Windows dark | `--accent #4d94ff`, `#5298ff` |
| `src/styles/viewer-v3.css` `.pfv3` | its own `--accent`, `--accent-strong`, `--accent-soft`, `--accent-line`, light and dark |
| `src/styles/magic-patterns.css` | dark `--primary` `hsl(215 100% 60%)`, dark `--ring`, dark `--pf-accent`, `--pf-accent-hover`, `--pf-accent-muted` (three copies: `.dark`, OS dark) |
| `tailwind.config.js` | no blue literal; `accent`, `primary`, `ring`, `pf-accent` map to the tokens above, so they were blue in dark mode and (through the unlayered `--accent`) in light mode too |

### Fills and main colours

| Surface | Selectors / sites | Now |
| --- | --- | --- |
| Primary buttons | `.toolbar-btn-primary`, `.btn-primary`, `.mode-contextual-cta:hover`, `.pfv3 .btn-primary.accent`, the `*-primary` / `*-cta` family (brand-mark fill, hover `#0a0a0a` / `#f5f5f5`) | `--emphasis`, `--on-emphasis`, `--emphasis-hover` |
| Active tab | `.mode-tab-active::after`, `.pfv3 .menu-tab.active` (+ blue 10% tint), `.pfv3 .thumbs-tab.active` | near-black underline, neutral tint |
| Active tool / mode | `.toolbar-mode-btn-active`, `.annotation-tool-btn.active`, `.toolbar-annot-btn.active`, `.toolbar-view-btn.active`, `.mode-contextual-action.active`, `.pfv3 .iconbtn.on`, `.pfv3 .iconbtn.live`, `.pfv3 .rail-btn.active` (blue fill, blue glow) | `--state-active-bg` / `--state-active-fg`; rail button `--emphasis`; glow removed |
| Active rows | `.cmdpalette-item-active`, `.searchpanel-result-active`, `.leftrail-item-active`, `.pfv3 .outline-item.active`, `.pfv3 .dd-item:hover` | `--state-active-bg` / `--state-hover-bg` |
| Badges, tags | `.admin-panel-badge`, `.leftrail-tab-badge`, `.pfv3 .rail-badge`, `.pfv3 .tool-row .tag`, `.pfv3 .sum-cite`, `.pfv3 .sum-ul li::before` | neutral |
| Progress, spinners, dots | `.toolbar-progress-bar`, `.bottom-taskbar-progress-fill`, `.bottom-taskbar-dot`, `.toolbar-filename .dot`, `.toolbar-status::before`, `.viewer-spinner`, `.pfv3 .read-bar .eq i`, spinners and bars in `EditorV3Shell.tsx` | `--emphasis` / `--text-secondary` |
| Format picker | `.pfv3 .fmt.sel`, `.radio` | `--emphasis` border, neutral tint |
| Native controls | `accent-color` on range, checkbox, radio (`global.css`, `40-settings-dialog.css`, `FormOverlay`, `XfaFormOverlay`) | `--emphasis` (`--emphasis-on-page` on a page) |
| Hover glows | `.btn-primary:hover`, `.mode-contextual-cta:hover` (blue `box-shadow` 0 4px 14px), `.first-run-option:hover` halo, `.pfv3 .rail-btn.active` glow | removed |
| Drop zones | `.v3-drop-overlay` (blue fill + dashed border), `.v3-drop-card` | neutral; `.welcome-drop-target` keeps the focus ring (it is a target indicator) |
| Form bar | `.pfv3 .v3-form-bar` and its buttons (`#2563eb`, `#1d4ed8`, `#1e3a5f`) | neutral; action button `--emphasis` |
| Floating text pill | `[data-testid="text-edit-floating-pill"] button[aria-pressed]` | white 22% on the dark pill |
| Inline text editor | `.viewer-text-inline-button` (blue text `#0b56cc`), `-editor`, `-in-place`, `-hotspot` | neutral buttons; page-edit borders use the selection-on-page tokens |
| Tool icons | `toolDefinitions.ts` `text-blue-500/600` on 8 tools | `text-foreground` |
| Settings link | `Settings.tsx` `var(--accent)` | `--link` |
| Enterprise default branding | `lib/enterprise.ts` `accentColor "#4a9eff"`; `legacy/App.tsx` fallback `rgba(74,158,255)` | `#1a1a1a` |
| Context bar | `TextContextBar.tsx` fallback `var(--primary, #2563eb)` | `#1a1a1a` |

### Kept blue, as a micro-accent

| Job | Where |
| --- | --- |
| Focus ring | every `:focus` / `:focus-visible` / `:focus-within` rule that set `border-color: var(--accent)` + halo (25 rules): inputs, dialogs, search field, page input, buttons, thumbnails; `--focus-ring-on-page` for the text-edit hotspot and inline editor on a page |
| Links | `.license-banner-link`, `.settings-row-link`, Settings "pdfluent.com" |
| Selection, PDF page | `selectionChrome.ts` (18 values), `AnnotationOverlay` (7), `ObjectSelectionOverlay`, `TextInteractionOverlay`, `LinkOverlay`, `FormOverlay`/`XfaFormOverlay` highlight, text selection layer `::selection`, draft circle in `Viewer.tsx`, caret in `TextInlineEditor` |
| Selection, chrome | selected page thumbnail (`.leftrail-thumb-active`, `.sidebar-thumb-active`, `.pfv3 .thumb.active`), global `::selection` |

Hover on a page object is grey (`--chrome-hover-on-page`), not blue: hover is
not selection. The old "focused" indigo and form-field "selected" violet are now
the focus ring and selection blue.

### Allowed exceptions (document content)

Colours the user paints into the document are content, not chrome. Each line
carries `monochrome-allow: <reason>` and is counted in the register in
`tests/monochrome-guard.test.ts`:

- highlight colour swatches (`AnnotationToolbar.tsx`, `Toolbar.tsx`) and shape
  colour presets (`AnnotationToolbar.tsx`);
- annotation swatches and the text colour palette (`RightContextPanel.tsx`);
- the underline annotation preview (`Viewer.tsx`);
- signature ink: blue like a pen (`SignaturePad.tsx`, `EditorV3Shell.tsx`, 4 lines).

## Accessibility

Checked in `tests/monochrome-guard.test.ts`, on the token values, in light and
dark, on every surface the token can sit on:

| Pair | Needs | Result |
| --- | --- | --- |
| `--text-primary` / `-secondary` / `-muted` on surfaces, v3 panel and workspace | 4.5:1 | pass |
| `--link`, `--link-hover` on every surface | 4.5:1 | pass |
| `--on-emphasis` on `--emphasis` and `-hover` | 4.5:1 | pass (17:1 light, 17:1 dark) |
| `--state-active-fg` on the active tint over each surface | 4.5:1 | pass |
| `--focus-ring` on each surface | 3:1 | pass (4.8 light on white, 4.4 dark on elevated) |
| `--focus-ring-on-page`, `--selection-on-page`, `--caret-on-page` on white | 3:1 | pass (4.8) |
| selection stroke on a page | 3:1 | pass |
| black text on the text-selection fill | 7:1 | pass |

Deviations from the brand greys, forced by AA:

- **`--text-muted`**: brand `#7B808F` is 3.9:1 on white and 3.4:1 on the panel
  grey. Muted text is `#656A77` (light) and `#9A9FAD` (dark). `#7B808F` stays as
  `--icon-muted` for non-text marks. Disabled text is exempt under WCAG.
- **`--link`** is the brand's strong blue `#0A58D8` (6.2:1 on white), not
  `#0A66FF` (4.8:1 on white, 4.4:1 on the panel grey, so it fails on panels).
  Dark link is `#6BA3FF`, not `#4D94FF` (4.5:1 on the second panel grey).
- **shadcn `--pf-text-muted`, `--muted-foreground`** darkened to the same effect.

The e2e axe spec (`tests/e2e/accessibility.spec.ts`) gained a dark-mode scan of
the empty state and the open-document shell. That runs in the e2e job, not in
vitest.

## Guard

`tests/monochrome-guard.test.ts` (runs in the normal vitest job):

1. fails on any blue hex, `rgb()`, `hsl()` or named blue, and any blue /
   sky / indigo / cyan / violet Tailwind class, in `src/` outside `tokens.css`;
2. fails if a `monochrome-allow` marker has no reason, or if the allow register
   drifts from the code;
3. fails if a button, tab, tool or CTA rule uses a blue token outside `:focus`;
4. fails if a retired token (`--accent`, `--accent-soft`, ...) comes back;
5. checks the contrast table above and that the dark copies agree.

The detector is tested against known blues and greys, and the guard was run
against three deliberate regressions (a blue hex in `global.css`, a
`text-blue-600` class, a failing link colour); each failed the right test.

## Second round: icons, glass, enterprise accent

- **Tool icons** (`toolDefinitions.ts`) lost their `color` field. Every icon in
  the All tools panel is `text-muted-foreground`; the toolbar icons inherit
  `currentColor`. No tool carries a status colour: none of them means
  error, warning or success. Status hues (red, green, emerald, amber) stay
  where they report a state, for example the form-field filled/empty dots and
  the signature validity text.
- **No blur.** Every `backdrop-filter` is gone (v3 shell, dialog scrims,
  settings, page loading overlay; 60 declarations). The v3 `--glass-*` and
  `--lg-*` tokens kept their names so selectors did not churn, but are now
  opaque fills with a hairline border and a quiet shadow. The "Liquid Glass"
  override block, the translucent gradients, the sheen on the bottom bar and the
  workspace radial gradient are removed. Scrims keep their tint, without blur.
- **Enterprise accent** (`legacy/App.tsx`) no longer sets `--accent`. The new
  `lib/enterpriseTheme.ts` maps it onto the focus and selection tokens only, and
  ignores a colour that is under 3:1 against either the light or the dark
  surface. Buttons, tabs and tools are unaffected by the setting.
- **`tests/e2e/legacy/viewer.test.ts`** is deleted. Nothing referenced it;
  `playwright.config.ts` ignores `**/legacy/**`, so it never ran.

The guard now also refuses rainbow Tailwind hues (purple, pink, teal, orange,
yellow, lime, rose, fuchsia, as well as the blues) and any `backdrop-filter` /
`backdropFilter`, outside `monochrome-allow` lines; it asserts that tool
definitions carry no colour and that the flat surface tokens are opaque. Run
against a deliberate `backdrop-filter` and a `text-purple-500` tool colour, it
failed the three right tests.

## Not done, on purpose

- **Cool-grey surfaces.** The Windows surface set (`#F6F8FC`, `#D5DBE6`, ...) and
  the brand border `#CCD1DC` are cool greys with a slight blue cast. Left as
  they are; the guard only flags clearly saturated blues.
- **Visual check.** Developed with tsc, lint and single vitest files only; the
  rendered result has not been looked at in a browser or the app. The first
  thing to look at: dark-mode primary buttons, the rail's active button, and
  the thumbnail selection.
