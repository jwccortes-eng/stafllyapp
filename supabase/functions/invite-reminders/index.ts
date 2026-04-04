import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/**
 * invite-reminders — Scheduled edge function
 * 
 * 1. Expire invitations past their expires_at
 * 2. Send 30-minute reminder for invitations not yet opened
 * 3. Send 24-hour final reminder for invitations not yet accepted
 * 4. Send 48h admin notification for stale invitations
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results = {
      expired: 0,
      reminder_30m: 0,
      reminder_24h: 0,
      admin_alerts: 0,
    };

    // 1. Expire old invitations (triggers admin notification via DB trigger)
    const { data: expiredCount } = await supabase.rpc("expire_old_invitations");
    results.expired = expiredCount ?? 0;

    const now = Date.now();

    // 2. 30-minute reminder: invitations sent but not opened after 30 min
    const cutoff30m = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: stale30m } = await supabase
      .from("employee_invitations")
      .select("id, employee_id, company_id, invite_token, notes")
      .in("status", ["sent", "created"])
      .lt("sent_at", cutoff30m)
      .or("expires_at.is.null,expires_at.gt.now()")
      .limit(100);

    for (const inv of stale30m ?? []) {
      const notes = inv.notes ?? "";
      if (notes.includes("reminder_30m")) continue; // already sent

      // Get employee info
      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id")
        .eq("id", inv.employee_id)
        .single();

      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "Empleado";

      // Notify admins
      const { data: admins } = await supabase
        .from("company_users")
        .select("user_id")
        .eq("company_id", inv.company_id)
        .in("role", ["admin", "company_owner", "owner"]);

      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          company_id: inv.company_id,
          recipient_id: admin.user_id,
          recipient_type: "user",
          type: "invitation_reminder",
          title: "⏱️ Invitación pendiente (30 min)",
          body: `${empName} aún no ha abierto su invitación. Considera reenviarla por WhatsApp.`,
          metadata: { employee_id: inv.employee_id, invitation_id: inv.id, reminder_type: "30m" },
        });
      }

      await supabase
        .from("employee_invitations")
        .update({ notes: (notes ? notes + " | " : "") + `reminder_30m:${new Date().toISOString()}` })
        .eq("id", inv.id);

      results.reminder_30m++;
    }

    // 3. 24-hour final reminder: invitations still not accepted after 24h
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: stale24h } = await supabase
      .from("employee_invitations")
      .select("id, employee_id, company_id, invite_token, notes")
      .in("status", ["sent", "created", "opened"])
      .lt("sent_at", cutoff24h)
      .or("expires_at.is.null,expires_at.gt.now()")
      .limit(100);

    for (const inv of stale24h ?? []) {
      const notes = inv.notes ?? "";
      if (notes.includes("reminder_24h")) continue;

      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", inv.employee_id)
        .single();

      const empName = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "Empleado";

      const { data: admins } = await supabase
        .from("company_users")
        .select("user_id")
        .eq("company_id", inv.company_id)
        .in("role", ["admin", "company_owner", "owner"]);

      for (const admin of admins ?? []) {
        await supabase.from("notifications").insert({
          company_id: inv.company_id,
          recipient_id: admin.user_id,
          recipient_type: "user",
          type: "invitation_reminder",
          title: "🔔 Último recordatorio de invitación",
          body: `${empName} no ha activado su cuenta después de 24 horas. Esta es la última alerta automática.`,
          metadata: { employee_id: inv.employee_id, invitation_id: inv.id, reminder_type: "24h" },
        });
      }

      await supabase
        .from("employee_invitations")
        .update({ notes: (notes ? notes + " | " : "") + `reminder_24h:${new Date().toISOString()}` })
        .eq("id", inv.id);

      results.reminder_24h++;
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
