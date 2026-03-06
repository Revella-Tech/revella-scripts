/* ============================================================
   REVELLA ENERGY — UI Logic
   rv2-logic.js v3
   Upload to GitHub: Revella-Tech/revella-scripts
   ============================================================ */
(function () {
  'use strict';

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
      searching:     false
    };

    /* ── Register callback ── */
    window._rv = window._rv || {};
    window._rv.onRates = function (data, url) {
      console.log('[rv2] Intercepted response from:', url);
      console.log('[rv2] Raw data:', data);
      var rates = rv_extractRates(data);
      console.log('[rv2] Extracted rates:', rates ? rates.length : 0);
      if (rates && rates.length) {
        S.allRates  = rates;
        S.searching = false;
        rv_applyFilterSort(S);
        rv_showState('results');
        rv_updateHeader(S);
        var ctrl = document.getElementById('rv2-controls');
        if (ctrl) ctrl.style.display = 'flex';
      }
    };

    if (typeof window._rv.replay === 'function') {
      window._rv.replay();
    }

    /* ── Widget positioning ──────────────────────────────────
       Key insight: the widget must render at FULL SIZE to
       initialize its Vue/React app and make API calls.
       We position it off the LEFT edge of the screen so it's
       completely invisible but the browser treats it as normal
       rendered content. No display:none, no visibility:hidden,
       no opacity:0 — those all prevent widget initialization.
       ─────────────────────────────────────────────────────── */
    function rv_positionWidget() {
      var c = document.getElementById('rv2-box-container');
      if (!c) return;
      c.style.position   = 'fixed';
      c.style.top        = '0';
      c.style.left       = '-9999px';  /* off left edge, fully rendered */
      c.style.width      = '900px';
      c.style.height     = '700px';
      c.style.zIndex     = '-1';
      c.style.overflow   = 'visible';
      c.style.background = 'white';
      /* Remove any aria-hidden so widget doesn't detect it's hidden */
      c.removeAttribute('aria-hidden');
    }

    rv_positionWidget();

    /* ── Zip search ── */
    window.rv2SearchZip = function () {
      var input = document.getElementById('rv2-zip');
      if (!input) return;
      var zip = input.value.trim();
      if (zip.length !== 5 || isNaN(Number(zip))) {
        input.classList.add('rv2-err');
        return;
      }
      input.classList.remove('rv2-err');
      S.zip       = zip;
      S.allRates  = [];
      S.searching = true;

      document.getElementById('rv2-results').scrollIntoView({ behavior: 'smooth' });
      rv_showState('loading');
      var ctrl = document.getElementById('rv2-controls');
      if (ctrl) ctrl.style.display = 'none';

      rv_injectZip(zip);

      setTimeout(function () {
        if (S.searching) {
          console.log('[rv2] Timeout — no rates received. Check network tab for myservicecloud.net requests.');
          S.searching = false;
          rv_showState('empty');
        }
      }, 12000);
    };

    var zipEl = document.getElementById('rv2-zip');
    if (zipEl) {
      zipEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') rv2SearchZip();
      });
    }

    /* ── Inject zip into BOX widget ── */
    function rv_injectZip(zip) {
      var container = document.getElementById('rv2-box-container');
      if (!container) {
        console.warn('[rv2] BOX container not found');
        return;
      }

      var injected = false;

      var selectors = [
        'input[maxlength="5"]',
        'input[type="text"]',
        'input[type="number"]',
        'input[inputmode="numeric"]',
        'input[placeholder*="zip" i]',
        'input[placeholder*="ZIP" i]',
        'input[placeholder*="postal" i]',
        'input[placeholder*="code" i]',
        'input[name*="zip" i]',
        'input[class*="zip" i]',
        'input[id*="zip" i]'
      ].join(', ');

      function tryInject() {
        if (injected) return;
        var zipInput = container.querySelector(selectors);
        if (!zipInput) return;

        console.log('[rv2] Found zip input:', zipInput);
        injected = true;

        /* Use native value setter to trigger framework reactivity */
        var descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(zipInput, zip);
        } else {
          zipInput.value = zip;
        }

        /* Fire full event sequence */
        ['focus', 'input', 'change', 'blur'].forEach(function (name) {
          zipInput.dispatchEvent(new Event(name, { bubbles: true }));
        });
        ['keydown', 'keypress', 'keyup'].forEach(function (name) {
          zipInput.dispatchEvent(new KeyboardEvent(name, {
            key: 'Enter', keyCode: 13, which: 13, bubbles: true
          }));
        });

        /* Click search/submit button if present */
        setTimeout(function () {
          var btn = container.querySelector([
            'button[type="submit"]',
            'button[class*="search"]',
            'button[class*="submit"]',
            'button[class*="go"]',
            'button[class*="find"]',
            'button[class*="check"]',
            'button:not([class*="close"]):not([class*="cancel"])'
          ].join(', '));
          if (btn) {
            console.log('[rv2] Clicking widget button:', btn);
            btn.click();
          }
        }, 300);
      }

      /* MutationObserver for dynamically rendered inputs */
      var observer = new MutationObserver(function () {
        tryInject();
        if (injected) observer.disconnect();
      });
      observer.observe(container, { childList: true, subtree: true, attributes: true });

      /* Polling fallback */
      var polls = 0;
      var poll  = setInterval(function () {
        tryInject();
        polls++;
        if (injected || polls >= 30) {
          clearInterval(poll);
          observer.disconnect();
          if (!injected) {
            console.warn('[rv2] Could not find zip input in widget after 30 attempts. Widget DOM:', container.innerHTML.slice(0, 500));
          }
        }
      }, 400);

      tryInject();
    }

    /* ── Extract rates — covers all known BOX response shapes ── */
    function rv_extractRates(data) {
      var arr = null;
      if (Array.isArray(data))                        arr = data;
      else if (data && Array.isArray(data.results))   arr = data.results;
      else if (data && Array.isArray(data.rates))     arr = data.rates;
      else if (data && Array.isArray(data.data))      arr = data.data;
      else if (data && Array.isArray(data.products))  arr = data.products;
      else if (data && Array.isArray(data.plans))     arr = data.plans;
      else if (data && Array.isArray(data.offers))    arr = data.offers;
      else if (data && Array.isArray(data.items))     arr = data.items;
      if (!arr || !arr.length) return null;

      return arr.map(function (r, i) {
        return {
          id:           r.id || r.product_id || r.planId || i,
          supplierName: r.supplier_name || r.supplierName || r.supplier ||
                        r.name || r.company || r.provider || 'Supplier',
          rate:         parseFloat(r.rate || r.price || r.kwh_rate ||
                        r.rateAmount || r.commodity_rate || r.unit_price || 0),
          term:         parseInt(r.term || r.contract_term || r.termMonths ||
                        r.term_months || r.duration || 0, 10),
          savingsPct:   parseFloat(r.savings_pct || r.savingsPct || r.savings ||
                        r.percent_savings || r.savings_percentage || 0),
          monthlyAmt:   parseFloat(r.monthly_savings || r.monthlySavings ||
                        r.monthly_amount || r.monthly_savings_amount || 0),
          termSavings:  parseFloat(r.term_savings || r.termSavings ||
                        r.total_savings || r.contract_savings || 0),
          product:      r.product_type || r.productType || r.type || r.rate_type || 'Fixed',
          _raw:         r
        };
      }).filter(function (r) { return r.rate > 0; });
    }

    /* ── Filter + Sort ── */
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

    /* ── Render cards ── */
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
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
        var rateStr   = r.rate       ? '$' + r.rate.toFixed(4) + '/kWh'         : '—';
        var termStr   = r.term       ? r.term + ' mo fixed'                      : '—';
        var savePct   = r.savingsPct ? r.savingsPct.toFixed(0) + '%'             : null;
        var saveMonth = r.monthlyAmt  ? '$' + r.monthlyAmt.toFixed(0) + '/mo'   : null;
        var saveTerm  = r.termSavings ? '$' + r.termSavings.toFixed(0) + ' over term' : null;
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
            (savePct ? '<div class="rv2-rc-savings"><span class="rv2-savings-pct">Save ' + savePct + '</span>' +
              '<span class="rv2-savings-detail">' + (saveMonth ? '<strong>' + saveMonth + '</strong>' : '') + (saveTerm || '') + '</span></div>' : '') +
            '<div class="rv2-rc-meta">' +
              '<div class="rv2-meta-item"><strong>Term</strong>' + rv_esc(termStr) + '</div>' +
              '<div class="rv2-meta-item"><strong>Type</strong>' + rv_esc(r.product) + '</div>' +
            '</div>' +
            '<button class="rv2-enroll-btn' + (best ? ' rv2-best-btn' : '') + '" onclick="rv2OpenModal(' + i + ')">Enroll Now →</button>' +
          '</div>'
        );
      }).join('');
    }

    /* ── Modal ── */
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
      rv_triggerEnrollment(rate);
    };

    var overlay = document.getElementById('rv2-modal');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) rv2CloseModal();
    });

    /* ── Enrollment ── */
    function rv_triggerEnrollment(rate) {
      if (!rate) return;
      var container = document.getElementById('rv2-box-container');
      if (!container) { rv_fallback(rate); return; }

      var allBtns = container.querySelectorAll('button, [role="button"]');
      var matched = null;
      var keyword = rate.supplierName.split(' ')[0].toLowerCase();
      var rateStr = rate.rate ? rate.rate.toFixed(4) : '';

      allBtns.forEach(function (btn) {
        if (matched) return;
        var card = btn.closest('[class*="card"],[class*="result"],[class*="plan"],[class*="rate"],li,tr');
        if (card && (card.innerText || '').toLowerCase().indexOf(keyword) !== -1) matched = btn;
      });

      if (!matched && rateStr) {
        allBtns.forEach(function (btn) {
          if (matched) return;
          var card = btn.closest('[class*="card"],[class*="result"],[class*="plan"],li,tr');
          if (card && (card.innerText || '').indexOf(rateStr) !== -1) matched = btn;
        });
      }

      matched ? matched.click() : rv_fallback(rate);
    }

    function rv_fallback(rate) {
      var subject = encodeURIComponent('Energy Rate Enrollment — ' + (rate.supplierName || '') + ' ' + (rate.term || '') + 'mo');
      var body    = encodeURIComponent(
        'Supplier: ' + (rate.supplierName || '') + '\n' +
        'Rate: '     + (rate.rate ? '$' + rate.rate.toFixed(4) + '/kWh' : '') + '\n' +
        'Term: '     + (rate.term || '') + ' months\nZip: ' + S.zip
      );
      window.location.href = 'mailto:hello@revellaenergy.com?subject=' + subject + '&body=' + body;
    }

    /* ── State ── */
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
