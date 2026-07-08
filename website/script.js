/* Hero hand rotation + checkout. The playable table demo lives in demo-game.js. */
(function () {
  'use strict';

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero: a real dealt hand, re-dealt every few seconds ----------
     Hero cards are always visible ('dealt'); the one-time entrance animates
     transform only via keyframes, so nothing ships blank if timers or
     animations are paused. */
  function cardHTML(rank, suitIdx, hidden, dealDelay) {
    var suits = [['♠', '#171310'], ['♥', '#c0362f'], ['♦', '#c0362f'], ['♣', '#171310']];
    var s = suits[suitIdx % 4];
    var anim = (typeof dealDelay === 'number' && !REDUCED)
      ? ' deal-anim" style="animation-delay:' + dealDelay + 'ms' : '';
    return '<div class="pcard dealt' + (hidden ? ' hidden' : '') + anim + '"><div class="pcard-inner">' +
      '<div class="pcard-face pcard-front" style="color:' + s[1] + '">' +
        '<div class="pc-rank">' + rank + '</div>' +
        '<div class="pc-rank pc-rank-b">' + rank + '</div>' +
        '<div class="pc-suit">' + s[0] + '</div>' +
      '</div>' +
      '<div class="pcard-face pcard-back"><span>BJ</span></div>' +
    '</div></div>';
  }

  function heroLoop() {
    var samples = [
      [['10', '6'], '5', [0, 2], 3],   // playerRanks, dealerRank, playerSuits, dealerSuit
      [['5', '6'], '4', [1, 0], 2],
      [['8', '8'], '10', [3, 1], 0],
      [['A', '7'], '9', [0, 3], 1],
      [['A', '8'], '6', [2, 0], 3]
    ];
    var a = document.getElementById('heroAction');
    var d = document.getElementById('heroDetail');
    var dot = document.querySelector('.mo-dot');
    var pEl = document.getElementById('heroPlayerCards');
    var dEl = document.getElementById('heroDealerCards');
    if (!a || !pEl || !dEl || !window.BJStrategy) return;

    var i = 0;
    function show(idx, animate) {
      var s = samples[idx];
      var rec = window.BJStrategy.getBestPlay(s[0], s[1]);
      dEl.innerHTML = cardHTML(s[1], s[3], false, animate ? 120 : undefined) +
                      cardHTML('?', 0, true, animate ? 280 : undefined);
      pEl.innerHTML = s[0].map(function (r, j) {
        return cardHTML(r, s[2][j], false, animate ? 440 + j * 160 : undefined);
      }).join('');
      a.textContent = rec.label.toUpperCase();
      a.style.color = rec.color;
      if (dot) { dot.style.background = rec.color; dot.style.boxShadow = '0 0 10px ' + rec.color; }
      d.textContent = 'You: ' + s[0].join(' ') + ' · Dealer: ' + s[1] +
        ' · (' + (rec.hand.soft ? 'soft ' : 'hard ') + rec.hand.total + ')';
    }

    show(0, true);
    setInterval(function () { i = (i + 1) % samples.length; show(i, false); }, 3400);
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

  /* ---------- Scroll reveal (opt-in via .reveal in markup) + nav shrink ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

  var nav = document.querySelector('.nav');
  window.addEventListener('scroll', function () {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 24);
  }, { passive: true });
})();
