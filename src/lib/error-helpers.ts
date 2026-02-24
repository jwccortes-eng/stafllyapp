/**
 * Maps technical Supabase/Postgres errors to user-friendly messages.
 * Prevents leaking internal schema details to the UI.
 */
export function getUserFriendlyError(error: any): string {
  if (!error) return 'Ocurrió un error inesperado. Intenta de nuevo.';

  const msg = typeof error === 'string' ? error : error?.message ?? '';
  const code = error?.code ?? '';

  // Duplicate key
  if (code === '23505' || msg.includes('duplicate key'))
    return 'Este registro ya existe. Verifica los datos e intenta de nuevo.';

  // Foreign key violation
  if (code === '23503' || msg.includes('foreign key'))
    return 'No se encontró un registro relacionado. Verifica los datos.';

  // RLS policy
  if (msg.includes('row-level security') || msg.includes('RLS'))
    return 'No tienes permisos para realizar esta acción.';

  // Not null violation
  if (code === '23502' || msg.includes('not-null'))
    return 'Faltan campos obligatorios. Completa todos los campos requeridos.';

  // Check constraint
  if (code === '23514')
    return 'Los datos ingresados no son válidos. Revisa los valores.';

  // Auth errors - keep specific for UX
  if (msg.includes('Invalid login'))
    return 'Credenciales incorrectas. Verifica tu email y contraseña.';
  if (msg.includes('Email not confirmed'))
    return 'Tu email no ha sido confirmado. Revisa tu bandeja de entrada.';
  if (msg.includes('User already registered'))
    return 'Este email ya está registrado.';

  // Network
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return 'Error de conexión. Verifica tu internet e intenta de nuevo.';

  // Generic fallback - don't expose internal details
  return 'Ocurrió un error. Intenta de nuevo.';
}
