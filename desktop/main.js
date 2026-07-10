/*
 * BJAssist desktop — main process.
 *
 * Owns the licensing state (ported from the extension's license.js +
 * background.js): activation/validation talk to Dodo Payments' public
 * license endpoints, state persists in a JSON file under userData, and a
 * cached "active" status is trusted for 6h, with a 3-day offline grace.
 *
 * Free-hand model for desktop: FREE_HANDS full advice computations
 * (blackjack or video poker), counted once per distinct hand, then a
 * license key is required. Checkout happens on bjassist.com in the
 * user's browser — no payment code ships in the app.
 */
'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DODO_BASE = 'https://live.dodopayments.com';
const CHECKOUT_PAGE = 'https://bjassist.com/#pricing';
const REVALIDATE_MS = 6 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const FREE_HANDS = 5;

/* ---------- persisted state ---------- */

const stateFile = () => path.join(app.getPath('userData'), 'bjassist-state.json');

let state = {
  licenseKey: null,
  activationId: null,
  status: null,      // 'active' | 'invalid' | ...
  lastCheck: 0,
  freeLeft: FREE_HANDS,
  lastSig: ''        // last counted hand, so re-renders don't burn free hands
};

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    state = Object.assign(state, raw);
    if (typeof state.freeLeft !== 'number' || state.freeLeft < 0) state.freeLeft = 0;
    if (state.freeLeft > FREE_HANDS) state.freeLeft = FREE_HANDS; // allowance was lowered in an update
  } catch (e) { /* first run */ }
}

function saveState() {
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch (e) { /* non-fatal */ }
}

/* ---------- Dodo license calls (public endpoints, no API key) ---------- */

async function dodo(pathname, payload) {
  try {
    const r = await fetch(DODO_BASE + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  } catch (e) {
    return null; // network failure
  }
}

async function activate(licenseKey) {
  licenseKey = String(licenseKey || '').trim();
  if (!licenseKey) return { ok: false, error: 'Enter a license key.' };
  const res = await dodo('/licenses/activate', { license_key: licenseKey, name: 'BJAssist Desktop' });
  if (!res) return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' };
  if (res.status >= 200 && res.status < 300 && res.body && res.body.id) {
    state.licenseKey = licenseKey;
    state.activationId = res.body.id;
    state.status = (res.body.license_key && res.body.license_key.status) || 'active';
    state.lastCheck = Date.now();
    saveState();
    return { ok: true, status: state.status };
  }
  return { ok: false, error: (res.body && (res.body.message || res.body.error)) || 'That license key could not be activated.' };
}

async function deactivate() {
  if (state.licenseKey && state.activationId) {
    await dodo('/licenses/deactivate', {
      license_key: state.licenseKey,
      license_key_instance_id: state.activationId
    });
  }
  state.licenseKey = null;
  state.activationId = null;
  state.status = null;
  state.lastCheck = 0;
  saveState();
  return { ok: true };
}

async function revalidate() {
  const res = await dodo('/licenses/validate', { license_key: state.licenseKey });
  if (!res || !res.body) return false; // leave cached state untouched on network failure
  const valid = !!res.body.valid;
  state.status = valid ? ((res.body.license_key && res.body.license_key.status) || 'active') : 'invalid';
  state.lastCheck = Date.now();
  saveState();
  return true;
}

/* The core gate — mirrors checkEntitlement() in the extension. */
async function entitlement() {
  if (!state.licenseKey) {
    return {
      entitled: state.freeLeft > 0,
      reason: state.freeLeft > 0 ? 'free' : 'free_used',
      licensed: false,
      freeLeft: state.freeLeft
    };
  }
  const age = Date.now() - (state.lastCheck || 0);
  const cachedOk = state.status === 'active';
  if (age >= REVALIDATE_MS) {
    const reached = await revalidate();
    if (!reached) {
      const inGrace = cachedOk && age < OFFLINE_GRACE_MS;
      return { entitled: inGrace, reason: inGrace ? 'licensed_offline' : 'unreachable', licensed: inGrace, freeLeft: state.freeLeft };
    }
  }
  const ok = state.status === 'active';
  return { entitled: ok, reason: ok ? 'licensed' : 'license_' + state.status, licensed: ok, freeLeft: state.freeLeft };
}

/*
 * Spend one free hand for the given hand signature (unlicensed users only).
 * The same signature never counts twice in a row, so chip-by-chip edits and
 * re-renders of one hand don't drain the allowance.
 */
async function consume(sig) {
  const ent = await entitlement();
  if (ent.licensed) return { allowed: true, licensed: true, freeLeft: state.freeLeft };
  if (sig && sig === state.lastSig) return { allowed: true, licensed: false, freeLeft: state.freeLeft, repeat: true };
  if (state.freeLeft <= 0) return { allowed: false, licensed: false, freeLeft: 0 };
  state.freeLeft -= 1;
  state.lastSig = sig || '';
  saveState();
  return { allowed: true, licensed: false, freeLeft: state.freeLeft };
}

/* ---------- windows ---------- */

let win = null;

// A real-Chrome user agent (no "Electron/…" token) so casino sites and their
// bot walls treat the built-in window like an ordinary browser.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/' + process.versions.chrome + ' Safari/537.36';

const OVERLAY_CSS = () => fs.readFileSync(path.join(__dirname, 'casino', 'overlay.css'), 'utf8');

/*
 * The "Play with live advice" window: an ordinary browser window (persistent
 * session, so logins survive restarts) whose preload runs the extension's
 * parser + overlay against the live page DOM.
 */
function openCasino(rawUrl) {
  let url = String(rawUrl || '').trim() || 'https://stake.com';
  if (!/^(https?|file):\/\//i.test(url)) url = 'https://' + url;
  const cwin = new BrowserWindow({
    width: 1280,
    height: 850,
    autoHideMenuBar: true,
    title: 'BJAssist — live advice',
    backgroundColor: '#0e1813',
    webPreferences: {
      preload: path.join(__dirname, 'casino', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:casino'
    }
  });
  cwin.webContents.setUserAgent(CHROME_UA);
  cwin.webContents.on('did-finish-load', () => {
    cwin.webContents.insertCSS(OVERLAY_CSS()).catch(() => {});
  });
  cwin.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('https://')) shell.openExternal(u);
    return { action: 'deny' };
  });
  cwin.loadURL(url);
  return cwin;
}

function createWindow() {
  win = new BrowserWindow({
    width: 384,
    height: 660,
    minWidth: 384,
    maxWidth: 480,
    minHeight: 480,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'BJAssist',
    backgroundColor: '#0e1813',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // CI/dev smoke test: BJ_SMOKE=1 loads the app, proves the renderer booted
  // with the preload bridge, then exits 0 (or 1 on any failure).
  if (process.env.BJ_SMOKE) {
    win.webContents.on('did-finish-load', async () => {
      try {
        const ok = await win.webContents.executeJavaScript(
          'Boolean(window.bj && document.getElementById("licenseStripText"))'
        );
        console.log('[smoke] preload bridge + UI present:', ok);
        const ent = await entitlement();
        console.log('[smoke] entitlement:', JSON.stringify(ent));
        app.exit(ok ? 0 : 1);
      } catch (e) {
        console.error('[smoke] failed:', e.message);
        app.exit(1);
      }
    });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  loadState();

  ipcMain.handle('bj:getState', async () => {
    const ent = await entitlement();
    return { licensed: ent.licensed, reason: ent.reason, freeLeft: state.freeLeft, hasKey: !!state.licenseKey };
  });
  ipcMain.handle('bj:activate', (_e, key) => activate(key));
  ipcMain.handle('bj:deactivate', () => deactivate());
  ipcMain.handle('bj:consume', (_e, sig) => consume(String(sig || '')));
  ipcMain.handle('bj:openCheckout', () => shell.openExternal(CHECKOUT_PAGE));
  ipcMain.handle('bj:openCasino', (_e, url) => { openCasino(url); return true; });
  ipcMain.handle('bj:setAlwaysOnTop', (_e, flag) => {
    if (win) win.setAlwaysOnTop(!!flag, 'floating');
    return !!flag;
  });

  // CI/dev smoke test for the live-advice stack: BJ_SMOKE_CASINO=<url> opens
  // the casino window on a page with Stake's DOM (e.g. the test-vp.html
  // fixture), waits for the injected parser to render the overlay into the
  // page DOM, then exits 0/1.
  if (process.env.BJ_SMOKE_CASINO) {
    const cwin = openCasino(process.env.BJ_SMOKE_CASINO);
    cwin.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const overlay = await cwin.webContents.executeJavaScript(`(function () {
            var el = document.getElementById('bjassist-overlay');
            return el ? { found: true, text: el.textContent.slice(0, 160) } : { found: false };
          })()`);
          console.log('[smoke-casino] overlay:', JSON.stringify(overlay));
          app.exit(overlay.found ? 0 : 1);
        } catch (e) {
          console.error('[smoke-casino] failed:', e.message);
          app.exit(1);
        }
      }, 4000); // > one 1.2s detection tick + the ~100ms VP solve
    });
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
