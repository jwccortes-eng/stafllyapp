import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AUTH_PWD_PREFIX = "SF_";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { phone, pin, kiosk_device_id, photo_base64 } = await req.json();

    if (!phone || !pin) {
      return new Response(
        JSON.stringify({ error: "Teléfono y PIN son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);

    // Rate limit check
    const { data: rateData } = await adminClient
      .from("auth_rate_limits")
      .select("*")
      .eq("phone_number", cleanPhone)
      .maybeSingle();

    if (rateData?.locked_until) {
      const lockUntil = new Date(rateData.locked_until);
      if (new Date() < lockUntil) {
        const minutesLeft = Math.ceil((lockUntil.getTime() - Date.now()) / 60000);
        return new Response(
          JSON.stringify({ error: `Cuenta bloqueada. Intenta en ${minutesLeft} min.` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Find employee
    const { data: employee, error: empErr } = await adminClient
      .from("employees")
      .select("id, first_name, last_name, phone_number, access_pin, is_active, user_id, company_id, avatar_url")
      .eq("phone_number", cleanPhone)
      .maybeSingle();

    if (empErr || !employee) {
      // Record failed attempt
      await recordFailed(adminClient, cleanPhone);
      return new Response(
        JSON.stringify({ error: "Credenciales inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!employee.is_active) {
      return new Response(
        JSON.stringify({ error: "Tu cuenta está inactiva. Contacta al administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!employee.access_pin || employee.access_pin !== pin) {
      await recordFailed(adminClient, cleanPhone);
      return new Response(
        JSON.stringify({ error: "PIN incorrecto" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset rate limit on success
    await adminClient.from("auth_rate_limits").delete().eq("phone_number", cleanPhone);

    // Upload photo if provided
    let photoUrl: string | null = null;
    if (photo_base64) {
      try {
        const photoData = Uint8Array.from(atob(photo_base64), c => c.charCodeAt(0));
        const fileName = `${employee.company_id}/${employee.id}/${Date.now()}.jpg`;
        const { error: uploadErr } = await adminClient.storage
          .from("kiosk-photos")
          .upload(fileName, photoData, { contentType: "image/jpeg", upsert: false });

        if (!uploadErr) {
          const { data: urlData } = adminClient.storage
            .from("kiosk-photos")
            .getPublicUrl(fileName);
          photoUrl = urlData?.publicUrl ?? null;
        }
      } catch (photoErr) {
        console.error("Photo upload error:", photoErr);
      }
    }

    // Check if there's an open time entry (no clock_out)
    const { data: openEntry } = await adminClient
      .from("time_entries")
      .select("id, clock_in, shift_id")
      .eq("employee_id", employee.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    let clockType: "clock_in" | "clock_out";
    let timeEntryId: string | null = null;

    if (openEntry) {
      // CLOCK OUT
      clockType = "clock_out";
      const clockIn = new Date(openEntry.clock_in);
      const clockOut = new Date(now);
      const diffHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;

      const { error: updateErr } = await adminClient
        .from("time_entries")
        .update({
          clock_out: now,
          total_hours: Math.round(diffHours * 100) / 100,
        })
        .eq("id", openEntry.id);

      if (updateErr) {
        console.error("Clock out update error:", updateErr);
      }
      timeEntryId = openEntry.id;
    } else {
      // CLOCK IN - find today's shift assignment if any
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayAssignment } = await adminClient
        .from("shift_assignments")
        .select("shift_id, scheduled_shifts!inner(id, date, start_time, end_time, clock_method)")
        .eq("employee_id", employee.id)
        .eq("status", "confirmed")
        .eq("scheduled_shifts.date", today)
        .limit(1)
        .maybeSingle();

      let shiftId: string | null = null;
      if (todayAssignment) {
        shiftId = todayAssignment.shift_id;
        // Check if shift allows kiosk
        const shiftClockMethod = (todayAssignment as any).scheduled_shifts?.clock_method;
        if (shiftClockMethod === "mobile") {
          return new Response(
            JSON.stringify({ error: "Este turno solo permite fichaje desde el celular" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      clockType = "clock_in";
      const { data: newEntry, error: insertErr } = await adminClient
        .from("time_entries")
        .insert({
          employee_id: employee.id,
          company_id: employee.company_id,
          clock_in: now,
          shift_id: shiftId,
          status: "approved",
          source: "kiosk",
        })
        .select("id")
        .single();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      timeEntryId = newEntry.id;
    }

    // Record clock event
    await adminClient.from("clock_events").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      type: clockType,
      clock_method: "kiosk",
      kiosk_device_id: kiosk_device_id || null,
      photo_url: photoUrl,
      time_entry_id: timeEntryId,
      device: "kiosk-terminal",
    });

    return new Response(
      JSON.stringify({
        success: true,
        clock_type: clockType,
        employee_name: `${employee.first_name} ${employee.last_name}`,
        avatar_url: employee.avatar_url,
        timestamp: now,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("kiosk-clock error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function recordFailed(adminClient: any, phone: string) {
  const { data: existing } = await adminClient
    .from("auth_rate_limits")
    .select("id, failed_attempts")
    .eq("phone_number", phone)
    .maybeSingle();

  const newAttempts = (existing?.failed_attempts ?? 0) + 1;
  let lockedUntil: string | null = null;

  if (newAttempts >= 10) {
    lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  } else if (newAttempts >= 5) {
    lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  }

  if (existing) {
    await adminClient
      .from("auth_rate_limits")
      .update({ failed_attempts: newAttempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await adminClient
      .from("auth_rate_limits")
      .insert({ phone_number: phone, failed_attempts: newAttempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() });
  }
}
