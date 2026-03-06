/* ============================================================
   REVELLA ENERGY — BOX API Intercept
   rv2-intercept.js v2
   Upload to GitHub: Revella-Tech/revella-scripts
   Runs BEFORE the BOX widget script.
   ============================================================ */
(function () {
  'use strict';

  var BOX_HOST = 'myservicecloud.net';

  /* ── Shared state ─────────────────────────────────────────── */
  window._rv = window._rv || {};
  window._rv.rawResponses = [];
  window._rv.onRates = null;

  /* ── Block the widget's hash router from hijacking the URL ───
     The BOX widget is a Vue/React SPA with hash routing.
     On init it writes window.location.hash = '/' which causes
     the page URL to change to #/ and can trigger a scroll-to-top.
     We intercept hash changes from the widget's origin and
     suppress any that look like SPA route changes.             */
  var _originalPushState    = history.pushState.bind(history);
  var _originalReplaceState = history.replaceState.bind(history);

  /* Block pushState calls that look like hash-router SPA routes */
  history.pushState = function (state, title, url) {
    if (url && (url === '#/' || url === '/#/' || url === '#' || String(url).match(/^#\//))) {
      console.log('[rv2] Blocked hash router pushState:', url);
      return;
    }
    return _originalPushState(state, title, url);
  };

  history.replaceState = function (state, title, url) {
    if (url && (url === '#/' || url === '/#/' || url === '#' || String(url).match(/^#\//))) {
      console.log('[rv2] Blocked hash router replaceState:', url);
      return;
    }
    return _originalReplaceState(state, title, url);
  };

  /* Also intercept direct hash assignment via hashchange */
  window.addEventListener('hashchange', function (e) {
    var hash = window.location.hash;
    /* If the hash looks like a SPA route (e.g. #/, #/step1) restore clean URL */
    if (hash && hash.match(/^#\//)) {
      console.log('[rv2] Cleaning up hash router URL:', hash);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  });

  /* Intercept location.hash setter as a last resort */
  try {
    var hashDescriptor = Object.getOwnPropertyDescriptor(window.location, 'hash') ||
                         Object.getOwnPropertyDescriptor(Location.prototype, 'hash');
    if (hashDescriptor && hashDescriptor.set) {
      var originalHashSet = hashDescriptor.set;
      Object.defineProperty(window.location, 'hash', {
        get: hashDescriptor.get,
        set: function (val) {
          if (val === '/' || val === '#/' || val === '') {
            console.log('[rv2] Blocked hash assignment:', val);
            return;
          }
          originalHashSet.call(this, val);
        },
        configurable: true
      });
    }
  } catch (e) {
    /* location.hash may not be configurable in all browsers — that's okay */
  }

  /* ── Parse intercepted responses ─────────────────────────── */
  function rv_tryParse(text, url) {
    if (!text) return;
    var t = text.trim();
    if (t.charAt(0) !== '[' && t.charAt(0) !== '{') return;
    try {
      var data = JSON.parse(t);
      window._rv.rawResponses.push({ url: url, data: data });
      if (typeof window._rv.onRates === 'function') {
        window._rv.onRates(data, url);
      }
    } catch (e) { /* not useful JSON */ }
  }

  /* ── Patch XHR ────────────────────────────────────────────── */
  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr    = new OrigXHR();
    var _url   = '';
    var origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url) {
      _url = url || '';
      return origOpen.apply(xhr, arguments);
    };
    xhr.addEventListener('load', function () {
      if (_url.indexOf(BOX_HOST) !== -1) {
        console.log('[rv2] XHR intercepted:', _url);
        rv_tryParse(xhr.responseText, _url);
      }
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  /* ── Patch fetch ──────────────────────────────────────────── */
  var origFetch = window.fetch;
  window.fetch = function (resource, options) {
    var url = typeof resource === 'string' ? resource
            : (resource && resource.url)   ? resource.url : '';
    return origFetch.apply(this, arguments).then(function (response) {
      if (url.indexOf(BOX_HOST) !== -1) {
        console.log('[rv2] fetch intercepted:', url);
        response.clone().text().then(function (text) {
          rv_tryParse(text, url);
        });
      }
      return response;
    });
  };

  /* ── Replay for late-registering callbacks ────────────────── */
  window._rv.replay = function () {
    window._rv.rawResponses.forEach(function (item) {
      if (typeof window._rv.onRates === 'function') {
        window._rv.onRates(item.data, item.url);
      }
    });
  };

})();
