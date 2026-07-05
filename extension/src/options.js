/* Settings page: persists to chrome.storage.sync, shared with popup + content. */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true,
    position: 'top-right',
    rules: { hitSoft17: false, das: true, surrender: false }
  };

  var el = {
    enabled: document.getElementById('enabled'),
    hitSoft17: document.getElementById('hitSoft17'),
    das: document.getElementById('das'),
    surrender: document.getElementById('surrender'),
    posGrid: document.getElementById('posGrid'),
    reset: document.getElementById('reset'),
    saved: document.getElementById('saved')
  };
  var position = DEFAULTS.position;

  function flashSaved() {
    el.saved.classList.add('show');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(function () { el.saved.classList.remove('show'); }, 1200);
  }

  function collect() {
    return {
      enabled: el.enabled.checked,
      position: position,
      rules: {
        hitSoft17: el.hitSoft17.checked,
        das: el.das.checked,
        surrender: el.surrender.checked
      }
    };
  }

  function save() {
    try { chrome.storage.sync.set(collect(), flashSaved); } catch (e) {}
  }

  function paintPosition() {
    Array.prototype.forEach.call(el.posGrid.children, function (b) {
      b.classList.toggle('active', b.dataset.pos === position);
    });
  }

  function apply(cfg) {
    el.enabled.checked = cfg.enabled !== false;
    el.hitSoft17.checked = !!cfg.rules.hitSoft17;
    el.das.checked = cfg.rules.das !== false;
    el.surrender.checked = cfg.rules.surrender === true;
    position = cfg.position || DEFAULTS.position;
    paintPosition();
  }

  function load() {
    try {
      chrome.storage.sync.get(['enabled', 'position', 'rules'], function (data) {
        apply({
          enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULTS.enabled,
          position: data.position || DEFAULTS.position,
          rules: Object.assign({}, DEFAULTS.rules, data.rules || {})
        });
      });
    } catch (e) { apply(DEFAULTS); }
  }

  ['enabled', 'hitSoft17', 'das', 'surrender'].forEach(function (k) {
    el[k].addEventListener('change', save);
  });
  el.posGrid.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pos]');
    if (!b) return;
    position = b.dataset.pos;
    paintPosition();
    save();
  });
  el.reset.addEventListener('click', function () {
    apply(JSON.parse(JSON.stringify(DEFAULTS)));
    save();
  });

  load();

  /* ---------- License card ---------- */
  (function () {
    var lc = {
      title: document.getElementById('licenseStatusTitle'),
      detail: document.getElementById('licenseStatusDetail'),
      buy: document.getElementById('buyBtn'),
      keyInput: document.getElementById('licenseKeyInput'),
      keyRow: document.getElementById('licenseKeyRow'),
      activate: document.getElementById('activateBtn'),
      deactivate: document.getElementById('deactivateBtn'),
      msg: document.getElementById('licenseMsg')
    };
    if (!lc.title || !window.BJLicense) return;

    function flash(text) {
      lc.msg.textContent = text;
      lc.msg.classList.add('show');
      clearTimeout(flash._t);
      flash._t = setTimeout(function () { lc.msg.classList.remove('show'); }, 2200);
    }

    function paint() {
      chrome.storage.local.get(['bjLicenseKey', 'bjStatus', 'bjFreeHandUsed'], function (data) {
        if (data.bjLicenseKey && data.bjStatus === 'active') {
          lc.title.textContent = 'BJAssist unlocked';
          lc.detail.textContent = 'Your license is active on this device.';
          lc.buy.style.display = 'none';
          lc.keyRow.style.display = 'none';
          lc.activate.style.display = 'none';
          lc.deactivate.style.display = '';
        } else if (data.bjLicenseKey) {
          lc.title.textContent = 'License ' + (data.bjStatus || 'inactive');
          lc.detail.textContent = 'This key is no longer active. Check your subscription or unlock again.';
          lc.buy.style.display = '';
          lc.keyRow.style.display = '';
          lc.activate.style.display = '';
          lc.deactivate.style.display = '';
        } else if (data.bjFreeHandUsed) {
          lc.title.textContent = 'Free hand used';
          lc.detail.textContent = 'Unlock BJAssist to keep getting on-page suggestions.';
          lc.buy.style.display = '';
          lc.keyRow.style.display = '';
          lc.activate.style.display = '';
          lc.deactivate.style.display = 'none';
        } else {
          lc.title.textContent = 'No license yet';
          lc.detail.textContent = "Play a hand on a supported table to use your free suggestion, or unlock now.";
          lc.buy.style.display = '';
          lc.keyRow.style.display = '';
          lc.activate.style.display = '';
          lc.deactivate.style.display = 'none';
        }
      });
    }

    lc.buy.addEventListener('click', function () {
      lc.buy.disabled = true;
      lc.buy.textContent = 'Opening checkout…';
      window.BJLicense.startCheckout('extension_options', function (res) {
        lc.buy.disabled = false;
        lc.buy.textContent = 'Unlock — $14.99/mo';
        if (res.ok) window.open(res.url, '_blank');
        else flash(res.error || 'Could not start checkout.');
      });
    });

    lc.activate.addEventListener('click', function () {
      lc.activate.disabled = true;
      window.BJLicense.activate(lc.keyInput.value, function (res) {
        lc.activate.disabled = false;
        if (res.ok) {
          lc.keyInput.value = '';
          flash('License activated ✓');
        } else {
          flash(res.error || 'Could not activate that key.');
        }
        paint();
      });
    });

    lc.deactivate.addEventListener('click', function () {
      lc.deactivate.disabled = true;
      window.BJLicense.deactivate(function () {
        lc.deactivate.disabled = false;
        flash('License removed from this device.');
        paint();
      });
    });

    paint();
  })();
})();
