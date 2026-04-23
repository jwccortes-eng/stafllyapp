// Hybrid generator for billable_service_blocks.
// Reads ONLY operational data (read-only): scheduled_shifts + time_entries + clients + locations.
// Writes ONLY to billable_service_blocks (idempotent upsert by shift_id source).
// Multi-tenant strict: company_id must match user's membership.
//
// Rules:
//  - Considers approved time_entries within [date_from, date_to] for the company.
//  - Resolves billing_client via clients.id -> billing_clients.operational_client_id (active).
//  - Resolves billing_client_location via:
//        1) Default (is_default=true) location of that billing client
//        2) If only one active location exists, use it.
//        3) Otherwise, leaves null but block is still created with default unit/rate so admin can fix.
//  - Calculates qty by billable_unit:
//        hour -> sum of (clock_out - clock_in - break_minutes) per shift
//        day  -> 1 per worker per shift (workers_count = approved entries count)
//        flat -> 1
//  - rate is taken from billing_client default (defaults to 0 with reason missing_rate).
//  - Idempotency: uses shift_group_id = shift_id; if a block already exists for that shift
//    AND its source_status is still 'pending', it is updated. If approved/invoiced -> skipped.
//
// NEVER touches: shifts, time_entries, payroll, attendance.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GenerateInput {
  company_id: string;
  date_from: string; // YYYY-MM-DD
  date_to: string; // YYYY-MM-DD
  client_id?: string | null; // optional operational client filter
  default_billable_unit?: "hour" | "day" | "flat";
}

interface SkippedReason {
  shift_id: string;
  service_date: string;
  reason:
    | "missing_billing_client"
    | "missing_billing_location"
    | "missing_rate"
    | "ambiguous_mapping"
    | "missing_approval"
    | "missing_attendance_data"
    | "already_invoiced";
  detail?: string;
}

interface GenerateResult {
  generated: number;
  updated: number;
  skipped: SkippedReason[];
  total_shifts_scanned: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 1) Verify caller via anon client (RLS-aware) and resolve user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub;

    // 2) Parse + validate input
    const body = (await req.json()) as GenerateInput;
    if (!body?.company_id || !body?.date_from || !body?.date_to) {
      return json(
        { error: "company_id, date_from and date_to are required" },
        400,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date_from) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date_to)) {
      return json({ error: "Dates must be YYYY-MM-DD" }, 400);
    }

    // 3) Verify membership + authorization in target company
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: membership }, { data: roleRows }, { data: invoicingPerm }] = await Promise.all([
      admin
        .from("company_users")
        .select("role")
        .eq("user_id", userId)
        .eq("company_id", body.company_id)
        .maybeSingle(),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId),
      admin
        .from("module_permissions")
        .select("can_edit")
        .eq("user_id", userId)
        .eq("module", "tenant_invoicing")
        .maybeSingle(),
    ]);

    const membershipRole = String(membership?.role ?? "").trim().toLowerCase();
    const globalRoles = new Set((roleRows ?? []).map((row: any) => String(row.role ?? "").trim().toLowerCase()));

    const hasGlobalAdminAccess = ["developer", "owner", "admin", "company_owner"].some((role) => globalRoles.has(role));
    const hasCompanyAdminAccess = ["admin", "owner", "company_owner"].includes(membershipRole);
    const hasScopedInvoicingAccess = ["manager", "supervisor"].includes(membershipRole) && !!invoicingPerm?.can_edit;

    if (!membership && !hasGlobalAdminAccess) {
      return json({ error: "Not a member of company" }, 403);
    }

    if (!(hasGlobalAdminAccess || hasCompanyAdminAccess || hasScopedInvoicingAccess)) {
      return json({ error: "Admin privileges required" }, 403);
    }

    // 4) Verify module enabled
    const { data: moduleRow } = await admin
      .from("company_modules")
      .select("is_active")
      .eq("company_id", body.company_id)
      .eq("module", "tenant_invoicing")
      .maybeSingle();

    if (!moduleRow?.is_active) {
      return json({ error: "tenant_invoicing module not enabled" }, 403);
    }

    const defaultUnit = body.default_billable_unit ?? "hour";

    // 5) Pull approved time_entries in window with their shifts
    let teQuery = admin
      .from("time_entries")
      .select(
        "id, shift_id, employee_id, clock_in, clock_out, break_minutes, status, " +
          "scheduled_shifts!inner(id, company_id, client_id, location_id, date, title, deleted_at)",
      )
      .eq("company_id", body.company_id)
      .eq("status", "approved")
      .not("clock_out", "is", null)
      .gte("scheduled_shifts.date", body.date_from)
      .lte("scheduled_shifts.date", body.date_to)
      .is("scheduled_shifts.deleted_at", null);

    if (body.client_id) {
      teQuery = teQuery.eq("scheduled_shifts.client_id", body.client_id);
    }

    const { data: entries, error: teErr } = await teQuery;
    if (teErr) return json({ error: teErr.message }, 500);

    // Group entries by shift_id
    const groups = new Map<
      string,
      {
        shift: any;
        entries: any[];
      }
    >();
    for (const e of entries ?? []) {
      const sh = (e as any).scheduled_shifts;
      if (!sh) continue;
      if (!groups.has(sh.id)) groups.set(sh.id, { shift: sh, entries: [] });
      groups.get(sh.id)!.entries.push(e);
    }

    // Pre-fetch billing_clients for the company (active)
    const { data: bcs } = await admin
      .from("billing_clients")
      .select("id, name, operational_client_id, default_currency, is_active")
      .eq("company_id", body.company_id)
      .eq("is_active", true);

    const bcByOpClient = new Map<string, any>();
    for (const bc of bcs ?? []) {
      if (bc.operational_client_id) bcByOpClient.set(bc.operational_client_id, bc);
    }

    // Pre-fetch all billing locations for those bcs
    const bcIds = (bcs ?? []).map((b) => b.id);
    let locsByClient = new Map<string, any[]>();
    if (bcIds.length) {
      const { data: locs } = await admin
        .from("billing_client_locations")
        .select("id, client_id, name, is_default, is_active")
        .in("client_id", bcIds)
        .eq("is_active", true);
      for (const l of locs ?? []) {
        const arr = locsByClient.get(l.client_id) ?? [];
        arr.push(l);
        locsByClient.set(l.client_id, arr);
      }
    }

    // Pre-fetch existing blocks for these shift ids to enforce idempotency
    const shiftIds = Array.from(groups.keys());
    let existingByShift = new Map<string, any>();
    if (shiftIds.length) {
      const { data: existing } = await admin
        .from("billable_service_blocks")
        .select("id, shift_group_id, source_status, invoice_id")
        .eq("company_id", body.company_id)
        .in("shift_group_id", shiftIds);
      for (const b of existing ?? []) {
        if (b.shift_group_id) existingByShift.set(b.shift_group_id, b);
      }
    }

    const skipped: SkippedReason[] = [];
    let generated = 0;
    let updated = 0;

    for (const [shiftId, { shift, entries: ents }] of groups) {
      const existing = existingByShift.get(shiftId);

      if (existing && ["invoiced", "approved"].includes(existing.source_status)) {
        skipped.push({
          shift_id: shiftId,
          service_date: shift.date,
          reason: existing.source_status === "invoiced" ? "already_invoiced" : "missing_approval",
          detail: `Block already in status ${existing.source_status}, not modified.`,
        });
        continue;
      }

      if (!shift.client_id) {
        skipped.push({
          shift_id: shiftId,
          service_date: shift.date,
          reason: "missing_billing_client",
          detail: "Shift has no operational client assigned.",
        });
        continue;
      }

      const bc = bcByOpClient.get(shift.client_id);
      if (!bc) {
        skipped.push({
          shift_id: shiftId,
          service_date: shift.date,
          reason: "missing_billing_client",
          detail: "Operational client is not linked to a billing client.",
        });
        continue;
      }

      // Resolve billing location
      const candidateLocs = locsByClient.get(bc.id) ?? [];
      let billingLocationId: string | null = null;
      if (candidateLocs.length === 1) {
        billingLocationId = candidateLocs[0].id;
      } else if (candidateLocs.length > 1) {
        const def = candidateLocs.find((l) => l.is_default);
        billingLocationId = def?.id ?? null;
      }

      // Compute qty
      let qty = 0;
      if (defaultUnit === "hour") {
        for (const e of ents) {
          const inMs = new Date(e.clock_in).getTime();
          const outMs = new Date(e.clock_out).getTime();
          const breakMs = (e.break_minutes ?? 0) * 60 * 1000;
          const ms = Math.max(0, outMs - inMs - breakMs);
          qty += ms / (1000 * 60 * 60);
        }
      } else if (defaultUnit === "day") {
        qty = ents.length; // 1 per worker per shift
      } else {
        qty = 1;
      }
      qty = Math.round(qty * 100) / 100;

      if (qty <= 0) {
        skipped.push({
          shift_id: shiftId,
          service_date: shift.date,
          reason: "missing_attendance_data",
          detail: "Computed qty is zero (no measurable approved attendance).",
        });
        continue;
      }

      const rate = 0; // Phase 3: rate must be set in admin UI; flagged below.
      const amount = Math.round(qty * rate * 100) / 100;
      const currency = bc.default_currency ?? "USD";

      const payload = {
        company_id: body.company_id,
        client_id: bc.id,
        client_location_id: billingLocationId,
        shift_group_id: shiftId,
        service_date: shift.date,
        service_type: shift.title ?? null,
        billable_unit: defaultUnit,
        workers_count: ents.length,
        qty,
        rate,
        amount,
        currency,
        description_rendered: shift.title ?? null,
        source_type: "approval" as const,
        source_status: "pending" as const,
        notes: !billingLocationId
          ? "Auto-generated: no default billing location resolved."
          : null,
      };

      if (existing) {
        const { error: upErr } = await admin
          .from("billable_service_blocks")
          .update(payload)
          .eq("id", existing.id);
        if (upErr) {
          skipped.push({
            shift_id: shiftId,
            service_date: shift.date,
            reason: "ambiguous_mapping",
            detail: upErr.message,
          });
          continue;
        }
        updated++;
      } else {
        const { error: insErr } = await admin
          .from("billable_service_blocks")
          .insert(payload);
        if (insErr) {
          skipped.push({
            shift_id: shiftId,
            service_date: shift.date,
            reason: "ambiguous_mapping",
            detail: insErr.message,
          });
          continue;
        }
        generated++;
      }

      if (rate === 0) {
        skipped.push({
          shift_id: shiftId,
          service_date: shift.date,
          reason: "missing_rate",
          detail: "Block created with rate 0 — set rate before approving.",
        });
      }
    }

    const result: GenerateResult = {
      generated,
      updated,
      skipped,
      total_shifts_scanned: groups.size,
    };

    return json(result, 200);
  } catch (e) {
    console.error("billing-generate-service-blocks error", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
