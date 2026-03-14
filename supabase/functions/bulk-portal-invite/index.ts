import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AUTH_PWD_PREFIX = "SF_";

function extractLast4Digits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

function buildInviteHtml(employee: { first_name: string; last_name: string; phone_number: string }, pin: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f5f6fa; margin: 0; padding: 0;">
  <div style="max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #3366FF, #5B8DEF); padding: 32px 24px; text-align: center;">
      <h1 style="color: #fff; font-size: 22px; margin: 0;">StaflyApps</h1>
      <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 8px 0 0;">Portal de Empleados</p>
    </div>
    <div style="padding: 32px 24px;">
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px;">¡Hola ${employee.first_name}! 👋</h2>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px;">
        Tu acceso al portal de empleados ha sido activado. Ahora puedes:
      </p>
      <ul style="font-size: 14px; color: #555; line-height: 1.8; padding-left: 20px; margin: 0 0 24px;">
        <li>📅 Ver tus turnos asignados</li>
        <li>✅ Aceptar o rechazar turnos</li>
        <li>⏰ Registrar entrada y salida</li>
        <li>📋 Ver detalles de tus trabajos</li>
      </ul>
      
      <div style="background: #f0f4ff; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
        <p style="font-size: 13px; font-weight: 600; color: #3366FF; margin: 0 0 12px;">🔐 Información de acceso</p>
        <table style="width: 100%; font-size: 14px; color: #333;">
          <tr><td style="padding: 4px 0; color: #777;">Usuario:</td><td style="padding: 4px 0; font-weight: 600;">${employee.phone_number}</td></tr>
          <tr><td style="padding: 4px 0; color: #777;">PIN temporal:</td><td style="padding: 4px 0; font-weight: 600; font-family: monospace; font-size: 18px; letter-spacing: 4px;">${pin}</td></tr>
        </table>
      </div>

      <div style="background: #fff8e6; border-radius: 12px; padding: 16px; margin: 0 0 24px; border: 1px solid #ffe0a0;">
        <p style="font-size: 13px; color: #8b6914; margin: 0;">
          ⚠️ <strong>Por seguridad</strong>, deberás cambiar tu PIN después de tu primer inicio de sesión.
        </p>
      </div>

      <a href="https://staflyapps.com/portal" style="display: block; text-align: center; background: #3366FF; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">
        Acceder al Portal →
      </a>
    </div>
    <div style="padding: 16px 24px; background: #f8f9fc; text-align: center;">
      <p style="font-size: 11px; color: #999; margin: 0;">StaflyApps · Gestión de personal inteligente</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check: must be admin/owner
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await callerClient.from("user_roles").select("role").eq("user_id", caller.id);
    const callerRoles = (roleData ?? []).map((r: any) => r.role);
    if (!callerRoles.includes("owner") && !callerRoles.includes("admin") && !callerRoles.includes("developer")) {
      return new Response(JSON.stringify({ error: "Solo admins pueden enviar invitaciones" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find eligible employees: active, has phone (force mode — resets all PINs)
    const { data: employees, error: fetchErr } = await adminClient
      .from("employees")
      .select("id, first_name, last_name, phone_number, email, access_pin, is_active")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .not("phone_number", "is", null);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Error al buscar empleados" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        processed: 0, 
        skipped: 0, 
        emails_sent: 0,
        message: "No hay empleados elegibles (todos ya tienen PIN o no tienen teléfono)" 
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;
    let emailsSent = 0;
    const errors: string[] = [];

    // Email sending via queue

    for (const emp of employees) {
      try {
        const pin = extractLast4Digits(emp.phone_number);
        if (!pin) {
          skipped++;
          continue;
        }

        // Update employee record
        const { error: updateErr } = await adminClient
          .from("employees")
          .update({
            access_pin: pin,
            must_change_pin: true,
            portal_access_enabled: true,
          })
          .eq("id", emp.id);

        if (updateErr) {
          errors.push(`${emp.first_name} ${emp.last_name}: ${updateErr.message}`);
          skipped++;
          continue;
        }

        // Create/update auth user
        const cleanPhone = emp.phone_number.replace(/[^\d+]/g, "");
        const empEmail = `emp_${cleanPhone}@employee.internal`;
        const pwd = AUTH_PWD_PREFIX + pin;

        // Check if auth user exists
        const { data: existingEmp } = await adminClient
          .from("employees")
          .select("user_id")
          .eq("id", emp.id)
          .single();

        if (!existingEmp?.user_id) {
          // Create auth user
          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email: empEmail,
            password: pwd,
            email_confirm: true,
            user_metadata: { full_name: `${emp.first_name} ${emp.last_name}` },
          });

          if (createErr) {
            // User might already exist
            const { data: { users } } = await adminClient.auth.admin.listUsers();
            const existing = users?.find((u: any) => u.email === empEmail);
            if (existing) {
              await adminClient.auth.admin.updateUserById(existing.id, { password: pwd });
              await adminClient.from("employees").update({ user_id: existing.id }).eq("id", emp.id);
              // Ensure employee role
              const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", existing.id).limit(1);
              if (!roles || roles.length === 0) {
                await adminClient.from("user_roles").insert({ user_id: existing.id, role: "employee" });
              }
            }
          } else if (newUser?.user) {
            await adminClient.from("employees").update({ user_id: newUser.user.id }).eq("id", emp.id);
            // Ensure employee role
            const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", newUser.user.id).limit(1);
            if (!roles || roles.length === 0) {
              await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "employee" });
            }
          }
        } else {
          // Update existing auth user password
          await adminClient.auth.admin.updateUserById(existingEmp.user_id, { password: pwd });
        }

        processed++;

        // Send invitation email if employee has a real email
        if (emp.email) {
          try {
            await adminClient.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                to: emp.email,
                subject: "Tu acceso al Portal de Empleados StaflyApps",
                html: buildInviteHtml(emp, pin),
                from_name: "StaflyApps",
                from_email: "noreply@notify.staflyapps.com",
              },
            });
            emailsSent++;
          } catch (emailErr: any) {
            errors.push(`Email a ${emp.first_name}: ${emailErr.message}`);
          }
        }
      } catch (empErr: any) {
        errors.push(`${emp.first_name} ${emp.last_name}: ${empErr.message}`);
        skipped++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_eligible: employees.length,
      processed,
      skipped,
      emails_sent: emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("bulk-portal-invite error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
