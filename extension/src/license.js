/*
 * Shared entitlement module — used by content.js (the on-page overlay),
 * popup.js, options.js, and web-bridge.js.
 *
 * Model: the on-page auto-read suggestion is free for exactly one hand per
 * install. After that, a valid BJAssist license key is required. The manual
 * calculator in the popup is never gated — it doesn't read any casino page.
 *
 * License activation/validation talks to Dodo Payments' public license
 * endpoints (no API key required — see docs.dodopayments.com/features/license-keys).
 * Checkout creation goes through our Supabase Edge Function because it needs
 * the Dodo secret key, which must never ship inside the extension.
 *
 * ALL network calls are routed through the background service worker
 * (chrome.runtime.sendMessage). Content-script fetches would carry the host
 * page's origin, which the checkout endpoint's CORS allowlist rejects; the
 * worker's requests come from the extension's own origin instead.
 */
(function (global) {
  'use strict';

  var REVALIDATE_MS = 6 * 60 * 60 * 1000;          // re-check a stored key every 6h
  var OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;  // trust a recently-good cache this long if Dodo is unreachable

  function getStorage(keys, cb) {
    try { chrome.storage.local.get(keys, cb); } catch (e) { cb({}); }
  }
  function setStorage(obj, cb) {
    try { chrome.storage.local.set(obj, cb || function () {}); } catch (e) { if (cb) cb(); }
  }

  // Ask the background worker to POST `payload` to the endpoint named by
  // `type` (see ENDPOINTS in background.js). cb gets { status, body } on a
  // completed request, or null when the network/messaging failed.
  function bgFetch(type, payload, cb) {
    try {
      chrome.runtime.sendMessage({ type: type, payload: payload }, function (res) {
        if (chrome.runtime.lastError || !res || !res.ok) { cb(null); return; }
        cb({ status: res.status, body: res.body });
      });
    } catch (e) { cb(null); }
  }

  function activate(licenseKey, cb) {
    licenseKey = (licenseKey || '').trim();
    if (!licenseKey) { cb({ ok: false, error: 'Enter a license key.' }); return; }
    bgFetch('bj-activate', { license_key: licenseKey, name: 'BJAssist Extension' }, function (res) {
      if (!res) {
        cb({ ok: false, error: 'Could not reach the license server. Check your connection and try again.' });
        return;
      }
      if (res.status >= 200 && res.status < 300 && res.body && res.body.id) {
        var status = (res.body.license_key && res.body.license_key.status) || 'active';
        setStorage({
          bjLicenseKey: licenseKey,
          bjActivationId: res.body.id,
          bjStatus: status,
          bjLastCheck: Date.now()
        }, function () { cb({ ok: true, status: status }); });
      } else {
        cb({ ok: false, error: (res.body && (res.body.message || res.body.error)) || 'That license key could not be activated.' });
      }
    });
  }

  function deactivate(cb) {
    getStorage(['bjLicenseKey', 'bjActivationId'], function (data) {
      function clearLocal() {
        setStorage({ bjLicenseKey: null, bjActivationId: null, bjStatus: null, bjLastCheck: null }, function () { if (cb) cb(); });
      }
      if (!data.bjLicenseKey || !data.bjActivationId) { clearLocal(); return; }
      bgFetch('bj-deactivate', {
        license_key: data.bjLicenseKey,
        license_key_instance_id: data.bjActivationId
      }, clearLocal);
    });
  }

  function revalidate(licenseKey, cb) {
    bgFetch('bj-validate', { license_key: licenseKey }, function (res) {
      if (!res || !res.body) { cb({ ok: false }); return; } // leave the cached state untouched on a network failure
      var valid = !!res.body.valid;
      var status = valid ? ((res.body.license_key && res.body.license_key.status) || 'active') : 'invalid';
      setStorage({ bjStatus: status, bjLastCheck: Date.now() }, function () { cb({ ok: true, valid: valid, status: status }); });
    });
  }

  // The core gate. cb receives { entitled, reason, status }.
  function checkEntitlement(cb) {
    getStorage(['bjLicenseKey', 'bjStatus', 'bjLastCheck', 'bjFreeHandUsed'], function (data) {
      if (!data.bjLicenseKey) {
        if (!data.bjFreeHandUsed) cb({ entitled: true, reason: 'free_hand', status: 'free' });
        else cb({ entitled: false, reason: 'free_hand_used', status: 'none' });
        return;
      }
      var age = Date.now() - (data.bjLastCheck || 0);
      var cachedOk = data.bjStatus === 'active';
      if (age < REVALIDATE_MS) {
        cb({ entitled: cachedOk, reason: cachedOk ? 'licensed' : ('license_' + data.bjStatus), status: data.bjStatus });
        return;
      }
      revalidate(data.bjLicenseKey, function (res) {
        if (!res.ok) {
          var stillInGrace = cachedOk && age < OFFLINE_GRACE_MS;
          cb({ entitled: stillInGrace, reason: stillInGrace ? 'licensed_offline' : 'unreachable', status: data.bjStatus });
          return;
        }
        cb({ entitled: res.valid, reason: res.valid ? 'licensed' : ('license_' + res.status), status: res.status });
      });
    });
  }

  function markFreeHandUsed() {
    setStorage({ bjFreeHandUsed: true });
  }

  function startCheckout(source, cb) {
    getStorage(['bjEmail'], function (data) {
      bgFetch('bj-checkout', { source: source, email: data.bjEmail || undefined }, function (res) {
        if (!res) { cb({ ok: false, error: 'Could not reach the checkout server.' }); return; }
        if (res.body && res.body.checkout_url) cb({ ok: true, url: res.body.checkout_url });
        else cb({ ok: false, error: 'Could not start checkout. Please try again in a moment.' });
      });
    });
  }

  global.BJLicense = {
    activate: activate,
    deactivate: deactivate,
    checkEntitlement: checkEntitlement,
    markFreeHandUsed: markFreeHandUsed,
    startCheckout: startCheckout
  };
})(typeof window !== 'undefined' ? window : this);
