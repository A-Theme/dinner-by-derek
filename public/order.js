/* Ordering interactions. Everything here is convenience only — quantities,
   prices, eligibility and fees are all re-decided server-side on submit. */
(function () {
  'use strict';
  var cfg = window.DBD || {};
  var form = document.getElementById('orderform');
  if (!form) return;

  var lines = {};                       // key|variant -> line
  var elLines = document.getElementById('lines');
  var elEmpty = document.getElementById('empty-note');
  var elFulfil = document.getElementById('fulfil');
  var elBar = document.getElementById('orderbar');
  var elErr = document.getElementById('formerror');
  var fee = 0;

  function money(c) { return '$' + (c / 100).toFixed(2); }

  function subtotal() {
    var s = 0;
    for (var k in lines) s += lines[k].unit_price * lines[k].qty;
    return s;
  }
  function count() {
    var n = 0;
    for (var k in lines) n += lines[k].qty;
    return n;
  }

  function isDelivery() {
    var r = form.querySelector('input[name=method]:checked');
    return r && r.value === 'delivery';
  }

  function render() {
    var sub = subtotal(), n = count();
    var deliveryFee = isDelivery() ? fee : 0;

    document.getElementById('t-sub').textContent = money(sub);
    document.getElementById('t-fee').textContent = money(deliveryFee);
    document.getElementById('t-feerow').hidden = !isDelivery();
    document.getElementById('t-total').textContent = money(sub + deliveryFee);

    document.getElementById('bar-count').textContent = n === 1 ? '1 item' : n + ' items';
    document.getElementById('bar-total').textContent = money(sub + deliveryFee);

    elEmpty.hidden = n > 0;
    elFulfil.hidden = n === 0;
    elBar.hidden = n === 0;

    elLines.value = JSON.stringify(Object.keys(lines).map(function (k) {
      return { key: lines[k].key, variant: lines[k].variant, qty: lines[k].qty };
    }));
  }

  /* --- Quantity steppers ------------------------------------------------ */
  document.querySelectorAll('[data-qty]').forEach(function (box) {
    var out = box.querySelector('output');
    var max = box.dataset.max === '' ? Infinity : Number(box.dataset.max);
    var id = box.dataset.key + '|' + box.dataset.variant;

    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var cur = lines[id] ? lines[id].qty : 0;
        var next = Math.max(0, Math.min(max, cur + Number(b.dataset.step)));
        if (next === 0) delete lines[id];
        else {
          lines[id] = {
            key: box.dataset.key, variant: box.dataset.variant, qty: next,
            unit_price: Number(box.dataset.price), name: box.dataset.name,
          };
        }
        out.textContent = next;
        render();
      });
    });
  });

  /* --- Pickup / delivery panes ------------------------------------------ */
  form.querySelectorAll('input[name=method]').forEach(function (r) {
    r.addEventListener('change', function () {
      var d = isDelivery();
      var pick = document.getElementById('pickup-pane');
      var del = document.getElementById('delivery-pane');
      if (pick) pick.hidden = d;
      if (del) del.hidden = !d;
      render();
    });
  });

  /* --- Delivery eligibility, checked as soon as the code looks complete -- */
  var postal = document.getElementById('postal');
  var elig = document.getElementById('eligibility');
  var eligible = false;
  var checkTimer = null;

  function showElig(kind, msg) {
    elig.hidden = false;
    elig.className = 'notice' + (kind === 'bad' ? ' notice--strong' : '');
    elig.innerHTML = msg;
  }

  function runCheck() {
    var raw = (postal.value || '').replace(/[^A-Za-z0-9]/g, '');
    if (raw.length < 6) { elig.hidden = true; eligible = false; fee = 0; render(); return; }
    fetch('/api/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postal: postal.value }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      eligible = !!d.ok;
      fee = d.ok ? d.fee : 0;
      if (d.ok) {
        showElig('ok', 'We deliver to <strong>' + d.fsa + '</strong>. Delivery is '
          + money(d.fee) + '.');
      } else if (d.reason === 'invalid') {
        showElig('bad', "That doesn't look like a Canadian postal code. It should look like N2L 3G1.");
      } else {
        showElig('bad', 'Sorry — we don\'t deliver to <strong>' + (d.fsa || 'that area')
          + '</strong> yet. We currently serve ' + (cfg.servedAreas || []).join(', ')
          + '. ' + (cfg.ownerContact || ''));
      }
      render();
    }).catch(function () {
      showElig('bad', "We couldn't check that postal code just now. Check your connection and try again.");
      eligible = false; fee = 0; render();
    });
  }

  if (postal) {
    postal.addEventListener('input', function () {
      clearTimeout(checkTimer);
      checkTimer = setTimeout(runCheck, 300);
    });
  }

  /* --- Remembered details (never order history) ------------------------- */
  var REMEMBER = ['name', 'phone', 'email'];
  try {
    var saved = JSON.parse(localStorage.getItem('dbd.customer') || '{}');
    REMEMBER.forEach(function (f) {
      var el = form.querySelector('[name=' + f + ']');
      if (el && saved[f]) el.value = saved[f];
    });
    if (saved.location_id) {
      var loc = form.querySelector('input[name=location_id][value="' + saved.location_id + '"]');
      if (loc) loc.checked = true;
    }
    if (saved.addr_line) {
      ['addr_line', 'addr_unit', 'postal'].forEach(function (f) {
        var el = form.querySelector('[name=' + f + ']');
        if (el && saved[f]) el.value = saved[f];
      });
    }
  } catch (e) { /* corrupt storage is not worth surfacing */ }

  function remember() {
    var out = {};
    REMEMBER.forEach(function (f) {
      var el = form.querySelector('[name=' + f + ']');
      if (el) out[f] = el.value;
    });
    var loc = form.querySelector('input[name=location_id]:checked');
    if (loc) out.location_id = loc.value;
    if (isDelivery()) {
      ['addr_line', 'addr_unit'].forEach(function (f) {
        var el = form.querySelector('[name=' + f + ']');
        if (el) out[f] = el.value;
      });
      if (postal) out.postal = postal.value;
    }
    try { localStorage.setItem('dbd.customer', JSON.stringify(out)); } catch (e) {}
  }

  /* --- Review before submitting ------------------------------------------
     The submit button opens a review instead of sending. The summary is priced
     by the server via /api/quote, not assembled from the page, so what the
     customer confirms is what the order will actually cost — and a dish that
     sold out while they were typing their address is caught here rather than
     after they commit.

     Without JavaScript none of this binds and the form posts straight through,
     exactly as it did before. */
  var dlg = document.getElementById('review');
  var reviewBody = document.getElementById('review-body');
  var reviewFoot = document.getElementById('review-foot');
  var confirmed = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function row(label, value, cls) {
    return '<div class="totals__row' + (cls ? ' ' + cls : '') + '"><span>' + label
      + '</span><span>' + value + '</span></div>';
  }

  function renderReview(q) {
    var h = '';
    if (q.late) {
      h += '<div class="notice notice--strong"><strong>This is a request, not an order.</strong> '
        + 'Ordering has closed for this day, so Derek has to confirm it before it counts.</div>';
    }

    h += '<div class="review__section"><h3>Your items</h3>';
    q.lines.forEach(function (l) {
      h += row(esc(l.qty) + ' × ' + esc(l.name)
        + ' <span class="variant__label">(' + esc(l.variant) + ')</span>', money(l.total));
    });
    h += '</div>';

    h += '<div class="review__section"><div class="totals">'
      + row('Food subtotal', money(q.subtotal))
      + (q.method === 'delivery' ? row('Delivery', money(q.deliveryFee)) : '')
      + row('Total', money(q.total), 'totals__row--grand')
      + '</div></div>';

    h += '<div class="review__section"><h3>' + (q.method === 'pickup' ? 'Pickup' : 'Delivery') + '</h3>';
    if (q.pickup) {
      h += '<p><strong>' + esc(q.pickup.name) + '</strong><br>' + esc(q.pickup.address)
        + '<br>Anytime ' + esc(q.pickup.window) + '</p>';
    } else if (q.delivery) {
      h += '<p>' + esc(q.delivery.line) + (q.delivery.unit ? ', ' + esc(q.delivery.unit) : '')
        + '<br>' + esc(q.delivery.postal) + '</p>';
    }
    h += '</div>';

    h += '<div class="review__section"><h3>Paying</h3><p>' + esc(q.payment)
      + ' <span class="variant__label">— nothing is charged here</span></p></div>';

    if (q.allergyNotes) {
      h += '<div class="review__section"><h3>Your note to the kitchen</h3>'
        + '<p>' + esc(q.allergyNotes) + '</p></div>';
    }

    reviewBody.innerHTML = h;
    reviewFoot.textContent = '';
  }

  function openReview() {
    var data = new FormData(form);
    var payload = {};
    data.forEach(function (v, k) { payload[k] = v; });

    reviewBody.innerHTML = '<p class="variant__label">Checking prices and availability…</p>';
    reviewFoot.textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');

    fetch('/api/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); }).then(function (q) {
      if (!q.ok) {
        reviewBody.innerHTML = '<p class="review__err">' + esc(q.error) + '</p>';
        reviewFoot.textContent = 'Close this and fix it, then try again.';
        return;
      }
      renderReview(q);
    }).catch(function () {
      // The review is a courtesy; losing it must not block the order.
      reviewBody.innerHTML = '<p class="review__err">We couldn\'t load the summary just now.</p>';
      reviewFoot.textContent = 'You can still place the order — everything is checked again when you do.';
    });
  }

  if (dlg) {
    document.getElementById('review-back').addEventListener('click', function () { dlg.close(); });
    document.getElementById('review-confirm').addEventListener('click', function () {
      confirmed = true;
      dlg.close();
      remember();
      document.getElementById('submitbtn').disabled = true;
      form.submit();                     // bypasses the listener below
    });
  }

  /* --- Submit ------------------------------------------------------------ */
  form.addEventListener('submit', function (e) {
    elErr.hidden = true;
    var problems = [];
    if (count() === 0) problems.push('Add at least one item.');
    if (!form.querySelector('[name=name]').value.trim()) problems.push('Add your name.');
    if (!form.querySelector('[name=phone]').value.trim()) problems.push('Add a phone number.');
    if (isDelivery()) {
      if (!eligible) problems.push('Enter a postal code we deliver to.');
      if (!form.querySelector('[name=addr_line]').value.trim()) problems.push('Add your street address.');
      var min = Number(cfg.deliveryMin || 0);
      if (min > 0 && subtotal() < min) {
        problems.push('Delivery orders start at ' + money(min) + '. You\'re '
          + money(min - subtotal()) + ' short.');
      }
    }
    if (problems.length) {
      e.preventDefault();
      elErr.hidden = false;
      elErr.innerHTML = '<strong>Almost there.</strong> ' + problems.join(' ');
      elErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // Everything checks out locally. Show the review rather than sending —
    // unless this submit is the confirmation coming back from the review.
    if (dlg && !confirmed) {
      e.preventDefault();
      openReview();
      return;
    }

    remember();
    document.getElementById('submitbtn').disabled = true;
  });

  render();
})();
