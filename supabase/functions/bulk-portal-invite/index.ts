import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendRawEmail } from "../_shared/send-raw-email.ts";
import { brandFrom, brandName } from "../_shared/email-brand.ts";

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

function buildActivationEmail(
  employee: { first_name: string; last_name: string; phone_number: string },
  pin: string | null,
  companyName: string,
): string {
  // `pin` solo llega cuando esta invitación creó la credencial. Si la persona
  // ya tenía PIN, nunca se revela: usa el que ya conoce.
  // Bilingüe ES/EN: no hay preferencia de idioma confiable por persona.
  const pinRowEs = pin
    ? `<tr><td style="padding:4px 0;color:#777;">PIN temporal:</td><td style="padding:4px 0;font-weight:600;font-family:monospace;font-size:18px;letter-spacing:4px;">${pin}</td></tr>`
    : `<tr><td style="padding:4px 0;color:#777;">PIN:</td><td style="padding:4px 0;font-weight:600;">Usa el PIN que ya tienes</td></tr>`;
  const brand = brandName(companyName);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Inter, Arial, sans-serif; background: #f5f6fa; margin: 0; padding: 0;">
  <div style="max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #1a4dff, #5B8DEF); padding: 28px 24px; text-align: center;">
      <h1 style="color: #fff; font-size: 20px; margin: 0;">${companyName}</h1>
      <p style="color: rgba(255,255,255,0.85); font-size: 12px; margin: 6px 0 0;">powered by Stafly</p>
    </div>
    <div style="padding: 28px 24px;">
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 12px;">¡Hola ${employee.first_name}!</h2>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 18px;">
        Tu portal de trabajador en <strong>${companyName}</strong> ya está activo. Desde ahí puedes ver tus turnos, marcar entrada y salida, y revisar tus horas y pagos.
      </p>
      <div style="background: #f0f4ff; border-radius: 12px; padding: 18px; margin: 0 0 18px;">
        <p style="font-size: 13px; font-weight: 600; color: #1a4dff; margin: 0 0 10px;">Tus datos de acceso · Your login</p>
        <table style="width: 100%; font-size: 14px; color: #333;">
          <tr><td style="padding:4px 0;color:#777;">Teléfono / Phone:</td><td style="padding:4px 0;font-weight:600;">${employee.phone_number}</td></tr>
          ${pinRowEs}
        </table>
      </div>
      <a href="https://staflyapps.com/portal" style="display:block;text-align:center;background:#1a4dff;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;">
        Entrar al portal · Open the portal
      </a>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:26px 0;">
      <h2 style="font-size: 16px; color: #1a1a2e; margin: 0 0 12px;">Hi ${employee.first_name}!</h2>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 12px;">
        Your worker portal at <strong>${companyName}</strong> is active. Sign in with your phone number and your 4-digit PIN to see shifts, clock in and out, and review hours and payments.
      </p>
      <p style="font-size: 13px; color: #8b6914; background:#fff8e6; border:1px solid #ffe0a0; border-radius:12px; padding:14px; margin: 0;">
        Por seguridad, cambia tu PIN después del primer ingreso. · For security, change your PIN after your first login.
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f8f9fc; text-align: center;">
      <p style="font-size: 11px; color: #999; margin: 0;">${brand}</p>
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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { company_id, employee_ids, send_email = true } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: allow either a global privileged role (owner/admin/developer)
    // OR a company-scoped admin/owner membership for the target company.
    const ELEVATED_GLOBAL = new Set(["owner", "admin", "developer"]);
    const ELEVATED_COMPANY = new Set(["owner", "company_owner", "admin"]);

    const [{ data: roleData }, { data: membershipData }] = await Promise.all([
      adminClient.from("user_roles").select("role").eq("user_id", caller.id),
      adminClient
        .from("company_users")
        .select("role")
        .eq("user_id", caller.id)
        .eq("company_id", company_id),
    ]);

    const hasGlobal = (roleData ?? []).some((r: any) => ELEVATED_GLOBAL.has(r.role));
    const hasCompany = (membershipData ?? []).some((m: any) => ELEVATED_COMPANY.has(m.role));

    if (!hasGlobal && !hasCompany) {
      return new Response(JSON.stringify({ error: "Only admins can send activation emails" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company name for email branding
    const { data: companyData } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();
    const companyName = companyData?.name ?? "Your Company";

    // Build query for eligible employees
    let query = adminClient
      .from("employees")
      .select("id, first_name, last_name, phone_number, email, access_pin, is_active, user_id")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .not("phone_number", "is", null);

    // If specific IDs provided, filter to those
    if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
      query = query.in("id", employee_ids);
    }

    const { data: employees, error: fetchErr } = await query;

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Error fetching employees" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, processed: 0, skipped: 0, emails_sent: 0,
        message: "No eligible employees found",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;
    let emailsSent = 0;
    let emailsSuppressed = 0;
    let emailsFailed = 0;
    const errors: string[] = [];

    for (const emp of employees) {
      try {
        // ─── P0 AUTH PIN CANONICALIZATION ───
        // El PIN vive en la credencial del Auth User. Aquí solo se crea/vincula
        // la identidad y, si la persona aún no tiene credencial, se establece
        // un PIN inicial (últimos 4 del teléfono) mediante el escritor único.
        const cleanPhone = emp.phone_number.replace(/[^\d+]/g, "");
        const empEmail = `emp_${cleanPhone}@employee.internal`;

        let authUserId: string | null = emp.user_id ?? null;
        const initialPin = extractLast4Digits(emp.phone_number);

        if (!authUserId) {
          if (!initialPin) { skipped++; continue; }
          const pwd = AUTH_PWD_PREFIX + initialPin;
          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email: empEmail,
            password: pwd,
            email_confirm: true,
            user_metadata: { full_name: `${emp.first_name} ${emp.last_name}` },
          });

          if (createErr) {
            const { data: { users } } = await adminClient.auth.admin.listUsers();
            const existing = users?.find((u: any) => u.email === empEmail);
            if (existing) {
              await adminClient.auth.admin.updateUserById(existing.id, { password: pwd });
              authUserId = existing.id;
            }
          } else if (newUser?.user) {
            authUserId = newUser.user.id;
          }

          if (!authUserId) {
            errors.push(`${emp.first_name} ${emp.last_name}: no se pudo crear identidad de acceso`);
            skipped++;
            continue;
          }

          await adminClient.from("employees")
            .update({ user_id: authUserId, must_change_pin: true, portal_access_enabled: true })
            .eq("id", emp.id);
          const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", authUserId).limit(1);
          if (!roles || roles.length === 0) {
            await adminClient.from("user_roles").insert({ user_id: authUserId, role: "employee" });
          }
        }

        // ¿Ya tiene credencial canónica?
        const { data: credRow } = await adminClient
          .from("auth_pin_credentials")
          .select("user_id")
          .eq("user_id", authUserId)
          .maybeSingle();

        // PIN a comunicar: solo cuando lo establecemos nosotros. Si ya existe
        // credencial, no se revela ni se sobreescribe.
        let pin: string | null = null;

        if (!credRow) {
          if (!initialPin) { skipped++; continue; }
          const { error: pinErr } = await adminClient.rpc("internal_set_auth_pin", {
            _user_id: authUserId,
            _pin: initialPin,
            _source: "bulk_portal_invite",
          });
          if (pinErr) {
            errors.push(`${emp.first_name} ${emp.last_name}: ${pinErr.message}`);
            skipped++;
            continue;
          }
          await adminClient.auth.admin.updateUserById(authUserId, {
            password: AUTH_PWD_PREFIX + initialPin,
          });
          pin = initialPin;
          console.log(`[NEW-ACTIVATION] ${emp.first_name} ${emp.last_name}`);
        } else {
          console.log(`[RESEND] ${emp.first_name} ${emp.last_name} — credencial existente, sin cambios de PIN`);
        }


        processed++;

        // Send activation email through Lovable's managed email API
        if (send_email && emp.email) {
          try {
            const html = buildActivationEmail(emp, pin, companyName);
            const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            const messageId = crypto.randomUUID();
            // Idempotencia estable: un reintento del mismo día no duplica el envío.
            const idempotencyKey = `bulk-activation-${emp.id}-${new Date().toISOString().slice(0, 10)}`;

            const result = await sendRawEmail({
              to: emp.email,
              from: brandFrom(companyName),
              subject: `${companyName} — Tu portal ya está activo · Your portal is ready`,
              html,
              text,
              label: "portal_activation",
              idempotencyKey,
              category: "transactional_access",
              adminClient,
            });

            const { error: logErr } = await adminClient.from("email_send_log").insert({
              recipient_email: emp.email,
              template_name: "portal_activation",
              // P0.3: aceptado por el API, no despachado todavía.
              status: result.accepted ? "accepted" : "suppressed",
              message_id: messageId,
              error_message: result.accepted ? null : "Recipient suppressed",
              metadata: {
                company_id,
                employee_id: emp.id,
                idempotency_key: idempotencyKey,
                campaign: "bulk_activation",
              },
            });
            if (logErr) console.error("email_send_log insert failed:", logErr.message);

            if (result.accepted) {
              emailsSent++;
            } else {
              emailsSuppressed++;
              errors.push(
                `${emp.first_name} ${emp.last_name}: no se pudo enviar el email (restricción de entrega en ${emp.email}).`,
              );
            }
          } catch (emailErr: any) {
            const detail = emailErr?.message ?? String(emailErr);
            const { error: logErr } = await adminClient.from("email_send_log").insert({
              recipient_email: emp.email,
              template_name: "portal_activation",
              status: "failed",
              message_id: crypto.randomUUID(),
              error_message: String(detail).slice(0, 1000),
              metadata: {
                company_id,
                employee_id: emp.id,
                campaign: "bulk_activation",
              },
            });
            if (logErr) console.error("email_send_log insert failed:", logErr.message);
            emailsFailed++;
            errors.push(`Email to ${emp.first_name}: ${detail}`);
          }
        }

        // Log the invitation
        try {
          const inviteStatus = hasActivePortal ? "resent" : "queued";
          await adminClient.from("employee_invitations").insert({
            company_id,
            employee_id: emp.id,
            channel: "email",
            status: inviteStatus,
            sent_by: caller.id,
            sent_at: new Date().toISOString(),
            notes: `Bulk activation campaign — ${companyName}${hasActivePortal ? " (resend)" : ""}`,
          });
        } catch (_) { /* non-critical */ }
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
      emails_suppressed: emailsSuppressed,
      emails_failed: emailsFailed,
      company_name: companyName,
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
