# BJAssist

A read-only blackjack **basic-strategy** assistant and trainer. It computes the
mathematically optimal play for any hand (hit / stand / double / split /
surrender) and either shows it in a popup calculator or as a small on-page badge.

It **never plays for you** — it reads card values already visible on screen and
displays advice. Every decision and every click stays yours.

## What's in here

```
extension/          Chrome extension (Manifest V3)
  manifest.json
  src/
    strategy.js       Pure basic-strategy engine (also unit-testable in Node)
    site-configs.js   Per-site DOM selectors for auto-reading a table
    license.js        Free-hand + license gating (talks to Dodo's public license API)
    content.js        Reads the page + renders the suggestion overlay
    popup.html/.js/.css   Manual calculator + settings
    options.html/.js/.css Settings + license management
    overlay.css       Floating badge styles
  icons/            Extension icons (16/48/128)
website/            Marketing site with a live in-browser demo
supabase/functions/ Edge functions backing checkout + the Dodo webhook
```

## Pricing & licensing

BJAssist is a single $14.99/mo subscription (Dodo Payments, product `pdt_0NiXK7A6ZVxXJuIJasQqB`).
The **manual calculator is always free** — it never reads a casino page. The
**on-page auto-read overlay** is free for exactly one hand per install, then
requires an active license.

- Checkout is created server-side by the `create-checkout` Supabase Edge
  Function (needs the Dodo secret key — never shipped in the extension or site).
- On successful payment, Dodo's built-in **License Keys** feature issues and
  emails a license key automatically (must be enabled on the product under
  *Advanced Settings → Entitlements & Credits* in the Dodo dashboard).
- The extension activates/validates that key directly against Dodo's public
  `/licenses/activate` and `/licenses/validate` endpoints (`extension/src/license.js`)
  — no backend needed for entitlement checks.
- The `dodo-webhook` Edge Function just logs webhook events for our own
  records (audit trail); it is not on the entitlement-checking path.

See `supabase/functions/*/index.ts` for the deployed backend code.

## Install the extension (developer mode)

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Pin BJAssist and click it to open the manual calculator.

The **popup calculator works immediately** on any page — pick your cards and the
dealer's upcard to see the optimal play. No casino, no configuration.

## The honest part

- **This does not beat the house.** Perfect basic strategy lowers the house edge
  to ~0.5%; the casino still wins slightly over the long run. Anything promising
  guaranteed profit is lying.
- **Card counting is out of scope** and doesn't work on online RNG blackjack
  (the shoe reshuffles every hand).
- **On-page suggestions and casino Terms of Service.** Many casinos restrict
  third-party software / on-screen assistants. Using the auto-read overlay on a
  given site is your call and your risk — read that site's terms. The manual
  calculator never reads any casino page, so it avoids the question entirely.

## Auto-read: Stake works out of the box

**Stake (stake.us and its mirror domains) is pre-calibrated.** The overlay reads
the live table automatically — no setup. It targets Stake's stable
`[data-testid="dealer"]` / `[data-testid="player"]` containers and reads each
card's rank from `.face-content span`, skipping the dealer's face-down hole card.
The content script runs in all frames, so it works whether the game is in the
page or an iframe. If Stake changes its markup, update `stakeParser()` in
`src/site-configs.js`.

## Calibrating another site (auto-read overlay)

Every casino renders cards with different HTML and changes it often, so the
selectors for other sites in `src/site-configs.js` are **starting points, not
guarantees**. To make auto-detection work on a new site:

1. Open the blackjack game and start a hand.
2. Right-click one of **your** cards → **Inspect**. Note a CSS selector that
   uniquely identifies player-card elements (a class or `data-*` attribute).
3. Do the same for a **dealer** card.
4. Edit the matching config in `src/site-configs.js`:
   - `match`: a regex for the site's hostname
   - `tableSelector`: a container around the whole table (optional)
   - `playerCardSelector` / `dealerCardSelector`: your selectors from steps 2–3
5. Reload the extension on `chrome://extensions`, then reload the game page.

The parser reads a rank from each matched element's text or `data-rank` /
`data-value` / `aria-label`. If it can't find a table it shows a "no table
detected" state and you fall back to the popup calculator.

## Testing the engine

```bash
node -e 'const S=require("./extension/src/strategy.js");
console.log(S.getBestPlay(["A","7"],"9").action);'  // HIT
```

## License / disclaimer

For education and entertainment. Not affiliated with any casino. No guarantee of
winnings. Gamble responsibly; 21+ where applicable.
