// Smart shift-link resolver.
//
// Public endpoint hit by /s/:token. Returns a minimal, safe preview of the
// shift PLUS routing instructions:
//   1. If a valid Authorization is provided AND the user has access to the
//      shift's company → route directly to the shift.
//   2. Otherwise the client must collect a phone number and POST it back; we
//      delegate identity resolution to `resolve-applicant-identity` and use
//      its result to choose register / activate / claim / detail.
//
// We intentionally expose only date/time/short location/title before identity
// is resolved. company_slug + shift_id are returned for observability and
// client-side fallback navigation; both are non-sensitive.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface PreviewPayload {
  ok: true;
  shift_id: string;
  company_id: string;
  company_slug: string;
  company_name: string;
  preview: {
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    location_short: string | null;
  };
  // Routing decision. `redirect` is the SPA path the page should navigate to.
  routing:
    | { kind: "session_authorized"; redirect: string }
    | { kind: "needs_phone"; redirect: null };
}

interface ResolvePayload {
  ok: true;
  shift_id: string;
  company_slug: string;
  scenario: string;
  redirect: string;
  message?: string;
  reference_code?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function shortLocation(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length <= 32) return trimmed;
  return trimmed.slice(0, 29) + "…";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();

    if (!token || token.length < 8) {
      return json({ error: "Invalid or missing token" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Look up the shift by token.
    const { data: shift, error: shiftErr } = await admin
      .from("scheduled_shifts")
      .select("id, company_id, title, date, start_time, end_time, location_id, status")
      .eq("shift_link_token", token)
      .maybeSingle();

    if (shiftErr) throw shiftErr;
    if (!shift) return json({ error: "Shift not found" }, 404);

    const [{ data: company }, { data: location }] = await Promise.all([
      admin
        .from("companies")
        .select("id, slug, name")
        .eq("id", shift.company_id)
        .maybeSingle(),
      shift.location_id
        ? admin
            .from("locations")
            .select("name")
            .eq("id", shift.location_id)
            .maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
    ]);

    if (!company) return json({ error: "Company not found" }, 404);

    const previewBase = {
      shift_id: shift.id,
      company_id: shift.company_id,
      company_slug: company.slug,
      company_name: company.name,
      preview: {
        date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        title: shift.title ?? "",
        location_short: shortLocation(location?.name ?? null),
      },
    };

    // === GET = preview + session-first routing ===
    if (req.method === "GET") {
      // Priority 1: If caller has a valid session AND belongs to this company,
      // skip the phone step entirely.
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: claims } = await userClient.auth.getClaims(
            authHeader.replace("Bearer ", ""),
          );
          const userId = claims?.claims?.sub as string | undefined;

          if (userId) {
            // Member of the company (admin/owner/manager/etc.)?
            const { data: membership } = await admin
              .from("company_users")
              .select("role")
              .eq("user_id", userId)
              .eq("company_id", shift.company_id)
              .maybeSingle();

            // Or has an active employee record in the company?
            const { data: empRecord } = await admin
              .from("employees")
              .select("id, is_active")
              .eq("user_id", userId)
              .eq("company_id", shift.company_id)
              .eq("is_active", true)
              .maybeSingle();

            if (membership || empRecord) {
              const target = membership
                ? `/app/shifts?focus=${shift.id}`
                : `/portal/shifts/${shift.id}`;
              const payload: PreviewPayload = {
                ok: true,
                ...previewBase,
                routing: { kind: "session_authorized", redirect: target },
              };
              return json(payload);
            }
          }
        } catch {
          // ignore auth errors → fall through to phone flow
        }
      }

      const payload: PreviewPayload = {
        ok: true,
        ...previewBase,
        routing: { kind: "needs_phone", redirect: null },
      };
      return json(payload);
    }

    // === POST = phone resolution ===
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const phone: string | undefined = body?.phone;
      const email: string | undefined = body?.email;

      if (!phone || typeof phone !== "string") {
        return json({ error: "phone is required" }, 400);
      }

      // Reuse the canonical identity resolver — single source of truth.
      const resolveResp = await fetch(
        `${supabaseUrl}/functions/v1/resolve-applicant-identity`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            company_id: shift.company_id,
            phone,
            email,
          }),
        },
      );

      if (!resolveResp.ok) {
        const txt = await resolveResp.text();
        return json({ error: "Identity resolver failed", detail: txt }, 502);
      }

      const resolved = await resolveResp.json();
      const scenario: string = resolved.scenario;

      // Map scenario → SPA route.
      let redirect: string;
      switch (scenario) {
        case "existing_active":
          // Has a portal account → go log in, then they can claim/view the shift.
          redirect = `/auth?next=${encodeURIComponent(`/portal/shifts/${shift.id}`)}`;
          break;
        case "existing_no_portal":
        case "existing_inactive":
          // Has identity, needs activation/reactivation.
          redirect = `/apply/${company.slug}?shift=${shift.id}&phone=${encodeURIComponent(phone)}`;
          break;
        case "pending_application":
          // Already applied — just acknowledge; no duplicate flow.
          redirect = `/apply/${company.slug}?status=pending&ref=${encodeURIComponent(resolved.reference_code ?? "")}`;
          break;
        case "new":
        default:
          // Brand new — register through the public application.
          redirect = `/apply/${company.slug}?shift=${shift.id}&phone=${encodeURIComponent(phone)}`;
          break;
      }

      const payload: ResolvePayload = {
        ok: true,
        shift_id: shift.id,
        company_slug: company.slug,
        scenario,
        redirect,
        message: resolved.message,
        reference_code: resolved.reference_code,
      };
      return json(payload);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("[resolve-shift-link] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
