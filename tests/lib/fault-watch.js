// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// The fault watch: what a person would have seen go wrong in the web view.
//
// Plain JavaScript on purpose, like the journey page agent: it is sent as
// source text into the page (WebDriver `execute`, the macOS file bridge,
// Playwright `addInitScript`) and evaluated there. One file serves the journeys,
// the Playwright suite and the unit tests that run it against a fake window
// (tests/fault-guard.test.ts).
//
// It records, and decides nothing. Whether a fault is expected is the
// harness's call (tests/lib/fault-guard.ts), made after the fact, so a fault
// can never be lost because the page moved on first.
//
// What counts as a fault:
//   error-toast          the app's error toast (data-testid="app-error-toast",
//                        data-severity="error"): "'<command>' did not complete"
//                        and every other error the app puts on screen.
//   console-error        console.error(...)
//   window-error         an uncaught exception
//   unhandled-rejection  a promise nobody caught
// Warning toasts (a visible fallback) are not faults. They are kept in
// `window.__pjFaultWatch.warnings` so a run can still say what it saw.
//
// The list lives in the page (`window.__pjFaultWatch.faults`); the harness reads
// it with `snapshot()`. A toast that is already on screen when the watch is
// installed is picked up by the first scan, so installing a little after the
// start of the app still sees the start-up probes' toasts: the toast stays up
// until dismissed. A console.error from before the install is not seen.
(function installFaultWatch(win, doc, ObserverCtor) {
  // Imported by the walk bundle under Node (unit tests): there is no page to watch.
  if (!win || typeof win.addEventListener !== 'function') return;
  if (win.__pjFaultWatch) return;

  var TOAST = '[data-testid="app-error-toast"]';
  var faults = [];
  var warnings = [];
  var seen = typeof WeakSet === 'function' ? new WeakSet() : { has: function () { return false; }, add: function () {} };

  function text(node) {
    return String((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function attr(node, name) {
    return node && typeof node.getAttribute === 'function' ? node.getAttribute(name) : null;
  }

  // A harness that outlives the page (Playwright's exposeFunction) can ask to
  // be told at once: a page that navigates away takes its own list with it.
  function add(list, fault) {
    fault.at = Date.now();
    list.push(fault);
    if (typeof win.__pjFaultSink === 'function') {
      try { win.__pjFaultSink(list === faults ? fault : Object.assign({}, fault, { kind: 'warning-toast' })); } catch (e) { /* the sink is best effort */ }
    }
  }

  function describeValue(v) {
    if (v instanceof Error) return v.stack ? String(v.stack).split('\n').slice(0, 3).join(' | ') : v.name + ': ' + v.message;
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  function readToast(node) {
    var paras = typeof node.querySelectorAll === 'function' ? node.querySelectorAll('p') : [];
    var title = paras && paras.length > 0 ? text(paras[0]) : '';
    var message = paras && paras.length > 1 ? text(paras[1]) : '';
    var fault = {
      kind: 'error-toast',
      text: title && message ? title + ' — ' + message : (title || message || text(node)),
      title: title,
      message: message,
      command: attr(node, 'data-error-source') || undefined,
      code: attr(node, 'data-error-code') || undefined,
    };
    return fault;
  }

  function takeToast(node) {
    if (!node || seen.has(node)) return;
    seen.add(node);
    var severity = attr(node, 'data-severity');
    var fault = readToast(node);
    if (severity === 'error') add(faults, fault);
    else { fault.kind = 'warning-toast'; add(warnings, fault); }
  }

  function scan(root) {
    if (!root) return;
    if (typeof root.matches === 'function' && root.matches(TOAST)) takeToast(root);
    if (typeof root.querySelectorAll === 'function') {
      var found = root.querySelectorAll(TOAST);
      for (var i = 0; i < found.length; i += 1) takeToast(found[i]);
    }
  }

  // The stack re-renders its toasts: a node can be replaced by an equal one,
  // so every added node is looked at, not only the first of a kind.
  if (ObserverCtor && doc) {
    var observer = new ObserverCtor(function (records) {
      for (var i = 0; i < records.length; i += 1) {
        var added = records[i].addedNodes || [];
        for (var k = 0; k < added.length; k += 1) scan(added[k]);
      }
    });
    observer.observe(doc.documentElement || doc, { childList: true, subtree: true });
  }
  scan(doc);

  var originalError = win.console && win.console.error ? win.console.error.bind(win.console) : null;
  if (win.console) {
    win.console.error = function faultWatchConsoleError() {
      var parts = [];
      for (var i = 0; i < arguments.length; i += 1) parts.push(describeValue(arguments[i]));
      add(faults, { kind: 'console-error', text: parts.join(' ') });
      if (originalError) return originalError.apply(null, arguments);
      return undefined;
    };
  }

  win.addEventListener('error', function (event) {
    // A resource that failed to load is an Event on the element, not an
    // ErrorEvent; the app's own images and fonts are checked by their tests.
    if (!event || typeof event.message !== 'string' || !event.message) return;
    add(faults, { kind: 'window-error', text: event.message });
  });

  win.addEventListener('unhandledrejection', function (event) {
    add(faults, { kind: 'unhandled-rejection', text: describeValue(event && event.reason) });
  });

  win.__pjFaultWatch = {
    version: 1,
    faults: faults,
    warnings: warnings,
    /** Look at the toast stack now, then return a copy of every fault so far. */
    snapshot: function () {
      scan(doc);
      return faults.slice();
    },
    warningsSnapshot: function () {
      scan(doc);
      return warnings.slice();
    },
  };
})(
  typeof window !== 'undefined' ? window : globalThis,
  typeof document !== 'undefined' ? document : undefined,
  typeof MutationObserver !== 'undefined' ? MutationObserver : undefined,
);
