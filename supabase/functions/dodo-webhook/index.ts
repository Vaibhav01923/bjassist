// Supabase Edge Function: dodo-webhook
// Receives Dodo Payments webhook events, verifies the Standard Webhooks
// signature, and logs them for our own records. Entitlement checks in the
// extension do NOT depend on this function (they call Dodo's public
// /licenses/validate directly) -- this is purely an audit trail.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOLERANCE_SECONDS = 5 * 60;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("DODO_WEBHOOK_KEY");
  if (!secret) {
    console.error("dodo-webhook: DODO_WEBHOOK_KEY is not set; refusing to process");
    return new Response("server misconfigured", { status: 500 });
  }

  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");
  const rawBody = await req.text();

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return new Response("missing signature headers", { status: 400 });
  }

  const ts = parseInt(webhookTimestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    return new Response("timestamp out of tolerance", { status: 400 });
  }

  const valid = await verifySignature(secret, webhookId, webhookTimestamp, rawBody, webhookSignature);
  if (!valid) {
    console.error("dodo-webhook: signature verification failed");
    return new Response("invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error: logError } = await supabase
    .from("webhook_events")
    .upsert(
      { dodo_event_id: webhookId, type: event.type ?? "unknown", payload: event },
      { onConflict: "dodo_event_id", ignoreDuplicates: true }
    );
  if (logError) console.error("dodo-webhook: failed to log event", logError);

  const data = event.data ?? {};
  const customer = data.customer ?? {};
  const { error: purchaseError } = await supabase.from("purchases").insert({
    email: customer.email ?? null,
    dodo_customer_id: customer.customer_id ?? null,
    dodo_subscription_id: data.subscription_id ?? null,
    event_type: event.type ?? "unknown",
    status: data.status ?? null,
    raw: event,
  });
  if (purchaseError) console.error("dodo-webhook: failed to record purchase", purchaseError);

  return new Response("ok", { status: 200 });
});

async function verifySignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string
): Promise<boolean> {
  const secretBytes = base64Decode(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedContent = `${id}.${timestamp}.${body}`;
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expected = base64Encode(new Uint8Array(sigBytes));

  const candidates = signatureHeader.split(" ").map((part) => {
    const idx = part.indexOf(",");
    return idx === -1 ? part : part.slice(idx + 1);
  });

  return candidates.some((c) => timingSafeEqual(c, expected));
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
