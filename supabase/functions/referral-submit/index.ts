import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONSENT_VERSION = "v1-2026-06-01";

interface ReferralPayload {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  city?: string;
  preferred_contact_method?: "phone" | "whatsapp" | "email" | "sms";
  notes?: string;
  referral_source?: string;
  source_partner_company_id?: string | null;
  opportunity_id?: string | null;
  intake_kind: "partner_referral" | "client_referral";
  consent: boolean;
}

function normalizePhone(input: string): string {
  let p = (input || "").replace(/\D/g, "");
  if (p.length === 11 && p.startsWith("1")) p = p.slice(1);
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = (await req.json()) as ReferralPayload;

    // Validate
    const errors: string[] = [];
    if (!body.first_name?.trim()) errors.push("first_name required");
    if (!body.last_name?.trim()) errors.push("last_name required");
    if (!body.phone?.trim()) errors.push("phone required");
    if (!body.consent) errors.push("consent required");
    if (!["partner_referral", "client_referral"].includes(body.intake_kind))
      errors.push("invalid intake_kind");
    if (body.preferred_contact_method &&
      !["phone", "whatsapp", "email", "sms"].includes(body.preferred_contact_method))
      errors.push("invalid contact method");

    const normPhone = normalizePhone(body.phone);
    if (normPhone.length !== 10) errors.push("phone must be 10 digits");

    const cleanEmail = body.email?.trim().toLowerCase() || null;
    if (cleanEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail))
      errors.push("invalid email");

    if (errors.length) {
      return new Response(JSON.stringify({ error: errors.join(", ") }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Simple rate-limit: max 10 submissions / user / hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await service
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .eq("submitted_by_user_id", userId)
      .gte("created_at", oneHourAgo);
    if ((recentCount ?? 0) >= 10) {
      return new Response(JSON.stringify({ error: "Rate limit: too many referrals in the last hour" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedupe scan (best-effort, never blocks)
    let dupApplicationId: string | null = null;
    let dupUserId: string | null = null;
    let initialStatus: "pending_review" | "possible_duplicate" = "pending_review";

    const { data: dupApp } = await service
      .from("job_applications")
      .select("id")
      .eq("phone", normPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dupApp?.id) {
      dupApplicationId = dupApp.id;
      initialStatus = "possible_duplicate";
    }

    const { data: dupEmp } = await service
      .from("employees")
      .select("user_id")
      .eq("phone_number", normPhone)
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (dupEmp?.user_id) {
      dupUserId = dupEmp.user_id;
      initialStatus = "possible_duplicate";
    }

    // Build INSERT — must satisfy "Authenticated partners can submit referrals" RLS:
    // We insert via service role to bypass and explicitly set submitted_by_user_id = caller.
    const referenceCode = `REF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const { data: inserted, error: insertErr } = await service
      .from("job_applications")
      .insert({
        company_id: null,
        first_name: body.first_name.trim(),
        last_name: body.last_name.trim(),
        phone: normPhone,
        email: cleanEmail,
        city: body.city?.trim() || null,
        notes: body.notes?.trim() || null,
        worker_type: "referral",
        application_type: "referral",
        status: initialStatus,
        reference_code: referenceCode,
        source: body.referral_source?.trim() || body.intake_kind,
        referral_source: body.referral_source?.trim() || null,
        source_partner_company_id: body.source_partner_company_id || null,
        opportunity_id: body.opportunity_id || null,
        preferred_contact_method: body.preferred_contact_method || null,
        intake_kind: body.intake_kind,
        submitted_by_user_id: userId,
        consent_at: new Date().toISOString(),
        consent_text_version: CONSENT_VERSION,
        duplicate_of_application_id: dupApplicationId,
        duplicate_of_user_id: dupUserId,
      })
      .select("id, reference_code, status")
      .single();

    if (insertErr) {
      console.error("[referral-submit] insert error", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      id: inserted.id,
      reference_code: inserted.reference_code,
      status: inserted.status,
      possible_duplicate: initialStatus === "possible_duplicate",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[referral-submit] unexpected", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
