import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

import { SCOPE_BY_SOURCE, type SuppressionSource } from '../_shared/email-policy.ts'

/**
 * Registro informativo del resultado de entrega. Nunca decide envíos futuros
 * fuera del alcance que corresponde al origen: una baja de marketing solo
 * bloquea marketing; una queja bloquea además lo operativo no esencial; solo
 * el rebote duro bloquea todo. Nunca borra usuarios, membresías ni datos.
 */
async function recordOutcome(
  recipient: string,
  logStatus: 'bounced' | 'complained' | 'suppressed',
  suppressionReason: SuppressionSource,
  message: string,
  eventId: string,
) {
  const email = String(recipient).toLowerCase()
  const scope = SCOPE_BY_SOURCE[suppressionReason] ?? 'all'

  // Idempotencia: una reentrega del mismo evento no crea una segunda fila.
  const { data: existing, error: existingError } = await supabase
    .from('email_send_log')
    .select('id')
    .eq('template_name', 'system')
    .eq('recipient_email', email)
    .contains('metadata', { event_id: eventId })
    .maybeSingle()

  if (existingError) {
    console.error('email_send_log dedupe read failed', {
      event_id: eventId,
      code: existingError.code,
    })
    throw new Error('email_send_log dedupe read failed')
  }

  if (!existing) {
    const { error: logError } = await supabase.from('email_send_log').insert({
      template_name: 'system',
      recipient_email: email,
      status: logStatus,
      error_message: message,
      metadata: { event_id: eventId, source: suppressionReason },
    })
    if (logError) {
      console.error('email_send_log insert failed', {
        event_id: eventId,
        code: logError.code,
        message: logError.message,
      })
      throw new Error('email_send_log insert failed')
    }
  }

  // Evento tardío sobre un envío concreto: avanza el estado del intento más
  // reciente de ese destinatario sin retroceder ni duplicar.
  const { error: advanceError } = await supabase
    .from('email_send_log')
    .update({ status: logStatus, error_message: message })
    .eq('recipient_email', email)
    .in('status', ['created', 'queued', 'accepted', 'sent'])
    .gte('created_at', new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString())
  if (advanceError) {
    console.error('email_send_log advance failed', {
      event_id: eventId,
      code: advanceError.code,
    })
  }

  const { error: suppressionError } = await supabase
    .from('suppressed_emails')
    .upsert(
      { email, reason: suppressionReason, scope, metadata: { event_id: eventId } },
      { onConflict: 'email' },
    )
  if (suppressionError) {
    console.error('suppressed_emails upsert failed', {
      event_id: eventId,
      code: suppressionError.code,
      message: suppressionError.message,
    })
    throw new Error('suppressed_emails upsert failed')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await recordOutcome(
        event.data.recipient,
        'bounced',
        'bounce',
        'Email bounced',
        event.event_id,
      )
    },
    'email.complaint': async (event) => {
      await recordOutcome(
        event.data.recipient,
        'complained',
        'complaint',
        'Spam complaint received',
        event.event_id,
      )
    },
    'email.unsubscribed': async (event) => {
      await recordOutcome(
        event.data.recipient,
        'suppressed',
        'unsubscribe',
        'Recipient unsubscribed',
        event.event_id,
      )
    },
  },
})

Deno.serve((req) => handler(req))
