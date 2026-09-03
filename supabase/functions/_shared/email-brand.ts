/**
 * Marca única del correo transaccional.
 *
 * Regla: la compañía es protagonista cuando existe contexto de tenant, y Stafly
 * queda como plataforma ("powered by Stafly"). Sin contexto de compañía, la
 * marca es solo "Stafly". Nunca se fija una compañía concreta por defecto:
 * cualquier tenant usa la misma infraestructura sin heredar marca ajena.
 */

export const FROM_DOMAIN = 'notify.staflyapps.com'
export const PLATFORM_NAME = 'Stafly'

/** Nombre visible de marca para encabezados y cuerpo del email. */
export function brandName(companyName?: string | null): string {
  const name = (companyName ?? '').trim()
  return name ? `${name} — powered by ${PLATFORM_NAME}` : PLATFORM_NAME
}

/** Remitente RFC-5322 seguro (comillas si el nombre trae puntuación). */
export function brandFrom(companyName?: string | null): string {
  const display = brandName(companyName)
  const needsQuotes = /[,;:<>@"]/.test(display)
  const safe = display.replace(/"/g, '')
  return needsQuotes
    ? `"${safe}" <noreply@${FROM_DOMAIN}>`
    : `${safe} <noreply@${FROM_DOMAIN}>`
}
