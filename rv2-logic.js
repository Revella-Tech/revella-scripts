/* ============================================================
   REVELLA ENERGY — UI Logic
   rv2-logic.js
   Hosted on GitHub, loaded via jsDelivr CDN
   Must load AFTER the Elementor HTML widget on the page.
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

    /* ── State ── */
    var S = {
      allRates:      [],
      filteredRates: [],
      filter:        'all',
      sort:          'savings',
      zip:           '',
      pendingRate:   null
    };

    /* ── Register callback with intercept script ── */
    window._rv = window._rv || {};
    window._rv.onRates = function (data) {
      var rates = rv_extractRates(data);
      if (rates && rates.length) {
        S.allRates = rates;
        rv_applyFilterSort(S);
        rv_showState('results');
        rv_updateHeader(S);
        var ctrl = document.getElementById('rv2-controls');
        if (ctrl) ctrl.style.display = 'flex';
      }
    };

    /* Replay anything that arrived before we registered */
    if (typeof window._rv.replay === 'function') {
      window._rv.replay();
    }

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
      S.zip = zip;
      S.allRates = [];
      document.getElementById('rv2-results').scrollIntoView({ behavior: 'smooth' });
      rv_showState('loading');
      var ctrl = document.getElementById('rv2-controls');
      if (ctrl) ctrl.style.display = 'none';
      rv_injectZip(zip);
      setTimeout(function () {
        if (!S.allRates.length) rv_showState('empty');
      }, 9000);
    };

    var zipEl = document.getElementById('rv2-zip');
    if (zipEl) {
      zipEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') rv2SearchZip();
      });
    }

    /* ── Inject zip into hidden BOX widget ── */
    function rv_injectZip(zip, attempts) {
      attempts = attempts === undefined ? 15 : attempts;
      var container = document.getElementById('rv2-box-container');
      if (!container) return;
      var zipInput = container.querySelector(
        'input[type="text"], input[inputmode="numeric"], ' +
        'input[placeholder*="zip" i], input[placeholder*="postal" i], ' +
        'input[name*="zip" i], input[class*="zip" i]'
      );
      if (zipInput) {
        zipInput.value = zip;
        ['input', 'change', 'keyup'].forEach(function (evName) {
          zipInput.dispatchEvent(new Event(evName, { bubbles: true }));
        });
        zipInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        var submitBtn = container.querySelector(
          'button[type="submit"], button.search-btn, ' +
          'button[class*="search"], button[class*="submit"], ' +
          '[class*="search-button"]'
        );
        if (submitBtn) setTimeout(function () { submitBtn.click(); }, 150);
      } else if (attempts > 0) {
        setTimeout(function () { rv_injectZip(zip, attempts - 1); }, 500);
      }
    }

    /* ── Extract & normalize rates ── */
    function rv_extractRates(data) {
      var arr = null;
      if (Array.isArray(data))                      arr = data;
      else if (data && Array.isArray(data.results)) arr = data.results;
      else if (data && Array.isArray(data.rates))   arr = data.rates;
      else if (data && Array.isArray(data.data))    arr = data.data;
      else if (data && Array.isArray(data.products)) arr = data.products;
      if (!arr || !arr.length) return null;

      return arr.map(function (r, i) {
        return {
          id:           r.id || r.product_id || r.planId || i,
          supplierName: r.supplier_name || r.supplierName || r.supplier || r.name || r.company || 'Supplier',
          rate:         parseFloat(r.rate || r.price || r.kwh_rate || r.rateAmount || r.commodity_rate || 0),
          term:         parseInt(r.term || r.contract_term || r.termMonths || r.term_months || 0, 10),
          savingsPct:   parseFloat(r.savings_pct || r.savingsPct || r.savings || r.percent_savings || 0),
          monthlyAmt:   parseFloat(r.monthly_savings || r.monthlySavings || r.monthly_amount || 0),
          termSavings:  parseFloat(r.term_savings || r.termSavings || r.total_savings || 0),
          product:      r.product_type || r.productType || r.type || 'Fixed',
          _raw:         r
        };
      }).filter(function (r) { return r.rate > 0; });
    }

    /* ── Filter & Sort ── */
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
      rv_renderCards(rates, S);
    }

    /* ── Render cards ── */
    var colorPalette = ['#7a4c49','#1a5db5','#1b5e20','#bf360c','#4a148c','#006064','#e65100'];
    var colorMap = {};

    function rv_color(name) {
      if (!colorMap[name]) {
        colorMap[name] = colorPalette[Object.keys(colorMap).length % colorPalette.length];
      }
      return colorMap[name];
    }

    function rv_initials(name) {
      var parts = name.split(' ').filter(Boolean);
      return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : name.slice(0, 3).toUpperCase();
    }

    function rv_esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function rv_renderCards(rates, S) {
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
        var rateStr   = r.rate ? '$' + r.rate.toFixed(4) + '/kWh' : '—';
        var termStr   = r.term ? r.term + ' mo fixed' : '—';
        var savePct   = r.savingsPct ? r.savingsPct.toFixed(0) + '%' : null;
        var saveMonth = r.monthlyAmt  ? '$' + r.monthlyAmt.toFixed(0)   + '/mo'       : null;
        var saveTerm  = r.termSavings ? '$' + r.termSavings.toFixed(0)  + ' over term' : null;

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

    /* ── Modal ── */
    window.rv2OpenModal = function (idx) {
      var rate = S.filteredRates[idx];
      if (!rate) return;
      S.pendingRate = rate;
      var sup = document.getElementById('rv2-modal-sup');
      if (sup) {
        sup.innerHTML =
          '<div class="rv2-sname">'  + rv_esc(rate.supplierName) + '</div>' +
          '<div class="rv2-sterm">'  + (rate.term || '—') + ' month fixed rate</div>' +
          '<div class="rv2-kwh">'    + (rate.rate ? '$' + rate.rate.toFixed(4) + '/kWh' : '—') + '</div>';
      }
      var overlay = document.getElementById('rv2-modal');
      if (overlay) overlay.classList.add('rv2-open');
    };

    window.rv2CloseModal = function () {
      var overlay = document.getElementById('rv2-modal');
      if (overlay) overlay.classList.remove('rv2-open');
      S.pendingRate = null;
    };

    var confirmBtn = document.getElementById('rv2-modal-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = function () {
        var rate = S.pendingRate;
        rv2CloseModal();
        rv_triggerEnrollment(rate, S);
      };
    }

    var modalOverlay = document.getElementById('rv2-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) rv2CloseModal();
      });
    }

    /* ── Trigger hidden BOX widget enrollment ── */
    function rv_triggerEnrollment(rate, S) {
      if (!rate) return;
      var container = document.getElementById('rv2-box-container');
      if (!container) { rv_fallbackEnroll(rate, S); return; }

      container.style.pointerEvents = 'auto';

      var allBtns = container.querySelectorAll('button, [role="button"]');
      var matched = null;
      var keyword = rate.supplierName.split(' ')[0].toLowerCase();
      var rateStr = rate.rate ? rate.rate.toFixed(4) : '';

      /* Pass 1: match by supplier name */
      allBtns.forEach(function (btn) {
        if (matched) return;
        var card = btn.closest('[class*="card"],[class*="result"],[class*="plan"],[class*="rate"],li,tr');
        if (card) {
          var txt = (card.innerText || card.textContent || '').toLowerCase();
          if (txt.indexOf(keyword) !== -1) matched = btn;
        }
      });

      /* Pass 2: match by rate value */
      if (!matched && rateStr) {
        allBtns.forEach(function (btn) {
          if (matched) return;
          var card = btn.closest('[class*="card"],[class*="result"],[class*="plan"],li,tr');
          if (card && (card.innerText || card.textContent || '').indexOf(rateStr) !== -1) {
            matched = btn;
          }
        });
      }

      if (matched) {
        matched.click();
      } else {
        rv_fallbackEnroll(rate, S);
      }

      setTimeout(function () { container.style.pointerEvents = 'none'; }, 600);
    }

    function rv_fallbackEnroll(rate, S) {
      var subject = encodeURIComponent('Energy Rate Enrollment — ' + (rate.supplierName || '') + ' ' + (rate.term || '') + 'mo');
      var body = encodeURIComponent(
        'I would like to enroll in the following rate:\n\n' +
        'Supplier: ' + (rate.supplierName || '') + '\n' +
        'Rate: '     + (rate.rate ? '$' + rate.rate.toFixed(4) + '/kWh' : '') + '\n' +
        'Term: '     + (rate.term || '') + ' months\n' +
        'Zip Code: ' + S.zip
      );
      window.location.href = 'mailto:hello@revellaenergy.com?subject=' + subject + '&body=' + body;
    }

    /* ── State machine ── */
    function rv_showState(name) {
      ['idle', 'loading', 'empty', 'results'].forEach(function (s) {
        var el = document.getElementById('rv2-state-' + s);
        if (el) el.classList.toggle('rv2-active', s === name);
      });
    }

    function rv_updateHeader(S) {
      var title = document.getElementById('rv2-results-title');
      var sub   = document.getElementById('rv2-results-sub');
      if (title) title.textContent = S.allRates.length + ' rates available near ' + S.zip;
      if (sub)   sub.textContent   = 'Filter by contract term or sort by savings below. Click Enroll Now to lock in your rate.';
    }

  } /* end rv_boot */

})();
