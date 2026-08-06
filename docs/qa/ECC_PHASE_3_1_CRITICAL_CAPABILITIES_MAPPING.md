# ECC — Fase 3.1. Catálogo de capacidades críticas y mappings legacy

Alcance: modelado y reconciliación. **Sin cutover, sin cambios de acceso real, sin tocar gates legacy**
(`useSubscription.canAccessModule`, `ModuleGate`, `company_modules`, `companies.plan_code`).

## 1. Problema resuelto

Fase 3 reportaba 0 compañías READY porque cuatro dominios operativos existían en producto pero no en el
catálogo canónico: Documentos, Cumplimiento, Portal del trabajador y Auditoría. La reconciliación los
clasificaba como `missing_mapping` (clase A) y bloqueaba readiness de toda la flota.

## 2. Inventario de gobierno real (evidencia)

| Dominio | Superficie | Gobierno hoy | Gate comercial |
|---|---|---|---|
| Documentos (almacenamiento y revisión) | `/app/documents`, `employee_documents` | `code_and_rls` | No |
| Auditoría | `activity_log`, `*_audit` | `code_and_rls` | No |
| Notificaciones | `notifications`, `notification_preferences` | `code_and_rls` | No |
| Cumplimiento | reglas de requisitos y política de asignación | `code_and_rls` | No |
| Portal del trabajador | `employee_portal_modules` (`my_shifts`, `my_documents`, …) | `portal_modules` | No (por persona) |

Ninguno de estos dominios tiene entrada en `company_modules`: hoy están disponibles para toda compañía y
el acceso lo acota rol + RLS. El ECC los representa con esa misma semántica, sin inventar restricciones.

## 3. Cambios

- `src/lib/ecc/capability-catalog.ts`: metadatos de gobernanza (`legacyGovernance`, `legacySources`,
  `requiredPermission`, `status`, `explanation`) y 9 capacidades nuevas. `SHARED_ONLY_DOMAINS` impide
  duplicar dominios transversales por producto (no existe `stafly.documents`).
- `src/lib/ecc/plan-versions.ts`: versiones inmutables nuevas (stafly.free v3, stafly.pro v2,
  stafly.enterprise v2, parceros.talent_free v2) efectivas 2026-08-01. Las versiones previas quedan
  intactas y las compañías ancladas conservan su versión.
- `src/lib/ecc/legacy-mapping.ts`: `resolveLegacyDecision` interpreta `code_and_rls` y `portal_modules`
  como "disponible hoy" en lugar de `null`, eliminando falsos `unknown`. Cada fila expone
  `legacyGovernance`, `legacySource` y `missingDependencies`.
- `src/lib/ecc/reconciliation.ts`: alias críticos apuntan a keys canónicas; la matriz crítica explica
  fuente legacy, fuente ECC, dependencias faltantes y acción recomendada. Nuevo blocker explícito por
  dependencia canónica no satisfecha.
- `src/components/billing/EccReadinessPanel.tsx`: desglose por capacidad con gobierno, fuente,
  dependencias faltantes y acción sugerida.

## 4. QA

`src/test/ecc-phase2-plan-versions.test.ts` y `src/test/ecc-phase3-reconciliation.test.ts` en verde
(35 tests). Verificado: catálogo consistente y namespaced, sin duplicación de dominios compartidos,
checksums verificables en todas las versiones, resolución por fecha (contexto 2026-07 sigue en v2),
y cero mutación del input durante la reconciliación.

## 5. Confirmación

No se ejecutó cutover, no se modificaron gates legacy, accesos reales, planes, suscripciones,
`company_modules`, RLS ni datos de producción.
