/* Popup: manual strategy calculator + settings. Always works, no site needed. */
(function () {
  'use strict';

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
    enabled: document.getElementById('enabled'),
    hitSoft17: document.getElementById('hitSoft17'),
    das: document.getElementById('das'),
    surrender: document.getElementById('surrender')
  };

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

  function compute() {
    if (player.length < 2 || !dealer) {
      el.resultAction.textContent = '—';
      el.resultAction.style.color = '#8a988e';
      el.resultDetail.textContent = 'Pick at least two of your cards and the dealer\'s upcard.';
      return;
    }
    var rec = window.BJStrategy.getBestPlay(player, dealer, rules());
    if (rec.error) {
      el.resultAction.textContent = '—';
      el.resultAction.style.color = '#8a988e';
      el.resultDetail.textContent = rec.error;
      return;
    }
    el.resultAction.textContent = rec.label.toUpperCase();
    el.resultAction.style.color = rec.color;
    el.resultDetail.textContent = rec.reason;
    el.resultAction.classList.remove('pop');
    void el.resultAction.offsetWidth; // restart the verdict animation
    el.resultAction.classList.add('pop');
  }

  function saveSettings() {
    try {
      chrome.storage.sync.set({ enabled: el.enabled.checked, rules: rules() });
    } catch (e) {}
  }

  function loadSettings() {
    try {
      chrome.storage.sync.get(['enabled', 'rules'], function (data) {
        if (typeof data.enabled === 'boolean') el.enabled.checked = data.enabled;
        if (data.rules) {
          el.hitSoft17.checked = !!data.rules.hitSoft17;
          el.das.checked = data.rules.das !== false;
          el.surrender.checked = data.rules.surrender === true;
        }
        compute();
      });
    } catch (e) { compute(); }
  }

  ['enabled', 'hitSoft17', 'das', 'surrender'].forEach(function (k) {
    el[k].addEventListener('change', function () { saveSettings(); compute(); });
  });
  el.clearPlayer.addEventListener('click', function () { player = []; renderPlayer(); compute(); });

  var settingsLink = document.getElementById('openSettings');
  if (settingsLink) settingsLink.addEventListener('click', function (e) {
    e.preventDefault();
    try { chrome.runtime.openOptionsPage(); } catch (err) {}
  });

  /* ---------- "Enable on this tab" (Stake mirrors / other casinos) ----------
   * The manifest only auto-injects on known casino domains. For anything else
   * the user opts in per-tab: opening this popup grants activeTab, so
   * chrome.scripting can inject the same overlay files into the current tab
   * without the extension holding any broad host permission. */
  (function () {
    var wrap = document.getElementById('siteEnable');
    var btn = document.getElementById('enableHereBtn');
    var msg = document.getElementById('enableHereMsg');
    if (!wrap || !btn || !chrome.scripting || !chrome.tabs) return;

    var OVERLAY_JS = ['src/strategy.js', 'src/video-poker.js', 'src/site-configs.js', 'src/license.js', 'src/content.js'];

    function withActiveTab(cb) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        cb(tabs && tabs[0]);
      });
    }

    // Only surface the button on ordinary web pages — not chrome://, the
    // web store, our own site, or hosts the manifest already covers.
    withActiveTab(function (tab) {
      if (!tab || !/^https?:/i.test(tab.url || '')) return;
      var host = '';
      try { host = new URL(tab.url).hostname; } catch (e) { return; }
      if (/(^|\.)(bjassist\.com)$/i.test(host)) return;
      chrome.tabs.sendMessage(tab.id, { type: 'bj-ping' }, function (res) {
        if (chrome.runtime.lastError || !res || !res.ok) wrap.hidden = false;
        else {
          wrap.hidden = false;
          btn.disabled = true;
          btn.textContent = '✓ Active on this tab';
          msg.textContent = 'The overlay is already watching this tab.';
        }
      });
    });

    btn.addEventListener('click', function () {
      btn.disabled = true;
      withActiveTab(function (tab) {
        if (!tab) { btn.disabled = false; return; }
        chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['src/overlay.css'] }, function () {
          chrome.scripting.executeScript({ target: { tabId: tab.id }, files: OVERLAY_JS }, function () {
            if (chrome.runtime.lastError) {
              btn.disabled = false;
              msg.textContent = 'Could not enable here. Open the casino tab you want, then try again.';
              return;
            }
            btn.textContent = '✓ Active on this tab';
            msg.textContent = 'Watching this tab for blackjack and video poker hands. Lasts until the tab reloads.';
          });
        });
      });
    });
  })();

  buildPickers();
  renderPlayer();
  loadSettings();

  /* ---------- License strip ---------- */
  (function () {
    var text = document.getElementById('licenseStripText');
    var actions = document.getElementById('licenseActions');
    var btn = document.getElementById('licenseStripBtn');
    var input = document.getElementById('licenseStripInput');
    var activateBtn = document.getElementById('licenseStripActivateBtn');
    var msg = document.getElementById('licenseStripMsg');
    if (!text || !window.BJLicense) return;

    function paint() {
      try {
        chrome.storage.local.get(['bjLicenseKey', 'bjStatus', 'bjFreeHandUsed'], function (data) {
          if (data.bjLicenseKey && data.bjStatus === 'active') {
            text.textContent = '✓ BJAssist unlocked';
            actions.style.display = 'none';
          } else if (data.bjFreeHandUsed) {
            text.textContent = 'Free hand used — on-page hints need a license.';
            actions.style.display = '';
          } else {
            text.textContent = 'On-page hints: 1 free hand, then $14.99/mo.';
            actions.style.display = '';
          }
        });
      } catch (e) {
        text.textContent = 'On-page hints: 1 free hand, then $14.99/mo.';
        actions.style.display = '';
      }
    }

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Opening…';
      window.BJLicense.startCheckout('extension_popup', function (res) {
        btn.disabled = false;
        btn.textContent = 'Unlock — $14.99/mo';
        if (res.ok) window.open(res.url, '_blank');
        else { msg.textContent = res.error || 'Could not start checkout.'; msg.classList.remove('success'); }
      });
    });

    // Already have a key (e.g. from a previous purchase, or the email just
    // arrived) — activate it right here, no need to hunt through Settings.
    activateBtn.addEventListener('click', activate);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') activate(); });

    function activate() {
      activateBtn.disabled = true;
      msg.textContent = '';
      window.BJLicense.activate(input.value, function (res) {
        activateBtn.disabled = false;
        if (res.ok) {
          input.value = '';
          msg.textContent = 'Activated ✓';
          msg.classList.add('success');
          paint();
        } else {
          msg.textContent = res.error || 'Could not activate that key.';
          msg.classList.remove('success');
        }
      });
    }

    paint();
  })();

  /* ---------- Video poker hand checker ---------- */
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
      result.appendChild(note('Working out the exact odds…'));
      var hand = picked.slice();
      // Let the "working…" note paint before the ~100ms enumeration runs.
      setTimeout(function () {
        if (hand.join(',') !== picked.join(',')) return; // selection changed meanwhile
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
    }

    function fmtPct(p) {
      var v = p * 100;
      return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
    }

    paint();
  })();

  /* ---------- Tabs + Bonuses ---------- */
  (function () {
    var tabs = document.getElementById('tabs');
    var panels = {
      calc: document.getElementById('panelCalc'),
      vp: document.getElementById('panelVp'),
      bonuses: document.getElementById('panelBonuses')
    };
    var list = document.getElementById('bonusList');
    var filters = document.getElementById('bonusFilters');
    if (!tabs || !panels.calc || !panels.vp || !panels.bonuses || !list || !filters) return;

    // Read-only view of public.bonuses. The publishable key is safe to ship:
    // RLS only permits SELECT on this table for the anon role.
    var BONUSES_URL = 'https://xlstduhdanyfqnbiziym.supabase.co/rest/v1/bonuses';
    var PUBLISHABLE_KEY = 'sb_publishable_HbuZ-j15lZUMZfFIqyzc1Q_tboNob54';

    var casino = 'stake.com';
    var cache = {};
    var loadedOnce = false;

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      Array.prototype.forEach.call(tabs.children, function (t) {
        t.classList.toggle('active', t === b);
      });
      Object.keys(panels).forEach(function (k) {
        panels[k].hidden = k !== b.dataset.tab;
      });
      if (b.dataset.tab === 'bonuses' && !loadedOnce) { loadedOnce = true; load(); }
    });

    filters.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-casino]');
      if (!b || b.dataset.casino === casino) return;
      casino = b.dataset.casino;
      Array.prototype.forEach.call(filters.children, function (f) {
        f.classList.toggle('active', f === b);
      });
      load();
    });

    function note(text) {
      var el = document.createElement('div');
      el.className = 'bonus-note';
      el.textContent = text;
      return el;
    }

    // Only the official recurring bonuses belong here — the feed (and the
    // initial import) also carries raffle-winner posts, giveaways, and forum
    // challenges, which are noise for this tab.
    var JUNK = /(giveaway|raffle|winners|challenge)/i;

    function load() {
      if (cache[casino]) { paintBonuses(cache[casino]); return; }
      list.textContent = '';
      list.appendChild(note('Loading…'));
      var wanted = casino;
      fetch(BONUSES_URL +
        '?select=cadence,code,title,value_display,link_url,posted_at' +
        '&casino=eq.' + encodeURIComponent(wanted) +
        '&order=posted_at.desc&limit=60',
        { headers: { apikey: PUBLISHABLE_KEY } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) {
          if (rows) {
            var seen = {};
            rows = rows.filter(function (r) {
              if (JUNK.test(r.title || '') || JUNK.test(r.code || '')) return false;
              // The feed sometimes reposts the same code — keep the newest only.
              var key = r.code || r.link_url || '';
              if (seen[key]) return false;
              seen[key] = true;
              return true;
            });
            cache[wanted] = rows;
          }
          if (wanted === casino) paintBonuses(rows);
        })
        .catch(function () { if (wanted === casino) paintBonuses(null); });
    }

    // Rows originate from an external feed, so everything is rendered with
    // textContent (never innerHTML) and links must be https.
    function paintBonuses(rows) {
      list.textContent = '';
      if (!rows) { list.appendChild(note('Could not load bonuses. Check your connection and try again.')); return; }
      if (!rows.length) { list.appendChild(note('No bonuses recorded for ' + casino + ' yet.')); return; }

      var order = ['weekly', 'monthly'];
      var byCadence = {};
      rows.forEach(function (r) {
        (byCadence[r.cadence] = byCadence[r.cadence] || []).push(r);
      });
      Object.keys(byCadence).forEach(function (c) {
        if (order.indexOf(c) === -1) order.push(c);
      });

      var CAD_NAMES = { weekly: 'Weekly bonus', monthly: 'Monthly bonus' };
      order.forEach(function (cadence) {
        var items = byCadence[cadence];
        if (!items || !items.length) return;
        var head = document.createElement('div');
        head.className = 'bonus-cad';
        head.textContent = CAD_NAMES[cadence] || cadence;
        list.appendChild(head);
        items.forEach(function (r) {
          var row = document.createElement('a');
          row.className = 'bonus-row';
          var url = String(r.link_url || '');
          if (url.indexOf('https://') === 0) {
            row.href = url;
            row.target = '_blank';
            row.rel = 'noopener noreferrer';
          }
          var main = document.createElement('div');
          main.className = 'bonus-main';
          var title = document.createElement('div');
          title.className = 'bonus-title';
          title.textContent = r.title || 'Bonus';
          main.appendChild(title);
          var meta = document.createElement('div');
          meta.className = 'bonus-meta';
          var d = new Date(r.posted_at);
          var parts = [];
          if (!isNaN(d)) parts.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
          if (r.value_display) parts.push(r.value_display);
          meta.textContent = parts.join(' · ');
          main.appendChild(meta);
          row.appendChild(main);
          var claim = document.createElement('span');
          claim.className = 'bonus-claim';
          claim.textContent = 'Claim ↗';
          row.appendChild(claim);
          list.appendChild(row);
        });
      });
    }
  })();
})();
