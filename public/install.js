/* Dinner By Derek — makes the dashboard installable.
 *
 * One job: register the service worker from an admin page, because a browser
 * will not offer to install a site that has no service worker controlling it,
 * however complete the manifest is. iOS never needed one — Add to Home Screen
 * works off the manifest and the apple-touch-icon alone — but Chrome and Edge
 * on a desktop do, and "install it on my computer too" is half the ask.
 *
 * IT IS THE SAME WORKER THE CUSTOMER SIDE REGISTERS, and that is safe rather
 * than convenient: sw.js returns early for every path under /admin, so it
 * controls these pages without ever answering a request made by one. No order,
 * no price and no page behind the password is cached, here or anywhere, and
 * that stays true because it is sw.js's rule and not this file's.
 *
 * Its own file rather than a few lines in admin.js: this is the only script the
 * login page could ever want, and the login page deliberately loads nothing
 * else. Kept out of the inline script the shell refuses to allow.
 */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (e) {
      /* Not worth a toast. The dashboard works either way; all that is lost is
         the browser's offer to install it, and there is nothing the owner can
         do about a failure here from the page they are standing on. */
      console.warn('Dashboard install support unavailable:', e && e.message);
    });
  });
})();
