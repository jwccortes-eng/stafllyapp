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

  const { error: logError } = await supabase.from('email_send_log').insert({
    template_name: 'system',
    recipient_email: email,
    status: logStatus,
    error_message: message,
  })
  if (logError) {
    console.error('email_send_log insert failed', {
      event_id: eventId,
      code: logError.code,
      message: logError.message,
    })
    throw new Error('email_send_log insert failed')
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
