/* ============================================================
   REVELLA ENERGY — BOX API Intercept
   rv2-intercept.js
   Hosted on GitHub, loaded via jsDelivr CDN
   Must load BEFORE the BOX widget script on the page.
   ============================================================ */
(function () {
  'use strict';

  var BOX_HOST = 'myservicecloud.net';

  window._rv = window._rv || {};
  window._rv.rawResponses = [];
  window._rv.onRates = null;

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

  /* ── Patch XHR ── */
  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr = new OrigXHR();
    var _url = '';
    var origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url) {
      _url = url || '';
      return origOpen.apply(xhr, arguments);
    };
    xhr.addEventListener('load', function () {
      if (_url.indexOf(BOX_HOST) !== -1) {
        rv_tryParse(xhr.responseText, _url);
      }
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  /* ── Patch fetch ── */
  var origFetch = window.fetch;
  window.fetch = function (resource, options) {
    var url = typeof resource === 'string' ? resource
            : (resource && resource.url) ? resource.url : '';
    return origFetch.apply(this, arguments).then(function (response) {
      if (url.indexOf(BOX_HOST) !== -1) {
        response.clone().text().then(function (text) {
          rv_tryParse(text, url);
        });
      }
      return response;
    });
  };

  /* ── Replay: in case responses arrived before logic script registered ── */
  window._rv.replay = function () {
    window._rv.rawResponses.forEach(function (item) {
      if (typeof window._rv.onRates === 'function') {
        window._rv.onRates(item.data, item.url);
      }
    });
  };

})();
