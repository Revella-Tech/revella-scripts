/* ============================================================
   REVELLA ENERGY — UI Logic
   rv2-logic.js v5
   Upload to GitHub: Revella-Tech/revella-scripts
   ─────────────────────────────────────────────────────────
   Loads BOX widget in a hidden iframe on /box-loader/
   Intercept happens inside the iframe, data is postMessaged
   back to this page. No CORS, no auth issues.
   ============================================================ */
(function () {
  'use strict';

  /* !! UPDATE THIS if your box-loader page URL is different !! */
  var LOADER_URL = 'https://revella.tech/box-loader/';

  function rv_init() {
    if (!document.getElementById('rv2-cards-grid')) {
      setTimeout(rv_init, 300);
      return;
    }
    rv_boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rv_init);
  } else {
    rv_init();
  }

  function rv_boot() {

    var S = {
      allRates:      [],
      filteredRates: [],
      filter:        'all',
      sort:          'savings',
      zip:           '',
      pendingRate:   null,
      iframe:        null
    };

    /* ── Create hidden iframe ─────────────────────────────────
       Positioned off-screen so the Vue app renders fully
       but is invisible to the user.                           */
    function rv_createIframe() {
      if (S.iframe) return;
      var iframe = document.createElement('iframe');
      iframe.src             = LOADER_URL;
      iframe.style.position  = 'fixed';
      iframe.style.top       = '0';
      iframe.style.left      = '-9999px';
      iframe.style.width     = '900px';
      iframe.style.height    = '700px';
      iframe.style.border    = 'none';
      iframe.style.zIndex    = '-1';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      document.body.appendChild(iframe);
      S.iframe = iframe;
      console.log('[rv2] Iframe created:', LOADER_URL);
    }

    /* ── Listen for rate data from iframe ─────────────────── */
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'rv2rates') return;
      console.log('[rv2] Received rates from iframe:', e.data.url);
      console.log('[rv2] Raw data:', e.data.data);
      var rates = rv_extractRates(e.data.data);
      console.log('[rv2] Extracted', rates ? rates.length : 0, 'rates');
      if (rates && rates.length) {
        S.allRates = rates;
        rv_applyFilterSort(S);
        rv_showState('results');
        rv_updateHeader(S);
        var ctrl = document.getElementById('rv2-controls');
        if (ctrl) ctrl.style.display = 'flex';
      } else {
        rv_showState('empty');
      }
    });

    /* ── Create iframe on page load so widget pre-initializes */
    rv_createIframe();

    /* ── Zip search ────────────────────────────────────────── */
    window.rv2SearchZip = function () {
      var input = document.getElementById('rv2-zip');
      if (!input) return;
      var zip = input.value.trim();
      if (zip.length !== 5 || isNaN(Number(zip))) {
        input.classList.add('rv2-err');
        return;
      }
      input.classList.remove('rv2-err');
      S.zip      = zip;
      S.allRates = [];

      document.getElementById('rv2-results').scrollIntoView({ behavior: 'smooth' });
      rv_showState('loading');
      var ctrl = document.getElementById('rv2-controls');
      if (ctrl) ctrl.style.display = 'none';

      /* Send zip to iframe */
      if (S.iframe && S.iframe.contentWindow) {
        console.log('[rv2] Sending zip to iframe:', zip);
        S.iframe.contentWindow.postMessage({ type: 'rv2zip', zip: zip }, '*');
      } else {
        console.warn('[rv2] Iframe not ready');
      }

      /* Timeout fallback */
      setTimeout(function () {
        if (!S.allRates.length) {
          console.warn('[rv2] Timeout — no rates received from iframe');
          rv_showState('empty');
        }
      }, 15000);
    };

    var zipEl = document.getElementById('rv2-zip');
    if (zipEl) {
      zipEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') rv2SearchZip();
      });
    }

    /* ── Extract & normalize rates ────────────────────────── */
    function rv_extractRates(data) {
      var arr = null;
      if (Array.isArray(data))                        arr = data;
      else if (data && Array.isArray(data.data))      arr = data.data;
      else if (data && Array.isArray(data.results))   arr = data.results;
      else if (data && Array.isArray(data.rates))     arr = data.rates;
      else if (data && Array.isArray(data.prices))    arr = data.prices;
      else if (data && Array.isArray(data.products))  arr = data.products;
      else if (data && Array.isArray(data.plans))     arr = data.plans;
      else if (data && Array.isArray(data.offers))    arr = data.offers;
      else if (data && data.data && typeof data.data === 'object') {
        var inner = data.data;
        arr = inner.prices || inner.rates || inner.results || inner.data || null;
      }
      if (!arr || !arr.length) return null;

      return arr.map(function (r, i) {
        var sup = r.supplier || r.Supplier || {};
        return {
          id:           r.id || r.product_id || r.planId || r.price_id || i,
          supplierName: sup.name || sup.company_name || r.supplier_name ||
                        r.supplierName || r.supplier || r.name || r.company || r.provider || 'Supplier',
          rate:         parseFloat(r.rate || r.price || r.kwh_rate || r.rate_amount ||
                        r.commodity_rate || r.unit_price || r.supply_rate || 0),
          term:         parseInt(r.term || r.contract_term || r.termMonths ||
                        r.term_months || r.duration || r.contract_length || 0, 10),
          savingsPct:   parseFloat(r.savings_pct || r.savingsPct || r.savings ||
                        r.percent_savings || r.savings_percentage || r.pct_savings || 0),
          monthlyAmt:   parseFloat(r.monthly_savings || r.monthlySavings ||
                        r.monthly_amount || r.monthly_savings_amount || 0),
          termSavings:  parseFloat(r.term_savings || r.termSavings ||
                        r.total_savings || r.contract_savings || 0),
          product:      r.product_type || r.productType || r.type ||
                        r.rate_type || r.product || 'Fixed',
          _raw:         r
        };
      }).filter(function (r) { return r.rate > 0; });
    }

    /* ── Filter + Sort ─────────────────────────────────────── */
    window.rv2Filter = function (btn) {
      document.querySelectorAll('.rv2-filter-btn').forEach(function (b) {
        b.classList.remove('rv2-active');
      });
      btn.classList.add('rv2-active');
      S.filter = btn.getAttribute('data-filter');
      rv_applyFilterSort(S);
    };

    window.rv2Sort = function (val) {
      S.sort = val;
      rv_applyFilterSort(S);
    };

    function rv_applyFilterSort(S) {
      var rates = S.allRates.slice();
      if (S.filter !== 'all') {
        var term = parseInt(S.filter, 10);
        rates = rates.filter(function (r) { return r.term === term; });
      }
      rates.sort(function (a, b) {
        if (S.sort === 'rate') return a.rate - b.rate;
        if (S.sort === 'term') return a.term - b.term;
        return b.savingsPct - a.savingsPct;
      });
      S.filteredRates = rates;
      rv_renderCards(rates);
    }

    /* ── Render cards ──────────────────────────────────────── */
    var palette  = ['#7a4c49','#1a5db5','#1b5e20','#bf360c','#4a148c','#006064','#e65100'];
    var colorMap = {};

    function rv_color(name) {
      if (!colorMap[name]) colorMap[name] = palette[Object.keys(colorMap).length % palette.length];
      return colorMap[name];
    }

    function rv_initials(name) {
      var p = name.split(' ').filter(Boolean);
      return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 3).toUpperCase();
    }

    function rv_esc(s) {
      return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function rv_renderCards(rates) {
      var grid = document.getElementById('rv2-cards-grid');
      if (!grid) return;
      if (!rates.length) {
        grid.innerHTML = '<p class="rv2-no-results">No rates match this filter. Try "All" or a different term.</p>';
        return;
      }
      grid.innerHTML = rates.map(function (r, i) {
        var best      = i === 0;
        var color     = rv_color(r.supplierName);
        var init      = rv_initials(r.supplierName);
        var rateStr   = r.rate        ? '$' + r.rate.toFixed(4) + '/kWh'              : '—';
        var termStr   = r.term        ? r.term + ' mo fixed'                           : '—';
        var savePct   = r.savingsPct  ? r.savingsPct.toFixed(0) + '%'                  : null;
        var saveMonth = r.monthlyAmt  ? '$' + r.monthlyAmt.toFixed(0) + '/mo'          : null;
        var saveTerm  = r.termSavings ? '$' + r.termSavings.toFixed(0) + ' over term'  : null;

        return (
          '<div class="rv2-rate-card' + (best ? ' rv2-best' : '') + '">' +
            (best ? '<div class="rv2-best-label">Best Rate</div>' : '') +
            '<div class="rv2-rc-top">' +
              '<div class="rv2-supplier-pill">' +
                '<div class="rv2-sup-dot" style="background:' + color + '">' + init + '</div>' +
                '<span class="rv2-sup-name">' + rv_esc(r.supplierName) + '</span>' +
              '</div>' +
              '<span class="rv2-term-badge">' + rv_esc(termStr) + '</span>' +
            '</div>' +
            '<div class="rv2-rc-rate"><span class="rv2-rate-big">' + rv_esc(rateStr) + '</span></div>' +
            (savePct
              ? '<div class="rv2-rc-savings">' +
                  '<span class="rv2-savings-pct">Save ' + savePct + '</span>' +
                  '<span class="rv2-savings-detail">' +
                    (saveMonth ? '<strong>' + saveMonth + '</strong>' : '') +
                    (saveTerm  ? saveTerm : '') +
                  '</span>' +
                '</div>'
              : '') +
            '<div class="rv2-rc-meta">' +
              '<div class="rv2-meta-item"><strong>Term</strong>' + rv_esc(termStr) + '</div>' +
              '<div class="rv2-meta-item"><strong>Type</strong>' + rv_esc(r.product) + '</div>' +
            '</div>' +
            '<button class="rv2-enroll-btn' + (best ? ' rv2-best-btn' : '') + '" onclick="rv2OpenModal(' + i + ')">Enroll Now →</button>' +
          '</div>'
        );
      }).join('');
    }

    /* ── Modal ─────────────────────────────────────────────── */
    window.rv2OpenModal = function (idx) {
      var rate = S.filteredRates[idx];
      if (!rate) return;
      S.pendingRate = rate;
      var sup = document.getElementById('rv2-modal-sup');
      if (sup) sup.innerHTML =
        '<div class="rv2-sname">' + rv_esc(rate.supplierName) + '</div>' +
        '<div class="rv2-sterm">' + (rate.term || '—') + ' month fixed rate</div>' +
        '<div class="rv2-kwh">'   + (rate.rate ? '$' + rate.rate.toFixed(4) + '/kWh' : '—') + '</div>';
      var overlay = document.getElementById('rv2-modal');
      if (overlay) overlay.classList.add('rv2-open');
    };

    window.rv2CloseModal = function () {
      var o = document.getElementById('rv2-modal');
      if (o) o.classList.remove('rv2-open');
      S.pendingRate = null;
    };

    var confirmBtn = document.getElementById('rv2-modal-confirm');
    if (confirmBtn) confirmBtn.onclick = function () {
      var rate = S.pendingRate;
      rv2CloseModal();
      rv_sendEnrollEmail(rate);
    };

    var overlay = document.getElementById('rv2-modal');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) rv2CloseModal();
    });

    function rv_sendEnrollEmail(rate) {
      if (!rate) return;
      var subject = encodeURIComponent('Energy Rate Enrollment — ' + (rate.supplierName || '') + ' ' + (rate.term || '') + 'mo');
      var body    = encodeURIComponent(
        'I would like to enroll in the following rate:\n\n' +
        'Supplier: ' + (rate.supplierName || '') + '\n' +
        'Rate: '     + (rate.rate ? '$' + rate.rate.toFixed(4) + '/kWh' : '') + '\n' +
        'Term: '     + (rate.term || '') + ' months\n' +
        'Zip Code: ' + S.zip
      );
      window.location.href = 'mailto:hello@revellaenergy.com?subject=' + subject + '&body=' + body;
    }

    /* ── State machine ─────────────────────────────────────── */
    function rv_showState(name) {
      ['idle','loading','empty','results'].forEach(function (s) {
        var el = document.getElementById('rv2-state-' + s);
        if (el) el.classList.toggle('rv2-active', s === name);
      });
    }

    function rv_updateHeader(S) {
      var t = document.getElementById('rv2-results-title');
      var s = document.getElementById('rv2-results-sub');
      if (t) t.textContent = S.allRates.length + ' rates available near ' + S.zip;
      if (s) s.textContent = 'Filter by contract term or sort by savings. Click Enroll Now to lock in your rate.';
    }

  }
})();
