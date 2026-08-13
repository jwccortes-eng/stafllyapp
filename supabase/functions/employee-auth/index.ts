import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPinAuthMode, PIN_AUTH_MODE_DEFAULT, type PinAuthMode } from "../_shared/security-flags.ts";
import { resolveMultiCompanyAccess, accessDeniedMessage } from "../_shared/multi-company-access.ts";
import {
  resolveCanonicalIdentity,
  verifyCanonicalPin,
  setCanonicalPin,
  lockoutMessage,
} from "../_shared/canonical-pin.ts";

// Internal prefix to meet Supabase min-password-length (6 chars) while keeping 4-digit PINs
const AUTH_PWD_PREFIX = "SF_";

// Sprint S7-B: only Stafly Demo Company may resolve a non-legacy mode.
// Any other tenant is force-pinned to "legacy" no matter what company_settings says.
const STAFLY_DEMO_COMPANY_ID = "d3500000-0000-4000-8000-000000000001";

/**
 * S7-B/D/K safe mode resolver.
 *   - Reads security.pin_auth_mode via getPinAuthMode (silent legacy on error).
 *   - Force-downgrades to "legacy" for any tenant other than Stafly Demo.
 *   - Demo-honored values: "dual" and "hash_only_ready" (S7-K capability).
 *   - hash_reader / hash_only still resolve to "legacy".
 *   - Never logs PIN, password, or hash. Logs mode + tenant only.
 *
 * The login branch (below) switches on the effective mode to run either
 * the dual hash-first+fallback path (S7-D/E/G) or the hash_only_ready
 * hash-only path (S7-K). activate / provision / change-pin call this
 * resolver for telemetry only and never branch on the value.
 */
const DEMO_HONORED_MODES_LOCAL: ReadonlySet<PinAuthMode> = new Set<PinAuthMode>([
  "dual",
  "hash_only_ready",
]);

async function resolvePinAuthModeSafe(
  adminClient: any,
  companyId: string | null | undefined,
  context: string,
): Promise<PinAuthMode> {
  if (!companyId) return PIN_AUTH_MODE_DEFAULT;
  let raw: PinAuthMode = PIN_AUTH_MODE_DEFAULT;
  try {
    raw = await getPinAuthMode(adminClient, companyId);
  } catch {
    raw = PIN_AUTH_MODE_DEFAULT;
  }
  let effective: PinAuthMode = PIN_AUTH_MODE_DEFAULT;
  if (companyId === STAFLY_DEMO_COMPANY_ID && DEMO_HONORED_MODES_LOCAL.has(raw)) {
    effective = raw;
  }
  try {
    console.info("[pin-auth-mode]", {
      ctx: context,
      company_id: companyId,
      requested: raw,
      effective,
      demo: companyId === STAFLY_DEMO_COMPANY_ID,
    });
  } catch { /* logging must never throw */ }
  return effective;
}



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

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

function getPhoneLookupVariants(raw: string | null | undefined): string[] {
  const normalized = normalizePhone(raw);
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  if (normalized.length === 10) {
    variants.add(`1${normalized}`);
  }
  return Array.from(variants);
}

async function resolveAuthEmail(adminClient: any, userId: string | null | undefined, fallbackEmail: string) {
  if (!userId) return fallbackEmail;
  try {
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (!error && data?.user?.email) return data.user.email;
  } catch (err) {
    console.error("[employee-auth] resolveAuthEmail failed", userId, err);
  }
  return fallbackEmail;
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

    const { action, phone, pin, employee_id, invite_token, email, avatar_url, activation_audit } = await req.json();

    // ACTION: check
    if (action === "check") {
      if (!phone) {
        return new Response(
          JSON.stringify({ error: "Teléfono requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanPhone = normalizePhone(phone);
      const phoneVariants = getPhoneLookupVariants(phone);
      console.info("[phone-login]", { normalizedPhone: cleanPhone, step: "check" });

      // Rate limit check action to prevent enumeration
      const rateCheck = await checkRateLimit(adminClient, cleanPhone);
      if (!rateCheck.allowed) {
        // Return generic response to avoid leaking info
        return new Response(
          JSON.stringify({ found: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // P0 — MULTI-COMPANY AUTH ACCESS TRUTH: la identidad NO se filtra por
      // `is_active`. Se traen todas las fichas del teléfono y el resolver
      // canónico separa identidad (AUTH) de acceso por compañía (MEMBERSHIP).
      const { data: employees } = await adminClient
        .from("employees")
        .select("id, company_id, access_pin, access_pin_hash, is_active, user_id, portal_access_enabled, merged_into_employee_id, created_at")
        .in("phone_number", phoneVariants)
        .order("created_at", { ascending: true });

      const access = resolveMultiCompanyAccess(employees ?? []);

      if (access.outcome === "no_identity") {
        return new Response(
          JSON.stringify({ found: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (access.outcome === "access_disabled") {
        return new Response(
          JSON.stringify({
            found: true,
            access_disabled: true,
            is_active: false,
            requires_activation: false,
            error: accessDeniedMessage("access_disabled"),
            code: "access_disabled",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return minimal info — no PII (name, email, avatar)
      return new Response(
        JSON.stringify({
          found: true,
          requires_activation: access.requiresActivation,
          is_active: true,
          active_companies: access.activeCompanyIds.length,
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
        const cleanPhone = normalizePhone(phone);
        const phoneVariants = getPhoneLookupVariants(phone);
        console.info("[phone-login]", { normalizedPhone: cleanPhone, step: "activate_lookup" });
        const { data: byPhone } = await adminClient
          .from("employees")
          .select("id, first_name, last_name, access_pin, access_pin_hash, is_active, user_id, phone_number, company_id, merged_into_employee_id, created_at")
          .in("phone_number", phoneVariants)
          .order("created_at", { ascending: true });
        // Activación: sólo sobre fichas activas, pero la identidad se resuelve
        // completa para poder distinguir "no existe" de "acceso desactivado".
        const activateAccess = resolveMultiCompanyAccess(byPhone ?? []);
        if (activateAccess.outcome === "access_disabled") {
          return new Response(
            JSON.stringify({ error: accessDeniedMessage("access_disabled"), code: "access_disabled" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        employee = activateAccess.activeRecords.find((e: any) => !e.access_pin)
          || activateAccess.primaryRecord
          || activateAccess.activeRecords[0]
          || null;
      }

      if (!employee && employee_id) {
        const { data: byId } = await adminClient
          .from("employees")
          .select("id, first_name, last_name, access_pin, is_active, user_id, phone_number, company_id")
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
            .select("id, first_name, last_name, access_pin, is_active, user_id, phone_number, company_id")
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

      // S7-C: safe mode read. Telemetry only — no branching on mode in this sprint.
      // Stafly Demo with security.pin_auth_mode="dual" will log effective=dual,
      // every other tenant force-resolves to legacy. authPassword / auth user
      // creation / PIN write / dual-write hash / signIn behavior unchanged.
      const _pinAuthMode_activate = await resolvePinAuthModeSafe(
        adminClient,
        (employee as any)?.company_id ?? null,
        "activate",
      );

      // Resolver phone para crear cuenta auth: usar el del empleado si existe; si no, sintético
      const empPhone = (employee.phone_number || "").replace(/[^\d+]/g, "").slice(0, 20);
      const authIdentifier = empPhone || `noph_${employee.id.replace(/-/g, "").slice(0, 16)}`;

      // P0 AUTH PIN CANONICALIZATION: la activación ya NO escribe PIN en la
      // ficha. El PIN se guarda en la credencial canónica del Auth User una
      // vez resuelto/creado (más abajo).
      const updateData: Record<string, any> = {};
      if (email && typeof email === "string" && email.includes("@")) {
        updateData.email = email.trim().slice(0, 255);
      }
      if (avatar_url && typeof avatar_url === "string") {
        updateData.avatar_url = avatar_url.slice(0, 500);
      }

      if (Object.keys(updateData).length > 0) {
        await adminClient.from("employees").update(updateData).eq("id", employee.id);
      }

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

      // Escritor único: la credencial canónica se crea contra el Auth User.
      if (employee.user_id) {
        await setCanonicalPin(adminClient, employee.user_id, pin, "activation");
      }

      await ensureEmployeeRole(adminClient, employee.user_id);

      const loginEmail = await resolveAuthEmail(adminClient, employee.user_id, empEmail);
      console.info("[phone-login]", {
        normalizedPhone: normalizePhone(phone),
        matchedProfileId: null,
        matchedEmployeeId: employee.id,
        matchedCompanyId: null,
        portalEnabled: true,
        isActive: employee.is_active,
        step: "activate_sign_in",
      });

      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: loginEmail,
        password: pwd,
      });

      if (signInError) {
        console.error("[employee-auth] activation signIn error:", signInError);
        return new Response(
          JSON.stringify({
            error: "Cuenta activada pero error al iniciar sesión. Intenta iniciar sesión manualmente.",
            code: "signin_failed",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── Persist activation audit + notify admins (best-effort) ───
      try {
        // Re-read employee with company context for audit/notification scoping
        const { data: empFull } = await adminClient
          .from("employees")
          .select("id, company_id, first_name, last_name, onboarding_status")
          .eq("id", employee.id)
          .maybeSingle();

        const companyId = empFull?.company_id ?? null;
        const empName = `${empFull?.first_name ?? employee.first_name ?? ""} ${empFull?.last_name ?? employee.last_name ?? ""}`.trim();

        // Canonical: write "complete" (admin UI uses this), guards accept both.
        if (companyId) {
          await adminClient.from("employees").update({
            onboarding_status: "complete",
            onboarding_completed_at: new Date().toISOString(),
            portal_access_enabled: true,
            updated_at: new Date().toISOString(),
          }).eq("id", employee.id);
        }

        // Sanitize incoming activation_audit. Never trust full SSN; only allow safe fields.
        const ALLOWED_FIELDS = new Set([
          "first_name","last_name","email","date_of_birth",
          "address","address_line","address_city","address_state","address_zip","address_structured",
          "emergency_contact_name","emergency_contact_phone",
          "can_drive","has_vehicle","languages","ssn_last4",
        ]);
        const sanitize = (obj: any): Record<string, any> => {
          if (!obj || typeof obj !== "object") return {};
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(obj)) {
            if (ALLOWED_FIELDS.has(k)) out[k] = v;
          }
          // Hard guard: never persist full SSN
          delete (out as any).ssn;
          return out;
        };

        let oldProfile: Record<string, any> = {};
        let newProfile: Record<string, any> = {};
        const changed: string[] = [];
        if (activation_audit && typeof activation_audit === "object") {
          // Validate cross-tenant integrity of submitted audit
          const auditEmpId = (activation_audit as any).employee_id;
          const auditCompanyId = (activation_audit as any).company_id;
          const empOk = !auditEmpId || auditEmpId === employee.id;
          const coOk = !auditCompanyId || !companyId || auditCompanyId === companyId;
          if (empOk && coOk) {
            oldProfile = sanitize((activation_audit as any).old_profile);
            newProfile = sanitize((activation_audit as any).new_profile);
            const keys = new Set([...Object.keys(oldProfile), ...Object.keys(newProfile)]);
            for (const k of keys) {
              const a = JSON.stringify(oldProfile[k] ?? null);
              const b = JSON.stringify(newProfile[k] ?? null);
              if (a !== b) changed.push(k);
            }
          }
        }

        if (companyId) {
          // Activity log entry (admins/owners can read via RLS)
          await adminClient.from("activity_log").insert({
            user_id: employee.user_id,
            company_id: companyId,
            action: "employee_profile_updated_during_activation",
            entity_type: "employee",
            entity_id: employee.id,
            old_data: oldProfile,
            new_data: newProfile,
            details: {
              source: "activation",
              employee_name: empName,
              changed_fields: changed,
              onboarding_status: "complete",
            },
          });

          // Notify company admins/owners
          const { data: admins } = await adminClient
            .from("company_users")
            .select("user_id")
            .eq("company_id", companyId)
            .in("role", ["admin", "company_owner", "owner"]);

          const recipientIds = Array.from(new Set((admins ?? []).map((a: any) => a.user_id).filter(Boolean)));
          if (recipientIds.length > 0) {
            const rows = recipientIds.map((uid) => ({
              company_id: companyId,
              recipient_id: uid,
              recipient_type: "user",
              type: "employee_profile_updated",
              title: "Worker profile updated",
              body: `${empName || "A worker"} updated their profile during portal activation.`,
              metadata: {
                employee_id: employee.id,
                company_id: companyId,
                source: "activation",
                changed_fields: changed,
                onboarding_status: "complete",
              },
            }));
            await adminClient.from("notifications").insert(rows);
          }
        }
      } catch (auditErr) {
        // Never block activation on audit failures
        console.error("[activate] audit/notification persistence failed", auditErr);
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

      const cleanPhone = normalizePhone(phone);
      const phoneVariants = getPhoneLookupVariants(phone);
      const pwd = authPassword(pin);
      console.info("[phone-login]", { normalizedPhone: cleanPhone, hasPin: !!pin, step: "login" });

      // ── P0 AUTH PIN CANONICALIZATION ──────────────────────────────────
      // Flujo único: normalizar teléfono → resolver Auth User → lockout
      // canónico → PIN canónico → memberships → sesión.
      // Ningún fallback a employees.access_pin / hash / switch_pin.
      const identity = await resolveCanonicalIdentity(adminClient, phone);

      // P0 — MULTI-COMPANY AUTH ACCESS TRUTH: identidad completa por teléfono
      // (sin filtrar por `is_active`); el resolver decide si hay acceso.
      const { data: loginEmployees } = await adminClient
        .from("employees")
        .select("id, first_name, last_name, phone_number, is_active, user_id, must_change_pin, company_id, portal_access_enabled, merged_into_employee_id, created_at")
        .in("phone_number", phoneVariants)
        .order("created_at", { ascending: true });

      const loginAccess = resolveMultiCompanyAccess(loginEmployees ?? []);

      if (loginAccess.outcome === "no_identity" && !identity.userId) {
        return new Response(
          JSON.stringify({ error: "Credenciales inválidas" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (loginAccess.outcome === "access_disabled") {
        return new Response(
          JSON.stringify({ error: accessDeniedMessage("access_disabled"), code: "access_disabled" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const activeLogin = loginAccess.activeRecords;
      const authUserId = identity.userId
        ?? activeLogin.find((e: any) => !!e.user_id)?.user_id
        ?? null;

      const pinCheck = await verifyCanonicalPin(adminClient, authUserId, pin);

      console.info("[auth-pin-canonical]", {
        ctx: "login",
        normalizedPhone: identity.phone,
        auth_user_resolved: !!authUserId,
        has_credential: identity.hasCredential,
        result: pinCheck.ok ? "ok" : pinCheck.reason,
      });

      if (!pinCheck.ok) {
        if (pinCheck.reason === "locked") {
          return new Response(
            JSON.stringify({ error: lockoutMessage(pinCheck.lockedUntil), code: "locked" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (pinCheck.reason === "no_credential") {
          return new Response(
            JSON.stringify({
              error: "Tu acceso aún no tiene PIN configurado. Pide a tu administrador que lo genere.",
              code: "no_credential",
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Credenciales inválidas" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Contexto operativo: ficha activa asociada al Auth User autenticado.
      const employee = activeLogin.find((e: any) => e.user_id === authUserId)
        || loginAccess.primaryRecord
        || activeLogin[0]!;

      if (!employee) {
        return new Response(
          JSON.stringify({ error: accessDeniedMessage("access_disabled"), code: "access_disabled" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!employee.user_id && authUserId) employee.user_id = authUserId;

      console.info("[multi-company-auth]", {
        step: "login_access_truth",
        outcome: loginAccess.outcome,
        active_companies: loginAccess.activeCompanyIds.length,
        inactive_companies: loginAccess.inactiveCompanyIds.length,
        selected_company_id: employee.company_id,
      });

      // Lockout legacy por teléfono: neutralizado. El único bloqueo válido
      // es el canónico (auth_pin_credentials.locked_until).
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
            .in("phone_number", phoneVariants)
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

      const loginEmail = await resolveAuthEmail(adminClient, employee.user_id, empEmail);
      console.info("[phone-login]", {
        normalizedPhone: cleanPhone,
        matchedProfileId: null,
        matchedEmployeeId: employee.id,
        matchedCompanyId: employee.company_id,
        portalEnabled: employee.portal_access_enabled ?? null,
        isActive: employee.is_active,
        step: "login_sign_in",
      });

      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: loginEmail,
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

      // S7-B: read effective pin_auth_mode for this tenant (no behavior change).
      const { data: provCompanyRow } = await adminClient
        .from("employees")
        .select("company_id")
        .eq("id", employee_id)
        .maybeSingle();
      const _pinAuthMode_provision = await resolvePinAuthModeSafe(
        adminClient,
        provCompanyRow?.company_id ?? null,
        "provision",
      );
      void _pinAuthMode_provision;

      // Generate 4-digit PIN for provision as well
      const newPin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const newPwd = authPassword(newPin);

      const { data: emp } = await adminClient
        .from("employees")
        .select("phone_number, user_id")
        .eq("id", employee_id)
        .maybeSingle();

      if (!emp?.user_id) {
        return new Response(
          JSON.stringify({
            error: "Esta persona aún no tiene identidad de acceso. Actívala antes de generar el PIN.",
            code: "no_auth_user",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Escritor único: credencial canónica + limpieza atómica de lockout.
      const provisioned = await setCanonicalPin(adminClient, emp.user_id, newPin, "provision");
      if (!provisioned) {
        return new Response(
          JSON.stringify({ error: "No se pudo generar el PIN" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await adminClient.auth.admin.updateUserById(emp.user_id, { password: newPwd });

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
      // RETIRADO (P0 AUTH PIN CANONICALIZATION): este escritor propagaba el PIN
      // legacy de una ficha arbitraria a la contraseña de autenticación.
      return new Response(
        JSON.stringify({
          error: "Operación retirada. El PIN es único por persona y se gestiona con reset de PIN.",
          code: "retired",
        }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
      // deno-lint-ignore no-unreachable
      const updated = 0;

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

      // Canonical: el PIN pertenece al Auth User, no a la ficha de empleado.
      if (current_pin) {
        const currentCheck = await verifyCanonicalPin(adminClient, caller.id, current_pin);
        if (!currentCheck.ok) {
          const msg = currentCheck.reason === "locked"
            ? lockoutMessage(currentCheck.lockedUntil)
            : "PIN actual incorrecto";
          return new Response(JSON.stringify({ error: msg }), {
            status: currentCheck.reason === "locked" ? 429 : 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const changed = await setCanonicalPin(adminClient, caller.id, new_pin, "self_change", caller.id);
      if (!changed) {
        return new Response(JSON.stringify({ error: "No se pudo actualizar el PIN" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("employees")
        .update({ must_change_pin: false })
        .eq("user_id", caller.id);

      // Sync auth password (puente de sesión, no credencial)
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
    return new Response(JSON.stringify({ error: "Error interno del servidor", code: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
