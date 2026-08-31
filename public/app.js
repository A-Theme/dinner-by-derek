/* Dinner By Derek — app shell behaviour: install prompts, SW registration. */
(function () {
  'use strict';

  var standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  /* --- Two buttons that only the browser can answer ----------------------
     Reload on the offline page, back on the one that says an order didn't go
     through. Both were inline handlers, which a page cannot keep if it wants
     to tell the browser that inline script is never legitimate here. */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('[data-reload]')) location.reload();
    else if (e.target.closest('[data-back]')) history.back();
  });

  /* --- The bigger picture -------------------------------------------------
     Tapping a dish photo opens the full-resolution original with the item's
     name and description beside it — the description repeated here on purpose,
     because the point of looking closer is deciding what to eat, and sending
     someone back to the card to re-read it defeats that.

     Delegated from the document, so it covers the featured dish and every
     option card without walking the page, and keeps working if anything is
     ever rendered after load. A <dialog> so the browser owns the focus trap,
     the backdrop and Escape. */
  (function () {
    var dlg = document.getElementById('lightbox');
    if (!dlg || !dlg.showModal) return;      // no dialog support: photos stay ordinary images
    var img = document.getElementById('lightbox-img');
    var nameEl = document.getElementById('lightbox-name');
    var descEl = document.getElementById('lightbox-desc');
    var opener = null;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-zoom]');
      if (!btn) return;
      opener = btn;

      /* Show the page's own copy first so there is something to look at while
         the original arrives — on a phone that is the difference between an
         instant response and a second of blank box. The full file replaces it
         when it has loaded, and if it never does, the small one stays. */
      img.src = btn.getAttribute('data-web');
      img.alt = btn.getAttribute('data-name') || '';
      var full = new Image();
      full.onload = function () { img.src = full.src; };
      full.src = btn.getAttribute('data-full');

      nameEl.textContent = btn.getAttribute('data-name') || '';
      var desc = btn.getAttribute('data-desc') || '';
      descEl.textContent = desc;
      descEl.hidden = !desc;

      dlg.showModal();
    });

    /* Tapping the picture itself closes it, which is what a full-screen image
       invites. The body is left alone so the description can be selected. */
    img.addEventListener('click', function () { dlg.close(); });

    // Focus goes back where it came from, or the page loses the reader's place.
    dlg.addEventListener('close', function () {
      if (opener && opener.isConnected) opener.focus();
      opener = null;
    });
  })();

  /* --- Service worker --------------------------------------------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        // A stale worker must never pin a customer to an old menu, price or
        // allergen tag. Check on every load and take over as soon as a new
        // build is waiting.
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              sw.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        reg.update();
      }).catch(function () { /* offline first load; nothing to do */ });

      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }

  if (standalone) return;

  var slot = document.getElementById('install-slot');
  if (!slot) return;
  if (localStorage.getItem('dbd.install.dismissed') === '1') return;

  function bar(inner) {
    var el = document.createElement('div');
    el.className = 'installbar';
    el.innerHTML = inner;
    // beforeinstallprompt can fire more than once for a single page load, so
    // a second bar has to replace the first rather than stack under it.
    var open = slot.querySelector('.installbar');
    if (open) open.remove();
    slot.appendChild(el);
    var close = el.querySelector('[data-dismiss]');
    if (close) {
      close.addEventListener('click', function () {
        localStorage.setItem('dbd.install.dismissed', '1');
        el.remove();
      });
    }
    return el;
  }

  /* --- Android / Chromium ----------------------------------------------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var el = bar(
      '<span>Install Dinner By Derek for one-tap ordering.</span>' +
      '<span><button type="button" class="btn btn--secondary" data-install>Install app</button> ' +
      '<button type="button" class="btn btn--secondary" data-dismiss aria-label="Dismiss">✕</button></span>'
    );
    el.querySelector('[data-install]').addEventListener('click', function () {
      el.remove();
      deferred.prompt();
      deferred = null;
    });
  });

  /* --- iOS Safari ------------------------------------------------------
     beforeinstallprompt does not exist on iOS, so the only route is the
     Share sheet. Detect iOS Safari specifically — showing these steps in
     an in-app browser (where Add to Home Screen is absent) would be wrong.  */
  var ua = window.navigator.userAgent;
  var iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inAppBrowser = /FBAN|FBAV|Instagram|Line|Twitter/i.test(ua);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  if (iOS && isSafari && !inAppBrowser) {
    bar(
      '<span>Add to your Home Screen: tap the Share button, then ' +
      '<strong>Add to Home Screen</strong>.</span>' +
      '<button type="button" class="btn btn--secondary" data-dismiss aria-label="Dismiss">✕</button>'
    );
  } else if (iOS && inAppBrowser) {
    bar(
      '<span>Tap <strong>⋯</strong> and choose <strong>Open in Safari</strong> ' +
      'to add this to your Home Screen.</span>' +
      '<button type="button" class="btn btn--secondary" data-dismiss aria-label="Dismiss">✕</button>'
    );
  }
})();
