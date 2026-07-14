# PDFluent design system

This document captures the philosophy and conventions of the v2 editor
design. Every redesigned surface in `src/viewer/components/` follows
these rules.

## Five principles

1. **Content is the hero.** The document is the largest, brightest,
   visually heaviest element on screen at all times. Chrome serves the
   document; it never competes. Empty states are calm and ask one
   clear question.

2. **Calm by default, dense on demand.** A user opening the app should
   not be hit by 28 buttons at once. Show what fits the current mode;
   power features live behind search, overflow menu, or a mode switch.

3. **One route per action.** Every action has exactly one canonical
   location. If a feature lives in two places, pick the right one and
   remove the other. Discoverability comes from great search and
   predictable grouping, never duplication.

4. **Predictable structure.** Same kind of thing always lives in the
   same place. File operations top-left. Identity + status top-centre.
   Page nav + view controls top-right. Mode tabs row 2. Mode-specific
   tools row 3. Page thumbnails left rail. Contextual panels right
   edge.

5. **Quiet motion.** Animation supports comprehension — panel
   open/close, focus changes, status transitions, search hit pulses.
   Animation never decorates. No looping animations on persistent
   surfaces. `prefers-reduced-motion` is honoured.

## Token system

Two coexisting families:

### `pf-*` and surface tokens — `src/styles/global.css`

Primary for motion, interaction state, and PDFluent-specific surfaces.

```css
--bg-canvas       --bg-surface       --bg-surface-2       --bg-surface-3
--bg-surface-elevated --bg-surface-hover --bg-surface-press
--text-primary    --text-secondary   --text-muted         --text-disabled
--accent          --accent-strong    --accent-soft
--success         --warning          --danger
--border          --border-strong    --border-subtle
--shadow-soft     --shadow-panel     --shadow-page        --shadow-sm
--brand-mark-fill --brand-mark-on
--pf-dur-fast     --pf-dur-med       --pf-ease
--radius-btn      --radius-pill      --radius-sm
```

### Shadcn tokens — `src/styles/magic-patterns.css`

Primary for layout/structure primitives that Tailwind utilities map to.

```css
--background      --foreground       --muted     --muted-foreground
--popover         --popover-foreground
--card            --card-foreground
--primary         --primary-foreground
--secondary       --secondary-foreground
--accent          --accent-foreground
--destructive     --destructive-foreground
--border          --input            --ring
--radius          --radius-sm        --radius-lg        --radius-xl
```

## Mode coverage

Both families are dark-mode + Windows-platform aware.

| Selector                                            | Effect                               |
| --------------------------------------------------- | ------------------------------------ |
| `:root`                                             | Default (macOS, light)               |
| `:root[data-platform="windows"]`                    | Windows tokens override              |
| `@media (prefers-color-scheme: dark)`               | OS-level dark mode                   |
| `@media (prefers-color-scheme: dark) :root[data-platform="windows"]` | Windows + dark combination |
| `.dark`                                             | Manual dark override                 |
| `.theme-light` / `.theme-dark`                      | Opt-out hooks from auto dark mode    |

## Class naming conventions

| Surface              | Class prefix       | Example                       |
| -------------------- | ------------------ | ----------------------------- |
| Top chrome row       | `.topbar-*`        | `.topbar-doc-chip`            |
| Mode tabs row        | `.mode-tab*`       | `.mode-tab-active`            |
| Contextual tool row  | `.modetoolbar`     | `.modetoolbar-meta`           |
| Status strip         | `.bottom-taskbar*` | `.bottom-taskbar-progress`    |
| Side rail (left)     | `.leftrail-*`      | `.leftrail-empty-mark`        |
| Mode-specific panel  | `.contextpanel-*`  | `.contextpanel-section`       |
| Signing flow         | `.signature-*`     | `.signature-cert-path`        |
| Welcome surface      | `.welcome-*`       | `.welcome-card-promise`       |
| Empty state          | `.viewer-empty*`   | `.viewer-empty-action`        |
| Dialogs              | `.app-dialog*`     | `.app-dialog-backdrop`        |
| Specific dialogs     | `.settings-dialog*` `.alltools-*` `.cmdpalette-*` `.shortcutsheet*` |
| Icon button atom     | `.pf-btn`          | `.pf-btn-active`              |
| Hairline grouping    | `.toolbar-sep`     | —                             |
| Status pill          | `.toolbar-status`  | —                             |

## Motion

Looping animations:

| Keyframe              | Used by                              |
| --------------------- | ------------------------------------ |
| `pf-mark-breathe`     | Welcome-screen brand mark only       |
| `pf-pulse`            | BottomTaskBar running dot            |
| `pf-search-pulse`     | SearchPanel active result            |

Entrance animations (single-shot, prefers-reduced-motion safe):

| Keyframe              | Used by                              |
| --------------------- | ------------------------------------ |
| `pf-fade-in`          | Welcome surface, viewer empty states |
| `pf-dialog-pop`       | App dialogs, CommandPalette, ShortcutSheet |
| `pf-panel-slide-in`   | AllToolsPanel, RightContextPanel     |
| `pf-fade-slide-down`  | TopBar document chip                 |

All looping animations are cut by `@media (prefers-reduced-motion: reduce)`.

## Component-level patterns

### Buttons

| Class                            | Use case                                    |
| -------------------------------- | ------------------------------------------- |
| `.pf-btn`                        | Icon-only toolbar button (30×30)            |
| `.pf-btn-active`                 | Active state — adds `aria-pressed="true"`   |
| `.topbar-primary-cta`            | Pill button — primary CTA in top bar        |
| `.topbar-action`                 | Text+icon action button                     |
| `.viewer-empty-action`           | Pill button in empty states                 |
| `.contextpanel-action`           | Compact action in panel sections            |
| `.mode-contextual-action`        | Pill-shaped tool toggle in contextual bar   |
| `.welcome-card-cta`              | Dark pill CTA on the welcome card           |

Always include `:focus-visible` ring via design tokens. Always pair
icon-only buttons with `aria-label` or `title`.

### Inputs

| Class                            | Use case                                    |
| -------------------------------- | ------------------------------------------- |
| `.settings-input` / `.settings-select` | Settings dialog form fields            |
| `.contextpanel-input` / `-select` / `-textarea` | Compact panel form fields       |
| `.topbar-page-input`             | Page number input in top bar                |
| `.topbar-search-trigger`         | Search-trigger that opens command palette   |

All inputs use the `--accent` focus ring via `box-shadow: 0 0 0 2px var(--accent-soft)`.

### Dialogs

All dialogs use `.app-dialog-backdrop` + a dialog-specific frame class
(`.settings-dialog`, `.cmdpalette`, `.shortcutsheet`, `.alltools-panel`).

Each dialog:
- Has `role="dialog"` + `aria-modal="true"`
- Either auto-focuses the first input or sets explicit focus
- Closes on Escape via a global keydown listener
- Closes on backdrop click via `onMouseDown` (avoids accidental close
  while text-selecting inside the dialog)

### Empty states

All "nothing here" surfaces use the `.viewer-empty` family:

```tsx
<div data-testid="empty-state-no-X" className="viewer-empty">
  <span className="viewer-empty-mark" aria-hidden="true">
    <LucideIcon />
  </span>
  <p className="viewer-empty-title">{t('emptyStates.X')}</p>
  <p className="viewer-empty-description">{t('emptyStates.XHint')}</p>
  <button className="viewer-empty-action [viewer-empty-action-primary]">
    {actionLabel}
  </button>
</div>
```

## i18n

All visible text flows through `react-i18next`'s `t()`. Keys live in
`src/i18n/locales/{en,nl}.json`.

Never use `defaultValue:` fallbacks — if a key doesn't exist yet, add
it to the locale bundle.

## Accessibility baseline

- All interactive elements have `:focus-visible` rings.
- All icon-only buttons have `aria-label` or `title`.
- All dialogs have `role="dialog"` + `aria-modal="true"` + Escape close.
- All toggles have `aria-pressed`.
- All tabs use `role="tablist"` / `role="tab"` + `aria-selected` +
  `aria-controls`.
- All status regions use `role="status"` + `aria-live="polite"`.
- Color is never the only signal — always paired with text or icon.
- `prefers-reduced-motion` is honoured for every looping animation.

## File map — global.css table of contents

See the top of `src/styles/global.css` for a 16-section ToC pointing
to each major class family with line numbers.
