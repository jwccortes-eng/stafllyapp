const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    // TODO: Verify Stripe webhook signature
    // const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    // const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    // const event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);

    if (!signature) {
      console.warn("[billing-webhook] Missing stripe-signature header");
    }

    // Basic validation: ensure body is valid JSON
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventType = payload?.type ?? "unknown";

    console.log(`[billing-webhook] Received event: ${eventType}`, {
      id: payload?.id,
      timestamp: new Date().toISOString(),
    });

    // TODO: Handle real Stripe events
    // switch (event.type) {
    //   case "checkout.session.completed":
    //     // Create/update subscription record
    //     break;
    //   case "customer.subscription.updated":
    //     // Update subscription status
    //     break;
    //   case "customer.subscription.deleted":
    //     // Mark subscription as canceled
    //     break;
    //   case "invoice.payment_failed":
    //     // Mark subscription as past_due
    //     break;
    // }

    return new Response(
      JSON.stringify({ received: true, stub: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[billing-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
