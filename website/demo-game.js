/*
 * Playable blackjack table demo for the marketing site. Deals a real hand
 * with fly-in + flip animations and uses the shipped BJStrategy engine for
 * the live suggestion badge — the same engine the extension ships.
 */
(function () {
  'use strict';

  var els = {
    dealerCards: document.getElementById('dealerCards'),
    playerCards: document.getElementById('playerCards'),
    dealerTotal: document.getElementById('dealerTotal'),
    playerTotal: document.getElementById('playerTotal'),
    status: document.getElementById('tableStatus'),
    badge: document.getElementById('suggestionBadge'),
    sbAction: document.getElementById('sbAction'),
    sbText: document.getElementById('sbText'),
    betAmountLabel: document.getElementById('betAmountLabel'),
    betValueText: document.getElementById('betValueText'),
    betHalf: document.getElementById('betHalf'),
    betDbl: document.getElementById('betDbl'),
    btnHit: document.getElementById('btnHit'),
    btnStand: document.getElementById('btnStand'),
    btnDouble: document.getElementById('btnDouble'),
    btnDeal: document.getElementById('btnDeal')
  };
  if (!els.dealerCards || !window.BJStrategy) return;

  var DEAL_MS = 420;   // fly-in duration
  var FLIP_MS = 380;   // reveal-flip duration
  var STEP_GAP = 260;  // pause between deal steps

  var state = {
    pc: [], dc: [], phase: 'idle', // idle | dealing | player | dealer | done
    doubled: false, bet: 25, balance: 1000, hands: 0
  };

  function drawCard() {
    var suits = [['♠', '#12181f'], ['♥', '#c0362f'], ['♦', '#c0362f'], ['♣', '#12181f']];
    var ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    var s = suits[Math.floor(Math.random() * 4)];
    var r = ranks[Math.floor(Math.random() * 13)];
    return { rank: r, suit: s[0], color: s[1] };
  }

  function val(ranks) { return window.BJStrategy.evaluateHand(ranks); }
  function fmtMoney(n) { return '$' + n.toFixed(2); }

  function cardFaceHTML(card) {
    return (
      '<div class="pc-rank">' + card.rank + '</div>' +
      '<div class="pc-suit" style="color:' + card.color + '">' + card.suit + '</div>' +
      '<div class="pc-rank pc-rank-b">' + card.rank + '</div>'
    );
  }

  // Appends a card to a hand row. If reveal is false, the card stays face
  // down (the dealer's hole card) until revealDealerHole() flips it later.
  function addCard(container, card, reveal, cb) {
    var outer = document.createElement('div');
    outer.className = 'pcard hidden';
    outer.innerHTML =
      '<div class="pcard-inner">' +
        '<div class="pcard-face pcard-front" style="color:' + card.color + '">' + cardFaceHTML(card) + '</div>' +
        '<div class="pcard-face pcard-back"><span>BJAssist</span></div>' +
      '</div>';
    container.appendChild(outer);
    // Force reflow so the fly-in transition actually runs.
    void outer.offsetWidth;
    outer.classList.add('dealt');
    setTimeout(function () {
      if (reveal) {
        outer.classList.remove('hidden');
        setTimeout(cb, FLIP_MS);
      } else {
        cb();
      }
    }, DEAL_MS);
  }

  function revealDealerHole(cb) {
    var holeEl = els.dealerCards.children[1];
    if (holeEl) holeEl.classList.remove('hidden');
    setTimeout(cb, FLIP_MS);
  }

  function updateTotals() {
    var pv = val(state.pc.map(function (c) { return c.rank; }));
    var dv = val(state.dc.map(function (c) { return c.rank; }));
    els.playerTotal.textContent = state.pc.length ? (pv.total > 21 ? 'BUST' : (pv.soft ? 'Soft ' + pv.total : pv.total)) : '';
    var holeHidden = state.phase === 'player' || state.phase === 'dealing';
    if (state.dc.length) {
      els.dealerTotal.textContent = holeHidden ? val([state.dc[0].rank]).total : (dv.total > 21 ? 'BUST' : dv.total);
    } else {
      els.dealerTotal.textContent = '';
    }
  }

  function setBadge(action, detail, color, pulsing) {
    if (!action) { els.badge.classList.remove('show'); return; }
    els.badge.classList.add('show');
    els.sbAction.textContent = action;
    els.sbAction.style.color = color || '#e6edf6';
    els.sbText.textContent = detail || '';
    els.badge.querySelector('.ext-dot').style.background = color || '#3b82f6';
    els.badge.classList.toggle('pulsing', !!pulsing);
  }

  function updateSuggestion() {
    if (state.phase !== 'player') return;
    var rec = window.BJStrategy.getBestPlay(state.pc.map(function (c) { return c.rank; }), state.dc[0].rank, {});
    if (rec.error) { setBadge('', '', null, false); return; }
    setBadge(rec.label.toUpperCase(), rec.reason, rec.color, false);
  }

  function setControlsEnabled(enabled) {
    var canDouble = enabled && state.pc.length === 2 && state.balance >= state.bet * 2;
    els.btnHit.disabled = !enabled;
    els.btnStand.disabled = !enabled;
    els.btnDouble.disabled = !canDouble;
    els.btnDeal.disabled = enabled || state.phase === 'dealing';
  }

  function paintBetUI() {
    els.betValueText.textContent = fmtMoney(state.bet * (state.doubled ? 2 : 1));
    els.betAmountLabel.textContent = fmtMoney(state.balance);
  }

  function resetTable() {
    els.dealerCards.innerHTML = '';
    els.playerCards.innerHTML = '';
    els.status.innerHTML = '';
    state.pc = []; state.dc = []; state.doubled = false;
    setBadge('', '', null, false);
    updateTotals();
  }

  function deal() {
    if (state.phase === 'dealing' || state.phase === 'player' || state.phase === 'dealer') return;
    resetTable();
    state.phase = 'dealing';
    setControlsEnabled(false);
    els.btnDeal.textContent = 'Dealing…';

    var p1 = drawCard(), d1 = drawCard(), p2 = drawCard(), d2 = drawCard();
    addCard(els.playerCards, p1, true, function () {
      state.pc.push(p1); updateTotals();
      addCard(els.dealerCards, d1, true, function () {
        state.dc.push(d1); updateTotals();
        setTimeout(function () {
          addCard(els.playerCards, p2, true, function () {
            state.pc.push(p2); updateTotals();
            setTimeout(function () {
              addCard(els.dealerCards, d2, false, function () {
                state.dc.push(d2); updateTotals();
                afterInitialDeal();
              });
            }, STEP_GAP);
          });
        }, STEP_GAP);
      });
    });
  }

  function afterInitialDeal() {
    var pv = val(state.pc.map(function (c) { return c.rank; }));
    var dUp = val([state.dc[0].rank]);
    if (pv.total === 21 || dUp.total === 11 || dUp.total === 10) {
      var dv = val(state.dc.map(function (c) { return c.rank; }));
      if (pv.total === 21 || dv.total === 21) {
        state.phase = 'dealer';
        revealDealerHole(function () {
          updateTotals();
          if (pv.total === 21 && dv.total === 21) settle('push');
          else if (pv.total === 21) settle('blackjack');
          else settle('lose');
        });
        return;
      }
    }
    state.phase = 'player';
    updateTotals();
    setControlsEnabled(true);
    els.btnDeal.textContent = 'Deal';
    updateSuggestion();
  }

  function hit(isDouble) {
    if (state.phase !== 'player') return;
    setControlsEnabled(false);
    var c = drawCard();
    addCard(els.playerCards, c, true, function () {
      state.pc.push(c);
      updateTotals();
      var pv = val(state.pc.map(function (cc) { return cc.rank; }));
      if (pv.total > 21) {
        state.phase = 'dealer';
        revealDealerHole(function () { updateTotals(); settle('lose'); });
      } else if (isDouble) {
        dealerTurn();
      } else if (pv.total === 21) {
        dealerTurn();
      } else {
        state.phase = 'player';
        setControlsEnabled(true);
        updateSuggestion();
      }
    });
  }

  function stand() {
    if (state.phase !== 'player') return;
    setControlsEnabled(false);
    dealerTurn();
  }

  function doubleDown() {
    if (state.phase !== 'player' || state.pc.length !== 2 || state.balance < state.bet * 2) return;
    state.doubled = true;
    paintBetUI();
    hit(true);
  }

  function dealerTurn() {
    state.phase = 'dealer';
    setBadge('DEALER PLAYING…', '', 'rgba(230,237,246,.55)', true);
    revealDealerHole(function () {
      updateTotals();
      dealerStep();
    });
  }

  function dealerStep() {
    var dv = val(state.dc.map(function (c) { return c.rank; }));
    if (dv.total < 17) {
      var c = drawCard();
      addCard(els.dealerCards, c, true, function () {
        state.dc.push(c);
        updateTotals();
        dealerStep();
      });
      return;
    }
    var pv = val(state.pc.map(function (c) { return c.rank; }));
    if (dv.total > 21 || pv.total > dv.total) settle('win');
    else if (pv.total < dv.total) settle('lose');
    else settle('push');
  }

  function settle(kind) {
    state.phase = 'done';
    var bet = state.bet * (state.doubled ? 2 : 1);
    var delta = 0;
    if (kind === 'win') delta = bet;
    else if (kind === 'blackjack') delta = Math.round(state.bet * 1.5);
    else if (kind === 'lose') delta = -bet;
    state.balance += delta;
    state.hands++;
    paintBetUI();

    var words = {
      win: ['YOU WIN', '#22c55e'], blackjack: ['BLACKJACK!', '#22c55e'],
      lose: ['DEALER WINS', '#ef4444'], push: ['PUSH', 'rgba(230,237,246,.7)']
    };
    var w = words[kind];
    var deltaText = delta > 0 ? '+' + fmtMoney(delta) : (delta < 0 ? '−' + fmtMoney(Math.abs(delta)) : 'Bet returned');
    els.status.innerHTML =
      '<span class="ts-word" style="color:' + w[1] + '">' + w[0] + '</span>' +
      '<span class="ts-delta">' + deltaText + '</span>';
    setBadge('', '', null, false);
    setControlsEnabled(false);
    els.btnDeal.disabled = false;
    els.btnDeal.textContent = 'Deal next hand';
  }

  els.btnDeal.addEventListener('click', deal);
  els.btnHit.addEventListener('click', function () { hit(false); });
  els.btnStand.addEventListener('click', stand);
  els.btnDouble.addEventListener('click', doubleDown);
  els.betHalf.addEventListener('click', function () {
    if (state.phase !== 'idle' && state.phase !== 'done') return;
    state.bet = Math.max(5, Math.round(state.bet / 2));
    paintBetUI();
  });
  els.betDbl.addEventListener('click', function () {
    if (state.phase !== 'idle' && state.phase !== 'done') return;
    state.bet = Math.min(500, state.bet * 2);
    paintBetUI();
  });

  paintBetUI();
  setControlsEnabled(false);
})();
