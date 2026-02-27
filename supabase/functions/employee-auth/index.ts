import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES_TIER1 = 15;  // After 5 failures
const LOCKOUT_MINUTES_TIER2 = 60;  // After 10 failures
const MAX_LOCKOUT_ATTEMPTS = 20;   // After 20 failures: permanent lock until admin reset

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

  // Check if permanently locked
  if (record.failed_attempts >= MAX_LOCKOUT_ATTEMPTS) {
    return { allowed: false, message: "Cuenta bloqueada permanentemente. Contacta al administrador." };
  }

  // Check if currently locked
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
  // Upsert: increment failed_attempts
  const { data: existing } = await adminClient
    .from("auth_rate_limits")
    .select("id, failed_attempts")
    .eq("phone_number", phone)
    .maybeSingle();

  const newAttempts = (existing?.failed_attempts ?? 0) + 1;

  // Determine lockout duration
  let lockedUntil: string | null = null;
  let message = "PIN incorrecto";

  if (newAttempts >= MAX_LOCKOUT_ATTEMPTS) {
    // Permanent lock
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { action, phone, pin, employee_id } = await req.json();

    // ACTION: login - Employee login with phone + PIN
    if (action === "login") {
      if (!phone || !pin) {
        return new Response(
          JSON.stringify({ error: "Teléfono y PIN son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clean phone number — strip everything except digits and leading +
      const cleanPhone = phone.replace(/[^\d+]/g, "").slice(0, 20);

      // Check rate limit BEFORE any database lookup
      const rateCheck = await checkRateLimit(adminClient, cleanPhone);
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({ error: rateCheck.message }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find employee by phone number (use exact match only to prevent injection)
      const { data: employee, error: empError } = await adminClient
        .from("employees")
        .select("id, first_name, last_name, phone_number, access_pin, is_active, user_id")
        .eq("phone_number", cleanPhone)
        .maybeSingle();

      if (empError || !employee) {
        // Record failed attempt even for unknown phones (prevents enumeration timing)
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

      // PIN correct — reset rate limit
      await resetRateLimit(adminClient, cleanPhone);

      // If employee doesn't have a Supabase auth user, create one
      const empEmail = `emp_${cleanPhone}@employee.internal`;
      
      if (!employee.user_id) {
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: empEmail,
          password: pin,
          email_confirm: true,
          user_metadata: { full_name: `${employee.first_name} ${employee.last_name}` },
        });

        if (createError) {
          const { data: { users } } = await adminClient.auth.admin.listUsers();
          const existingUser = users?.find((u: any) => u.email === empEmail);
          if (existingUser) {
            await adminClient.auth.admin.updateUserById(existingUser.id, { password: pin });
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
        await adminClient.auth.admin.updateUserById(employee.user_id, { password: pin });
      }

      // Ensure role exists for employee portal access
      await ensureEmployeeRole(adminClient, employee.user_id);

      // Sign in the employee
      const { data: signInData, error: signInError } = await adminClient.auth.signInWithPassword({
        email: empEmail,
        password: pin,
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ error: "Error al iniciar sesión: " + signInError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Periodic cleanup of expired rate limits
      adminClient.rpc("cleanup_expired_rate_limits").then(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          session: signInData.session,
          user: signInData.user,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: provision - Admin creates/updates employee auth
    if (action === "provision") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify caller is admin or owner
      const { data: roleData } = await callerClient
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id);
      const callerRoles = (roleData ?? []).map((r: any) => r.role);
      if (!callerRoles.includes("owner") && !callerRoles.includes("admin")) {
        return new Response(JSON.stringify({ error: "Solo admins pueden generar PINs" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!employee_id) {
        return new Response(JSON.stringify({ error: "employee_id requerido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate new PIN
      const newPin = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
      
      await adminClient.from("employees").update({ access_pin: newPin }).eq("id", employee_id);

      // Reset rate limit for this employee when admin provisions new PIN
      const { data: emp } = await adminClient
        .from("employees")
        .select("phone_number")
        .eq("id", employee_id)
        .maybeSingle();
      
      if (emp?.phone_number) {
        await resetRateLimit(adminClient, emp.phone_number.replace(/[\s\-\(\)]/g, ""));
      }

      return new Response(
        JSON.stringify({ success: true, pin: newPin }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
