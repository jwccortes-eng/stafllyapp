import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/**
 * shift-reminders — Scheduled edge function (run every 15 min via cron)
 *
 * 1. Shift reminders: 24h and 1h before shift start (existing behavior)
 * 2. Confirmation reminders: nudge employees who haven't confirmed (12h and 1h)
 * 3. No clock-in alerts: notify admins 15 min after shift start
 * 4. No-show detection: 30 min after shift start → critical admin alert + clock_alert
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split("T")[0];
  const results = {
    reminders_24h: 0,
    reminders_1h: 0,
    confirm_reminders: 0,
    no_clockin_alerts: 0,
    no_show_alerts: 0,
    errors: [] as string[],
  };

  try {
    // ─── EXISTING: Shift start reminders (24h + 1h) ───
    const { data: companies } = await supabase.from("companies").select("id").eq("is_active", true);

    for (const company of companies ?? []) {
      const { data: rule } = await supabase
        .from("automation_rules")
        .select("enabled")
        .eq("company_id", company.id)
        .eq("rule_key", "shift_reminder")
        .maybeSingle();

      if (rule && !rule.enabled) continue;

      for (const hoursBefore of [24, 1]) {
        const targetTime = new Date(now.getTime() + hoursBefore * 3600000);
        const windowStart = new Date(targetTime.getTime() - 30 * 60000);
        const windowEnd = new Date(targetTime.getTime() + 30 * 60000);
        const targetDate = targetTime.toISOString().split("T")[0];

        const { data: shifts } = await supabase
          .from("scheduled_shifts")
          .select("id, title, date, start_time, shift_code, locations(name)")
          .eq("company_id", company.id)
          .eq("date", targetDate)
          .is("deleted_at", null)
          .in("status", ["published", "open"]);

        for (const shift of shifts ?? []) {
          const [h, m] = (shift.start_time as string).split(":").map(Number);
          const shiftStart = new Date(targetDate + "T00:00:00Z");
          shiftStart.setUTCHours(h, m, 0, 0);
          if (shiftStart < windowStart || shiftStart > windowEnd) continue;

          const { data: assignments } = await supabase
            .from("shift_assignments")
            .select("employee_id")
            .eq("shift_id", shift.id)
            .in("status", ["confirmed", "pending", "accepted"]);

          for (const sa of assignments ?? []) {
            const notifType = hoursBefore === 24 ? "shift_reminder_24h" : "shift_reminder_1h";

            const { data: existing } = await supabase
              .from("notifications").select("id")
              .eq("recipient_id", sa.employee_id)
              .eq("type", notifType)
              .contains("metadata", { shift_id: shift.id })
              .limit(1);

            if (existing && existing.length > 0) continue;

            const locationName = (shift as any).locations?.name;
            const timeLabel = hoursBefore === 24 ? "mañana" : "en 1 hora";

            await supabase.from("notifications").insert({
              company_id: company.id,
              recipient_id: sa.employee_id,
              recipient_type: "employee",
              type: notifType,
              title: hoursBefore === 24 ? "📅 Recordatorio de turno" : "⏰ Tu turno comienza pronto",
              body: `Tu turno "${shift.title}" comienza ${timeLabel} a las ${(shift.start_time as string).slice(0, 5)}${locationName ? ` en ${locationName}` : ""}.`,
              metadata: { shift_id: shift.id, shift_code: shift.shift_code },
            });

            if (hoursBefore === 24) results.reminders_24h++;
            else results.reminders_1h++;
          }
        }
      }
    }

    // ─── NEW: Confirmation reminders for pending assignments ───
    const { data: pendingAssignments } = await supabase
      .from("shift_assignments")
      .select(`id, employee_id, scheduled_shifts!inner (id, title, date, start_time, end_time, company_id)`)
      .eq("status", "pending")
      .in("scheduled_shifts.date", [todayStr, tomorrowStr])
      .is("scheduled_shifts.deleted_at", null) as any;

    for (const sa of pendingAssignments ?? []) {
      const shift = sa.scheduled_shifts;
      const shiftStart = new Date(`${shift.date}T${shift.start_time}`);
      const hoursUntil = (shiftStart.getTime() - now.getTime()) / 3600000;
      if (hoursUntil < 0 || hoursUntil > 13) continue;

      const isUrgent = hoursUntil <= 2;
      const notifType = isUrgent ? "shift_confirm_urgent" : "shift_confirm_reminder";

      const { data: existing } = await supabase
        .from("notifications").select("id")
        .eq("recipient_id", sa.employee_id)
        .eq("type", notifType)
        .contains("metadata", { assignment_id: sa.id })
        .limit(1);

      if (existing && existing.length > 0) continue;

      await supabase.from("notifications").insert({
        company_id: shift.company_id,
        recipient_id: sa.employee_id,
        recipient_type: "employee",
        type: notifType,
        title: isUrgent ? "⚠️ Confirma tu turno — comienza pronto" : "📋 Confirma tu turno asignado",
        body: `"${shift.title}" — ${shift.date} de ${shift.start_time.slice(0, 5)} a ${shift.end_time.slice(0, 5)}. Abre tus turnos para confirmar.`,
        metadata: { shift_id: shift.id, assignment_id: sa.id, reminder_type: isUrgent ? "1h" : "12h" },
      });

      results.confirm_reminders++;
    }

    // ─── No clock-in alerts (grace_period_minutes after shift start) ───
    // Read company clock_config for grace period
    const { data: clockCfgRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", company.id)
      .eq("key", "clock_config")
      .maybeSingle();
    const clockCfg = (clockCfgRow?.value && typeof clockCfgRow.value === "object") ? clockCfgRow.value as Record<string, unknown> : {};
    const gracePeriod = typeof clockCfg.grace_period_minutes === "number" ? clockCfg.grace_period_minutes : 15;

    const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
    const minsAgo = new Date(now.getTime() - gracePeriod * 60000);
    const tGrace = `${String(minsAgo.getHours()).padStart(2, "0")}:${String(minsAgo.getMinutes()).padStart(2, "0")}:00`;

    const { data: startedAssignments } = await supabase
      .from("shift_assignments")
      .select(`id, employee_id, scheduled_shifts!inner (id, title, start_time, company_id)`)
      .in("status", ["confirmed", "accepted", "pending"])
      .eq("scheduled_shifts.date", todayStr)
      .lte("scheduled_shifts.start_time", nowHHMM)
      .gte("scheduled_shifts.start_time", tGrace)
      .is("scheduled_shifts.deleted_at", null) as any;

    for (const sa of startedAssignments ?? []) {
      const shift = sa.scheduled_shifts;

      const { data: clock } = await supabase
        .from("time_entries").select("id")
        .eq("employee_id", sa.employee_id).eq("shift_id", shift.id).limit(1);
      if (clock && clock.length > 0) continue;

      const { data: ex } = await supabase
        .from("notifications").select("id")
        .eq("type", "no_clockin_alert")
        .contains("metadata", { assignment_id: sa.id }).limit(1);
      if (ex && ex.length > 0) continue;

      const { data: emp } = await supabase
        .from("employees").select("first_name, last_name")
        .eq("id", sa.employee_id).single();
      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "Empleado";

      // Alert admins
      const { data: admins } = await supabase
        .from("company_users").select("user_id")
        .eq("company_id", shift.company_id)
        .in("role", ["admin", "company_owner", "owner"]);

      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          company_id: shift.company_id,
          recipient_id: admin.user_id,
          recipient_type: "user",
          type: "no_clockin_alert",
          title: "🚨 Sin fichaje — Turno iniciado",
          body: `${empName} no ha fichado en "${shift.title}" que empezó a las ${shift.start_time.slice(0, 5)}.`,
          metadata: { shift_id: shift.id, employee_id: sa.employee_id, assignment_id: sa.id },
        });
      }

      // Alert employee
      await supabase.from("notifications").insert({
        company_id: shift.company_id,
        recipient_id: sa.employee_id,
        recipient_type: "employee",
        type: "no_clockin_alert",
        title: "⏰ ¿Olvidaste fichar?",
        body: `Tu turno "${shift.title}" ya empezó. Ficha tu entrada.`,
        metadata: { shift_id: shift.id, assignment_id: sa.id },
      });

      results.no_clockin_alerts++;
    }

    // ─── NEW: No-show detection (30 min after shift start) ───
    const mins30ago = new Date(now.getTime() - 30 * 60000);
    const mins45ago = new Date(now.getTime() - 45 * 60000);
    const t30 = `${String(mins30ago.getHours()).padStart(2, "0")}:${String(mins30ago.getMinutes()).padStart(2, "0")}:00`;
    const t45 = `${String(mins45ago.getHours()).padStart(2, "0")}:${String(mins45ago.getMinutes()).padStart(2, "0")}:00`;

    const { data: noShowCandidates } = await supabase
      .from("shift_assignments")
      .select(`id, employee_id, scheduled_shifts!inner (id, title, start_time, company_id)`)
      .in("status", ["confirmed", "accepted", "pending"])
      .eq("scheduled_shifts.date", todayStr)
      .lte("scheduled_shifts.start_time", t30)
      .gte("scheduled_shifts.start_time", t45)
      .is("scheduled_shifts.deleted_at", null) as any;

    for (const sa of noShowCandidates ?? []) {
      const shift = sa.scheduled_shifts;

      const { data: clock } = await supabase
        .from("time_entries").select("id")
        .eq("employee_id", sa.employee_id).eq("shift_id", shift.id).limit(1);
      if (clock && clock.length > 0) continue;

      const { data: ex } = await supabase
        .from("notifications").select("id")
        .eq("type", "no_show_alert")
        .contains("metadata", { assignment_id: sa.id }).limit(1);
      if (ex && ex.length > 0) continue;

      const { data: emp } = await supabase
        .from("employees").select("first_name, last_name")
        .eq("id", sa.employee_id).single();
      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "Empleado";

      const { data: admins } = await supabase
        .from("company_users").select("user_id")
        .eq("company_id", shift.company_id)
        .in("role", ["admin", "company_owner", "owner"]);

      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          company_id: shift.company_id,
          recipient_id: admin.user_id,
          recipient_type: "user",
          type: "no_show_alert",
          title: "🔴 Posible no-show",
          body: `${empName} no ha fichado 30+ min después del inicio de "${shift.title}". Considera buscar reemplazo.`,
          metadata: { shift_id: shift.id, employee_id: sa.employee_id, assignment_id: sa.id },
        });
      }

      await supabase.from("clock_alerts").insert({
        company_id: shift.company_id,
        employee_id: sa.employee_id,
        shift_id: shift.id,
        type: "no_show",
        severity: "critical",
        description: `No fichaje 30+ min después del inicio de "${shift.title}"`,
      });

      results.no_show_alerts++;
    }

    return new Response(JSON.stringify({ success: true, timestamp: now.toISOString(), ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
