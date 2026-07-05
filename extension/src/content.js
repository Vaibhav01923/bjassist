/*
 * Content script: watches the page for a blackjack hand, computes the optimal
 * basic-strategy play, and shows a floating suggestion badge.
 *
 * This is READ-ONLY. It never clicks buttons or plays for you — it only reads
 * card values already visible on your screen and displays advice. You make
 * every decision and every click yourself.
 */
(function () {
  'use strict';

  var HOST = location.hostname;
  var siteConfig = window.BJSiteConfigs ? window.BJSiteConfigs.forHost(HOST) : null;

  var state = {
    enabled: true,
    rules: {},          // rule overrides for BJStrategy
    position: 'top-right',
    lastSignature: '',
    overlay: null
  };

  // Load settings from extension storage (falls back to defaults).
  function loadSettings(cb) {
    try {
      chrome.storage.sync.get(['enabled', 'rules', 'position'], function (data) {
        if (typeof data.enabled === 'boolean') state.enabled = data.enabled;
        if (data.rules) state.rules = data.rules;
        if (data.position) state.position = data.position;
        cb();
      });
    } catch (e) { cb(); }
  }

  // Anchor the overlay to the configured corner.
  function applyPosition(el) {
    var pad = '20px';
    el.style.top = el.style.bottom = el.style.left = el.style.right = 'auto';
    var p = state.position || 'top-right';
    if (p.indexOf('top') === 0) el.style.top = '90px'; else el.style.bottom = pad;
    if (p.indexOf('left') > -1) el.style.left = pad; else el.style.right = pad;
  }

  function readHand() {
    // A known site (e.g. Stake) uses ONLY its precise parser — no generic
    // fallback, so unrelated iframes with "card"-ish markup can't false-trigger.
    if (siteConfig && siteConfig.parser) {
      try { return siteConfig.parser() || null; } catch (e) { return null; }
    }
    if (window.BJSiteConfigs) {
      try { return window.BJSiteConfigs.genericParser() || null; } catch (e) { return null; }
    }
    return null;
  }

  function signature(parsed) {
    if (!parsed) return 'none';
    return parsed.playerCards.join(',') + '|' + parsed.dealerUpcard;
  }

  function ensureOverlay() {
    // isConnected is true whether the node lives under <html> or <body>, so the
    // existing badge is reused instead of a new one being built every hand.
    if (state.overlay && state.overlay.isConnected) return state.overlay;
    var el = document.createElement('div');
    el.id = 'bjassist-overlay';
    el.className = 'bjassist-overlay bjassist-idle';
    el.innerHTML =
      '<div class="aa-head"><span class="aa-dot"></span><span class="aa-title">BJAssist</span>' +
      '<button class="aa-close" title="Hide">×</button></div>' +
      '<div class="aa-action">—</div>' +
      '<div class="aa-detail">Waiting for a hand…</div>';
    document.documentElement.appendChild(el);
    el.querySelector('.aa-close').addEventListener('click', function () {
      el.style.display = 'none';
    });
    // Simple drag by the header.
    var head = el.querySelector('.aa-head');
    var drag = null;
    head.addEventListener('mousedown', function (e) {
      drag = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      el.style.left = (drag.left + e.clientX - drag.x) + 'px';
      el.style.top = (drag.top + e.clientY - drag.y) + 'px';
      el.style.right = 'auto';
    });
    document.addEventListener('mouseup', function () { drag = null; });
    applyPosition(el);
    state.overlay = el;
    return el;
  }

  function render(parsed) {
    // Only surface the overlay in a frame that actually has a hand. This keeps
    // it out of ad/chat iframes and off the page between hands.
    if (!parsed) {
      if (state.overlay) state.overlay.style.display = 'none';
      return;
    }
    var el = ensureOverlay();
    el.style.display = '';
    var rec = window.BJStrategy.getBestPlay(parsed.playerCards, parsed.dealerUpcard, state.rules);
    if (rec.error) {
      el.className = 'bjassist-overlay bjassist-idle';
      el.querySelector('.aa-action').textContent = '—';
      el.querySelector('.aa-detail').textContent = rec.error;
      return;
    }
    // A real, actionable suggestion is the paid moment — gate it. Idle/no-hand
    // states above are always free since they don't reveal a decision.
    if (!window.BJLicense) { showSuggestion(el, rec, parsed); return; }
    window.BJLicense.checkEntitlement(function (ent) {
      if (ent.entitled) {
        if (ent.reason === 'free_hand') window.BJLicense.markFreeHandUsed();
        showSuggestion(el, rec, parsed);
      } else {
        showPaywall(el);
      }
    });
  }

  function showSuggestion(el, rec, parsed) {
    el.className = 'bjassist-overlay';
    el.style.setProperty('--aa-color', rec.color);
    el.querySelector('.aa-action').textContent = rec.label.toUpperCase();
    el.querySelector('.aa-detail').textContent =
      'You: ' + parsed.playerCards.join(' ') + '  ·  Dealer: ' + parsed.dealerUpcard +
      (rec.hand ? '  ·  (' + (rec.hand.soft ? 'soft ' : '') + rec.hand.total + ')' : '');
  }

  function showPaywall(el) {
    el.className = 'bjassist-overlay bjassist-locked';
    el.querySelector('.aa-action').textContent = '🔒 LOCKED';
    el.querySelector('.aa-detail').innerHTML =
      'Your free hand is used. <button type="button" class="aa-unlock">Unlock BJAssist — $14.99/mo</button>';
    var btn = el.querySelector('.aa-unlock');
    if (!btn) return;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Opening checkout…';
      window.BJLicense.startCheckout('extension_overlay', function (res) {
        btn.disabled = false;
        btn.textContent = 'Unlock BJAssist — $14.99/mo';
        if (res.ok) window.open(res.url, '_blank');
        else el.querySelector('.aa-detail').textContent = res.error || 'Something went wrong. Try again.';
      });
    });
  }

  function tick() {
    if (!state.enabled) {
      if (state.overlay) state.overlay.style.display = 'none';
      return;
    }
    var parsed = readHand();
    var sig = signature(parsed);
    if (sig === state.lastSignature) return;
    state.lastSignature = sig;
    render(parsed);
  }

  function start() {
    // Poll + observe: polling catches canvas/animation-based tables that don't
    // fire useful mutations; the observer catches DOM-driven ones promptly.
    var observer = new MutationObserver(function () { tick(); });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(tick, 1200);
    tick();
  }

  // React to settings changes from the popup live.
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.enabled) state.enabled = changes.enabled.newValue;
      if (changes.rules) state.rules = changes.rules.newValue || {};
      if (changes.position) {
        state.position = changes.position.newValue || 'top-right';
        if (state.overlay) applyPosition(state.overlay);
      }
      state.lastSignature = ''; // force re-render
      tick();
    });
  } catch (e) {}

  loadSettings(start);
})();
