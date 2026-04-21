// Returns the public Mapbox token to authenticated clients.
// The token is publishable (URL-restricted should be set in Mapbox dashboard).
// Edge function used so we don't bake the token into the bundle and can rotate it.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const token = Deno.env.get("MAPBOX_PUBLIC_TOKEN");
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Mapbox token not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ token }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // Allow short caching at the client level
      "Cache-Control": "private, max-age=3600",
    },
  });
});
