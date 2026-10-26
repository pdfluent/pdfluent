// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

// Tells the Rust startup watchdog the web view is alive while the bundle is
// still loading. A timer stops when the web view is suspended, so silence
// means dead; a slow machine keeps beating and keeps its window. Classic
// script (not inline) because the CSP allows script-src 'self' only.
(function () {
  var internals = window.__TAURI_INTERNALS__;
  if (!internals || typeof internals.invoke !== 'function') return;
  function beat() {
    try {
      var p = internals.invoke('frontend_heartbeat');
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* no IPC */ }
  }
  beat();
  var id = setInterval(beat, 2000);
  // The app has taken over once it reported ready; stop the extra timer.
  window.__pdfluentStopHeartbeat = function () { clearInterval(id); };
})();
