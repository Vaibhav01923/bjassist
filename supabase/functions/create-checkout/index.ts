// Supabase Edge Function: create-checkout
// Creates a Dodo Payments checkout session for the BJAssist subscription and
// returns a hosted checkout URL. Never exposes the Dodo secret key to the caller.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PRODUCT_ID = "pdt_0NiXK7A6ZVxXJuIJasQqB";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const apiKey = Deno.env.get("DODO_API_KEY");
  const apiBase = Deno.env.get("DODO_API_BASE") || "https://live.dodopayments.com";
  const returnUrl = Deno.env.get("DODO_RETURN_URL") || "https://bjassist.com/thank-you.html";

  if (!apiKey) {
    console.error("create-checkout: DODO_API_KEY is not set");
    return json({ error: "server_misconfigured" }, 500);
  }

  let body: { email?: string; source?: string } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined;
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
    return json({ error: "upstream_unreachable" }, 502);
  }

  const data = await dodoRes.json().catch(() => null);
  if (!dodoRes.ok || !data) {
    console.error("create-checkout: Dodo returned", dodoRes.status, data);
    return json({ error: "checkout_failed", detail: data }, 502);
  }

  if (!data.checkout_url) {
    console.error("create-checkout: no checkout_url in Dodo response", data);
    return json({ error: "no_checkout_url" }, 502);
  }

  return json({ checkout_url: data.checkout_url, session_id: data.session_id });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
