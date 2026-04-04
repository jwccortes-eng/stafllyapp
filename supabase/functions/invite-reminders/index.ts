import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

/**
 * invite-reminders — Scheduled edge function (cron every hour)
 * 
 * 1. Expire invitations past their expires_at
 * 2. Auto-resend reminders for invitations sent >48h ago and not yet accepted/opened
 * 3. Notify admins of expired invitations (handled by DB trigger)
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

    const results: Record<string, number> = {
      expired: 0,
      reminders_sent: 0,
    };

    // 1. Expire old invitations (triggers admin notification via DB trigger)
    const { data: expiredCount } = await supabase.rpc("expire_old_invitations");
    results.expired = expiredCount ?? 0;

    // 2. Find invitations sent >48h ago that are still in "sent" status (not opened/accepted)
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: staleInvites } = await supabase
      .from("employee_invitations")
      .select("id, employee_id, company_id, channel, invite_token, notes")
      .in("status", ["sent", "created"])
      .lt("sent_at", cutoff48h)
      .or("expires_at.is.null,expires_at.gt.now()")
      .limit(50);

    if (staleInvites && staleInvites.length > 0) {
      for (const inv of staleInvites) {
        // Get employee info for notification
        const { data: emp } = await supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", inv.employee_id)
          .single();

        const empName = emp
          ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim()
          : "Empleado";

        // Notify admins that this invitation needs attention
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
            title: "🔔 Invitación sin respuesta",
            body: `${empName} no ha aceptado su invitación después de 48 horas. Considera reenviarla.`,
            metadata: {
              employee_id: inv.employee_id,
              invitation_id: inv.id,
            },
          });
        }

        // Mark that we sent a reminder (update notes to avoid re-notifying)
        await supabase
          .from("employee_invitations")
          .update({
            notes: (inv.notes ? inv.notes + " | " : "") +
              `Reminder sent at ${new Date().toISOString()}`,
          })
          .eq("id", inv.id);

        results.reminders_sent++;
      }
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
