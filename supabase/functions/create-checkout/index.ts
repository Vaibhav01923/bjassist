// Supabase Edge Function: create-checkout
// Creates a Dodo Payments checkout session for the BJAssist subscription and
// returns a hosted checkout URL. Never exposes the Dodo secret key to the caller.
//
// Hardening:
//  - CORS is limited to bjassist.com and the extension's own origin. The
//    extension routes this call through its background service worker, so
//    casino-page content scripts never hit this endpoint directly.
//  - Best-effort per-IP rate limit (per isolate) against checkout-session spam.
//  - Upstream (Dodo) error bodies are logged server-side, never echoed to callers.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PRODUCT_ID = "pdt_0NiXK7A6ZVxXJuIJasQqB";

const ALLOWED_WEB_ORIGINS = new Set([
  "https://bjassist.com",
  "https://www.bjassist.com",
]);

const CORS_BASE: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

// Returns the CORS headers for an allowed caller, {} for non-browser callers
// (no Origin header — CORS doesn't apply), or null for a disallowed browser origin.
function corsFor(origin: string | null): Record<string, string> | null {
  if (!origin) return {};
  if (ALLOWED_WEB_ORIGINS.has(origin) || origin.startsWith("chrome-extension://")) {
    return { ...CORS_BASE, "Access-Control-Allow-Origin": origin };
  }
  return null;
}

// Best-effort sliding-window rate limit, in-memory per isolate. Resets on cold
// start, which is acceptable: the goal is blunting browser/script spam, not
// stopping a determined distributed attacker.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  if (hits.size > 10_000) hits.clear(); // crude memory cap
  hits.set(ip, recent);
  return false;
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("origin"));
  if (cors === null) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return json({ error: "rate_limited" }, 429, cors);
  }

  const apiKey = Deno.env.get("DODO_API_KEY");
  const apiBase = Deno.env.get("DODO_API_BASE") || "https://live.dodopayments.com";
  const returnUrl = Deno.env.get("DODO_RETURN_URL") || "https://bjassist.com/thank-you.html";

  if (!apiKey) {
    console.error("create-checkout: DODO_API_KEY is not set");
    return json({ error: "server_misconfigured" }, 500, cors);
  }

  let body: { email?: string; source?: string } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const email =
    typeof body.email === "string" && body.email.trim() && body.email.length <= 254
      ? body.email.trim()
      : undefined;
  const source = typeof body.source === "string" ? body.source.slice(0, 40) : "unknown";

  const payload: Record<string, unknown> = {
    product_cart: [{ product_id: PRODUCT_ID, quantity: 1 }],
    return_url: returnUrl,
    metadata: { source },
    // Dodo's own docs recommend always including credit/debit as a fallback —
    // without this, checkout can default to UPI-only for Indian customers,
    // which requires manually approving in a UPI app within a short window.
    allowed_payment_method_types: ["credit", "debit", "upi_collect", "upi_intent"],
  };
  if (email) payload.customer = { email };

  let dodoRes: Response;
  try {
    dodoRes = await fetch(`${apiBase}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("create-checkout: fetch to Dodo failed", err);
    return json({ error: "upstream_unreachable" }, 502, cors);
  }

  const data = await dodoRes.json().catch(() => null);
  if (!dodoRes.ok || !data) {
    // Log the upstream detail for ourselves; never echo it to the caller.
    console.error("create-checkout: Dodo returned", dodoRes.status, data);
    return json({ error: "checkout_failed" }, 502, cors);
  }

  if (!data.checkout_url) {
    console.error("create-checkout: no checkout_url in Dodo response", data);
    return json({ error: "no_checkout_url" }, 502, cors);
  }

  return json({ checkout_url: data.checkout_url, session_id: data.session_id }, 200, cors);
});

function json(obj: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
