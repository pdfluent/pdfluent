import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression guard for the white-text-on-dark-background editing bug.
//
// The inline text editor is a transparent overlay positioned over the rendered
// PDF page: the original glyphs are hidden underneath and the editable text is
// drawn in the span's real colour. The overlay background MUST stay transparent
// so the rendered page (e.g. a dark Canva background) shows through. A hardcoded
// opaque white background made white text invisible while editing (white-on-white).
//
// This is a source-introspection test (vitest runs in the `node` environment, so
// a DOM render is unavailable) — it locates the editor's style block by its stable
// caret colour and asserts the background can never regress to an opaque colour.
describe('TextInlineEditor overlay background', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../TextInlineEditor.tsx', import.meta.url)),
    'utf8',
  );

  // The contenteditable overlay's style block is uniquely identified by its caret colour.
  const caretMarker = "caretColor: 'rgb(37, 99, 235)'";
  const caretIdx = src.indexOf(caretMarker);
  // Look at the style declarations immediately preceding the caret colour.
  const block = src.slice(Math.max(0, caretIdx - 500), caretIdx + 60);

  it('marks the editor style block (caret colour present)', () => {
    expect(caretIdx).toBeGreaterThan(-1);
  });

  it('renders the editable overlay on a transparent background', () => {
    expect(block).toMatch(/background:\s*'transparent'/);
  });

  it('never uses an opaque (white) background for the editable overlay', () => {
    // Guards against `#fff`, `#ffffff`, `white`, or `rgb(255, 255, 255)` returning.
    expect(block).not.toMatch(
      /background:\s*'(#fff(?:fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))'/i,
    );
  });
});
