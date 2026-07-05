/*
 * Shared entitlement module — used by content.js (the on-page overlay),
 * popup.js, and options.js.
 *
 * Model: the on-page auto-read suggestion is free for exactly one hand per
 * install. After that, a valid BJAssist license key is required. The manual
 * calculator in the popup is never gated — it doesn't read any casino page.
 *
 * License activation/validation talks directly to Dodo Payments' public
 * license endpoints (no API key required — see docs.dodopayments.com/features/license-keys).
 * Checkout creation goes through our Supabase Edge Function because it needs
 * the Dodo secret key, which must never ship inside the extension.
 */
(function (global) {
  'use strict';

  var DODO_BASE = 'https://live.dodopayments.com';
  var CHECKOUT_URL = 'https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/create-checkout';
  var REVALIDATE_MS = 6 * 60 * 60 * 1000;          // re-check a stored key every 6h
  var OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;  // trust a recently-good cache this long if Dodo is unreachable

  function getStorage(keys, cb) {
    try { chrome.storage.local.get(keys, cb); } catch (e) { cb({}); }
  }
  function setStorage(obj, cb) {
    try { chrome.storage.local.set(obj, cb || function () {}); } catch (e) { if (cb) cb(); }
  }

  function activate(licenseKey, cb) {
    licenseKey = (licenseKey || '').trim();
    if (!licenseKey) { cb({ ok: false, error: 'Enter a license key.' }); return; }
    fetch(DODO_BASE + '/licenses/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey, name: 'BJAssist Extension' })
    })
      .then(function (r) { return r.json().then(function (body) { return { status: r.status, body: body }; }); })
      .then(function (res) {
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
      })
      .catch(function () { cb({ ok: false, error: 'Could not reach the license server. Check your connection and try again.' }); });
  }

  function deactivate(cb) {
    getStorage(['bjLicenseKey', 'bjActivationId'], function (data) {
      function clearLocal() {
        setStorage({ bjLicenseKey: null, bjActivationId: null, bjStatus: null, bjLastCheck: null }, function () { if (cb) cb(); });
      }
      if (!data.bjLicenseKey || !data.bjActivationId) { clearLocal(); return; }
      fetch(DODO_BASE + '/licenses/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: data.bjLicenseKey, license_key_instance_id: data.bjActivationId })
      }).then(clearLocal).catch(clearLocal);
    });
  }

  function revalidate(licenseKey, cb) {
    fetch(DODO_BASE + '/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey })
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var valid = !!body.valid;
        var status = valid ? ((body.license_key && body.license_key.status) || 'active') : 'invalid';
        setStorage({ bjStatus: status, bjLastCheck: Date.now() }, function () { cb({ ok: true, valid: valid, status: status }); });
      })
      .catch(function () { cb({ ok: false }); }); // leave the cached state untouched on a network failure
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
      fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source, email: data.bjEmail || undefined })
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body.checkout_url) cb({ ok: true, url: body.checkout_url });
          else cb({ ok: false, error: 'Could not start checkout. Please try again in a moment.' });
        })
        .catch(function () { cb({ ok: false, error: 'Could not reach the checkout server.' }); });
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
