// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The journey suite's helper inside the app's webview.
//
// Plain JavaScript on purpose: it is sent as source text, by WebDriver
// `execute` (Windows, Linux) or the e2e file bridge (macOS), and evaluated in
// the page. Nothing here is compiled, so nothing a compiler adds can be
// missing on the other side.
//
// Installed once per page load as `window.__pj`; every driver call is
// `window.__pj[name](...args)`.
//
// Native dialogs opened from JavaScript (`@tauri-apps/plugin-dialog`: open,
// save, ask, confirm, message) are answered from a queue the test fills.
// A dialog nobody queued an answer for is cancelled and recorded, never shown:
// on a runner nobody would ever click it, and the test would hang instead of
// failing with the name of the dialog it did not expect.
(function installAgent() {
  if (window.__pj && window.__pj.version === 3) return;
  const answers = [];
  const unexpected = [];
  const invokeLog = [];

  // `__TAURI_INTERNALS__.invoke` is non-writable, so the seam is one level
  // down: Tauri's IPC posts every call with `fetch` to `ipc://localhost/<cmd>`
  // (http://ipc.localhost on Windows) and reads the reply's `Tauri-Response`
  // header. Dialog commands are answered here without reaching the backend.
  function reply(value) {
    return Promise.resolve(new Response(JSON.stringify(value), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
    }));
  }
  function wrapInvoke() {
    if (window.fetch.__pjWrapped) return;
    const original = window.fetch.bind(window);
    const wrapped = function fetchThroughAgent(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const m = url.match(/^(?:ipc:\/\/localhost|https?:\/\/ipc\.localhost)\/([^?#]+)/);
      if (!m) return original(input, init);
      let cmd = m[1];
      try { cmd = decodeURIComponent(cmd); } catch (e) { /* keep raw */ }
      if (cmd !== 'e2e_reply') {
        invokeLog.push({ cmd, at: Date.now() });
        if (invokeLog.length > 500) invokeLog.shift();
      }
      if (cmd === 'plugin:dialog|open' || cmd === 'plugin:dialog|save' || cmd === 'plugin:dialog|message') {
        const kind = cmd.slice('plugin:dialog|'.length);
        let args = {};
        try { args = init && typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch (e) { args = {}; }
        const i = answers.findIndex((a) => a.kind === kind);
        if (i < 0) {
          unexpected.push({ kind, args: JSON.stringify(args).slice(0, 300) });
          return reply(kind === 'message' ? 'Cancel' : null);
        }
        const [answer] = answers.splice(i, 1);
        if (kind === 'message') {
          const buttons = args && args.buttons;
          let ok = 'Ok';
          let cancel = 'Cancel';
          if (buttons === 'YesNo') { ok = 'Yes'; cancel = 'No'; }
          else if (buttons === 'OkCancel') { ok = 'Ok'; cancel = 'Cancel'; }
          else if (buttons && typeof buttons === 'object') { ok = buttons.ok || ok; cancel = buttons.cancel || cancel; }
          return reply(answer.value ? ok : cancel);
        }
        return reply(answer.value);
      }
      return original(input, init);
    };
    wrapped.__pjWrapped = true;
    window.fetch = wrapped;
  }
  wrapInvoke();

  function el(selector) {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`no element matches ${selector}`);
    return found;
  }

  function visible(node) {
    if (!node || !node.isConnected) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function mouseAt(node, type, extra) {
    const r = node.getBoundingClientRect();
    const init = Object.assign({
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1,
    }, extra || {});
    // false when a listener called preventDefault().
    if (type.startsWith('pointer')) {
      return node.dispatchEvent(new PointerEvent(type, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, init)));
    }
    return node.dispatchEvent(new MouseEvent(type, init));
  }

  const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable="true"]';

  // What a real mousedown does to focus: the nearest focusable element takes
  // it; when there is none, the element that had it loses it (and its blur
  // handler runs). A synthetic event does none of this, so without it a click
  // on the page never committed the field being typed in: J-57 and J-59 read
  // the old calculated total because the edit had not been committed yet.
  function focusLikeMouseDown(node) {
    const target = node.closest ? node.closest(FOCUSABLE) : null;
    if (target && typeof target.focus === 'function') { target.focus(); return; }
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') active.blur();
  }

  function keyInit(key, mods) {
    const m = mods || [];
    let code = key.length === 1 ? (/[0-9]/.test(key) ? `Digit${key}` : /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : '') : key;
    if (key === ' ') code = 'Space';
    return {
      key, code, bubbles: true, cancelable: true, composed: true,
      ctrlKey: m.includes('ctrl'), metaKey: m.includes('meta'), shiftKey: m.includes('shift'), altKey: m.includes('alt'),
    };
  }

  function target() {
    return document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  }

  window.__pj = {
    version: 3,
    ping() {
      wrapInvoke();
      // What launch readiness is judged on (lib/launch-readiness.ts): a ping
      // is answered by any page, so it also says which page and how far it got.
      let scriptBytes = 0;
      try {
        for (const e of performance.getEntriesByType('resource')) {
          if (e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name)) scriptBytes += e.transferSize || e.encodedBodySize || 0;
        }
      } catch (e) { /* no resource timing: the count stays 0 */ }
      const root = document.getElementById('root');
      return {
        readyState: document.readyState,
        href: String(location.href),
        shellMounted: !!document.querySelector('[data-has-document]'),
        hasDocument: !!document.querySelector('[data-has-document="true"]'),
        rootChildren: root ? root.childElementCount : 0,
        scriptBytes,
        title: document.title,
      };
    },
    exists(selector) { return !!document.querySelector(selector); },
    visible(selector) { return visible(document.querySelector(selector)); },
    // What a real click on the element would hit: the element (or a child), or
    // the selector of whatever covers its centre. The bridge dispatches events
    // on the node itself, so it never notices an overlay; WebDriver does.
    coveredBy(selector) {
      const n = el(selector);
      const r = n.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && (top === n || n.contains(top))) return null;
      if (!top) return 'nothing';
      const t = top.getBoundingClientRect();
      const what = top.getAttribute('data-testid') || top.tagName.toLowerCase() + '.' + String(top.getAttribute('class') || '').slice(0, 50);
      const box = (b) => [b.left, b.top, b.width, b.height].map((v) => Math.round(v)).join(',');
      const q = (id) => { const x = document.querySelector('[data-testid="' + id + '"]'); return x ? box(x.getBoundingClientRect()) : '-'; };
      return what + ' [' + box(t) + '] over [' + box(r) + '] editor [' + q('text-inline-editor') + '] pill [' + q('text-edit-floating-pill') + ']';
    },
    count(selector) { return document.querySelectorAll(selector).length; },
    /** Size of the first match in CSS px, or null. */
    size(selector) {
      const n = document.querySelector(selector);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { width: r.width, height: r.height };
    },
    /**
     * A fingerprint of what a <canvas> shows right now (FNV-1a over its
     * pixels), or null while it is missing or blank-sized. Two equal values mean
     * the page on screen did not change; the journeys use it to prove that an
     * edit reached the picture and not only the file.
     */
    canvasDigest(selector) {
      const c = document.querySelector(selector);
      if (!c || !c.width || !c.height) return null;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      const px = new Uint32Array(ctx.getImageData(0, 0, c.width, c.height).data.buffer);
      let h = 0x811c9dc5;
      for (let i = 0; i < px.length; i += 1) { h = Math.imul(h ^ px[i], 0x01000193) >>> 0; }
      return `${c.width}x${c.height}:${h.toString(16)}`;
    },
    text(selector) { const n = document.querySelector(selector); return n ? (n.textContent || '').trim() : null; },
    texts(selector) { return Array.from(document.querySelectorAll(selector)).map((n) => (n.textContent || '').trim()); },
    attr(selector, name) { const n = document.querySelector(selector); return n ? n.getAttribute(name) : null; },
    value(selector) { const n = document.querySelector(selector); return n ? (n.type === 'checkbox' || n.type === 'radio' ? n.checked : n.value) : null; },
    activeTestId() { const a = document.activeElement; return a ? a.getAttribute('data-testid') : null; },
    visibleTestIds() {
      return Array.from(document.querySelectorAll('[data-testid]')).filter(visible).map((x) => x.getAttribute('data-testid'));
    },
    describe(selector) {
      return Array.from(document.querySelectorAll(selector)).slice(0, 80).map((n) => ({
        tag: n.tagName.toLowerCase(), testid: n.getAttribute('data-testid'), aria: n.getAttribute('aria-label'),
        title: n.getAttribute('title'), text: (n.textContent || '').trim().slice(0, 60), visible: visible(n),
        cls: (n.getAttribute('class') || '').slice(0, 60),
      }));
    },
    bodyText() { return (document.body.innerText || '').slice(0, 20000); },

    async waitFor(selector, opts) {
      const o = Object.assign({ timeout: 15000, state: 'visible', text: null }, opts || {});
      const until = Date.now() + o.timeout;
      for (;;) {
        const n = document.querySelector(selector);
        let ok;
        if (o.state === 'gone') ok = !n || !visible(n);
        else if (o.state === 'attached') ok = !!n;
        else ok = visible(n);
        if (ok && o.text !== null) ok = !!n && (n.textContent || '').includes(o.text);
        if (ok) return true;
        if (Date.now() > until) {
          const shown = Array.from(document.querySelectorAll('[data-testid]'))
            .filter(visible).map((x) => x.getAttribute('data-testid')).slice(0, 60);
          throw new Error(`timed out after ${o.timeout} ms waiting for ${selector} to be ${o.state}` +
            (o.text !== null ? ` with text ${JSON.stringify(o.text)}` : '') +
            `; visible test ids: ${shown.join(', ')}`);
        }
        await sleep(50);
      }
    },

    scrollIntoView(selector) { el(selector).scrollIntoView({ block: 'center', inline: 'center' }); return true; },

    click(selector, opts) {
      const n = el(selector);
      n.scrollIntoView({ block: 'center', inline: 'center' });
      const o = opts || {};
      const extra = { detail: 1, shiftKey: !!o.shift, metaKey: !!o.meta, ctrlKey: !!o.ctrl };
      mouseAt(n, 'pointerdown', extra);
      if (mouseAt(n, 'mousedown', extra)) focusLikeMouseDown(n);
      mouseAt(n, 'pointerup', Object.assign({ buttons: 0 }, extra));
      mouseAt(n, 'mouseup', Object.assign({ buttons: 0 }, extra));
      mouseAt(n, 'click', Object.assign({ buttons: 0 }, extra));
      return true;
    },

    doubleClick(selector) {
      const n = el(selector);
      n.scrollIntoView({ block: 'center', inline: 'center' });
      for (const detail of [1, 2]) {
        mouseAt(n, 'pointerdown', { detail });
        mouseAt(n, 'mousedown', { detail });
        mouseAt(n, 'pointerup', { detail, buttons: 0 });
        mouseAt(n, 'mouseup', { detail, buttons: 0 });
        mouseAt(n, 'click', { detail, buttons: 0 });
      }
      mouseAt(n, 'dblclick', { detail: 2, buttons: 0 });
      return true;
    },

    /** A drag in page coordinates relative to the element's top-left corner. */
    drag(selector, from, to) {
      const n = el(selector);
      const r = n.getBoundingClientRect();
      const at = (p) => ({ clientX: r.left + p[0], clientY: r.top + p[1] });
      mouseAt(n, 'pointerdown', at(from));
      mouseAt(n, 'mousedown', at(from));
      const steps = 6;
      for (let i = 1; i <= steps; i += 1) {
        const p = [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps];
        mouseAt(n, 'pointermove', at(p));
        mouseAt(n, 'mousemove', at(p));
      }
      mouseAt(n, 'pointerup', Object.assign({ buttons: 0 }, at(to)));
      mouseAt(n, 'mouseup', Object.assign({ buttons: 0 }, at(to)));
      return true;
    },

    /**
     * `drag`, at the pace of a hand: a frame between the events. A drawing tool
     * that keeps the start of the drag in React state (a redaction or rectangle
     * box) never sees it when mousedown, the moves and mouseup arrive in one
     * tick, because the render that stores the start has not happened yet. A
     * person's events are milliseconds apart, so this is the faithful version.
     */
    async dragPaced(selector, from, to) {
      const n = el(selector);
      const r = n.getBoundingClientRect();
      const at = (p) => ({ clientX: r.left + p[0], clientY: r.top + p[1] });
      mouseAt(n, 'pointerdown', at(from));
      mouseAt(n, 'mousedown', at(from));
      await sleep(50);
      const steps = 6;
      for (let i = 1; i <= steps; i += 1) {
        const p = [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps];
        mouseAt(n, 'pointermove', at(p));
        mouseAt(n, 'mousemove', at(p));
        await sleep(20);
      }
      mouseAt(n, 'pointerup', Object.assign({ buttons: 0 }, at(to)));
      mouseAt(n, 'mouseup', Object.assign({ buttons: 0 }, at(to)));
      return true;
    },

    /** The first visible element under `selector` whose text is `text` (trimmed), tagged for a click. */
    findText(selector, text, exact) {
      const want = String(text).trim();
      const hit = Array.from(document.querySelectorAll(selector)).filter(visible).find((n) => {
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        return exact === false ? t.includes(want) : t === want;
      });
      if (!hit) {
        const seen = Array.from(document.querySelectorAll(selector)).filter(visible)
          .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40);
        throw new Error(`no visible ${selector} with text ${JSON.stringify(want)}; visible: ${JSON.stringify(seen)}`);
      }
      document.querySelectorAll('[data-pj-target]').forEach((n) => n.removeAttribute('data-pj-target'));
      hit.setAttribute('data-pj-target', '1');
      return '[data-pj-target="1"]';
    },

    /** Select the text of `selector` the way a drag over it ends: a selection, then mouseup. */
    selectText(selector) {
      const n = el(selector);
      n.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      range.selectNodeContents(n);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const r = n.getBoundingClientRect();
      mouseAt(n, 'mousedown', { clientX: r.left + 1, clientY: r.top + r.height / 2 });
      document.dispatchEvent(new Event('selectionchange'));
      mouseAt(n, 'mouseup', { clientX: r.right - 1, clientY: r.top + r.height / 2, buttons: 0 });
      return sel.toString();
    },

    focus(selector) { const n = el(selector); n.focus(); return document.activeElement === n; },

    /** What a person typing does: keydown, the character, keyup — per key. */
    typeText(text) {
      for (const ch of Array.from(text)) {
        const t = target();
        const down = new KeyboardEvent('keydown', keyInit(ch));
        const proceed = t.dispatchEvent(down);
        if (proceed) {
          t.dispatchEvent(new KeyboardEvent('keypress', keyInit(ch)));
          if (!document.execCommand('insertText', false, ch)) {
            // A target execCommand cannot edit (not focused, not editable): the
            // character goes nowhere, as it would for a person.
          }
        }
        t.dispatchEvent(new KeyboardEvent('keyup', keyInit(ch)));
      }
      return true;
    },

    press(key, mods) {
      const t = target();
      const proceed = t.dispatchEvent(new KeyboardEvent('keydown', keyInit(key, mods)));
      if (proceed && key === 'Backspace') document.execCommand('delete', false);
      if (proceed && key === 'Enter' && t.tagName === 'TEXTAREA') document.execCommand('insertLineBreak', false);
      t.dispatchEvent(new KeyboardEvent('keyup', keyInit(key, mods)));
      return true;
    },

    selectAll(selector) {
      const n = el(selector);
      n.focus();
      if (typeof n.select === 'function') n.select();
      else document.execCommand('selectAll', false);
      return true;
    },

    /** Set an input or select the way React sees a person change it. */
    setValue(selector, value) {
      const n = el(selector);
      n.focus();
      const proto = n instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : n instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(n, value);
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
      return n.value;
    },

    async invoke(cmd, args) {
      return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    },

    queueDialog(kind, value) { wrapInvoke(); answers.push({ kind, value }); return answers.length; },
    pendingDialogs() { return answers.slice(); },
    unexpectedDialogs() { return unexpected.slice(); },
    invokes(since) { return invokeLog.filter((e) => e.at >= (since || 0)).map((e) => e.cmd); },
    now() { return Date.now(); },
    /** Errors the page showed or logged so far (tests/lib/fault-watch.js, sent along with this agent). */
    faults() { return window.__pjFaultWatch ? window.__pjFaultWatch.snapshot() : []; },
    faultWarnings() { return window.__pjFaultWatch ? window.__pjFaultWatch.warningsSnapshot() : []; },
  };
})();
