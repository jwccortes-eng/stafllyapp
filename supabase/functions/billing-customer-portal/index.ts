import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { companyId } = await req.json();

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: "companyId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Replace with real Stripe Customer Portal session
    // const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    // const { data: sub } = await supabase.from("subscriptions").select("stripe_customer_id").eq("company_id", companyId).single();
    // const session = await stripe.billingPortal.sessions.create({
    //   customer: sub.stripe_customer_id,
    //   return_url: `${origin}/admin/billing`,
    // });
    // return new Response(JSON.stringify({ url: session.url }), { ... });

    console.log(`[billing-customer-portal] Stub called for company=${companyId}`);

    return new Response(
      JSON.stringify({
        stub: true,
        message: "Customer portal stub — connect Stripe keys to activate",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[billing-customer-portal] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
