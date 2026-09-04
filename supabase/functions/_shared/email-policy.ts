/**
 * P0.1 — SEPARACIÓN DE SUPRESIÓN: MARKETING vs SEGURIDAD/TRANSACCIONAL
 *
 * Regla dura: una baja de marketing NUNCA puede inutilizar el acceso ni la
 * recuperación de una persona. Cada envío declara su categoría y cada entrada
 * de supresión declara su alcance. El cruce categoría × alcance decide si el
 * envío se bloquea localmente.
 *
 * La supresión del proveedor (Lovable) sigue siendo autoridad de entrega: esto
 * NO la evade, solo evita que el registro local amplíe el bloqueo más allá de
 * lo que corresponde.
 */

/** Clases de correo que emite la plataforma. */
export type EmailCategory =
  /** Código/enlace de recuperación, verificación, magic link, avisos de seguridad. */
  | 'security'
  /** Invitación y activación de portal: acceso necesario a la cuenta. */
  | 'transactional_access'
  /** Operativo no crítico: recordatorios, avisos de turno. */
  | 'operational'
  /** Boletines, promociones, campañas no esenciales. */
  | 'marketing'

/** Alcance de una entrada de supresión. */
export type SuppressionScope =
  /** Solo marketing (baja voluntaria del boletín). */
  | 'marketing'
  /** Marketing + operativo no esencial (queja de spam). */
  | 'non_essential'
  /** Todo (rebote duro: la dirección no existe o no acepta correo). */
  | 'all'

export type SuppressionSource =
  | 'unsubscribe'
  | 'complaint'
  | 'bounce'
  | 'provider'
  | 'manual'

/** Alcance que corresponde a cada origen de supresión. */
export const SCOPE_BY_SOURCE: Record<SuppressionSource, SuppressionScope> = {
  unsubscribe: 'marketing',
  complaint: 'non_essential',
  bounce: 'all',
  provider: 'all',
  manual: 'all',
}

/** Categorías bloqueadas por cada alcance. */
const BLOCKED_BY_SCOPE: Record<SuppressionScope, EmailCategory[]> = {
  marketing: ['marketing'],
  non_essential: ['marketing', 'operational'],
  all: ['marketing', 'operational', 'transactional_access', 'security'],
}

/** Categoría de cada etiqueta de envío usada en las Edge Functions. */
export const CATEGORY_BY_LABEL: Record<string, EmailCategory> = {
  pin_recovery_code: 'security',
  invite_email: 'transactional_access',
  portal_activation: 'transactional_access',
}

export function categoryForLabel(label: string): EmailCategory {
  return CATEGORY_BY_LABEL[label] ?? 'operational'
}

/** ¿Este alcance bloquea esta categoría? */
export function scopeBlocksCategory(
  scope: SuppressionScope,
  category: EmailCategory,
): boolean {
  return BLOCKED_BY_SCOPE[scope]?.includes(category) ?? false
}

/**
 * Consulta el registro local de supresión y decide si el envío debe frenarse.
 * Un registro `marketing` jamás frena seguridad ni acceso.
 */
export async function localSuppressionBlocks(
  adminClient: any,
  email: string,
  category: EmailCategory,
): Promise<{ blocked: boolean; scope?: SuppressionScope; source?: string }> {
  const { data, error } = await adminClient
    .from('suppressed_emails')
    .select('reason, scope')
    .eq('email', String(email).toLowerCase())
    .maybeSingle()

  if (error || !data) return { blocked: false }

  const source = (data.reason ?? 'manual') as SuppressionSource
  const scope = (data.scope ?? SCOPE_BY_SOURCE[source] ?? 'all') as SuppressionScope

  return { blocked: scopeBlocksCategory(scope, category), scope, source }
}
