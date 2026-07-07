# BJAssist payments backend

Supabase project: `bjassist` (ref `xlstduhdanyfqnbiziym`, org `kssdcwxturgxzlfntaqw`, region `us-east-1`).

## Deployed Edge Functions

- `create-checkout` — https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/create-checkout
  Creates a Dodo Payments checkout session for product `pdt_0NiXK7A6ZVxXJuIJasQqB` and
  returns `{ checkout_url }`. Called by the website and the extension. Public (no JWT).
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

## Dodo dashboard setup — status

- ✅ **License Key entitlement** (`ent_0NifEUpUyCUoL9hgjwoDE`, auto fulfillment, 3
  activations) is attached to the BJAssist product. Any successful payment now
  auto-generates and emails a license key.
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
