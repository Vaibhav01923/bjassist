/*
 * Per-site DOM configuration for auto-reading the blackjack table.
 *
 * IMPORTANT / HONEST NOTE:
 * Every casino renders its blackjack table with different HTML, and those
 * sites change their markup often. The selectors below are STARTING POINTS,
 * not guaranteed to match any live site today. You will almost certainly need
 * to open the game, inspect it with DevTools (right-click a card -> Inspect),
 * and update the selectors here. See README.md -> "Calibrating a site".
 *
 * If auto-detect finds nothing, the overlay falls back to a "no table found"
 * state and you can still use the popup's manual calculator, which always works.
 *
 * Each config provides selectors and a parser that returns:
 *   { playerCards: [ranks], dealerUpcard: rank }
 * Card ranks are strings: "A","2".."10","J","Q","K".
 */
(function (root) {
  'use strict';

  // Pull a rank out of an element's text/attributes using common patterns.
  function rankFromEl(el) {
    if (!el) return null;
    var txt = (el.getAttribute && (el.getAttribute('data-rank') || el.getAttribute('data-value') || el.getAttribute('aria-label'))) || el.textContent || '';
    txt = String(txt).trim().toUpperCase();
    // Match a leading rank token like "A", "10", "K", optionally "10♠", "AS".
    var m = txt.match(/\b(10|[2-9]|[AKQJT])\b/);
    if (!m) return null;
    var r = m[1];
    if (r === 'T') r = '10';
    return r;
  }

  function collectRanks(nodeList) {
    var out = [];
    for (var i = 0; i < nodeList.length; i++) {
      var r = rankFromEl(nodeList[i]);
      if (r) out.push(r);
    }
    return out;
  }

  // Generic best-effort parser driven by CSS selectors.
  function selectorParser(cfg) {
    return function () {
      var root = cfg.tableSelector ? document.querySelector(cfg.tableSelector) : document;
      if (!root) return null;
      var playerEls = root.querySelectorAll(cfg.playerCardSelector);
      var dealerEls = root.querySelectorAll(cfg.dealerCardSelector);
      var playerCards = collectRanks(playerEls);
      var dealerRanks = collectRanks(dealerEls);
      if (!playerCards.length || !dealerRanks.length) return null;
      // Dealer upcard = first visible dealer card.
      return { playerCards: playerCards, dealerUpcard: dealerRanks[0] };
    };
  }

  // Strict rank normalizer for Stake's card faces (exact single-token text).
  function normRank(s) {
    s = (s || '').trim().toUpperCase();
    if (s === 'T') return '10';
    return ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].indexOf(s) > -1 ? s : null;
  }

  /*
   * Purpose-built parser for Stake's blackjack table (stake.us and mirrors).
   * DOM shape (as of build): the hand containers carry stable test ids
   *   [data-testid="dealer"] and [data-testid="player"]; each card is
   *   [data-testid="card-N"] and its rank sits in `.face-content span`.
   *   The dealer's face-down hole card contains a `.face-down` node with an
   *   empty span, so we skip any card that has one (and any empty face).
   */
  function readStakeCards(scope) {
    var out = [];
    var cards = scope.querySelectorAll('[data-testid^="card-"]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.querySelector('.face-down')) continue;         // hole card / not yet revealed
      var span = card.querySelector('.face-content span');
      if (!span) continue;                                    // empty face
      var r = normRank(span.textContent);
      if (r) out.push(r);
    }
    return out;
  }

  function stakeParser() {
    var dealer = document.querySelector('[data-testid="dealer"]');
    var player = document.querySelector('[data-testid="player"]');
    if (!dealer || !player) return null;

    var dealerCards = readStakeCards(dealer);
    // Active hand = first .hand-wrap (covers the common, non-split case).
    var handWrap = player.querySelector('.hand-wrap') || player;
    var playerCards = readStakeCards(handWrap);

    if (dealerCards.length < 1 || playerCards.length < 2) return null;
    return { playerCards: playerCards, dealerUpcard: dealerCards[0] };
  }

  var configs = [
    {
      id: 'stake',
      label: 'Stake',
      // Matches stake.us, stake.com, stake.games, stake.bet, etc. Some Stake
      // mirror domains won't match by name; the generic fallback still applies.
      match: /(^|\.)stake\.[a-z]{2,}$/i,
      parser: stakeParser
    },
    {
      id: 'shuffle',
      label: 'Shuffle',
      match: /(^|\.)shuffle\.(us|com)$/i,
      tableSelector: 'main, #root',
      playerCardSelector: '[class*="player"] [class*="card"]',
      dealerCardSelector: '[class*="dealer"] [class*="card"]',
      parser: null
    }
  ];

  // Attach the default selector-based parser where a custom one isn't set.
  configs.forEach(function (c) { if (!c.parser) c.parser = selectorParser(c); });

  // Generic fallback: scan the whole page for two clusters of card-like
  // elements. Heuristic and imperfect — real use should calibrate a config.
  function genericParser() {
    var candidates = document.querySelectorAll(
      '[class*="card"],[data-test*="card"],[data-rank],[class*="Card"]'
    );
    if (candidates.length < 3) return null;
    var groups = {};
    candidates.forEach(function (el) {
      var container = el.closest('[class*="player"],[class*="dealer"],[data-test*="player"],[data-test*="dealer"]');
      var key = 'other';
      if (container) {
        var cls = (container.className + ' ' + (container.getAttribute('data-test') || '')).toLowerCase();
        if (cls.indexOf('dealer') > -1) key = 'dealer';
        else if (cls.indexOf('player') > -1) key = 'player';
      }
      (groups[key] = groups[key] || []).push(el);
    });
    if (!groups.player || !groups.dealer) return null;
    var playerCards = collectRanks(groups.player);
    var dealerRanks = collectRanks(groups.dealer);
    if (!playerCards.length || !dealerRanks.length) return null;
    return { playerCards: playerCards, dealerUpcard: dealerRanks[0] };
  }

  function forHost(host) {
    host = (host || '').toLowerCase();
    for (var i = 0; i < configs.length; i++) {
      if (configs[i].match.test(host)) return configs[i];
    }
    return null;
  }

  root.BJSiteConfigs = {
    configs: configs,
    forHost: forHost,
    genericParser: genericParser,
    rankFromEl: rankFromEl
  };
})(typeof window !== 'undefined' ? window : this);
