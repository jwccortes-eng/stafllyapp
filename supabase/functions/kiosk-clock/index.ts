import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveCanonicalIdentity,
  verifyCanonicalPin,
  lockoutMessage,
} from "../_shared/canonical-pin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// K1 limits
const MAX_PHOTO_BASE64_CHARS = 1_400_000; // ~1MB binary after decode
const ALLOWED_PHOTO_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
const IP_LOCKOUT_THRESHOLD_15M = 30;
const IP_KEY_PREFIX = "ip:";

function jsonResp(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = getClientIp(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { phone, pin, kiosk_device_id, photo_base64 } = await req.json();

    if (!phone || !pin) {
      return jsonResp({ error: "Teléfono y PIN son requeridos" }, 400);
    }

    const cleanPhone = String(phone).replace(/[^\d+]/g, "").slice(0, 20);
    const phoneHash = (await sha256Hex(cleanPhone)).slice(0, 12);

    // ---- Photo pre-validation (before any DB work) ----
    let photoBinary: Uint8Array | null = null;
    let photoContentType = "image/jpeg";
    if (photo_base64) {
      if (typeof photo_base64 !== "string") {
        return jsonResp({ error: "Invalid photo" }, 400);
      }
      if (photo_base64.length > MAX_PHOTO_BASE64_CHARS) {
        console.warn(JSON.stringify({ event: "kiosk_photo_oversize", ip, phone_hash: phoneHash, len: photo_base64.length }));
        return jsonResp({ error: "Photo too large" }, 413);
      }
      const dataUrlMatch = photo_base64.match(/^data:([^;]+);base64,(.*)$/);
      let raw = photo_base64;
      if (dataUrlMatch) {
        if (!ALLOWED_PHOTO_MIME.test(dataUrlMatch[1])) {
          return jsonResp({ error: "Invalid photo" }, 400);
        }
        photoContentType = dataUrlMatch[1].toLowerCase().replace("image/jpg", "image/jpeg");
        raw = dataUrlMatch[2];
      }
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw) || raw.length < 100) {
        return jsonResp({ error: "Invalid photo" }, 400);
      }
      try {
        photoBinary = Uint8Array.from(atob(raw.replace(/[\r\n]/g, "")), (c) => c.charCodeAt(0));
      } catch {
        return jsonResp({ error: "Invalid photo" }, 400);
      }
    }

    // ---- IP rate limit ----
    const ipKey = IP_KEY_PREFIX + ip;
    const { data: ipRate } = await adminClient
      .from("auth_rate_limits")
      .select("locked_until, failed_attempts")
      .eq("phone_number", ipKey)
      .maybeSingle();
    if (ipRate?.locked_until && new Date(ipRate.locked_until) > new Date()) {
      return jsonResp({ error: "Demasiados intentos. Intenta más tarde." }, 429);
    }

    // ---- Phone rate limit ----
    const { data: rateData } = await adminClient
      .from("auth_rate_limits")
      .select("locked_until")
      .eq("phone_number", cleanPhone)
      .maybeSingle();

    if (rateData?.locked_until) {
      const lockUntil = new Date(rateData.locked_until);
      if (new Date() < lockUntil) {
        const minutesLeft = Math.ceil((lockUntil.getTime() - Date.now()) / 60000);
        return jsonResp({ error: `Cuenta bloqueada. Intenta en ${minutesLeft} min.` }, 429);
      }
    }

    // ---- Find employee ----
    const { data: employee, error: empErr } = await adminClient
      .from("employees")
      .select("id, first_name, last_name, phone_number, access_pin, access_pin_hash, pin_hash_version, is_active, company_id, avatar_url")
      .eq("phone_number", cleanPhone)
      .maybeSingle();

    if (empErr || !employee) {
      await recordFailed(adminClient, cleanPhone);
      await recordFailedIp(adminClient, ipKey);
      console.warn(JSON.stringify({ event: "kiosk_auth_fail", reason: "no_employee", ip, phone_hash: phoneHash }));
      return jsonResp({ error: "Invalid credentials" }, 401);
    }

    // P0 AUTH PIN CANONICALIZATION: validador único contra la credencial del
    // Auth User. Sin fallback a employees.access_pin / hash.
    const kioskIdentity = await resolveCanonicalIdentity(adminClient, cleanPhone);
    const kioskCheck = await verifyCanonicalPin(adminClient, kioskIdentity.userId, pin);

    console.info("[auth-pin-canonical]", {
      ctx: "kiosk-clock",
      company_id: employee.company_id,
      auth_user_resolved: !!kioskIdentity.userId,
      has_credential: kioskIdentity.hasCredential,
      result: kioskCheck.ok ? "ok" : kioskCheck.reason,
    });

    if (!kioskCheck.ok) {
      if (kioskCheck.reason === "locked") {
        return jsonResp({ error: lockoutMessage(kioskCheck.lockedUntil) }, 429);
      }
      await recordFailed(adminClient, cleanPhone);
      await recordFailedIp(adminClient, ipKey);
      console.warn(JSON.stringify({ event: "kiosk_auth_fail", reason: "bad_pin", ip, phone_hash: phoneHash }));
      return jsonResp({ error: "Invalid credentials" }, 401);
    }

    // PIN correct — only NOW reveal account-inactive (not enumeration risk)
    if (!employee.is_active) {
      console.warn(JSON.stringify({ event: "kiosk_auth_inactive", ip, phone_hash: phoneHash }));
      return jsonResp({ error: "Tu cuenta está inactiva. Contacta al administrador." }, 403);
    }

    // Reset rate limits on success
    await adminClient.from("auth_rate_limits").delete().eq("phone_number", cleanPhone);
    await adminClient.from("auth_rate_limits").delete().eq("phone_number", ipKey);

    // ---- Upload photo (signed URL for private bucket) ----
    let photoUrl: string | null = null;
    if (photoBinary) {
      try {
        const ext = photoContentType === "image/png" ? "png" : photoContentType === "image/webp" ? "webp" : "jpg";
        const fileName = `${employee.company_id}/${employee.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await adminClient.storage
          .from("kiosk-photos")
          .upload(fileName, photoBinary, { contentType: photoContentType, upsert: false });
        if (!uploadErr) {
          const { data: signed } = await adminClient.storage
            .from("kiosk-photos")
            .createSignedUrl(fileName, 60 * 60 * 24 * 30); // 30 days
          photoUrl = signed?.signedUrl ?? null;
        } else {
          console.error("Photo upload error:", uploadErr.message);
        }
      } catch (photoErr) {
        console.error("Photo decode/upload error:", photoErr);
      }
    }

    // ---- Open entry check ----
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
      clockType = "clock_out";
      const { error: updateErr } = await adminClient
        .from("time_entries")
        .update({ clock_out: now })
        .eq("id", openEntry.id);

      if (updateErr) console.error("Clock out update error:", updateErr);
      timeEntryId = openEntry.id;
    } else {
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
        const shiftClockMethod = (todayAssignment as any).scheduled_shifts?.clock_method;
        if (shiftClockMethod === "mobile") {
          return jsonResp({ error: "Este turno solo permite fichaje desde el celular" }, 403);
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
          entry_source: "clock",
        })
        .select("id")
        .single();

      if (insertErr) {
        return jsonResp({ error: insertErr.message }, 500);
      }
      timeEntryId = newEntry.id;
    }

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

    return jsonResp({
      success: true,
      clock_type: clockType,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      avatar_url: employee.avatar_url,
      timestamp: now,
    }, 200);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("kiosk-clock error:", message);
    return jsonResp({ error: "Internal error" }, 500);
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

async function recordFailedIp(adminClient: any, ipKey: string) {
  const { data: existing } = await adminClient
    .from("auth_rate_limits")
    .select("id, failed_attempts, last_attempt_at")
    .eq("phone_number", ipKey)
    .maybeSingle();

  // Reset window if last attempt > 15 min ago
  let baseAttempts = existing?.failed_attempts ?? 0;
  if (existing?.last_attempt_at) {
    const ageMs = Date.now() - new Date(existing.last_attempt_at).getTime();
    if (ageMs > 15 * 60 * 1000) baseAttempts = 0;
  }

  const newAttempts = baseAttempts + 1;
  let lockedUntil: string | null = null;
  if (newAttempts >= IP_LOCKOUT_THRESHOLD_15M) {
    lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h IP lock
  }

  if (existing) {
    await adminClient
      .from("auth_rate_limits")
      .update({ failed_attempts: newAttempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await adminClient
      .from("auth_rate_limits")
      .insert({ phone_number: ipKey, failed_attempts: newAttempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() });
  }
}
