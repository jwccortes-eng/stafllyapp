import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { priceId, companyId } = await req.json();

    if (!priceId || !companyId) {
      return new Response(
        JSON.stringify({ error: "priceId and companyId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Replace with real Stripe checkout session creation
    // const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    // const session = await stripe.checkout.sessions.create({
    //   mode: "subscription",
    //   line_items: [{ price: priceId, quantity: 1 }],
    //   success_url: `${origin}/admin/billing?success=true`,
    //   cancel_url: `${origin}/admin/billing?canceled=true`,
    //   metadata: { companyId, userId: user.id },
    // });

    console.log(`[billing-checkout] Stub called by user=${user.id}, company=${companyId}, price=${priceId}`);

    return new Response(
      JSON.stringify({
        stub: true,
        message: "Checkout stub — connect Stripe keys to activate",
        // url: session.url  // Uncomment when Stripe is connected
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[billing-checkout] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
