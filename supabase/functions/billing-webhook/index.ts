import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const PLAN_MAP: Record<string, string> = {
  "price_1T5C9xK7PYTRtWks5cRmmPtJ": "pro",
  "price_1T5CAJK7PYTRtWksY7nUGqB5": "enterprise",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey) {
    console.error("[billing-webhook] STRIPE_SECRET_KEY not configured");
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.text();
    let event: Stripe.Event;

    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) {
        return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      // Fallback: no signature verification (dev mode)
      console.warn("[billing-webhook] STRIPE_WEBHOOK_SECRET not set, skipping signature verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`[billing-webhook] Event: ${event.type}, id: ${event.id}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        if (!companyId || !session.subscription) break;

        // Fetch the subscription to get plan details
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = sub.items.data[0]?.price?.id;
        const plan = PLAN_MAP[priceId] || "pro";

        await supabase.from("subscriptions").upsert({
          company_id: companyId,
          plan,
          status: sub.status,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: sub.id,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        }, { onConflict: "company_id" });

        await supabase.from("billing_events").insert({
          company_id: companyId,
          type: event.type,
          payload_json: event as any,
        });

        console.log(`[billing-webhook] Subscription created: company=${companyId}, plan=${plan}`);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;

        const priceId = sub.items.data[0]?.price?.id;
        const plan = PLAN_MAP[priceId] || "pro";

        await supabase.from("subscriptions").upsert({
          company_id: companyId,
          plan,
          status: sub.status,
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        }, { onConflict: "company_id" });

        await supabase.from("billing_events").insert({
          company_id: companyId,
          type: event.type,
          payload_json: event as any,
        });

        console.log(`[billing-webhook] Subscription updated: company=${companyId}, status=${sub.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;

        await supabase.from("subscriptions").upsert({
          company_id: companyId,
          plan: "free",
          status: "canceled",
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: false,
        }, { onConflict: "company_id" });

        await supabase.from("billing_events").insert({
          company_id: companyId,
          type: event.type,
          payload_json: event as any,
        });

        console.log(`[billing-webhook] Subscription deleted: company=${companyId}`);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;

        await supabase.from("billing_events").insert({
          company_id: companyId,
          type: event.type,
          payload_json: event as any,
        });

        console.log(`[billing-webhook] Invoice paid: company=${companyId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const companyId = sub.metadata?.companyId;
        if (!companyId) break;

        await supabase.from("subscriptions").update({
          status: "past_due",
        }).eq("company_id", companyId);

        await supabase.from("billing_events").insert({
          company_id: companyId,
          type: event.type,
          payload_json: event as any,
        });

        console.log(`[billing-webhook] Payment failed: company=${companyId}, status=past_due`);
        break;
      }

      default:
        console.log(`[billing-webhook] Unhandled event: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[billing-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
