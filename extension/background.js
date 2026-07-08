/*
 * Service worker: opens the welcome page once on first install, and performs
 * all license/checkout network calls on behalf of the other contexts.
 *
 * Content scripts can't make these requests themselves: their fetches carry
 * the host page's origin (e.g. the casino site), which the checkout
 * endpoint's CORS allowlist rejects. Requests from here come from the
 * extension's own origin and are covered by manifest host_permissions.
 * Only our own content scripts and pages can message this worker — plain web
 * pages can't reach chrome.runtime without externally_connectable.
 */

// Video poker solver — runs here so the ~100ms exact-EV enumeration never
// blocks the casino page's main thread.
importScripts('src/video-poker.js');

var DODO_BASE = 'https://live.dodopayments.com';
var CHECKOUT_URL = 'https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/create-checkout';

var ENDPOINTS = {
  'bj-activate': DODO_BASE + '/licenses/activate',
  'bj-deactivate': DODO_BASE + '/licenses/deactivate',
  'bj-validate': DODO_BASE + '/licenses/validate',
  'bj-checkout': CHECKOUT_URL
};

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') });
  }
});

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg && msg.type === 'bj-vp-solve' && msg.payload && Array.isArray(msg.payload.cards)) {
    try {
      sendResponse({ ok: true, advice: self.BJVideoPoker.advise(msg.payload.cards) });
    } catch (e) {
      sendResponse({ ok: false });
    }
    return;
  }

  var url = msg && ENDPOINTS[msg.type];
  if (!url) return; // not one of ours

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg.payload || {})
  })
    .then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        sendResponse({ ok: true, status: r.status, body: body });
      });
    })
    .catch(function () {
      sendResponse({ ok: false });
    });

  return true; // keep the message channel open for the async response
});
