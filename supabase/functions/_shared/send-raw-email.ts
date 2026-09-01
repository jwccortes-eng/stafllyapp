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

export const SENDER_DOMAIN = 'notify.staflyapps.com'

export type RawEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface RawEmailInput {
  to: string
  from: string
  subject: string
  html: string
  text: string
  label: string
  idempotencyKey: string
  replyTo?: string
}

export async function sendRawEmail(input: RawEmailInput): Promise<RawEmailResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
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
      return { sent: false, reason: 'recipient_suppressed' }
    }
    throw error
  }

  return { sent: true }
}
