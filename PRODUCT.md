# Product

## Register

product

## Users

Players using online (sweepstakes/social) blackjack sites who want mathematically
correct basic-strategy advice while they play. They're mid-session, attention split
between the actual casino table and the extension — glances, not reading. A smaller
segment uses the manual calculator standalone, off any casino page, to drill/learn
the chart. Post-purchase, the same user is in a distinct, narrow moment: they just
paid, got an email with a license key, and need to get it into the extension with
zero ambiguity about where that happens.

## Product Purpose

BJAssist reads the cards already visible on a blackjack table and shows the
optimal play (hit/stand/double/split/surrender) in a small on-page overlay. It
never clicks anything — advice only, the player decides. Free for one hand per
install; a $14.99/mo subscription unlocks it beyond that. Success = a paying user
can go from "I just got a license key email" to "unlocked and getting suggestions"
in one obvious path, without hunting through settings.

## Brand Personality

Direct, honest, no-nonsense. The existing copy sets the tone deliberately: "This
does not beat the house," "Card counting is out of scope," "read-only, you decide"
— it actively undercuts hype rather than selling harder. Extend that same
plain-spokenness to transactional moments: post-payment copy should say exactly
what happened and exactly what to do next, not celebrate ("Woohoo!") or oversell.
Confidence comes from clarity, not enthusiasm.

## Anti-references

- Scammy/hustler casino-tool aesthetics (neon, countdown urgency timers, fake
  scarcity, "VIP" language).
- Dark patterns: hiding cancellation, burying the license-entry field, confirm-
  shaming.
- Generic SaaS-onboarding cheerfulness (confetti, "You're all set! 🎉") that
  doesn't fit a tool this matter-of-fact everywhere else.
- Anything that makes the free-hand-then-paywall moment feel like a bait-and-
  switch rather than a plainly stated limit.

## Design Principles

- Say the thing plainly; don't dress up a limit or a step as good news.
- The next action is always visible, not filed under Settings, especially at
  moments of highest intent (right after paying).
- One overlay/UI convention family across popup, options, and on-page badge —
  a user shouldn't have to relearn the interface between them.
- Never claim or imply the tool changes the odds — advice-only framing holds
  even in UI microcopy, tooltips, and error states.

## Accessibility & Inclusion

No stated formal requirement (WCAG level unconfirmed) — default to solid
keyboard operability and color-contrast on the dark navy/blue palette already
in use (verify text against `#0f172a`/`#020617` panel backgrounds), since the
existing overlay and popup are small, high-density surfaces where low contrast
would hurt readability most.
