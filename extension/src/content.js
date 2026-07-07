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
    overlay: null,
    roundEntitled: null // cached entitlement decision for the CURRENT round (see evaluateEntitlement)
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
    return parsed.hands.map(function (h) { return h.cards.join(','); }).join('|') + '#' + parsed.dealerUpcard;
  }

  // A round "starts" at a fresh two-card hand with no split yet. We cache the
  // entitlement decision for the whole round the first time we see this, so
  // a later hit (more cards) or a split (more hands) doesn't re-trigger the
  // paywall mid-hand — only the NEXT round re-evaluates.
  function isRoundStart(parsed) {
    return parsed.hands.length === 1 && parsed.hands[0].cards.length === 2;
  }

  function evaluateEntitlement(parsed, cb) {
    if (!window.BJLicense) { cb(true); return; }
    if (!isRoundStart(parsed) && typeof state.roundEntitled === 'boolean') {
      cb(state.roundEntitled);
      return;
    }
    window.BJLicense.checkEntitlement(function (ent) {
      state.roundEntitled = ent.entitled;
      if (ent.entitled && ent.reason === 'free_hand') window.BJLicense.markFreeHandUsed();
      cb(ent.entitled);
    });
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
      '<div class="aa-body">' +
      '<div class="aa-action">—</div>' +
      '<div class="aa-detail">Waiting for a hand…</div>' +
      '</div>';
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
      state.roundEntitled = null; // table's idle — next hand is a fresh round
      return;
    }
    var el = ensureOverlay();
    el.style.display = '';

    var recs = parsed.hands.map(function (h) {
      return window.BJStrategy.getBestPlay(h.cards, parsed.dealerUpcard, state.rules);
    });

    // If every hand is incomplete (e.g. only one card in, mid-deal), stay idle —
    // this doesn't reveal a decision, so it's not gated and doesn't touch the
    // free-hand allowance.
    if (recs.every(function (r) { return r.error; })) {
      el.className = 'bjassist-overlay bjassist-idle';
      setBody(el, '<div class="aa-action">—</div><div class="aa-detail">' + recs[0].error + '</div>');
      return;
    }

    evaluateEntitlement(parsed, function (entitled) {
      if (!entitled) { showPaywall(el); return; }
      if (parsed.hands.length === 1) showSingleHand(el, recs[0], parsed.hands[0], parsed.dealerUpcard);
      else showMultiHand(el, recs, parsed.hands, parsed.dealerUpcard);
    });
  }

  function setBody(el, html) {
    el.querySelector('.aa-body').innerHTML = html;
  }

  function showSingleHand(el, rec, hand, dealerUpcard) {
    el.className = 'bjassist-overlay';
    el.style.setProperty('--aa-color', rec.color);
    if (rec.error) {
      setBody(el, '<div class="aa-action">—</div><div class="aa-detail">' + rec.error + '</div>');
      return;
    }
    setBody(el,
      '<div class="aa-action">' + rec.label.toUpperCase() + '</div>' +
      '<div class="aa-detail">You: ' + hand.cards.join(' ') + '  ·  Dealer: ' + dealerUpcard +
      (rec.hand ? '  ·  (' + (rec.hand.soft ? 'soft ' : '') + rec.hand.total + ')' : '') + '</div>'
    );
  }

  // Split into 2+ hands: never collapse these into one suggestion — show
  // each hand's own recommendation, clearly labeled, so it's never ambiguous
  // which advice belongs to which hand.
  function showMultiHand(el, recs, hands, dealerUpcard) {
    el.className = 'bjassist-overlay bjassist-multi';
    el.style.setProperty('--aa-color', recs[0].color || '#e6edf6');
    var knowActive = hands.some(function (h) { return h.active === true; });
    var rows = hands.map(function (h, i) {
      var rec = recs[i];
      var label = rec.error ? '—' : rec.label.toUpperCase();
      var color = rec.error ? '#64748b' : rec.color;
      var activeCls = knowActive && h.active ? ' aa-multi-active' : '';
      return (
        '<div class="aa-multi-row' + activeCls + '">' +
          '<span class="aa-multi-label">HAND ' + (i + 1) + '</span>' +
          '<span class="aa-multi-cards">' + h.cards.join(' ') + '</span>' +
          '<span class="aa-multi-action" style="color:' + color + '">' + label + '</span>' +
        '</div>'
      );
    }).join('');
    setBody(el,
      '<div class="aa-multi">' + rows + '</div>' +
      '<div class="aa-detail">Dealer: ' + dealerUpcard + (knowActive ? '' : '  ·  active hand not detected — check yours') + '</div>'
    );
  }

  function showPaywall(el) {
    el.className = 'bjassist-overlay bjassist-locked';
    setBody(el,
      '<div class="aa-action">🔒 LOCKED</div>' +
      '<div class="aa-detail">Your free hand is used. <button type="button" class="aa-unlock">Unlock BJAssist — $14.99/mo</button></div>'
    );
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

  // React to settings changes from the popup live. Settings live in
  // chrome.storage.sync — license.js writes to chrome.storage.local, and
  // onChanged fires for every storage area, so this must filter by areaName
  // or a free-hand write would force a spurious extra render mid-hand.
  try {
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'sync') return;
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
