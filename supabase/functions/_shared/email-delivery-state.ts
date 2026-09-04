/**
 * P0.3 — VERDAD DE ENTREGA
 *
 * Un 2xx del API de correo NO significa que el mensaje salió: el proveedor aún
 * puede rechazar el despacho (dominio no verificado, destinatario inválido,
 * límite de envío). Por eso la aceptación del API y el despacho efectivo son
 * dos estados distintos.
 *
 * Ciclo de vida canónico (solo avanza, nunca retrocede):
 *
 *   created → queued → accepted → sent → delivered
 *                         ↘ rejected / failed / suppressed / bounced / complained
 */

export const EMAIL_STATE = {
  /** Registro creado, todavía no se intentó nada. */
  CREATED: 'created',
  /** En espera de intento de envío. */
  QUEUED: 'queued',
  /** El API aceptó la solicitud. NO es prueba de despacho. */
  ACCEPTED: 'accepted',
  /** El proveedor aceptó el mensaje para despacho efectivo. */
  SENT: 'sent',
  /** Existe evento real de entrega en el buzón destino. */
  DELIVERED: 'delivered',
  /** El proveedor rechazó el despacho (p. ej. dominio remitente no verificado). */
  REJECTED: 'rejected',
  /** Error técnico antes o durante la solicitud. */
  FAILED: 'failed',
  /** Bloqueado por el registro de supresión. */
  SUPPRESSED: 'suppressed',
  /** Rebote duro. */
  BOUNCED: 'bounced',
  /** Queja de spam. */
  COMPLAINED: 'complained',
  /** Frenado por límite de envío del proveedor. */
  RATE_LIMITED: 'rate_limited',
} as const

export type EmailState = (typeof EMAIL_STATE)[keyof typeof EMAIL_STATE]

/** Orden de progreso. Un evento tardío nunca puede bajar el estado. */
const RANK: Record<EmailState, number> = {
  created: 0,
  queued: 1,
  rate_limited: 1,
  accepted: 2,
  sent: 3,
  delivered: 4,
  // Terminales de fallo: mandan sobre cualquier estado de progreso.
  rejected: 5,
  failed: 5,
  suppressed: 5,
  bounced: 6,
  complained: 6,
}

/** True si `next` puede sobrescribir a `current` (reconciliación monótona). */
export function canAdvance(current: string | null | undefined, next: EmailState): boolean {
  if (!current) return true
  const from = RANK[current as EmailState]
  if (from === undefined) return true
  return RANK[next] > from
}

/** Estados que todavía no prueban despacho y deben reconciliarse. */
export const PENDING_RECONCILIATION: EmailState[] = [
  EMAIL_STATE.CREATED,
  EMAIL_STATE.QUEUED,
  EMAIL_STATE.ACCEPTED,
]

/** Motivo legible cuando el rechazo viene de un dominio remitente sin verificar. */
export function isDomainUnverified(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('is not allowed to send') || m.includes('domain is unverified')
}
