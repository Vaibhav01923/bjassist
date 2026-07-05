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
| `DODO_WEBHOOK_KEY` | (Dodo webhook signing secret, `whsec_...`) | From the Dodo dashboard's webhook endpoint settings. Not yet set — `dodo-webhook` fails closed (500) until it is. |
| `DODO_API_BASE` | `https://live.dodopayments.com` | Set to `https://test.dodopayments.com` while testing. |
| `DODO_RETURN_URL` | `https://bjassist.com/thank-you.html` | Where Dodo redirects after checkout. |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform.

## Database (see migration `create_dodo_payment_records`)

- `webhook_events(dodo_event_id unique, type, payload jsonb, received_at)` — idempotency/audit log.
- `purchases(email, dodo_customer_id, dodo_subscription_id, event_type, status, raw jsonb, created_at)` —
  a record of what happened, for support/debugging. Not used for gating.

RLS is enabled with no policies, so only the service-role key (used inside the
Edge Functions) can read/write these tables.

## One-time setup still needed in the Dodo dashboard

1. Enable a **License Key** entitlement on the BJAssist product
   (Product → Advanced Settings → Entitlements & Credits). This is what makes Dodo
   auto-generate and email a license key on successful payment.
2. Point the webhook endpoint at `https://xlstduhdanyfqnbiziym.supabase.co/functions/v1/dodo-webhook`
   (bjassist.com has no server yet to receive it at `/api/webhooks/dodo`).
3. Copy the webhook signing secret into `DODO_WEBHOOK_KEY` above.
