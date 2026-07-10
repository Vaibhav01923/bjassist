/*
 * Preload for the built-in casino window ("Play with live advice").
 *
 * This is the desktop equivalent of the extension's content-script stack:
 * the same strategy/video-poker engines, the same site parser, and the same
 * content.js — run verbatim in this preload's isolated world, which (like an
 * extension content script) shares the page's DOM but not its JS globals.
 *
 * content.js references chrome.* only inside try/catch (settings fall back to
 * defaults, the VP solver falls back to solving locally), so no chrome shim
 * is needed. The one API it requires is window.BJLicense — provided here,
 * backed by the main process's license state over IPC.
 */
'use strict';

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

function source(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function installLicenseShim() {
  window.BJLicense = {
    checkEntitlement: function (cb) {
      ipcRenderer.invoke('bj:getState').then(function (s) {
        if (s.licensed) cb({ entitled: true, reason: 'licensed', status: 'active' });
        else if (s.freeLeft > 0) cb({ entitled: true, reason: 'free_hand', status: 'free' });
        else cb({ entitled: false, reason: 'free_hand_used', status: 'none' });
      }).catch(function () {
        cb({ entitled: false, reason: 'unreachable', status: 'none' });
      });
    },
    // One live round = one free hand. The signature is unique per call —
    // content.js already de-duplicates per round, so this only fires once
    // per fresh hand.
    markFreeHandUsed: function () {
      ipcRenderer.invoke('bj:consume', 'live:' + Date.now()).catch(function () {});
    },
    // The paywall button: hand back the pricing URL; content.js window.open()s
    // it, and the window-open handler bounces it to the system browser.
    startCheckout: function (_source, cb) {
      cb({ ok: true, url: 'https://bjassist.com/#pricing' });
    },
    activate: function (_key, cb) { cb({ ok: false, error: 'Activate in the BJAssist panel.' }); },
    deactivate: function (cb) { if (cb) cb(); }
  };
}

function boot() {
  try {
    installLicenseShim();
    // Same order as the extension manifest's content_scripts "js" array.
    (0, eval)(source(path.join('..', 'renderer', 'strategy.js')));
    (0, eval)(source(path.join('..', 'renderer', 'video-poker.js')));
    (0, eval)(source('site-configs.js'));
    (0, eval)(source('content.js'));
  } catch (e) {
    console.error('[BJAssist] live advice failed to start:', e.message);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
