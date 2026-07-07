/*
 * Bridge between bjassist.com and the extension's local license storage.
 * Scoped ONLY to bjassist.com/www.bjassist.com via manifest matches — never
 * runs on any other site. Lets website/activate.html redeem a license key
 * directly into the extension, so a paying customer never has to go find
 * the popup themselves.
 *
 * Protocol (window.postMessage, same-window only):
 *   page -> content script: { type: 'BJASSIST_ACTIVATE_LICENSE', key }
 *   content script -> page: { type: 'BJASSIST_EXTENSION_READY' }        (announced on load)
 *   content script -> page: { type: 'BJASSIST_ACTIVATE_RESULT', ok, error? }
 */
(function () {
  'use strict';
  if (!window.BJLicense) return;

  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== 'BJASSIST_ACTIVATE_LICENSE') return;

    window.BJLicense.activate(data.key, function (res) {
      window.postMessage({ type: 'BJASSIST_ACTIVATE_RESULT', ok: res.ok, error: res.error }, window.location.origin);
    });
  });

  // Tell the page the extension is installed and the bridge is live —
  // activate.html uses this to know whether to show the activation form
  // or an "install the extension first" message.
  window.postMessage({ type: 'BJASSIST_EXTENSION_READY' }, window.location.origin);
})();
