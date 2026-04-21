/**
 * attendance-qr-resolve
 *
 * Resolves a scanned QR payload (`stafly:shift:<shiftId>:<token>`) into an
 * actionable response for the worker portal:
 *  - validates the token vs the live shift record
 *  - confirms the worker is assigned (and not removed/rejected)
 *  - decides intent: `clock_in` | `clock_out` | `already_done` | `out_of_window`
 *  - logs the QR scan into `clock_events` (type=`qr_scan`) with reason
 *
 * Returns SPECIFIC error codes so the UI can render targeted messages instead
 * of a generic "invalid QR".
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

type Outcome =
  | "ok_clock_in"
  | "ok_clock_out"
  | "already_clocked_in_elsewhere"
  | "out_of_window"
  | "not_assigned"
  | "invalid_payload"
  | "shift_not_found"
  | "token_mismatch"
  | "qr_disabled"
  | "auth_required"
  | "internal_error";

interface Payload { qr: string; employee_id: string; }

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
}
function fail(outcome: Outcome, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ outcome, message, ...extra }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("auth_required", "Missing authorization", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { qr, employee_id } = (await req.json().catch(() => ({}))) as Partial<Payload>;
    if (!qr || !employee_id) return fail("invalid_payload", "Missing qr or employee_id");

    // ── Parse: stafly:shift:<shiftId>:<token>
    const parts = qr.split(":");
    if (parts.length !== 4 || parts[0] !== "stafly" || parts[1] !== "shift") {
      return fail("invalid_payload", "This QR doesn't look like a shift code.");
    }
    const [, , shiftId, token] = parts;

    // ── Resolve the shift
    const { data: shift, error: shiftErr } = await supabase
      .from("scheduled_shifts")
      .select("id, company_id, title, qr_token, qr_attendance_mode, start_time, end_time, date, deleted_at")
      .eq("id", shiftId)
      .maybeSingle();

    if (shiftErr) return fail("internal_error", shiftErr.message, 500);
    if (!shift || shift.deleted_at) return fail("shift_not_found", "Shift not found or has been removed.", 404);

    if (shift.qr_attendance_mode === "disabled") {
      return fail("qr_disabled", "QR attendance is disabled for this shift.");
    }
    if (shift.qr_token !== token) {
      return fail("token_mismatch", "This QR has expired. Ask your supervisor for a fresh one.");
    }

    // ── Confirm assignment
    const { data: assignment } = await supabase
      .from("shift_assignments")
      .select("id, status")
      .eq("shift_id", shiftId)
      .eq("employee_id", employee_id)
      .not("status", "in", "(removed,rejected)")
      .maybeSingle();
    if (!assignment) {
      return fail("not_assigned", "You're not assigned to this shift.", 403);
    }

    // ── Time window: allow ±2h around start, +30min after end
    const now = new Date();
    const shiftStart = new Date(`${shift.date}T${shift.start_time}`);
    const shiftEnd = new Date(`${shift.date}T${shift.end_time}`);
    const earliestIn = new Date(shiftStart.getTime() - 2 * 60 * 60_000);
    const latestOut = new Date(shiftEnd.getTime() + 30 * 60_000);

    // ── Detect open time entry → clock-out flow
    const { data: openEntry } = await supabase
      .from("time_entries")
      .select("id, shift_id, clock_in")
      .eq("employee_id", employee_id)
      .is("clock_out", null)
      .maybeSingle();

    let outcome: Outcome = "ok_clock_in";

    if (openEntry) {
      if (openEntry.shift_id === shiftId) {
        outcome = "ok_clock_out";
      } else {
        return fail(
          "already_clocked_in_elsewhere",
          "You have an active shift on another assignment. Clock out there first.",
          409,
          { open_entry_id: openEntry.id, open_shift_id: openEntry.shift_id },
        );
      }
    } else if (now < earliestIn || now > latestOut) {
      outcome = "out_of_window";
    }

    // ── Log scan event regardless of outcome (audit trail)
    await supabase.from("clock_events").insert({
      employee_id,
      company_id: shift.company_id,
      shift_id: shiftId,
      type: "qr_scan",
      clock_method: "qr",
      is_payroll_relevant: false,
      device: req.headers.get("user-agent")?.slice(0, 80) ?? null,
      // store outcome in the address slot as a lightweight tag (no separate column needed)
      address: `qr:${outcome}`,
    } as never);

    if (outcome === "out_of_window") {
      return fail(
        "out_of_window",
        `Shift runs ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}. Try again closer to start time.`,
        425,
      );
    }

    return ok({
      outcome,
      shift_id: shiftId,
      company_id: shift.company_id,
      assignment_id: assignment.id,
      shift: {
        title: shift.title,
        start_time: shift.start_time,
        end_time: shift.end_time,
        date: shift.date,
      },
    });
  } catch (err) {
    console.error("[attendance-qr-resolve] unexpected error", err);
    return fail("internal_error", "Unexpected error. Try again.", 500);
  }
});
