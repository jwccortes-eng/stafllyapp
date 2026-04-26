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

function buildActivationEmail(
  employee: { first_name: string; last_name: string; phone_number: string },
  pin: string,
  companyName: string,
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: 'Inter', Arial, sans-serif; background: #f5f6fa; margin: 0; padding: 0;">
  <div style="max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
    <div style="background: linear-gradient(135deg, #3366FF, #5B8DEF); padding: 32px 24px; text-align: center;">
      <h1 style="color: #fff; font-size: 22px; margin: 0;">StaflyApps</h1>
      <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 8px 0 0;">${companyName}</p>
    </div>
    <div style="padding: 32px 24px;">
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px;">Hi ${employee.first_name}! 👋</h2>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px;">
        Your employee portal at <strong>${companyName}</strong> has been activated. You now have access to:
      </p>
      <ul style="font-size: 14px; color: #555; line-height: 1.8; padding-left: 20px; margin: 0 0 24px;">
        <li>📅 View your assigned shifts</li>
        <li>✅ Accept or decline shifts</li>
        <li>⏰ Clock in and clock out</li>
        <li>💰 Track your hours and payments</li>
        <li>📊 View payment reports (hourly, daily & more)</li>
        <li>📋 Access your work history</li>
      </ul>
      
      <div style="background: #f0f4ff; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
        <p style="font-size: 13px; font-weight: 600; color: #3366FF; margin: 0 0 12px;">🔐 Your Login Credentials</p>
        <table style="width: 100%; font-size: 14px; color: #333;">
          <tr><td style="padding: 4px 0; color: #777;">Phone:</td><td style="padding: 4px 0; font-weight: 600;">${employee.phone_number}</td></tr>
          <tr><td style="padding: 4px 0; color: #777;">Temporary PIN:</td><td style="padding: 4px 0; font-weight: 600; font-family: monospace; font-size: 18px; letter-spacing: 4px;">${pin}</td></tr>
        </table>
      </div>

      <div style="background: #fff8e6; border-radius: 12px; padding: 16px; margin: 0 0 24px; border: 1px solid #ffe0a0;">
        <p style="font-size: 13px; color: #8b6914; margin: 0;">
          ⚠️ <strong>Security note</strong> — You'll be asked to change your PIN after your first login.
        </p>
      </div>

      <a href="https://staflyapps.com/portal" style="display: block; text-align: center; background: #3366FF; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-size: 14px; font-weight: 600;">
        Access Employee Portal →
      </a>
    </div>
    <div style="padding: 16px 24px; background: #f8f9fc; text-align: center;">
      <p style="font-size: 11px; color: #999; margin: 0;">StaflyApps · ${companyName} · Smart Workforce Management</p>
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
    const errors: string[] = [];

    for (const emp of employees) {
      try {
        // ─── SAFETY: Determine employee state and act accordingly ───
        const hasActivePortal = !!emp.user_id;
        const hasPin = !!emp.access_pin;

        // Determine the PIN to use/send
        let pin: string;

        if (hasActivePortal) {
          // CASE 3: Already active portal — DO NOT touch auth or PIN
          // Only resend the email with their existing PIN
          pin = emp.access_pin || extractLast4Digits(emp.phone_number) || "0000";
          // Do NOT update employee record or auth user
          console.log(`[RESEND] ${emp.first_name} ${emp.last_name} — already active, email-only resend`);
        } else if (hasPin) {
          // CASE 2: Previously invited (has PIN) but no user_id — create auth user with existing PIN
          pin = emp.access_pin;
          const cleanPhone = emp.phone_number.replace(/[^\d+]/g, "");
          const empEmail = `emp_${cleanPhone}@employee.internal`;
          const pwd = AUTH_PWD_PREFIX + pin;

          const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
            email: empEmail,
            password: pwd,
            email_confirm: true,
            user_metadata: { full_name: `${emp.first_name} ${emp.last_name}` },
          });

          if (createErr) {
            // User may already exist — find and link
            const { data: { users } } = await adminClient.auth.admin.listUsers();
            const existing = users?.find((u: any) => u.email === empEmail);
            if (existing) {
              await adminClient.auth.admin.updateUserById(existing.id, { password: pwd });
              await adminClient.from("employees").update({ user_id: existing.id }).eq("id", emp.id);
              const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", existing.id).limit(1);
              if (!roles || roles.length === 0) {
                await adminClient.from("user_roles").insert({ user_id: existing.id, role: "employee" });
              }
            }
          } else if (newUser?.user) {
            await adminClient.from("employees").update({ user_id: newUser.user.id }).eq("id", emp.id);
            const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", newUser.user.id).limit(1);
            if (!roles || roles.length === 0) {
              await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "employee" });
            }
          }
          console.log(`[ACTIVATE-EXISTING-PIN] ${emp.first_name} ${emp.last_name}`);
        } else {
          // CASE 1: New employee — generate PIN and create auth user
          const newPin = extractLast4Digits(emp.phone_number);
          if (!newPin) { skipped++; continue; }
          pin = newPin;

          // Set PIN on employee record
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

          // Create auth user
          const cleanPhone = emp.phone_number.replace(/[^\d+]/g, "");
          const empEmail = `emp_${cleanPhone}@employee.internal`;
          const pwd = AUTH_PWD_PREFIX + pin;

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
              await adminClient.from("employees").update({ user_id: existing.id }).eq("id", emp.id);
              const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", existing.id).limit(1);
              if (!roles || roles.length === 0) {
                await adminClient.from("user_roles").insert({ user_id: existing.id, role: "employee" });
              }
            }
          } else if (newUser?.user) {
            await adminClient.from("employees").update({ user_id: newUser.user.id }).eq("id", emp.id);
            const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", newUser.user.id).limit(1);
            if (!roles || roles.length === 0) {
              await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "employee" });
            }
          }
          console.log(`[NEW-ACTIVATION] ${emp.first_name} ${emp.last_name}`);
        }

        processed++;

        // Send activation email via queue (transactional pattern)
        if (send_email && emp.email) {
          try {
            const html = buildActivationEmail(emp, pin, companyName);
            const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            const messageId = crypto.randomUUID();
            const idempotencyKey = `bulk-activation-${emp.id}-${Date.now()}`;

            // Get/create unsubscribe token (REQUIRED by Lovable Email API for transactional)
            let unsubscribeToken: string | null = null;
            const { data: tokenData, error: tokenErr } = await adminClient.rpc(
              "get_or_create_unsubscribe_token",
              { p_email: emp.email }
            );
            if (tokenErr) {
              console.error(`Failed to get unsubscribe token for ${emp.email}`, tokenErr.message);
            } else {
              unsubscribeToken = tokenData as string;
            }

            const { error: enqueueErr } = await adminClient.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                queued_at: new Date().toISOString(),
                to: emp.email,
                subject: `${companyName} — Your Employee Portal is Ready`,
                html,
                text,
                from: `${companyName} via StaflyApps <noreply@notify.staflyapps.com>`,
                sender_domain: "notify.staflyapps.com",
                purpose: "transactional",
                label: "portal_activation",
                message_id: messageId,
                idempotency_key: idempotencyKey,
                unsubscribe_token: unsubscribeToken,
              },
            });

            if (enqueueErr) {
              errors.push(`Email enqueue for ${emp.first_name}: ${enqueueErr.message}`);
            } else {
              // Log pending state
              await adminClient.from("email_send_log").insert({
                recipient_email: emp.email,
                template_name: "portal_activation",
                status: "pending",
                message_id: messageId,
                metadata: {
                  company_id,
                  employee_id: emp.id,
                  idempotency_key: idempotencyKey,
                  campaign: "bulk_activation",
                },
              });
              emailsSent++;
            }
          } catch (emailErr: any) {
            errors.push(`Email to ${emp.first_name}: ${emailErr.message}`);
          }
        }

        // Log the invitation
        try {
          const inviteStatus = hasActivePortal ? "resent" : "sent";
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
