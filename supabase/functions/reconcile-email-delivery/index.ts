/**
 * P0.3 — RECONCILIACIÓN DE ENTREGA
 *
 * Un 2xx del API de correo solo prueba que la solicitud fue aceptada
 * (`accepted`). Esta función contrasta el registro local contra los eventos
 * reales del proveedor y solo entonces fija `sent`, `rejected`, `bounced`,
 * `complained`, `suppressed` o `rate_limited`.
 *
 * Reglas duras:
 *  - Nunca retrocede un estado (ver `canAdvance`).
 *  - Es idempotente: reejecutarla no duplica filas ni altera estados finales.
 *  - Nunca inventa `delivered`: la plataforma no emite acuse de entrega.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { listEmailLogs } from 'npm:@lovable.dev/email-js@0.1.0'
import {
  EMAIL_STATE,
  PENDING_RECONCILIATION,
  canAdvance,
  isDomainUnverified,
  type EmailState,
} from '../_shared/email-delivery-state.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Evento del proveedor → estado canónico local. */
const STATE_BY_EVENT: Record<string, EmailState> = {
  sent: EMAIL_STATE.SENT,
  rejected: EMAIL_STATE.REJECTED,
  bounced: EMAIL_STATE.BOUNCED,
  complained: EMAIL_STATE.COMPLAINED,
  unsubscribed: EMAIL_STATE.SUPPRESSED,
  suppressed: EMAIL_STATE.SUPPRESSED,
  rate_limited: EMAIL_STATE.RATE_LIMITED,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const sinceIso = new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()

  // 1. Registros locales que aún no prueban despacho.
  const { data: pending, error: pendingError } = await admin
    .from('email_send_log')
    .select('id, recipient_email, status, created_at')
    .in('status', PENDING_RECONCILIATION)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500)

  if (pendingError) {
    console.error('reconcile: pending read failed', pendingError.message)
    return new Response(JSON.stringify({ error: 'pending read failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!pending?.length) {
    return new Response(JSON.stringify({ reconciled: 0, pending: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Eventos reales del proveedor en la misma ventana.
  let events: Array<{ event_type: string; recipient: string; status?: string; created_at: string }> = []
  try {
    const res: any = await listEmailLogs({ since: sinceIso, limit: 100 }, { apiKey })
    events = (res?.events ?? res?.data ?? res ?? []) as any[]
  } catch (error) {
    console.error('reconcile: provider log read failed', (error as Error).message)
    return new Response(JSON.stringify({ error: 'provider log read failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Último evento por destinatario (los eventos tardíos ganan por orden, no por
  // llegada: `canAdvance` impide cualquier retroceso).
  const latest = new Map<string, { state: EmailState; detail: string; at: string }>()
  for (const ev of events) {
    const recipient = String(ev.recipient ?? '').toLowerCase()
    const state = STATE_BY_EVENT[String(ev.event_type ?? '')]
    if (!recipient || !state) continue
    const current = latest.get(recipient)
    if (current && canAdvance(state, current.state)) continue
    latest.set(recipient, {
      state,
      detail: String(ev.status ?? ev.event_type ?? ''),
      at: String(ev.created_at ?? ''),
    })
  }

  let reconciled = 0
  const outcomes: Record<string, number> = {}

  for (const row of pending) {
    const match = latest.get(String(row.recipient_email).toLowerCase())
    if (!match) continue
    if (!canAdvance(row.status, match.state)) continue

    const failureCode =
      match.state === EMAIL_STATE.REJECTED && isDomainUnverified(match.detail)
        ? 'DOMAIN_UNVERIFIED'
        : null

    const errorMessage =
      match.state === EMAIL_STATE.SENT
        ? null
        : `${failureCode ? failureCode + ': ' : ''}${match.detail}`.slice(0, 1000)

    const { error: updateError } = await admin
      .from('email_send_log')
      .update({
        status: match.state,
        error_message: errorMessage,
      })
      .eq('id', row.id)
      // Guarda de idempotencia: solo avanza desde un estado no probatorio.
      .in('status', PENDING_RECONCILIATION)

    if (updateError) {
      console.error('reconcile: update failed', { id: row.id, code: updateError.code })
      continue
    }

    reconciled++
    outcomes[match.state] = (outcomes[match.state] ?? 0) + 1
  }

  console.log('reconcile-email-delivery', { pending: pending.length, reconciled, outcomes })

  return new Response(
    JSON.stringify({ pending: pending.length, reconciled, outcomes }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
