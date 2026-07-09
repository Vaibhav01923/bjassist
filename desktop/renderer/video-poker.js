/*
 * BJVideoPoker — exact-EV Jacks or Better advisor.
 *
 * For a dealt 5-card hand it evaluates ALL 32 possible hold combinations by
 * enumerating every draw from the 47 unseen cards (~2.6M hand evaluations),
 * so the expected values and probabilities shown are exact, not heuristic.
 *
 * Loaded in two places:
 *  - the background service worker (importScripts) where the heavy solve runs
 *  - the content script, for the Stake DOM parser + display helpers (and as a
 *    local fallback solver if messaging is unavailable)
 *
 * Read-only like everything else in BJAssist: it never clicks or holds cards
 * for you — it only reads what's on screen and reports the odds.
 */
(function (root) {
  'use strict';

  // rank index 0..12 = 2..9,10,J,Q,K,A ; card int = suit*13 + rank
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var SUITS = ['♣', '♦', '♥', '♠'];

  // Stake Jacks or Better paytable (multiple of bet returned), read off the
  // live game: royal 800, straight flush 60, quads 22, full house 9, flush 6,
  // straight 4, trips 3, two pair 2, jacks-or-better 1.
  var PAYS = [0, 1, 2, 3, 4, 6, 9, 22, 60, 800];
  var CATS = [
    'Nothing', 'Jacks or better', 'Two pair', 'Three of a kind', 'Straight',
    'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'
  ];

  function cardLabel(c) { return RANKS[c % 13] + SUITS[(c / 13) | 0]; }
  function isRed(c) { var s = (c / 13) | 0; return s === 1 || s === 2; } // ♦ ♥

  // Reused rank-count scratchpad; category() always leaves it zeroed again.
  var cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  // Hand category (index into PAYS/CATS) for five card ints.
  function category(a, b, c, d, e) {
    var r0 = a % 13, r1 = b % 13, r2 = c % 13, r3 = d % 13, r4 = e % 13;
    cnt[r0]++; cnt[r1]++; cnt[r2]++; cnt[r3]++; cnt[r4]++;

    var pairs = 0, trips = false, quads = false, highPair = false, distinct = 0, v;
    v = cnt[r0]; if (v) { cnt[r0] = 0; distinct++; if (v === 4) quads = true; else if (v === 3) trips = true; else if (v === 2) { pairs++; if (r0 >= 9) highPair = true; } }
    v = cnt[r1]; if (v) { cnt[r1] = 0; distinct++; if (v === 4) quads = true; else if (v === 3) trips = true; else if (v === 2) { pairs++; if (r1 >= 9) highPair = true; } }
    v = cnt[r2]; if (v) { cnt[r2] = 0; distinct++; if (v === 4) quads = true; else if (v === 3) trips = true; else if (v === 2) { pairs++; if (r2 >= 9) highPair = true; } }
    v = cnt[r3]; if (v) { cnt[r3] = 0; distinct++; if (v === 4) quads = true; else if (v === 3) trips = true; else if (v === 2) { pairs++; if (r3 >= 9) highPair = true; } }
    v = cnt[r4]; if (v) { cnt[r4] = 0; distinct++; if (v === 4) quads = true; else if (v === 3) trips = true; else if (v === 2) { pairs++; if (r4 >= 9) highPair = true; } }

    if (distinct === 5) {
      var s0 = (a / 13) | 0;
      var flush = s0 === ((b / 13) | 0) && s0 === ((c / 13) | 0) && s0 === ((d / 13) | 0) && s0 === ((e / 13) | 0);
      var bits = (1 << r0) | (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4);
      var straight = false, royal = false;
      if (bits === 0x1F00) { straight = true; royal = true; }        // 10 J Q K A
      else if ((bits & 0x100F) === 0x100F) { straight = true; }      // A 2 3 4 5 (wheel)
      else {
        var m = bits;
        while ((m & 1) === 0) m >>= 1;
        if (m === 0x1F) straight = true;                             // 5 consecutive ranks
      }
      if (straight && flush) return royal ? 9 : 8;
      if (flush) return 5;
      if (straight) return 4;
      return 0;
    }
    if (quads) return 7;
    if (trips && pairs === 1) return 6;
    if (trips) return 3;
    if (pairs === 2) return 2;
    if (pairs === 1 && highPair) return 1;
    return 0;
  }

  // Exact stats for every hold mask. hand = array of 5 card ints.
  function solve(hand) {
    var deck = [];
    var i, j, k, l, m;
    for (i = 0; i < 52; i++) if (hand.indexOf(i) === -1) deck.push(i);
    var n = deck.length; // 47

    var out = [];
    for (var mask = 0; mask < 32; mask++) {
      var held = [];
      for (i = 0; i < 5; i++) if (mask & (1 << i)) held.push(hand[i]);
      var h0 = held[0], h1 = held[1], h2 = held[2], h3 = held[3];
      var cats = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      switch (held.length) {
        case 5:
          cats[category(h0, h1, h2, h3, held[4])]++;
          break;
        case 4:
          for (i = 0; i < n; i++) cats[category(h0, h1, h2, h3, deck[i])]++;
          break;
        case 3:
          for (i = 0; i < n; i++) for (j = i + 1; j < n; j++)
            cats[category(h0, h1, h2, deck[i], deck[j])]++;
          break;
        case 2:
          for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++)
            cats[category(h0, h1, deck[i], deck[j], deck[k])]++;
          break;
        case 1:
          for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++) for (l = k + 1; l < n; l++)
            cats[category(h0, deck[i], deck[j], deck[k], deck[l])]++;
          break;
        case 0:
          for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++) for (l = k + 1; l < n; l++) for (m = l + 1; m < n; m++)
            cats[category(deck[i], deck[j], deck[k], deck[l], deck[m])]++;
          break;
      }

      var total = 0, ev = 0, winP = 0;
      for (i = 0; i <= 9; i++) {
        total += cats[i];
        ev += cats[i] * PAYS[i];
        if (i >= 1) winP += cats[i];
      }
      out.push({
        mask: mask,
        ev: ev / total,
        winProb: winP / total,
        royalProb: cats[9] / total,
        bigProb: (cats[8] + cats[9]) / total,   // straight flush or royal
        quadProb: cats[7] / total
      });
    }
    return out;
  }

  function decorate(hand, r, kind) {
    var holdIdx = [], holdCards = [];
    for (var i = 0; i < 5; i++) {
      if (r.mask & (1 << i)) { holdIdx.push(i); holdCards.push(hand[i]); }
    }
    return {
      kind: kind,
      mask: r.mask,
      holdIdx: holdIdx,       // 0-based positions on screen
      holdCards: holdCards,   // card ints, for labels/colors
      ev: r.ev,
      winProb: r.winProb,
      royalProb: r.royalProb,
      bigProb: r.bigProb,
      quadProb: r.quadProb
    };
  }

  /*
   * Advice = up to three options:
   *  - best:  highest EV (the mathematically correct play — recommended)
   *  - safe:  wins most often, shown when it beats the best play's hit rate
   *           by ≥3 points without giving up more than ~45% of the value
   *  - risky: the most credible royal / straight-flush chase, shown when it
   *           has a genuinely better jackpot chance and isn't value suicide
   */
  function advise(hand) {
    var res = solve(hand);
    res.sort(function (a, b) { return b.ev - a.ev; });
    var best = res[0];
    var options = [decorate(hand, best, 'best')];

    var safest = null;
    for (var i = 0; i < res.length; i++) {
      if (!safest || res[i].winProb > safest.winProb) safest = res[i];
    }
    // A guaranteed payout (winProb 1, e.g. a made flush the best play breaks)
    // is always worth showing, even at a bigger EV sacrifice.
    if (safest.mask !== best.mask &&
        safest.winProb >= best.winProb + 0.03 &&
        (safest.ev >= best.ev * 0.55 ||
         (safest.winProb === 1 && safest.ev >= best.ev * 0.25))) {
      options.push(decorate(hand, safest, 'safe'));
    }

    var shot = null;
    for (i = 0; i < res.length; i++) {
      var r = res[i];
      if (r.mask === best.mask) continue;
      if (options.length > 1 && r.mask === options[1].mask) continue;
      // Must be a real chase (≥ a 3-to-royal's ~0.09% jackpot odds over the
      // best play), not a technicality like a lone-card 0.01% "chance".
      if (r.bigProb < best.bigProb + 0.0008) continue;
      if (r.ev < best.ev * 0.45) continue;
      if (!shot || r.bigProb > shot.bigProb || (r.bigProb === shot.bigProb && r.ev > shot.ev)) shot = r;
    }
    if (shot) options.push(decorate(hand, shot, 'risky'));

    return { game: 'jacks-or-better', options: options };
  }

  /*
   * Stake video poker DOM parser. Matches the structure of stake.com/.us
   * video poker (as of this build): .player-hand holds five
   * [data-testid="card-N"] cards; each face shows the rank in
   * `.face-content span` and the suit as an svg[data-ds-icon="Suit*"].
   * data-test-action-enabled="true" means the hold/draw decision is open.
   */
  var SUIT_FROM_ICON = { SuitClub: 0, SuitDiamond: 1, SuitHeart: 2, SuitSpade: 3 };

  function parseStake(doc) {
    var wrap = (doc || document).querySelector('.player-hand');
    if (!wrap) return null;
    var els = wrap.querySelectorAll('[data-testid^="card-"]');
    if (els.length !== 5) return null;

    var cards = [], actionable = true;
    for (var i = 0; i < 5; i++) {
      var el = els[i];
      var span = el.querySelector('.face-content span');
      var svg = el.querySelector('.face-content svg[data-ds-icon]');
      if (!span || !svg) return null;                    // face-down / mid-deal
      var t = (span.textContent || '').trim().toUpperCase();
      if (t === 'T') t = '10';
      var rank = RANKS.indexOf(t);
      var suit = SUIT_FROM_ICON[svg.getAttribute('data-ds-icon')];
      if (rank < 0 || suit === undefined) return null;
      cards.push(suit * 13 + rank);
      if (el.getAttribute('data-test-action-enabled') !== 'true') actionable = false;
    }
    // A real deal never repeats a card; duplicates mean we misread the DOM.
    for (i = 0; i < 5; i++) {
      for (var j = i + 1; j < 5; j++) if (cards[i] === cards[j]) return null;
    }
    return { cards: cards, actionable: actionable };
  }

  root.BJVideoPoker = {
    solve: solve,
    advise: advise,
    parseStake: parseStake,
    category: category,
    cardLabel: cardLabel,
    isRed: isRed,
    PAYS: PAYS,
    CATS: CATS,
    RANKS: RANKS,
    SUITS: SUITS
  };
})(typeof window !== 'undefined' ? window : this);
