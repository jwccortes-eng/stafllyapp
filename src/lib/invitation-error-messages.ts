// Pure helper: convert technical invitation/email errors into operator-friendly Spanish messages.
// Always preserve the technical detail separately for the "Ver detalle técnico" panel.

import type { InviteDeliveryStatus } from "./invitation-status";

export interface HumanInvitationError {
  title: string;
  message: string;
  hint?: string;
  technical: string;
}

const RULES: Array<{ test: RegExp; out: Omit<HumanInvitationError, "technical"> }> = [
  {
    test: /unauthor|jwt|401|missing.+token/i,
    out: {
      title: "Sesión expirada",
      message: "Tu sesión expiró. Vuelve a entrar e inténtalo de nuevo.",
    },
  },
  {
    test: /invalid.+email|email.+invalid|email.+format/i,
    out: {
      title: "Email inválido",
      message: "El email del trabajador no tiene un formato válido. Edita el email y reintenta.",
    },
  },
  {
    test: /(subject|html).+required|missing.+(subject|html)/i,
    out: {
      title: "Error preparando el email",
      message: "Error interno preparando el email. Reporta este caso al equipo.",
    },
  },
  {
    test: /enqueue|pgmq|queue.+(full|fail)/i,
    out: {
      title: "Servicio de email saturado",
      message: "El servicio de email está saturado. Reintenta en 1 minuto.",
    },
  },
  {
    test: /bounce|undeliverable|no.+such.+user|mailbox.+(not.+exist|unavailable)/i,
    out: {
      title: "Email rebotado",
      message: "El email rebotó. Revisa la dirección o usa WhatsApp.",
    },
  },
  {
    test: /suppress|blocklist|blocked.+address|complain/i,
    out: {
      title: "Email bloqueado",
      message: "Este email está bloqueado por rebotes o quejas previas. Cambia el email o usa WhatsApp.",
    },
  },
  {
    test: /expired|token.+expired|invitation.+expired/i,
    out: {
      title: "Enlace expirado",
      message: "El enlace expiró. Genera una nueva invitación.",
    },
  },
  {
    test: /rate.?limit|429|too many/i,
    out: {
      title: "Demasiados intentos",
      message: "Demasiados intentos en poco tiempo. Espera 1 minuto y reintenta.",
    },
  },
  {
    test: /network|fetch.+fail|timeout|aborted/i,
    out: {
      title: "Sin conexión",
      message: "Problema de conexión al servidor. Verifica internet y reintenta.",
    },
  },
  {
    test: /5\d\d|internal.+server|service.+unavail/i,
    out: {
      title: "Servicio no disponible",
      message: "El servicio de email no está disponible ahora. Reintenta en unos minutos.",
    },
  },
];

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

export function humanizeInvitationError(err: unknown): HumanInvitationError {
  const technical = extractMessage(err) || "Error desconocido";
  for (const rule of RULES) {
    if (rule.test.test(technical)) {
      return { ...rule.out, technical };
    }
  }
  return {
    title: "No se pudo enviar la invitación",
    message: "Ocurrió un error al procesar la invitación. Revisa el detalle técnico o reintenta.",
    technical,
  };
}

// Pre-flight context messages (no technical error yet).
export function missingContactMessage(opts: { hasEmail: boolean; hasPhone: boolean }): string | null {
  if (!opts.hasEmail && !opts.hasPhone) return "Sin email ni teléfono. Agrega al menos uno antes de invitar.";
  if (!opts.hasEmail) return "Sin email registrado. Usa WhatsApp o copia el enlace.";
  if (!opts.hasPhone) return "Falta teléfono. Agrégalo para poder invitar por WhatsApp.";
  return null;
}

// Sub-state chip labels — reusable across dialog and PortalAccessCard.
export const SUBSTATE_LABELS: Record<InviteDeliveryStatus, { label: string; description: string }> = {
  created: { label: "Pendiente", description: "Invitación creada, no enviada aún" },
  queued: { label: "En cola", description: "Email en cola de envío" },
  processing: { label: "Procesando", description: "El backend está procesando el envío" },
  sent: { label: "Enviada", description: "Aceptada por el proveedor" },
  provider_accepted: { label: "Aceptada por proveedor", description: "Proveedor confirmó recepción" },
  delivered: { label: "Entregada", description: "Email entregado al buzón" },
  opened: { label: "Abierta", description: "El trabajador abrió el email" },
  accepted: { label: "Acceso listo", description: "Cuenta activada" },
  expired: { label: "Link expirado", description: "La invitación expiró" },
  revoked: { label: "Revocada", description: "Invitación revocada" },
  failed: { label: "Falló", description: "Error al enviar el email" },
  bounced: { label: "Email rebotado", description: "Dirección inválida o buzón inexistente" },
  suppressed: { label: "No se pudo enviar", description: "Este correo tiene una restricción de entrega" },
  dlq: { label: "Sin entregar", description: "Agotó reintentos. Usa WhatsApp o cambia el email." },
  resent: { label: "Reenviada", description: "Invitación reenviada" },
  superseded: { label: "Reemplazada", description: "Reemplazada por una más reciente" },
};

export function getInviteSubState(status: InviteDeliveryStatus | string | null | undefined) {
  if (!status) return SUBSTATE_LABELS.created;
  return SUBSTATE_LABELS[status as InviteDeliveryStatus] ?? { label: status, description: "" };
}
