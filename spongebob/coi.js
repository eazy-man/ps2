// Registers sw.js and reloads once so this document is actually created cross-origin isolated:
// service worker fetch handlers can add COOP/COEP to a response, but the browser only decides
// whether a document is isolated while creating it, so the headers have to be there on the
// navigation that follows the first visit.
(function () {
  var KEY = 'ps2web-coi';
  try {
    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(KEY);
      return;
    }
  } catch (e) {
    if (window.crossOriginIsolated) return;
  }
  if (!('serviceWorker' in navigator)) return;

  var script = document.currentScript;
  var swUrl = new URL('sw.js', script ? script.src : location.href).href;
  var scope = new URL('./', swUrl).pathname;

  navigator.serviceWorker
    .register(swUrl, { scope: scope, updateViaCache: 'none' })
    .then(function () {
      return navigator.serviceWorker.ready;
    })
    .then(function () {
      if (navigator.serviceWorker.controller) return;
      // clients.claim() in the worker's activate handler takes over this page; wait for that
      // rather than reloading into a document the worker does not control yet.
      return new Promise(function (resolve) {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        setTimeout(resolve, 2000);
      });
    })
    .catch(function (error) {
      console.warn('[coi] could not register ' + swUrl + ': ' + error);
    })
    .then(function () {
      if (window.crossOriginIsolated) return;
      var already;
      try {
        already = sessionStorage.getItem(KEY);
      } catch (e) {}
      if (already) {
        // One reload did not isolate the page: do not loop, say what is wrong instead.
        console.warn('[coi] still not cross-origin isolated after a reload; sw.js was not used for this navigation');
        return;
      }
      try {
        sessionStorage.setItem(KEY, '1');
      } catch (e) {}
      location.reload();
    });
})();
