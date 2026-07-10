/*
 * BJAssist desktop renderer — the extension popup's calculators, re-plumbed
 * onto the desktop preload API (window.bj) instead of chrome.*.
 *
 * Gating: full advice (blackjack rec or video poker solve) asks the main
 * process to spend one free hand until a license is active. Partial input
 * (fewer than 2 cards / no upcard / <5 VP cards) is never gated.
 */
(function () {
  'use strict';

  // window.bj is installed by preload.js. The fallback keeps the UI alive if
  // preload ever fails to run (and lets the renderer load in a plain browser
  // during development) — everything works, nothing is licensed.
  var API = window.bj || (function () {
    console.warn('[BJAssist] preload API missing — running with in-memory license state');
    var freeLeft = 5, lastSig = '';
    return {
      getState: function () { return Promise.resolve({ licensed: false, freeLeft: freeLeft, hasKey: false }); },
      activate: function () { return Promise.resolve({ ok: false, error: 'Licensing unavailable in this build.' }); },
      deactivate: function () { return Promise.resolve({ ok: true }); },
      consume: function (sig) {
        if (sig && sig === lastSig) return Promise.resolve({ allowed: true, licensed: false, freeLeft: freeLeft });
        if (freeLeft <= 0) return Promise.resolve({ allowed: false, licensed: false, freeLeft: 0 });
        freeLeft -= 1; lastSig = sig || '';
        return Promise.resolve({ allowed: true, licensed: false, freeLeft: freeLeft });
      },
      openCheckout: function () { window.open('https://bjassist.com/#pricing'); return Promise.resolve(); },
      openCasino: function (url) { window.open(/^https?:/.test(url) ? url : 'https://' + url); return Promise.resolve(); },
      setAlwaysOnTop: function () { return Promise.resolve(false); }
    };
  })();

  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var player = [];
  var dealer = null;

  var el = {
    playerChips: document.getElementById('playerChips'),
    playerPicker: document.getElementById('playerPicker'),
    dealerPicker: document.getElementById('dealerPicker'),
    clearPlayer: document.getElementById('clearPlayer'),
    resultAction: document.getElementById('resultAction'),
    resultDetail: document.getElementById('resultDetail'),
    alwaysOnTop: document.getElementById('alwaysOnTop'),
    hitSoft17: document.getElementById('hitSoft17'),
    das: document.getElementById('das'),
    surrender: document.getElementById('surrender')
  };

  /* ---------- license strip (shared painter, used by both gates) ---------- */

  var strip = {
    text: document.getElementById('licenseStripText'),
    actions: document.getElementById('licenseActions'),
    btn: document.getElementById('licenseStripBtn'),
    input: document.getElementById('licenseStripInput'),
    activateBtn: document.getElementById('licenseStripActivateBtn'),
    msg: document.getElementById('licenseStripMsg')
  };

  function paintStrip() {
    API.getState().then(function (s) {
      if (s.licensed) {
        strip.text.textContent = '✓ BJAssist unlocked';
        strip.actions.style.display = 'none';
      } else if (s.freeLeft > 0) {
        strip.text.textContent = s.freeLeft + ' free hand' + (s.freeLeft === 1 ? '' : 's') + ' left, then $14.99/mo.';
        strip.actions.style.display = '';
      } else {
        strip.text.textContent = 'Free hands used — advice needs a license.';
        strip.actions.style.display = '';
      }
    });
  }

  strip.btn.addEventListener('click', function () {
    API.openCheckout();
    strip.msg.textContent = 'Checkout opened in your browser. Your key arrives by email.';
    strip.msg.classList.add('success');
  });

  function doActivate() {
    strip.activateBtn.disabled = true;
    strip.msg.textContent = '';
    API.activate(strip.input.value).then(function (res) {
      strip.activateBtn.disabled = false;
      if (res.ok) {
        strip.input.value = '';
        strip.msg.textContent = 'Activated ✓';
        strip.msg.classList.add('success');
        paintStrip();
        compute();       // un-lock whatever is on screen
        vpRepaint();
      } else {
        strip.msg.textContent = res.error || 'Could not activate that key.';
        strip.msg.classList.remove('success');
      }
    });
  }
  strip.activateBtn.addEventListener('click', doActivate);
  strip.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doActivate(); });

  /* ---------- blackjack calculator ---------- */

  function buildPickers() {
    RANKS.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = r;
      b.addEventListener('click', function () { player.push(r); renderPlayer(); compute(); });
      el.playerPicker.appendChild(b);
    });
    RANKS.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = r;
      b.addEventListener('click', function () {
        dealer = r;
        Array.prototype.forEach.call(el.dealerPicker.children, function (c) {
          c.classList.toggle('active', c.textContent === r);
        });
        compute();
      });
      el.dealerPicker.appendChild(b);
    });
  }

  function renderPlayer() {
    el.playerChips.innerHTML = '';
    player.forEach(function (r, i) {
      var c = document.createElement('span');
      c.className = 'chip';
      c.textContent = r;
      c.title = 'Remove';
      c.style.cursor = 'pointer';
      c.addEventListener('click', function () { player.splice(i, 1); renderPlayer(); compute(); });
      el.playerChips.appendChild(c);
    });
  }

  function rules() {
    return {
      hitSoft17: el.hitSoft17.checked,
      das: el.das.checked,
      surrender: el.surrender.checked
    };
  }

  function showIdle(text) {
    el.resultAction.textContent = '—';
    el.resultAction.style.color = '#8a988e';
    el.resultDetail.textContent = text;
  }

  function showLocked() {
    el.resultAction.textContent = '🔒 LOCKED';
    el.resultAction.style.color = '#e2b13c';
    el.resultDetail.textContent = 'Your free hands are used. Unlock above, or paste your license key.';
  }

  function compute() {
    if (player.length < 2 || !dealer) {
      showIdle('Pick at least two of your cards and the dealer\'s upcard.');
      return;
    }
    var rec = window.BJStrategy.getBestPlay(player, dealer, rules());
    if (rec.error) {
      showIdle(rec.error);
      return;
    }
    var sig = 'bj:' + player.join(',') + '#' + dealer;
    API.consume(sig).then(function (res) {
      if (sig !== 'bj:' + player.join(',') + '#' + dealer) return; // hand changed meanwhile
      if (!res.allowed) { showLocked(); paintStrip(); return; }
      el.resultAction.textContent = rec.label.toUpperCase();
      el.resultAction.style.color = rec.color;
      el.resultDetail.textContent = rec.reason;
      el.resultAction.classList.remove('pop');
      void el.resultAction.offsetWidth; // restart the verdict animation
      el.resultAction.classList.add('pop');
      setMiniAdvice(rec.label.toUpperCase(), 'You: ' + player.join(' ') + ' · Dealer: ' + dealer, rec.color);
      if (!res.licensed) paintStrip();
    });
  }

  /* ---------- settings (localStorage replaces chrome.storage.sync) ---------- */

  function saveSettings() {
    try {
      localStorage.setItem('bjSettings', JSON.stringify({ rules: rules(), alwaysOnTop: el.alwaysOnTop.checked }));
    } catch (e) {}
  }

  function loadSettings() {
    var data = {};
    try { data = JSON.parse(localStorage.getItem('bjSettings')) || {}; } catch (e) {}
    if (data.rules) {
      el.hitSoft17.checked = !!data.rules.hitSoft17;
      el.das.checked = data.rules.das !== false;
      el.surrender.checked = data.rules.surrender === true;
    }
    el.alwaysOnTop.checked = data.alwaysOnTop !== false; // floats by default — that's the point
    API.setAlwaysOnTop(el.alwaysOnTop.checked);
    compute();
  }

  ['hitSoft17', 'das', 'surrender'].forEach(function (k) {
    el[k].addEventListener('change', function () { saveSettings(); compute(); });
  });
  el.alwaysOnTop.addEventListener('change', function () {
    API.setAlwaysOnTop(el.alwaysOnTop.checked);
    saveSettings();
  });
  el.clearPlayer.addEventListener('click', function () { player = []; renderPlayer(); compute(); });

  /* ---------- miniplayer ---------- */

  var miniBar = document.getElementById('miniBar');
  var miniAction = document.getElementById('miniAction');
  var miniDetail = document.getElementById('miniDetail');

  function setMiniAdvice(action, detail, color) {
    miniAction.textContent = action;
    miniAction.style.color = color || '';
    miniDetail.textContent = detail;
  }

  function setMini(on) {
    document.body.classList.toggle('mini', on);
    miniBar.hidden = !on;
    API.setMini(on);
    if (!on) API.setAlwaysOnTop(el.alwaysOnTop.checked); // restore the user's preference
  }

  document.getElementById('miniBtn').addEventListener('click', function () { setMini(true); });
  document.getElementById('miniExpand').addEventListener('click', function () { setMini(false); });

  if (API.onLiveAdvice) {
    API.onLiveAdvice(function (p) {
      if (p) setMiniAdvice(p.action, p.detail, '#22c55e');
      else setMiniAdvice('—', 'Waiting for a hand…', '');
    });
  }

  var casinoBtn = document.getElementById('openCasinoBtn');
  var casinoUrl = document.getElementById('casinoUrl');
  if (casinoBtn && casinoUrl) {
    casinoBtn.addEventListener('click', function () { API.openCasino(casinoUrl.value); });
    casinoUrl.addEventListener('keydown', function (e) { if (e.key === 'Enter') API.openCasino(casinoUrl.value); });
  }

  buildPickers();
  renderPlayer();
  loadSettings();

  /* ---------- video poker hand checker ---------- */

  var vpRepaint = function () {};

  (function () {
    var grid = document.getElementById('vpGrid');
    var chips = document.getElementById('vpChips');
    var result = document.getElementById('vpResult');
    var clearBtn = document.getElementById('vpClear');
    if (!grid || !chips || !result || !clearBtn || !window.BJVideoPoker) return;

    var VP = window.BJVideoPoker;
    var LABELS = { best: 'BEST PLAY', safe: 'SAFER', risky: 'LONG SHOT' };
    var picked = []; // card ints (suit*13 + rank), max 5

    // 4 suit rows × 13 rank buttons = the full deck.
    for (var s = 0; s < 4; s++) {
      var row = document.createElement('div');
      row.className = 'vp-row';
      var suitEl = document.createElement('span');
      suitEl.className = 'vp-suit' + (s === 1 || s === 2 ? ' vp-red' : '');
      suitEl.textContent = VP.SUITS[s];
      row.appendChild(suitEl);
      for (var r = 0; r < 13; r++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.card = String(s * 13 + r);
        b.textContent = VP.RANKS[r];
        b.title = VP.RANKS[r] + VP.SUITS[s];
        row.appendChild(b);
      }
      grid.appendChild(row);
    }

    grid.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-card]');
      if (!b) return;
      var card = parseInt(b.dataset.card, 10);
      var at = picked.indexOf(card);
      if (at > -1) picked.splice(at, 1);       // tap again to remove
      else if (picked.length < 5) picked.push(card);
      paint();
    });

    clearBtn.addEventListener('click', function () { picked = []; paint(); });

    function cardChip(card, small) {
      var chip = document.createElement('span');
      chip.className = (small ? 'vp-card' : 'chip vp-chip') + (VP.isRed(card) ? ' vp-red' : '');
      chip.textContent = VP.cardLabel(card);
      return chip;
    }

    function note(text) {
      var el = document.createElement('div');
      el.className = 'result-detail';
      el.textContent = text;
      return el;
    }

    function paint() {
      chips.textContent = '';
      picked.forEach(function (card) {
        var chip = cardChip(card, false);
        chip.title = 'Remove';
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', function () {
          picked.splice(picked.indexOf(card), 1);
          paint();
        });
        chips.appendChild(chip);
      });
      Array.prototype.forEach.call(grid.querySelectorAll('button[data-card]'), function (b) {
        b.classList.toggle('active', picked.indexOf(parseInt(b.dataset.card, 10)) > -1);
      });

      result.textContent = '';
      if (picked.length < 5) {
        result.appendChild(note('Pick the five cards you were dealt (' + picked.length + '/5).'));
        return;
      }
      var hand = picked.slice();
      var sig = 'vp:' + hand.join(',');
      result.appendChild(note('Working out the exact odds…'));
      API.consume(sig).then(function (res) {
        if (hand.join(',') !== picked.join(',')) return; // selection changed meanwhile
        if (!res.allowed) {
          result.textContent = '';
          result.appendChild(note('🔒 Your free hands are used. Unlock above, or paste your license key.'));
          paintStrip();
          return;
        }
        if (!res.licensed) paintStrip();
        // Let the "working…" note paint before the ~100ms enumeration runs.
        setTimeout(function () {
          if (hand.join(',') !== picked.join(',')) return;
          var advice;
          try { advice = VP.advise(hand); } catch (e) { advice = null; }
          result.textContent = '';
          if (!advice) { result.appendChild(note('Could not compute this hand.')); return; }
          advice.options.forEach(function (o) {
            var opt = document.createElement('div');
            opt.className = 'vp-opt' + (o.kind === 'best' ? ' vp-best' : o.kind === 'risky' ? ' vp-risky' : '');
            var top = document.createElement('div');
            top.className = 'vp-top';
            var tag = document.createElement('span');
            tag.className = 'vp-tag';
            tag.textContent = LABELS[o.kind];
            var stats = document.createElement('span');
            stats.className = 'vp-stats';
            stats.textContent = 'wins ' + fmtPct(o.winProb) + ' · avg ' + o.ev.toFixed(2) + 'x' +
              (o.kind === 'risky' ? ' · royal/SF ' + fmtPct(o.bigProb) : '');
            top.appendChild(tag);
            top.appendChild(stats);
            opt.appendChild(top);
            var hold = document.createElement('div');
            hold.className = 'vp-hold';
            if (o.mask === 31) hold.textContent = 'Hold all five cards';
            else if (o.mask === 0) hold.textContent = 'Discard all five, draw a fresh hand';
            else {
              hold.appendChild(document.createTextNode('Hold '));
              o.holdCards.forEach(function (c) { hold.appendChild(cardChip(c, true)); });
            }
            opt.appendChild(hold);
            result.appendChild(opt);
          });
        }, 30);
      });
    }

    function fmtPct(p) {
      var v = p * 100;
      return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
    }

    vpRepaint = paint;
    paint();
  })();

  /* ---------- tabs ---------- */

  (function () {
    var tabs = document.getElementById('tabs');
    var panels = {
      calc: document.getElementById('panelCalc'),
      vp: document.getElementById('panelVp')
    };
    if (!tabs || !panels.calc || !panels.vp) return;

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      Array.prototype.forEach.call(tabs.children, function (t) {
        t.classList.toggle('active', t === b);
      });
      Object.keys(panels).forEach(function (k) {
        panels[k].hidden = k !== b.dataset.tab;
      });
    });
  })();

  paintStrip();
})();
