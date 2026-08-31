/* Ordering interactions. Everything here is convenience only — quantities,
   prices, eligibility and fees are all re-decided server-side on submit. */
(function () {
  'use strict';
  var cfgEl = document.getElementById('dbd-config');
  var cfg = {};
  try { cfg = cfgEl ? JSON.parse(cfgEl.textContent) : {}; } catch (e) { cfg = {}; }
  var form = document.getElementById('orderform');
  if (!form) return;

  /* --- One submission, one order ----------------------------------------
     Stamped once per drawn page and never regenerated, so every way of
     sending this form twice — a double tap, a refresh of the posted form,
     a retry after the signal dropped mid-request — carries the same key and
     lands as the one order the server already has. A genuine second order
     means loading the menu again, which draws a new key. */
  var keyEl = document.getElementById('submission-key');
  if (keyEl && !keyEl.value) {
    keyEl.value = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(16).slice(2) +
        Math.random().toString(16).slice(2);
  }

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
      /* Switching changes which fields are being asked for, so whatever was
         flagged under the old choice is no longer the question. */
      clearProblems();
      render();
    });
  });

  /* --- Delivery eligibility, checked as soon as the code looks complete -- */
  var postal = document.getElementById('postal');
  var elig = document.getElementById('eligibility');
  var eligible = false;
  var checking = false;                 // a code typed but not yet answered for
  var checkTimer = null;

  function showElig(kind, msg) {
    elig.hidden = false;
    elig.className = 'notice' + (kind === 'bad' ? ' notice--strong' : '');
    elig.innerHTML = msg;
  }

  function runCheck() {
    var raw = (postal.value || '').replace(/[^A-Za-z0-9]/g, '');
    if (raw.length < 6) { elig.hidden = true; eligible = false; checking = false; fee = 0; render(); return; }
    fetch('/api/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postal: postal.value }),
    }).then(function (r) { return r.json(); }).then(function (d) {
      eligible = !!d.ok;
      checking = false;
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
      eligible = false; checking = false; fee = 0; render();
    });
  }

  if (postal) {
    postal.addEventListener('input', function () {
      clearTimeout(checkTimer);
      checking = (postal.value || '').replace(/[^A-Za-z0-9]/g, '').length >= 6;
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

  /* --- What's missing, and where -----------------------------------------
     Two things have to happen when details are incomplete: the customer has
     to be stopped, and they have to be told which box to go back to. The
     summary above the button does the first job and used to do both, which
     left "Add your name." floating above a dozen inputs. So each problem now
     also names its own field: the box is marked, the reason sits under it,
     and focus lands on the first one. The summary stays, because a list of
     four problems is easier to hold onto than four scattered lines.

     None of this replaces the server's checks. Every rule here is enforced
     again in orders.js, which is what an unscripted post still meets. */

  function fieldEl(n) { return form.querySelector('[name=' + n + ']'); }
  function noteEl(el) { return el && el.id ? document.getElementById('err-' + el.id) : null; }
  function val(el) { return el ? (el.value || '').trim() : ''; }

  function markBad(el, msg) {
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    var n = noteEl(el);
    if (n) { n.textContent = msg; n.hidden = false; }
  }
  function markGood(el) {
    if (!el) return;
    el.removeAttribute('aria-invalid');
    var n = noteEl(el);
    if (n) { n.hidden = true; n.textContent = ''; }
  }

  /* One entry per field. `run` returns a message when the box is wrong and
     nothing when it is fine; `when` limits a check to the fulfilment method
     that actually asks for that box. */
  var CHECKS = [
    { name: 'postal', when: isDelivery, run: function (v) {
      if (!v) return 'Add the postal code we\'re delivering to.';
      if (v.replace(/[^A-Za-z0-9]/g, '').length < 6) return 'That postal code looks incomplete — it should look like N2L 3G1.';
      if (checking) return 'Still checking this postal code — give it a second and try again.';
      if (!eligible) return 'We can\'t deliver to this postal code — see the note below.';
    } },
    { name: 'addr_line', when: isDelivery, run: function (v) {
      if (!v) return 'Add your street address.';
    } },
    { name: 'name', run: function (v) {
      if (!v) return 'Add your name, so Derek knows whose dinner this is.';
    } },
    { name: 'phone', run: function (v) {
      if (!v) return 'Add a phone number Derek can reach you on.';
      if (v.replace(/\D/g, '').length < 10) return 'That number looks too short — include the area code.';
    } },
    { name: 'email', run: function (v) {
      if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'That email address doesn\'t look right.';
    } },
  ];

  function clearProblems() {
    CHECKS.forEach(function (c) { markGood(fieldEl(c.name)); });
    elErr.hidden = true;
    elErr.innerHTML = '';
  }

  /* Everything wrong, in the order the form asks for it, so the first problem
     reported is the topmost one on the page. */
  function findProblems() {
    var out = [];
    if (count() === 0) out.push({ msg: 'Add at least one item from the menu.' });
    CHECKS.forEach(function (c) {
      if (c.when && !c.when()) return;
      var el = fieldEl(c.name);
      if (!el) return;
      var msg = c.run(val(el));
      if (msg) out.push({ el: el, msg: msg });
    });
    if (isDelivery()) {
      var min = Number(cfg.deliveryMin || 0);
      if (min > 0 && subtotal() < min) {
        out.push({ msg: 'Delivery orders start at ' + money(min) + '. You\'re '
          + money(min - subtotal()) + ' short.' });
      }
    }
    return out;
  }

  /* Paint the result. Fields that are fine are cleared as well as fields that
     are wrong — a message that has been fixed must not sit there contradicting
     the box it points at. */
  function showProblems(problems) {
    clearProblems();
    if (!problems.length) return;
    problems.forEach(function (p) { if (p.el) markBad(p.el, p.msg); });
    elErr.hidden = false;
    elErr.innerHTML = '<strong>' + (problems.length === 1
      ? 'One thing to fix before you can continue:'
      : 'A few things to fix before you can continue:') + '</strong><ul>'
      + problems.map(function (p) { return '<li>' + esc(p.msg) + '</li>'; }).join('') + '</ul>';

    var first = problems[0].el;
    if (first && first.offsetParent !== null) {
      first.focus();
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      elErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elErr.focus();
    }
  }

  /* Live corrections. Typing only ever clears a message, so a box that is
     already marked stops arguing with what is now in it the moment it is
     fixed — and a box nobody has reached yet is left alone. Leaving a field
     with something in it does run the check, which is how a mistyped email is
     caught where it was typed rather than at the bottom of the form. */
  CHECKS.forEach(function (c) {
    var el = fieldEl(c.name);
    if (!el) return;
    function recheck(onBlur) {
      var flagged = el.hasAttribute('aria-invalid');
      var v = val(el);
      if (!flagged && (!onBlur || !v)) return;
      if (c.when && !c.when()) { markGood(el); return; }
      var msg = c.run(v);
      if (!msg) { markGood(el); return; }
      // Mid-typing, a message can only go away, never change: swapping "add a
      // phone number" for "that number is too short" on the third digit is the
      // form arguing with someone who is still answering it.
      if (onBlur) markBad(el, msg);
    }
    el.addEventListener('input', function () { recheck(false); });
    el.addEventListener('blur', function () { recheck(true); });
  });

  /* --- Submit ------------------------------------------------------------ */
  form.addEventListener('submit', function (e) {
    var problems = findProblems();
    if (problems.length) {
      e.preventDefault();
      showProblems(problems);
      return;
    }
    showProblems([]);
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
