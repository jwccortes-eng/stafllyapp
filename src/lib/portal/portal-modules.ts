/**
 * Canonical portal module resolution.
 *
 * REGLA ÚNICA (P0 — partial config must not disable default modules):
 *  - Existe fila explícita con enabled=true  → habilitado
 *  - Existe fila explícita con enabled=false → deshabilitado
 *  - NO existe fila                          → default canónico
 *
 * Una configuración parcial NUNCA se interpreta como whitelist completa.
 */

export const PORTAL_MODULE_KEYS = [
  "my_shifts",
  "my_clock",
  "my_payments",
  "my_chat",
  "my_announcements",
  "my_w9",
  "my_profile",
  "my_resources",
  "my_availability",
  "my_documents",
  "my_reviews",
] as const;

export type PortalModuleKey = (typeof PORTAL_MODULE_KEYS)[number];

/** Módulos siempre visibles, no se pueden deshabilitar */
export const ALWAYS_VISIBLE_MODULES: ReadonlySet<string> = new Set(["home", "profile"]);

/** Default canónico cuando no hay fila explícita para el módulo */
export const DEFAULT_ENABLED_MODULES: ReadonlySet<string> = new Set([
  "my_shifts",
  "my_clock",
  "my_payments",
]);

export type PortalModuleOverrides = ReadonlyMap<string, boolean>;

export function buildPortalModuleOverrides(
  rows: ReadonlyArray<{ module: string; enabled: boolean | null }> | null | undefined,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const row of rows ?? []) {
    if (!row?.module) continue;
    map.set(row.module, row.enabled === true);
  }
  return map;
}

export function resolvePortalModuleEnabled(
  key: string,
  overrides: PortalModuleOverrides,
): boolean {
  if (ALWAYS_VISIBLE_MODULES.has(key)) return true;
  const explicit = overrides.get(key);
  if (typeof explicit === "boolean") return explicit;
  return DEFAULT_ENABLED_MODULES.has(key);
}

/** Conjunto efectivo de módulos habilitados (defaults + overrides). */
export function resolveEnabledPortalModules(
  overrides: PortalModuleOverrides,
): Set<string> {
  const result = new Set<string>();
  for (const key of PORTAL_MODULE_KEYS) {
    if (resolvePortalModuleEnabled(key, overrides)) result.add(key);
  }
  return result;
}
