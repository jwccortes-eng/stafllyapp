# P0 — Definición canónica de trabajador asignable (Quality Staff)

Fecha: 2026-08-10 · Empresa de referencia: **Quality Staff by Keury**
Alcance: UI + resolver de dominio. **Sin migraciones, sin borrados, sin merges, sin cambios de estado, sin tocar payroll, time_entries, assignments históricos ni RLS.**

Origen: `docs/qa/P0_QUALITY_STAFF_ASSIGNABLE_WORKERS_AUDIT.md`.

---

## 1. Contrato canónico

Nuevo módulo único: `src/lib/shifts/assignable-workers.ts`.

```
classifyWorkerAssignability(employee) → { bucket, assignable, reason }
isAssignableWorker(employee)
getAssignableWorkers(list)
partitionWorkersByAssignability(list)
notAssignableMessage(name)
```

Precedencia de exclusión: **inactivo → placeholder/system → historical → pending approval**.

Mapa a campos reales ya auditados (no se inventaron estados):

| Condición | Campos reales |
|---|---|
| Tenant correcto | `company_id` (query del roster / consultas por empresa) |
| Activo | `is_active !== false` y `deleted_at IS NULL` |
| No placeholder/system | `worker_type`, `identity_status`, `requires_identity_resolution`, `payroll_safe`, `person_type_guess` (vía `isPlaceholderWorker`) |
| No historical | `employee_role = 'historical'` |
| No pending approval | `added_via = 'Pending approval'` |

`added_via` se añadió al `SELECT` de `useEmployeeRoster` y al tipo `Employee`. Ningún otro dato cambia.

---

## 2. Superficies migradas (una sola regla)

| Superficie | Antes | Ahora |
|---|---|---|
| Crear Servicio / Editar / Asignar equipo (`EmployeeCombobox`) | activo + no placeholder | `isAssignableWorker` |
| Quick Create móvil (`MobileQuickCreateShiftSheet`) | solo `is_active` | `getAssignableWorkers` |
| Team hub móvil (`MobileShiftTeamHub`) | solo `is_active` | `isAssignableWorker` |
| Picker simple / drivers (`SingleEmployeePicker`, `MultiDriverPicker`) | sin regla | `getAssignableWorkers` |
| Reemplazo (`ReplacementSuggestionDialog`) | query `is_active = true` | query + `getAssignableWorkers` y `deleted_at IS NULL` |
| Duplicar / copiar equipo (`DuplicateShiftDialog`) | sin regla, copiaba tal cual | valida elegibilidad **solo** de los `employee_id` del Servicio origen |

No quedan filtros locales de elegibilidad por pantalla.

---

## 3. Matriz antes / después (Quality Staff)

| Categoría | Antes visible | Después visible |
|---|---:|---:|
| Operativos activos asignables | 224 (combobox) / 242 (móvil y reemplazo) | 224 → menos historical y pending approval → **~157** |
| System / placeholder | 18 (móvil y reemplazo) | **0** |
| Historical activos | 4 (todas las superficies) | **0** |
| Pending approval | 67 (todas las superficies) | **0** |
| Inactivos | 0 por defecto (1.176 vía toggle) | **0** por defecto |
| Duplicar (población consultada) | hasta 1.418 | solo los `employee_id` del Servicio origen |

Todas las superficies devuelven ahora la **misma población base**.

---

## 4. Opción administrativa

El selector conserva una única acción explícita: **"Mostrar no asignables"**, con desglose por grupo (`Pendientes de aprobación`, `Históricos`, `Placeholders / system`, `Inactivos / archivados`). Nunca se mezclan por defecto: quedan agrupados al final y marcados como no disponibles para staffing normal. Los ya asignados siguen visibles para preservar el histórico.

## 5. Duplicar Servicio

- No se consulta el roster completo: solo los ids de `shift_assignments` del origen.
- Cada worker se revalida contra el contrato canónico.
- Los no elegibles se listan con el mensaje `"X ya no está disponible para asignación."` y su razón; no se sustituyen automáticamente ni se altera su identidad.

## 6. UX del selector

Orden vigente: seleccionados → elegibles/disponibles (grupo `ready`) → advertencias → bloqueados → no asignables (solo si se revelan). La búsqueda y la relevancia/ELDM ordenan **dentro** de la población elegible; ELDM no decide quién está activo.

## 7. QA

- `src/test/assignable-workers.test.ts` — 8 tests del contrato (System N, historical, pending approval, inactivos, partición sin pérdida, perfil incompleto sigue asignable).
- `src/test/assignment-eligibility.test.ts` — sin regresión: perfil incompleto / onboarding pendiente / sin portal siguen visibles.
- Typecheck (`tsgo --noEmit`) sin errores.

## 8. No se tocó

payroll, time_entries, snapshots de tarifas, documentos, assignments históricos, `scheduled_shifts`, auth, RLS, tenants, ECC, persistencia ELDM, datos de producción. Cero borrados, cero merges, cero cambios sobre los 1.418 registros.

## 9. Siguiente frente (no incluido)

**WORKER IDENTITY QUALITY / DUPLICATES** — resolución de duplicados de identidad, posterior a esta limpieza de quién aparece en staffing.

---

Stafly utiliza una única definición operativa de trabajador asignable en todas las superficies, conservando históricos, pendientes e información legacy sin mezclarlos con el equipo activo disponible para staffing.
