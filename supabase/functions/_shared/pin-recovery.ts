/**
 * P0 — PIN LOCKOUT VERIFIED RECOVERY
 *
 * Recuperación de acceso verificada por canal de identidad ya existente
 * (email de la ficha). NO relaja el rate limit ni el lockout canónico:
 * el bloqueo solo se limpia DESPUÉS de verificar identidad, y siempre a
 * través del escritor único `internal_set_auth_pin`.
 *
 * Reglas duras:
 *   - Nadie (admin incluido) ve el PIN ni el código en la app.
 *   - El código solo viaja al destino verificado del trabajador.
 *   - Nunca se registran PIN, código ni token en logs.
 */

/** Enmascara un email para mostrarlo sin exponer la dirección completa. */
export function maskEmail(email: string): string {
  const [user, domain] = String(email).split("@");
  if (!domain) return "•••";
  const head = user.slice(0, 1);
  const tail = user.length > 3 ? user.slice(-1) : "";
  const dparts = domain.split(".");
  const dhead = dparts[0]?.slice(0, 1) ?? "•";
  const rest = dparts.slice(1).join(".");
  return `${head}${"•".repeat(Math.max(2, user.length - 2))}${tail}@${dhead}${"•".repeat(
    Math.max(2, (dparts[0]?.length ?? 3) - 1),
  )}${rest ? "." + rest : ""}`;
}

const FROM_ADDRESS = "Stafly <noreply@notify.staflyapps.com>";

/** Envía el email con el código de recuperación (6 dígitos, 10 minutos). */
export async function sendRecoveryCodeEmail(
  adminClient: any,
  to: string,
  code: string,
  workerName?: string | null,
): Promise<boolean> {
  const messageId = `pin-recovery-${crypto.randomUUID()}`;

  const hello = workerName ? `Hola ${workerName},` : "Hola,";
  const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h1 style="font-size:18px;margin:0 0 12px">Recuperar acceso a Stafly</h1>
        <p style="font-size:14px;color:#444;margin:0 0 16px">${hello} usa este código para crear un PIN nuevo. Vence en 10 minutos.</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px">${code}</p>
        <p style="font-size:13px;color:#666;margin:0">Si no pediste este código, ignora este mensaje: tu PIN actual sigue siendo válido.</p>
      </div>`;
  const text = `${hello}\n\nCódigo para recuperar tu acceso a Stafly: ${code}\nVence en 10 minutos.\n\nSi no lo pediste, ignora este mensaje.`;

  try {
    const result = await sendRawEmail({
      to,
      from: FROM_ADDRESS,
      subject: "Tu código para recuperar el acceso",
      html,
      text,
      label: "pin_recovery_code",
      idempotencyKey: messageId,
    });

    const { error: logError } = await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "pin_recovery_code",
      recipient_email: to,
      status: result.sent ? "sent" : "suppressed",
      error_message: result.sent ? null : "Recipient suppressed",
    });
    if (logError) console.error("[pin-recovery] log failed:", logError.message);

    return result.sent;
  } catch (e) {
    const message = (e as any)?.message ?? "send failed";
    console.error("[pin-recovery] send failed:", message);
    const { error: logError } = await adminClient.from("email_send_log").insert({
      message_id: messageId,
      template_name: "pin_recovery_code",
      recipient_email: to,
      status: "failed",
      error_message: String(message).slice(0, 1000),
    });
    if (logError) console.error("[pin-recovery] log failed:", logError.message);
    return false;
  }
}

/** Mensajes operativos únicos (español, sin filtrar existencia de cuentas). */
export function recoveryErrorMessage(reason: string, retryAfter?: number | null): string {
  switch (reason) {
    case "rate_limited":
      return "Demasiadas solicitudes de recuperación. Intenta de nuevo más tarde.";
    case "cooldown":
      return `Espera ${Math.max(1, retryAfter ?? 60)} segundos antes de pedir otro código.`;
    case "invalid_code":
      return "Código incorrecto. Revísalo e intenta de nuevo.";
    case "too_many_attempts":
      return "Demasiados intentos con el código. Pide uno nuevo.";
    case "expired":
      return "El código venció. Pide uno nuevo.";
    case "consumed":
      return "Este código ya se usó. Pide uno nuevo.";
    case "not_verified":
    case "invalid_token":
      return "Verifica el código antes de crear el PIN nuevo.";
    case "no_channel":
      return "No hay un correo verificado en tu ficha. Pide a tu administrador que inicie la recuperación.";
    default:
      return "No se pudo completar la recuperación. Intenta de nuevo.";
  }
}
