# P0 — PERSON STATUS / ASSIGNABILITY SINGLE SOURCE OF TRUTH

Fecha: 2026-08-10 · Alcance: **UI + resolvers de lectura**. Sin migraciones, sin merges, sin borrados.
No se tocó auth, RLS, payroll, time_entries, shift_assignments, scheduled_shifts ni datos de producción.

## 1. Problema

Las superficies mezclaban dimensiones distintas en un mismo badge y cada una inferría el estado a su manera:

- El perfil calculaba portal como `portal_active || has_portal_access || profile_status === 'active'`
  (tres señales que no son acceso real) mientras el resto ya usaba `employees.user_id`.
- El selector de staffing mostraba "posible duplicado" y "emergency worker" sin decir si eso
  bloqueaba la asignación.
- "Missing docs" e "Invited" se leían como bloqueos, cuando no lo son.

## 2. Modelo canónico (4 dimensiones separadas)

Nuevo módulo único: `src/lib/people/person-status.ts` → `resolvePersonStatus(person, opts)`.

| Dimensión | Valores | Fuente |
|---|---|---|
| IDENTITY | VERIFIED · PENDING_IDENTITY · POSSIBLE_DUPLICATE · HISTORICAL · REVIEW_REQUIRED | `worker_type`, `identity_status`, `requires_identity_resolution`, `employee_role`, grupo de duplicado |
| PORTAL | PORTAL_ACTIVE · INVITED · ACCESS_REPAIR_REQUIRED · NO_PORTAL | `resolvePortalStatus` (`employees.user_id` + invitación) |
| COMPLIANCE | COMPLIANT · MISSING_DOCS · EXPIRED_DOCS · REVIEW_REQUIRED · UNKNOWN | conteos de documentos / readiness de la superficie |
| ASSIGNABILITY | ASSIGNABLE · ASSIGNABLE_WITH_WARNING · BLOCKED (+ `reason`, `reasons[]`) | `classifyWorkerAssignability` + duplicado sin resolver + cross-tenant + restricción operativa real |

Reglas aplicadas literalmente:

- Portal activo **no** implica asignable (test: histórico con portal → BLOCKED).
- Missing / expired docs **nunca** bloquean por sí solos → ASSIGNABLE_WITH_WARNING.
- Invited **no** implica bloqueo ni ausencia de acceso: es su propia dimensión.
- Possible duplicate siempre aparece con explicación y solo bloquea cuando está sin resolver.

## 3. Superficies migradas

| Superficie | Antes | Ahora |
|---|---|---|
| Perfil (`UnifiedPersonProfile`) | badges sueltos Active/Invited/Pending/Missing docs y portal inferido de 3 campos | `hasPortalAccess(user_id)` + `PersonStatusMatrix` con las 4 dimensiones etiquetadas |
| Selector de staffing (`EmployeeCombobox`) | badge de duplicado sin explicación | nota por fila: `Identidad · Portal · Cumplimiento · Asignabilidad — razón` |

Componente de presentación único: `src/components/employee/PersonStatusMatrix.tsx`
(`variant="grid"` para perfil, `variant="inline"` para superficies compactas).

## 4. QA con datos reales (Quality Staff)

Consulta de verificación sobre `employees` (solo lectura):

| Persona | Registros | Observación |
|---|---:|---|
| Sophia Contreras | 4 | 1 inactivo, 2 sin portal, 1 con portal y `added_via = 'Pending approval'` → BLOCKED por pendiente de aprobación + duplicado sin resolver |
| Mariany Ortiz | 3 | 2 sin portal (`cloned`, sin rol), 1 con portal activo → ASSIGNABLE_WITH_WARNING cuando faltan documentos |

Casos cubiertos por pruebas (`src/test/person-status.test.ts`, 9 tests, todos verdes):

1. Worker normal activo → ASSIGNABLE
2. Portal activo + missing docs (Mariany) → ASSIGNABLE_WITH_WARNING
3. Duplicado sin resolver + identidad pendiente + invitación aceptada sin vincular (Sophia) → BLOCKED
4. Portal activo + histórico → BLOCKED
5. Invitado → ASSIGNABLE_WITH_WARNING ("portal pendiente")
6. Sin portal → asignable con advertencia
7. Pending identity / placeholder → BLOCKED
8. Cross-tenant → BLOCKED
9. Inactivo con portal → BLOCKED, el portal sigue reportando la verdad

Typecheck (`tsgo --noEmit`) sin errores.

## 5. No se tocó

auth, RLS, payroll, time_entries, shift_assignments, scheduled_shifts, edge functions, datos de
producción. Cero fusiones y cero borrados de personas.

## 6. Regla permanente

Cualquier superficie que muestre estado de una persona debe consumir `resolvePersonStatus`
y mostrar las dimensiones por separado. Está prohibido derivar asignabilidad desde portal,
documentos o invitaciones.
