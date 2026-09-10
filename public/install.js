/* Dinner By Derek — makes the dashboard installable, and offers it.
 *
 * Two jobs, and the first is the one nothing on the page shows:
 *
 * REGISTER THE SERVICE WORKER. A browser will not offer to install a site that
 * has no service worker controlling it, however complete the manifest is. iOS
 * never needed one — Add to Home Screen works off the manifest and the
 * apple-touch-icon alone — but Chrome and Edge do, and "install it on my
 * computer too" is half the ask.
 *
 * IT IS THE SAME WORKER THE CUSTOMER SIDE REGISTERS, and that is safe rather
 * than convenient: sw.js returns early for every path under /admin, so it
 * controls these pages without ever answering a request made by one. No order,
 * no price and no page behind the password is cached, here or anywhere, and
 * that stays true because it is sw.js's rule and not this file's.
 *
 * OFFER THE INSTALL. Chrome fires beforeinstallprompt and then says nothing;
 * the offer lives behind a menu the owner has no reason to open. So the page
 * asks, once, with a button.
 *
 * A SECOND IMPLEMENTATION, not a shared one. app.js has this for customers and
 * the mechanism is the same fifteen lines — but the copy, the audience and the
 * dismissal are all different, and app.js is a single script the customer shell
 * caches by fingerprint, so sharing would mean a new shell file, a new entry in
 * sw.js's SHELL list and a new CACHE_VERSION for a page that is working. Worth
 * doing the day a third page wants this; not worth it for the second.
 *
 * THE DISMISSAL KEY IS ITS OWN, and that part is not a preference. localStorage
 * is per origin, and the customer site is the same origin — a shared key would
 * mean dismissing the menu's bar also hid this one, on a screen the customer
 * never sees, with nothing to explain why the offer never came back.
 */
(function () {
  'use strict';

  var standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) {
        /* Not worth a toast. The dashboard works either way; all that is lost
           is the browser's offer to install it, and there is nothing the owner
           can do about a failure here from the page they are standing on. */
        console.warn('Dashboard install support unavailable:', e && e.message);
      });
    });
  }

  // Already installed — this IS the installed app, so there is nothing to offer.
  if (standalone) return;

  var slot = document.getElementById('install-slot');
  if (!slot) return;

  /* Wrapped, the way the customer side wraps its own reads. A browser set to
     block site data does not answer null here — it throws on the property
     access itself, and that throw would take the whole offer down with it. */
  function remembered(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function remember(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* nothing to do */ }
  }

  var KEY = 'dbd.install.dismissed.admin';
  if (remembered(KEY) === '1') return;

  function bar(inner) {
    var el = document.createElement('div');
    el.className = 'installbar';
    el.innerHTML = inner;
    // beforeinstallprompt can fire more than once for one page load, so a
    // second bar replaces the first rather than stacking under it.
    var open = slot.querySelector('.installbar');
    if (open) open.remove();
    slot.appendChild(el);
    var close = el.querySelector('[data-dismiss]');
    if (close) {
      close.addEventListener('click', function () {
        remember(KEY, '1');
        el.remove();
      });
    }
    return el;
  }

  /* --- Android and desktop Chromium ------------------------------------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var el = bar(
      '<span>Install the dashboard for one-tap access.</span>'
      + '<span><button type="button" class="btn btn--secondary" data-install>Install</button> '
      + '<button type="button" class="btn btn--secondary" data-dismiss aria-label="Dismiss">✕</button></span>'
    );
    var button = el.querySelector('[data-install]');
    button.addEventListener('click', function () {
      var evt = deferred;
      deferred = null;
      if (!evt) return;
      /* The bar stays up until the browser says what happened. Taken away the
         instant it is tapped, the offer vanishes while the install sheet is
         still opening — which reads as the thing having failed rather than
         started. */
      button.disabled = true;
      evt.prompt();
      Promise.resolve(evt.userChoice).then(function (choice) {
        // Accepted: appinstalled clears the bar once the app is really there.
        if (choice && choice.outcome === 'accepted') return;
        // Declined. The event cannot be prompted twice, so this offer is spent;
        // the browser makes it again on a later visit and a new bar replaces it.
        el.remove();
      }).catch(function () { el.remove(); });
    });
  });

  /* Installed for real — the only moment the offer has actually been answered,
     and the one that takes it off the screen. */
  window.addEventListener('appinstalled', function () {
    var open = slot.querySelector('.installbar');
    if (open) open.remove();
  });

  /* --- iOS Safari -------------------------------------------------------
     beforeinstallprompt does not exist on iOS, so the Share sheet is the only
     route and the page can do no more than say where it is. Safari
     specifically: in another iOS browser, or inside an app's web view, Add to
     Home Screen is not in that menu and these directions send somebody looking
     for a button that is not there. */
  var ua = window.navigator.userAgent;
  var iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  if (iOS && isSafari) {
    bar(
      '<span>Add the dashboard to your Home Screen: tap Share, then '
      + '<strong>Add to Home Screen</strong>.</span>'
      + '<button type="button" class="btn btn--secondary" data-dismiss aria-label="Dismiss">✕</button>'
    );
  }
})();
