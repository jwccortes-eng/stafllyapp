# P0 — Auditoría de población de trabajadores en selectores de asignación (Quality Staff)

Fecha: 2026-08-09 · Empresa auditada: **Quality Staff by Keury** (`00000000-0000-0000-0000-000000000001`)
Alcance: **solo lectura**. No se modificaron datos, estados, asignaciones, payroll, time_entries ni RLS.

---

## 1. Realidad de datos (lectura directa, sin filtros de UI)

| Métrica | Valor |
|---|---|
| Trabajadores en la empresa (sin borrado lógico) | **1.418** |
| Activos (`is_active = true`) | **242** |
| Inactivos | 1.176 |
| Con acceso al portal (cuenta creada) | 199 activos con cuenta |
| `employee_role = 'historical'` **activos** | **4** |
| `employee_role = 'historical'` inactivos | 1.108 |
| Placeholders "System N" activos (`worker_type = legacy_placeholder`) | **18** |
| Activos con `added_via = 'Pending approval'` | **67** (54 con cuenta + 13 sin cuenta) |
| Activos con perfil `incomplete` / `pending_documents` | **238** |

Nota sobre el Excel: `employees_2026-08-09.xlsx` (185 filas) es un recorte, no el universo real. La tabla contiene 1.418 registros de esta empresa, y `Status = Active` en el export **no** equivale a "elegible para staffing".

---

## 2. Trazado por superficie

| Superficie | Origen de datos | Filtros de consulta | Tenant scope | Lógica de status | Lógica de portal | Resultado (Quality Staff) |
|---|---|---|---|---|---|---|
| **Crear Servicio** (`Shifts.tsx` → `ShiftFormShell`/`TeamSection` → `EmployeeCombobox`) | `useEmployeeRoster(companyId,"shifts")` (paginado completo) | `company_id = X` **y** `deleted_at IS NULL`. Nada más en la consulta | Sí, por `company_id` en query y en la key de caché | En la consulta: **ninguna**. En el componente: oculta `is_active=false` salvo toggle "mostrar inactivos" o ya seleccionado | **Ninguna**. Portal/`user_id`/`portal_access_enabled` no filtra nada | Carga 1.418 → visibles por defecto **224** |
| **Editar Servicio** (`ShiftEditDialog` / `ShiftDetailDialog`) | Mismo roster (prop `employees` desde `Shifts.tsx`) | Igual | Igual | `unassigned = employees.filter(e => !assignedIds.has(e.id))`, luego el mismo filtro del combobox | Ninguna | Idéntico a Crear |
| **Asignar equipo** (`ShiftTeamPanel` / `ShiftRoleSlotsTeamPanel` / `MobileShiftTeamHub`) | Prop `employees` (mismo roster) | Igual | Igual | Igual (combobox) + gate servidor en `assign_worker_to_shift` | Ninguna | Idéntico |
| **Duplicar/copiar workers** (`DuplicateShiftDialog`) | No selecciona trabajadores: copia los `shift_assignments` de origen | — | Hereda el turno origen | Ninguna revalidación de `is_active` al copiar | Ninguna | Puede duplicar asignaciones de placeholders/inactivos ya asignados |
| **Quick Create** (`QuickCreatePopover`, `MobileQuickCreateShiftSheet`) | Prop `employees` (mismo roster) | Igual | Igual | Móvil: `employees.filter(e => e.is_active !== false)`. **No** aplica el filtro de placeholders | Ninguna | Visibles **242** (incluye los 18 "System N") |
| **Reemplazo sugerido** (`ReplacementSuggestionDialog`) | Consulta propia a `employees` | `company_id = X` **y** `is_active = true` (sin `deleted_at IS NULL`) | Sí | Solo `is_active` | Ninguna | Candidatos base **242**, con "System N" incluidos |
| **Gate servidor** (`assign_worker_to_shift` → `get_employee_assignment_status`) | RPC SECURITY DEFINER | Misma empresa, empleado existente | Sí | `inactive` bloquea; perfil incompleto/documentos/onboarding solo advierte salvo política `block`/`require_override` | Ninguna | Bloquea inactivos; **no conoce** placeholders ni `historical` |

---

## 3. Matriz Quality Staff (representativa por clase)

"Aparece en selector" = visible por defecto, sin activar toggles.

| Worker | employee_id | status | portal | role | historical | system/legacy | pending approval | ¿aparece? | razón |
|---|---|---|---|---|---|---|---|---|---|
| System 1 | 2e2dd0b3…7bc896 | active | sí | Supervisor_Manager | no | **sí** (`legacy_placeholder` / `pending_identity`) | no | Crear/Editar/Equipo: **no** · Quick Create móvil y Reemplazo: **sí** | El combobox oculta placeholders por defecto; Quick Create móvil y el diálogo de reemplazo no aplican esa regla |
| System 2…System 20 (18 en total) | varios | active | sí | Mesero_Waiter / Supervisor | no | **sí** | no | Igual que System 1 | Misma inconsistencia |
| LUIS CEDENO | 6564430e…f943 | active | sí | **historical** | **sí** | no | no | **sí, en todas** | Ninguna superficie mira `employee_role='historical'` |
| EDWIN GONZALES | 4c3bcf06…5be0 | active | sí | **historical** | **sí** | no | no | **sí** | Igual |
| Alejandra Sanchez | 347f28aa…6d3e5 | active | sí | **historical** | **sí** | no | no | **sí** | Igual |
| Danna S Prieto | 8474f498…4132 | active | sí | **historical** | **sí** | no | no | **sí** | Igual |
| Johan Valbuena (y 66 más) | 1b0d45a8…d67e9 | active | sí | Auxiliar_Kitchen | no | no | **sí** (`added_via='Pending approval'`) | **sí** | Ninguna superficie mira `added_via`; solo se advierte por `profile_status=incomplete` |
| Trabajador verificado estándar (224) | — | active | sí/no | operativo | no | no | no | **sí** | Caso esperado |
| Inactivos (1.176) | — | inactive | — | mayormente historical | sí | — | — | **no** (toggle) y bloqueados por el RPC | Único bloqueo real hoy |

Conteos por superficie: roster cargado **1.418** → combobox por defecto **224** → Quick Create móvil / Reemplazo **242** → gate servidor permite **242** (menos los que la política de cumplimiento marque).

---

## 4. Respuestas explícitas

1. **¿Los selectores traen todos los employees de la compañía?** Sí. `useEmployeeRoster` carga los 1.418 registros no borrados; el recorte es puramente de presentación.
2. **¿Filtran únicamente `status='active'`?** No de forma uniforme. El combobox filtra `is_active` **y** placeholders (cliente). Quick Create móvil filtra solo `is_active`. Reemplazo filtra solo `is_active` en la consulta. Duplicar no filtra nada.
3. **¿Aparecen System/legacy?** Sí, en Quick Create móvil y en Reemplazo sugerido (18 registros). En Crear/Editar/Equipo quedan ocultos salvo toggle.
4. **¿Aparecen historical?** Sí, los 4 activos aparecen en **todas** las superficies. No existe ninguna regla que lea `employee_role='historical'`.
5. **¿Aparecen pending approval?** Sí, los 67 activos. `added_via` nunca se evalúa.
6. **¿Existen diferentes filtros entre pantallas?** Sí — tres reglas distintas conviviendo: combobox (activo + no placeholder), Quick Create móvil / Reemplazo (solo activo), Duplicar (sin regla). El gate del servidor usa una cuarta definición (activo + política de cumplimiento).
7. **¿Cuál debería ser la fuente canónica de "assignable worker"?** Una única función de dominio — p. ej. `isAssignableWorker(employee, companyPolicy)` en `src/lib/shifts/` — consumida por todas las superficies y alineada con `get_employee_assignment_status`, que debería incorporar además las dimensiones hoy invisibles para el servidor: `worker_type/identity_status` (placeholder), `employee_role='historical'` y `added_via='Pending approval'` (aprobación pendiente). Regla propuesta: **asignable = activo + no borrado + identidad verificada + no historical + aprobación resuelta**, con placeholders y pendientes de aprobación visibles solo tras acción explícita del operador y siempre marcados.

---

## 5. Riesgos observados (sin acción tomada)

- Un operador puede asignar hoy a los 18 "System N" desde móvil y desde el diálogo de reemplazo, con consecuencias directas en horas y conciliación de nómina.
- Los 4 trabajadores `historical` activos son indistinguibles de personal operativo en cualquier selector.
- Duplicar un Servicio copia asignaciones sin revalidar elegibilidad.

**No se implementó ningún cambio.** Este documento es únicamente diagnóstico.
