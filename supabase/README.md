# BJAssist payments backend

Supabase project: `bjassist` (ref `xlstduhdanyfqnbiziym`, org `kssdcwxturgxzlfntaqw`, region `us-east-1`).

## Deployed Edge Functions

- `create-checkout` — https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/create-checkout
  Creates a Dodo Payments checkout session for product `pdt_0NiXK7A6ZVxXJuIJasQqB` and
  returns `{ checkout_url }`. Called by the website and the extension. Public (no JWT),
  but hardened: CORS is allowlisted to `bjassist.com`/`www.bjassist.com` and
  `chrome-extension://*` origins (403 otherwise), there's a best-effort per-IP rate
  limit (5/min, in-memory per isolate), and Dodo error bodies are logged server-side
  only, never echoed to callers. Because of the CORS allowlist, the extension calls
  this ONLY via its background service worker (see `extension/background.js`) —
  content-script fetches would carry the casino page's origin and get 403.
- `dodo-webhook` — https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/dodo-webhook
  Verifies the Dodo Standard-Webhooks signature and logs events to `webhook_events` /
  `purchases` for our own records. **Not** on the entitlement-checking path — the
  extension validates license keys directly against Dodo's public API instead.

Redeploy after editing either `supabase/functions/*/index.ts` with the Supabase MCP
`deploy_edge_function` tool, or via the CLI: `supabase functions deploy <name> --project-ref xlstduhdanyfqnbiziym`.

## Required secrets (set in Dashboard → Project Settings → Edge Functions → Secrets,
or via `supabase secrets set --project-ref xlstduhdanyfqnbiziym KEY=value`)

| Secret | Value | Notes |
|---|---|---|
| `DODO_API_KEY` | (the Dodo secret API key) | Never put this in client code. |
| `DODO_WEBHOOK_KEY` | (Dodo webhook signing secret, `whsec_...`) | From the Dodo dashboard's webhook endpoint settings. Set and confirmed working — signed events are landing in `webhook_events`. |
| `DODO_API_BASE` | `https://live.dodopayments.com` | Set to `https://test.dodopayments.com` while testing. |
| `DODO_RETURN_URL` | `https://bjassist.com/thank-you.html` | Where Dodo redirects after checkout. |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform.

## Database (see migration `create_dodo_payment_records`)

- `webhook_events(dodo_event_id unique, type, payload jsonb, received_at)` — idempotency/audit log.
- `purchases(email, dodo_customer_id, dodo_subscription_id, event_type, status, raw jsonb, created_at)` —
  a record of what happened, for support/debugging. Not used for gating.

RLS is enabled with no policies, so only the service-role key (used inside the
Edge Functions) can read/write these tables.

## Bonuses table (see migration `create_bonuses_table`)

`bonuses(source_id unique, casino, cadence, code, title, value_display, requirement,
link_url, posted_at)` feeds the extension popup's **Bonuses** tab. RLS allows
anon **SELECT only** — the extension reads it directly via PostgREST with the
publishable key (`sb_publishable_...`, hardcoded in `extension/src/popup.js`);
writes need the service role (dashboard / SQL editor / MCP).

Seeded 2026-07-08 with the 10 newest weekly + monthly bonuses for stake.com and
stake.us from `https://stakecruncher.com/faucet-api/stake-bonuses?casino=all&cadence=all&limit=300`
(`source_id` = their `id`, so re-imports dedupe via `on conflict do nothing`).

To add a bonus later, run in the SQL editor:

```sql
insert into public.bonuses (casino, cadence, code, title, value_display, link_url, posted_at)
values ('stake.com', 'weekly', 'TheCode', 'Title shown in the popup', '$75000',
        'https://stake.com/?bonus=TheCode', now());
```

The popup shows each casino's rows grouped by cadence, newest first (limit 60).
It client-side-filters out rows whose title/code matches
`giveaway|raffle|winners|challenge` (only official recurring bonuses are shown)
and dedupes repeated codes. The initial import included some of those noise
rows; to also clean them out of the table, run:

```sql
delete from public.bonuses
where title ~* '(giveaway|raffle|winners|challenge)'
   or code ~* '(giveaway|raffle|winners|challenge)';
```

## Dodo dashboard setup — status

- ✅ **License Key entitlement** (`ent_0NifEUpUyCUoL9hgjwoDE`, auto fulfillment, **1
  activation per key** — lowered from 3 on 2026-07-08, existing key updated too) is
  attached to the BJAssist product. Any successful payment auto-generates and emails
  a license key. Note the support tradeoff: a customer who reinstalls or switches
  browsers without "Remove license from this device" first will hit the activation
  cap and need their key's instance freed (Dodo dashboard → license key instances).
- ✅ **Webhook endpoint** is `https://bjassist.com/api/webhooks/dodo`, proxied via
  the `website/vercel.json` rewrite straight through to the `dodo-webhook`
  function above (no separate server needed at that path).
- ✅ **`DODO_WEBHOOK_KEY`** is set and verified working.
- ⚠️ **Product's subscription period was misconfigured** (20 years instead of 1
  month) at some point after initial setup and has been fixed via API — if the
  product is ever edited again in the dashboard, double-check
  `subscription_period_interval`/`subscription_period_count` match
  `payment_frequency_interval`/`payment_frequency_count` (both should be
  `Month`/`1`).
- ⚠️ **Live payments have been failing** with a generic `error_code: "UNKNOWN_ERROR"`
  on UPI Intent attempts specifically — not something diagnosable from this repo
  or the API; needs Dodo support looking at the underlying processor/bank logs
  for the affected `payment_id`s if it keeps happening.
