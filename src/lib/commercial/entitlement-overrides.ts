/**
 * P1.1 — REGISTRO CANÓNICO DE OVERRIDES EXPLÍCITOS (SHADOW MODE).
 *
 * Un override es una excepción declarada, con motivo y vigencia, que sustituye
 * al límite del plan para UNA empresa concreta. Vive aquí (código versionado y
 * auditable) y NO en las columnas legacy de `companies`: así el motor sombra
 * puede explicar la capacidad real sin mutar datos de producción ni tocar
 * facturación, planes globales o cualquier otra empresa.
 *
 * Reglas duras:
 *   · solo lectura: nada de esto bloquea acciones hoy (el gating vigente sigue
 *     siendo `useSubscription`);
 *   · un override afecta exclusivamente a la empresa nombrada;
 *   · los overrides explícitos tienen prioridad sobre los derivados de las
 *     columnas legacy `max_employees` / `max_admins`.
 */
import type { EntitlementOverrideRecord } from "./entitlements";

/** Identificadores estables usados por los overrides declarados. */
export const STAFLY_DEMO_COMPANY_ID = "d3500000-0000-4000-8000-000000000001";

export const ENTITLEMENT_OVERRIDES: EntitlementOverrideRecord[] = [
  {
    // Stafly Demo — tenant interno de demostración. La columna legacy
    // `max_admins = 2` es un valor de plantilla, no una capacidad negociada:
    // el espacio ya opera con 9 administradores internos. Se declara una
    // capacidad explícita de 10 para que la lectura sombra refleje la
    // realidad, sin tocar los límites globales de ningún plan ni crear,
    // borrar o modificar cuentas de administrador.
    company_id: STAFLY_DEMO_COMPANY_ID,
    key: "admin_users",
    limit: 10,
    reason: "internal_demo",
    source: "manual_review",
    effective_from: "2026-09-14T00:00:00.000Z",
  },
];

/** Overrides explícitos declarados para una empresa. */
export const getCompanyOverrides = (companyId: string | null | undefined): EntitlementOverrideRecord[] =>
  companyId ? ENTITLEMENT_OVERRIDES.filter((o) => o.company_id === companyId) : [];
