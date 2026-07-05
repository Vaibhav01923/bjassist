/* Hero mini-overlay rotation + checkout. The playable table demo lives in demo-game.js. */
(function () {
  'use strict';

  // Rotate a few example hands in the hero card for life.
  function heroLoop() {
    var samples = [
      ['16', ['10', '6'], '5'],
      ['DOUBLE', ['5', '6'], '4'],
      ['SPLIT', ['8', '8'], '10'],
      ['HIT', ['A', '7'], '9'],
      ['STAND', ['A', '8'], '6']
    ];
    var i = 0;
    var a = document.getElementById('heroAction');
    var d = document.getElementById('heroDetail');
    var dot = document.querySelector('.mo-dot');
    if (!a) return;
    setInterval(function () {
      i = (i + 1) % samples.length;
      var s = samples[i];
      var rec = window.BJStrategy.getBestPlay(s[1], s[2]);
      a.textContent = rec.label.toUpperCase();
      a.style.color = rec.color;
      if (dot) { dot.style.background = rec.color; dot.style.boxShadow = '0 0 10px ' + rec.color; }
      d.textContent = 'You: ' + s[1].join(' ') + ' · Dealer: ' + s[2] +
        ' · (' + (rec.hand.soft ? 'soft ' : 'hard ') + rec.hand.total + ')';
    }, 2200);
  }

  heroLoop();

  /* ---------- Checkout ---------- */
  (function () {
    var CHECKOUT_URL = 'https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/create-checkout';
    var buyBtn = document.getElementById('buyBtn');
    var note = document.getElementById('buyNote');
    if (!buyBtn) return;
    buyBtn.addEventListener('click', function () {
      buyBtn.disabled = true;
      buyBtn.textContent = 'Opening checkout…';
      note.textContent = '';
      note.classList.remove('error');
      fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'website' })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.checkout_url) {
            window.location.href = data.checkout_url;
          } else {
            throw new Error('no checkout_url');
          }
        })
        .catch(function () {
          buyBtn.disabled = false;
          buyBtn.textContent = 'Get BJAssist';
          note.textContent = 'Could not start checkout. Please try again in a moment.';
          note.classList.add('error');
        });
    });
  })();
})();

/* ---------- Animations & live strategy grid ---------- */
(function () {
  'use strict';

  // 1) Scroll-reveal: tag common elements, then observe.
  var autoReveal = '.step, .feature, .plan, .review, .demo-panel, .demo-result, ' +
    '#how .section-title, #features .section-title, #pricing .section-title, ' +
    '#faq .section-title, #demo .section-title, #reviews .section-title, ' +
    '#demo .section-sub, .faq details, .hero-stats';
  document.querySelectorAll(autoReveal).forEach(function (el) { el.classList.add('reveal'); });

  // Stagger siblings within each group.
  document.querySelectorAll('.steps, .features, .plans, .reviews').forEach(function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) {
      if (child.classList.contains('reveal')) child.style.transitionDelay = (i * 90) + 'ms';
    });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  // 2) Sticky-nav shrink.
  var nav = document.querySelector('.nav');
  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 24);
  }, { passive: true });

  // 3) Count-up on the hero's numeric stat(s).
  function countUp(el, target, suffix, decimals) {
    var start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var statObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.querySelectorAll('strong').forEach(function (s) {
        var raw = s.textContent.trim();
        var m = raw.match(/^([0-9]+(?:\.[0-9]+)?)(%?)$/);
        if (m) {
          var num = parseFloat(m[1]);
          if (num > 0) countUp(s, num, m[2], m[1].indexOf('.') > -1 ? 1 : 0);
        }
      });
      statObs.unobserve(e.target);
    });
  }, { threshold: 0.5 });
  var hs = document.querySelector('.hero-stats');
  if (hs) statObs.observe(hs);
})();
