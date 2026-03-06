/* ============================================================
   REVELLA ENERGY — Hash Router Blocker
   rv2-intercept.js v3
   Upload to GitHub: Revella-Tech/revella-scripts
   ─────────────────────────────────────────────────────────
   The BOX widget is a Vue SPA. On init it immediately writes
   window.location.hash = '/' causing the URL to change to #/
   This script blocks that before the widget loads.
   We no longer need API interception — we call the API directly.
   ============================================================ */
(function () {
  'use strict';

  /* ── Block hash-router URL changes ─────────────────────────
     Must run before the BOX script loads.                      */
  var _push    = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);

  function isHashRoute(url) {
    if (!url) return false;
    var s = String(url);
    return s === '#/' || s === '/#/' || s === '#' || /^\/?#\//.test(s);
  }

  history.pushState = function (state, title, url) {
    if (isHashRoute(url)) return;
    return _push(state, title, url);
  };

  history.replaceState = function (state, title, url) {
    if (isHashRoute(url)) return;
    return _replace(state, title, url);
  };

  /* Clean up if hash gets set before we can stop it */
  window.addEventListener('hashchange', function () {
    if (/^\/?#\//.test(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  /* Shared namespace for logic script */
  window._rv = window._rv || {};

})();
