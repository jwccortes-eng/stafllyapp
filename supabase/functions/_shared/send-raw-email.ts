/**
 * Envío directo a través del API de correo gestionado de Lovable.
 *
 * Se usa en los remitentes que componen su propio HTML en el momento del envío
 * (invitaciones con asunto/contenido dinámico, activación de portal, código de
 * recuperación). Los envíos basados en plantillas registradas usan
 * `_shared/transactional-email-templates/send-email.ts`.
 *
 * La entrega, los reintentos, el rate limit, la supresión y el enlace de baja
 * son responsabilidad de Lovable: aquí no hay cola ni estado local.
 */
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import {
  categoryForLabel,
  localSuppressionBlocks,
  type EmailCategory,
} from './email-policy.ts'

export const SENDER_DOMAIN = 'notify.staflyapps.com'

/**
 * P0.3 — Verdad de entrega: `accepted` significa que el API aceptó la
 * solicitud, NO que el proveedor despachó el mensaje. El estado `sent` solo lo
 * fija la reconciliación con los eventos reales del proveedor.
 */
export type RawEmailResult =
  | { accepted: true }
  | {
      accepted: false
      reason: 'recipient_suppressed'
      scope?: string
      source?: string
    }

export interface RawEmailInput {
  to: string
  from: string
  subject: string
  html: string
  text: string
  label: string
  idempotencyKey: string
  replyTo?: string
  /** Categoría del envío; por defecto se deduce de `label`. */
  category?: EmailCategory
  /** Cliente service-role para consultar el registro local de supresión. */
  adminClient?: any
}

export async function sendRawEmail(input: RawEmailInput): Promise<RawEmailResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }

  const category = input.category ?? categoryForLabel(input.label)

  // El registro local nunca amplía el bloqueo: una baja de marketing no frena
  // seguridad ni acceso.
  if (input.adminClient) {
    const local = await localSuppressionBlocks(input.adminClient, input.to, category)
    if (local.blocked) {
      return {
        sent: false,
        reason: 'recipient_suppressed',
        scope: local.scope,
        source: local.source,
      }
    }
  }

  try {
    await sendLovableEmail(
      {
        to: input.to,
        from: input.from,
        sender_domain: SENDER_DOMAIN,
        subject: input.subject,
        html: input.html,
        text: input.text,
        purpose: 'transactional',
        label: input.label,
        idempotency_key: input.idempotencyKey,
        reply_to: input.replyTo,
      },
      { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') },
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      return { sent: false, reason: 'recipient_suppressed', source: 'provider' }
    }
    throw error
  }

  return { sent: true }
}
