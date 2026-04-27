import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Internal prefix to meet Supabase min-password-length (6 chars) while keeping 4-digit PINs
const AUTH_PWD_PREFIX = "SF_";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES_TIER1 = 15;
const LOCKOUT_MINUTES_TIER2 = 60;
const MAX_LOCKOUT_ATTEMPTS = 20;

interface RateLimit {
  id: string;
  phone_number: string;
  failed_attempts: number;
  locked_until: string | null;
  last_attempt_at: string;
}

async function checkRateLimit(adminClient: any, phone: string): Promise<{ allowed: boolean; message?: string; minutesLeft?: number }> {
  const { data, error } = await adminClient
    .from("auth_rate_limits")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();

  if (error || !data) return { allowed: true };

  const record = data as RateLimit;

  if (record.failed_attempts >= MAX_LOCKOUT_ATTEMPTS) {
    return { allowed: false, message: "Cuenta bloqueada permanentemente. Contacta al administrador." };
  }

  if (record.locked_until) {
    const lockUntil = new Date(record.locked_until);
    const now = new Date();
    if (now < lockUntil) {
      const minutesLeft = Math.ceil((lockUntil.getTime() - now.getTime()) / 60000);
      return { 
        allowed: false, 
        message: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesLeft} minuto${minutesLeft > 1 ? 's' : ''}.`,
        minutesLeft,
      };
    }
  }

  return { allowed: true };
}

async function recordFailedAttempt(adminClient: any, phone: string): Promise<{ locked: boolean; message: string }> {
  const { data: existing } = await adminClient
    .from("auth_rate_limits")
    .select("id, failed_attempts")
    .eq("phone_number", phone)
    .maybeSingle();

  const newAttempts = (existing?.failed_attempts ?? 0) + 1;

  let lockedUntil: string | null = null;
  let message = "PIN incorrecto";

  if (newAttempts >= MAX_LOCKOUT_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    message = "Cuenta bloqueada permanentemente por demasiados intentos fallidos. Contacta al administrador.";
  } else if (newAttempts >= 10) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES_TIER2 * 60 * 1000).toISOString();
    message = `PIN incorrecto. Cuenta bloqueada por ${LOCKOUT_MINUTES_TIER2} minutos. (${newAttempts} intentos fallidos)`;
  } else if (newAttempts >= MAX_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES_TIER1 * 60 * 1000).toISOString();
    message = `PIN incorrecto. Cuenta bloqueada por ${LOCKOUT_MINUTES_TIER1} minutos. (${newAttempts} intentos fallidos)`;
  } else {
    const remaining = MAX_ATTEMPTS - newAttempts;
    message = `PIN incorrecto. ${remaining} intento${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`;
  }

  if (existing) {
    await adminClient
      .from("auth_rate_limits")
      .update({
        failed_attempts: newAttempts,
        locked_until: lockedUntil,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await adminClient
      .from("auth_rate_limits")
      .insert({
        phone_number: phone,
        failed_attempts: newAttempts,
        locked_until: lockedUntil,
        last_attempt_at: new Date().toISOString(),
      });
  }

  return { locked: !!lockedUntil, message };
}

async function resetRateLimit(adminClient: any, phone: string): Promise<void> {
  await adminClient
    .from("auth_rate_limits")
    .delete()
    .eq("phone_number", phone);
}

async function ensureEmployeeRole(adminClient: any, userId: string): Promise<void> {
  const { data: existingRoles, error: roleLookupError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);

  if (roleLookupError) {
    console.error("Error checking user role:", roleLookupError.message);
    return;
  }

  if (!existingRoles || existingRoles.length === 0) {
    const { error: insertRoleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: userId, role: "employee" });

    if (insertRoleError) {
      console.error("Error assigning employee role:", insertRoleError.message);
    }
  }
}

/** Build the auth password from a 4-digit PIN */
function authPassword(pin: string): string {
  return AUTH_PWD_PREFIX + pin;
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
    const anonClient = createClient(supabaseUrl, anonKey);

    const { action, phone, pin, employee_id, invite_token, email, avatar_url } = await req.json();

    // ACTION: check
    if (action === "check") {
      if (!phone) {
        return new Response(
          JSON.stringify({ error: "Teléfono requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);

      // Rate limit check action to prevent enumeration
      const rateCheck = await checkRateLimit(adminClient, cleanPhone);
      if (!rateCheck.allowed) {
        // Return generic response to avoid leaking info
        return new Response(
          JSON.stringify({ found: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch all employees with this phone (may exist in multiple companies)
      const { data: employees } = await adminClient
        .from("employees")
        .select("id, access_pin, is_active")
        .eq("phone_number", cleanPhone)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      // Prioritize: has PIN + active > active without PIN
      const employee = employees?.find(e => e.access_pin) || employees?.[0] || null;

      if (!employee) {
        return new Response(
          JSON.stringify({ found: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return minimal info — no PII (name, email, avatar)
      return new Response(
        JSON.stringify({
          found: true,
          requires_activation: !employee.access_pin,
          is_active: employee.is_active,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: activate
    if (action === "activate") {
      // PIN siempre requerido
      if (!pin) {
        return new Response(
          JSON.stringify({ error: "PIN requerido", code: "missing_pin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!/^\d{4}$/.test(pin)) {
        return new Response(
          JSON.stringify({ error: "El PIN debe ser exactamente 4 dígitos numéricos", code: "invalid_pin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Identidad: phone, employee_id o invite_token (al menos uno)
      if (!phone && !employee_id && !invite_token) {
        return new Response(
          JSON.stringify({
            error: "Falta identificación. Se requiere teléfono, employee_id o invite_token.",
            code: "missing_identity",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pwd = authPassword(pin);

      // Resolver empleado: phone → employee_id → invite_token
      let employee: any = null;

      if (phone) {
        const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);
        const { data: byPhone } = await adminClient
          .from("employees")
          .select("id, first_name, last_name, access_pin, is_active, user_id, phone_number")
          .eq("phone_number", cleanPhone)
          .eq("is_active", true)
          .order("created_at", { ascending: true });
        employee = byPhone?.find((e: any) => !e.access_pin) || byPhone?.[0] || null;
      }

      if (!employee && employee_id) {
        const { data: byId } = await adminClient
          .from("employees")
          .select("id, first_name, last_name, access_pin, is_active, user_id, phone_number")
          .eq("id", employee_id)
          .maybeSingle();
        employee = byId ?? null;
      }

      if (!employee && invite_token) {
        const { data: invRows } = await adminClient
          .from("employee_invitations")
          .select("employee_id, status, expires_at")
          .eq("invite_token", invite_token)
          .maybeSingle();
        if (invRows?.employee_id) {
          if (invRows.status === "accepted") {
            return new Response(
              JSON.stringify({ error: "Esta invitación ya fue activada.", code: "invitation_used" }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (invRows.expires_at && new Date(invRows.expires_at) < new Date()) {
            return new Response(
              JSON.stringify({ error: "La invitación expiró.", code: "invitation_expired" }),
              { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const { data: byInv } = await adminClient
            .from("employees")
            .select("id, first_name, last_name, access_pin, is_active, user_id, phone_number")
            .eq("id", invRows.employee_id)
            .maybeSingle();
          employee = byInv ?? null;
        }
      }

      if (!employee) {
        return new Response(
          JSON.stringify({ error: "Empleado no encontrado", code: "employee_not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!employee.is_active) {
        return new Response(
          JSON.stringify({ error: "Tu cuenta está inactiva. Contacta al administrador.", code: "inactive" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // "Already activated" = real linked auth user. A legacy/seed access_pin
      // without a user_id is NOT a real activation; the invite flow must be
      // allowed to overwrite it and create the auth user.
      if (employee.user_id && employee.access_pin) {
        return new Response(
          JSON.stringify({ error: "Tu cuenta ya está activada. Inicia sesión con tu PIN.", code: "already_activated" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolver phone para crear cuenta auth: usar el del empleado si existe; si no, sintético
      const empPhone = (employee.phone_number || "").replace(/[^\d+]/g, "").slice(0, 20);
      const authIdentifier = empPhone || `noph_${employee.id.replace(/-/g, "").slice(0, 16)}`;

      const updateData: Record<string, any> = { access_pin: pin };
      if (email && typeof email === "string" && email.includes("@")) {
        updateData.email = email.trim().slice(0, 255);
      }
      if (avatar_url && typeof avatar_url === "string") {
        updateData.avatar_url = avatar_url.slice(0, 500);
      }

      await adminClient.from("employees").update(updateData).eq("id", employee.id);

      const empEmail = `emp_${authIdentifier}@employee.internal`;

      if (!employee.user_id) {
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: empEmail,
          password: pwd,
          email_confirm: true,
          user_metadata: { full_name: `${employee.first_name} ${employee.last_name}` },
        });

        if (createError) {
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existingUser = users?.find((u: any) => u.email === empEmail);
          if (existingUser) {
            await adminClient.auth.admin.updateUserById(existingUser.id, { password: pwd });
            await adminClient.from("employees").update({ user_id: existingUser.id }).eq("id", employee.id);
            employee.user_id = existingUser.id;
          } else {
            return new Response(
              JSON.stringify({ error: "Error al crear cuenta: " + createError.message, code: "auth_create_failed" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else if (newUser?.user) {
          await adminClient.from("employees").update({ user_id: newUser.user.id }).eq("id", employee.id);
          employee.user_id = newUser.user.id;
        }
      } else {
        await adminClient.auth.admin.updateUserById(employee.user_id, { password: pwd });
      }

      await ensureEmployeeRole(adminClient, employee.user_id);

      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: empEmail,
        password: pwd,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({
            error: "Cuenta activada pero error al iniciar sesión. Intenta iniciar sesión manualmente.",
            code: "signin_failed",
            detail: signInError.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          activated: true,
          session: signInData.session,
          user: signInData.user,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: login
    if (action === "login") {
      if (!phone || !pin) {
        return new Response(
          JSON.stringify({ error: "Teléfono y PIN son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);
      const pwd = authPassword(pin);

      const rateCheck = await checkRateLimit(adminClient, cleanPhone);
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: rateCheck.message }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch all employees with this phone; pick the one with matching PIN
      const { data: loginEmployees } = await adminClient
        .from("employees")
        .select("id, first_name, last_name, phone_number, access_pin, is_active, user_id, must_change_pin")
        .eq("phone_number", cleanPhone)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      // Prioritize: match by PIN first, then fallback to first with PIN
      const employee = loginEmployees?.find(e => e.access_pin === pin)
        || loginEmployees?.find(e => !!e.access_pin)
        || loginEmployees?.[0]
        || null;

      if (!employee) {
        await recordFailedAttempt(adminClient, cleanPhone);
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
        const result = await recordFailedAttempt(adminClient, cleanPhone);
        return new Response(
          JSON.stringify({ error: result.message }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await resetRateLimit(adminClient, cleanPhone);

      const empEmail = `emp_${cleanPhone}@employee.internal`;
      
      if (!employee.user_id) {
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: empEmail,
          password: pwd,
          email_confirm: true,
          user_metadata: { full_name: `${employee.first_name} ${employee.last_name}` },
        });

        if (createError) {
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existingUser = users?.find((u: any) => u.email === empEmail);
          if (existingUser) {
            await adminClient.auth.admin.updateUserById(existingUser.id, { password: pwd });
            await adminClient.from("employees").update({ user_id: existingUser.id }).eq("id", employee.id);
            employee.user_id = existingUser.id;
          } else {
            return new Response(
              JSON.stringify({ error: "Error al crear cuenta: " + createError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else if (newUser?.user) {
          await adminClient.from("employees").update({ user_id: newUser.user.id }).eq("id", employee.id);
          employee.user_id = newUser.user.id;
        }
      } else {
        await adminClient.auth.admin.updateUserById(employee.user_id, { password: pwd });
      }

      await ensureEmployeeRole(adminClient, employee.user_id);

      // Link ALL employees with same phone to this user_id + ensure company_users entries
      if (employee.user_id) {
        const { data: allPhoneEmps } = await adminClient
          .from("employees")
          .select("id, company_id, user_id")
          .eq("phone_number", cleanPhone)
          .eq("is_active", true);

        for (const emp of (allPhoneEmps ?? [])) {
          // Link employee to same user_id if not already linked
          if (!emp.user_id) {
            await adminClient.from("employees").update({ user_id: employee.user_id }).eq("id", emp.id);
          }
          // Ensure company_users entry exists
          const { data: existingCU } = await adminClient
            .from("company_users")
            .select("id")
            .eq("user_id", employee.user_id)
            .eq("company_id", emp.company_id)
            .maybeSingle();
          if (!existingCU) {
            await adminClient.from("company_users").insert({
              user_id: employee.user_id,
              company_id: emp.company_id,
              role: "employee",
            }).then(() => {});
          }
        }
      }

      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: empEmail,
        password: pwd,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ error: "Error al iniciar sesión: " + signInError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      adminClient.rpc("cleanup_expired_rate_limits").then(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          session: signInData.session,
          user: signInData.user,
          must_change_pin: employee.must_change_pin === true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: provision
    if (action === "provision") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
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

      if (!employee_id) {
        return new Response(JSON.stringify({ error: "employee_id requerido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Authorize: global developer/owner/admin OR company-level admin/owner of the target employee's company
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id);
      const callerRoles = (roleData ?? []).map((r: any) => r.role);
      const isGlobalPrivileged =
        callerRoles.includes("developer") ||
        callerRoles.includes("owner") ||
        callerRoles.includes("admin");

      let isCompanyAdmin = false;
      if (!isGlobalPrivileged) {
        const { data: targetEmp } = await adminClient
          .from("employees")
          .select("company_id")
          .eq("id", employee_id)
          .maybeSingle();
        if (targetEmp?.company_id) {
          const { data: companyRole } = await adminClient
            .from("company_users")
            .select("role")
            .eq("user_id", caller.id)
            .eq("company_id", targetEmp.company_id)
            .maybeSingle();
          isCompanyAdmin =
            companyRole?.role === "admin" ||
            companyRole?.role === "company_owner" ||
            companyRole?.role === "owner";
        }
      }

      if (!isGlobalPrivileged && !isCompanyAdmin) {
        return new Response(JSON.stringify({ error: "Solo admins pueden generar PINs" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate 4-digit PIN for provision as well
      const newPin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const newPwd = authPassword(newPin);
      
      await adminClient.from("employees").update({ access_pin: newPin }).eq("id", employee_id);

      const { data: emp } = await adminClient
        .from("employees")
        .select("phone_number, user_id")
        .eq("id", employee_id)
        .maybeSingle();
      
      // Also update auth password if employee has an auth account
      if (emp?.user_id) {
        await adminClient.auth.admin.updateUserById(emp.user_id, { password: newPwd });
      }

      if (emp?.phone_number) {
        await resetRateLimit(adminClient, emp.phone_number.replace(/[\s\-\(\)]/g, ""));
      }

      return new Response(
        JSON.stringify({ success: true, pin: newPin }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: sync-pins — Bulk update auth passwords for all employees with 4-digit PINs
    if (action === "sync-pins") {
      // Secured: requires authenticated admin/owner
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
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
      if (!callerRoles.includes("owner") && !callerRoles.includes("admin")) {
        return new Response(JSON.stringify({ error: "Solo admins pueden sincronizar PINs" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: emps } = await adminClient
        .from("employees")
        .select("id, first_name, last_name, access_pin, user_id")
        .not("access_pin", "is", null)
        .not("user_id", "is", null);

      let updated = 0;
      for (const e of emps ?? []) {
        if (e.access_pin && e.user_id) {
          const pwd = authPassword(e.access_pin);
          const { error } = await adminClient.auth.admin.updateUserById(e.user_id, { password: pwd });
          if (!error) updated++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, updated }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: change-pin — Employee changes their own PIN (requires auth)
    if (action === "change-pin") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
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

      const { current_pin, new_pin } = await req.json().catch(() => ({}));

      if (!new_pin || !/^\d{4}$/.test(new_pin)) {
        return new Response(JSON.stringify({ error: "El nuevo PIN debe ser exactamente 4 dígitos" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find employee linked to this user
      const { data: emp } = await adminClient
        .from("employees")
        .select("id, access_pin, user_id")
        .eq("user_id", caller.id)
        .maybeSingle();

      if (!emp) {
        return new Response(JSON.stringify({ error: "Empleado no encontrado" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify current PIN if provided
      if (current_pin && emp.access_pin && current_pin !== emp.access_pin) {
        return new Response(JSON.stringify({ error: "PIN actual incorrecto" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update PIN in employees table and clear must_change_pin flag
      await adminClient.from("employees").update({ access_pin: new_pin, must_change_pin: false }).eq("id", emp.id);

      // Sync auth password
      const newPwd = authPassword(new_pin);
      await adminClient.auth.admin.updateUserById(caller.id, { password: newPwd });

      return new Response(
        JSON.stringify({ success: true, message: "PIN actualizado correctamente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[employee-auth] internal error:", err?.message, err?.stack);
    return new Response(JSON.stringify({ error: "Error interno del servidor", code: "internal_error", detail: err?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
