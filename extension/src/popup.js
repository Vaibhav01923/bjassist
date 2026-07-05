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
      el.resultAction.style.color = '#64748b';
      el.resultDetail.textContent = 'Pick at least two of your cards and the dealer\'s upcard.';
      return;
    }
    var rec = window.BJStrategy.getBestPlay(player, dealer, rules());
    if (rec.error) {
      el.resultAction.textContent = '—';
      el.resultAction.style.color = '#64748b';
      el.resultDetail.textContent = rec.error;
      return;
    }
    el.resultAction.textContent = rec.label.toUpperCase();
    el.resultAction.style.color = rec.color;
    el.resultDetail.textContent = rec.reason;
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

  buildPickers();
  renderPlayer();
  loadSettings();

  /* ---------- License strip ---------- */
  (function () {
    var text = document.getElementById('licenseStripText');
    var btn = document.getElementById('licenseStripBtn');
    if (!text || !window.BJLicense) return;

    chrome.storage.local.get(['bjLicenseKey', 'bjStatus', 'bjFreeHandUsed'], function (data) {
      if (data.bjLicenseKey && data.bjStatus === 'active') {
        text.textContent = '✓ BJAssist unlocked';
        btn.style.display = 'none';
      } else if (data.bjFreeHandUsed) {
        text.textContent = 'Free hand used — on-page hints need a license.';
        btn.style.display = '';
      } else {
        text.textContent = 'On-page hints: 1 free hand, then $14.99/mo.';
        btn.style.display = '';
      }
    });

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Opening…';
      window.BJLicense.startCheckout('extension_popup', function (res) {
        btn.disabled = false;
        btn.textContent = 'Unlock $14.99/mo';
        if (res.ok) window.open(res.url, '_blank');
        else text.textContent = res.error || 'Could not start checkout.';
      });
    });
  })();
})();
