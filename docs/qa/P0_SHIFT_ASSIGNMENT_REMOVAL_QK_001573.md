# P0 — Retirar personas asignadas del turno (caso QK-001573)

Fecha: 2026-08-01 · Alcance: retiro seguro de asignaciones. No se tocó payroll, horas, fichajes, RLS de otras tablas ni `required_workers`.

---

## 1. Causa exacta

Había **dos caminos distintos** para "quitar" a una persona, y el de desktop era el roto:

| Superficie | Camino | Resultado real |
|---|---|---|
| Móvil (Team Hub) | RPC `set_shift_assignment_state` → `status='removed'` | Funcionaba, pero la acción se llamaba "Remover" y compartía diálogo genérico en inglés |
| Desktop (`ShiftDetailDialog` → `Shifts.tsx`) | `supabase.from("shift_assignments").delete().eq("id", …)` | **Hard DELETE** sujeto a la política `Managers can delete shift_assignments` (`has_module_permission(uid,'shifts','delete')`) |

Causas concretas:

1. **Falso éxito en desktop.** `DELETE` sin `.select()` devuelve `error = null` aunque RLS filtre las filas: la UI mostraba "Empleado removido del turno" y recargaba con la persona todavía asignada. Ese es exactamente el síntoma reportado ("no puedo retirar personas").
2. **Borrado destructivo.** Cuando sí pasaba, se destruía la historia de la asignación (auditoría, respuesta del worker, rol de conductor).
3. **Trigger bloqueante.** `prevent_overlapping_shift_assignments` se ejecuta también en `UPDATE`; al pasar una asignación a `removed`, si esa persona tenía otro turno solapado el mismo día, la operación fallaba con excepción de solapamiento — bloqueando justamente la acción que libera el cupo.
4. **Sin regla de negocio central.** Ninguna capa validaba fichajes, horas, rol de conductor ni responsable del turno antes de quitar a alguien.

---

## 2. Estado real de QK-001573

`scheduled_shifts.id = 88469adb-077b-4900-9e0f-acd47edba935` · `company_id = 00000000-…-0001` · `status = published` · `2026-08-03 12:00–23:30` · `slots = 23` · `driver_employee_id = null` · `shift_admin_id = 28b436c6…` (William Rodriguez) · `deleted_at = null`.

- **13 asignaciones activas**, todas `assignment_role = 'staff'`, ninguna borrada.
- 1 `confirmed` con `response_status = needs_reacceptance` (Jorge Cortes) → cuenta como cobertura, **no** como confirmación.
- 12 `pending` / `response_status = pending`.
- `clock_events` del turno: **0**. `time_entries`: **0**. Sin incidencias ni reemplazos activos.
- Cobertura canónica: **13 de 23 cubiertos · 0 de 13 confirmó**.

Diagnóstico del checklist solicitado: (1) sí existía acción, (2) parcialmente oculta por `shifts.delete`, (3) semántica distinta móvil vs desktop, (4) la RPC móvil sí permitía retirar, (5) el trigger de solapamiento podía bloquear, (6) **sí, la UI desktop hacía DELETE**, (7) sin dependencias que impidan retirar, (8) el turno no ha comenzado ni tiene actividad real.

---

## 3. Acción / RPC canónica

`public.remove_worker_from_shift(p_assignment_id, p_reason, p_replacement_employee_id, p_source)` — `SECURITY DEFINER`, `search_path = public`, ejecutable sólo por `authenticated` y `service_role`.

Valida en este orden: existencia → `can_manage_shift_company(company_id)` → turno del mismo tenant → idempotencia → actividad real (`clock_events` + `time_entries`) → responsable del turno → rol de conductor.

Escribe: `shift_assignments.status = 'removed'` (nunca DELETE), degrada `assignment_role` de `driver` a `worker`, guarda el motivo, transfiere `shift_admin_id` si aplica, sincroniza `driver_employee_id`, notifica por la capa canónica (`create_shift_worker_notification`) y registra `shift_audit_log(action='assignment_removed')`.

Devuelve resultado humano estructurado:

```json
{ "removed": true, "reason": "removed", "assignment_status": "removed",
  "coverage_after": { "required": 2, "assigned_active": 0, "confirmed": 0 },
  "driver_impact": "none", "captain_impact": "none",
  "payroll_protected": true, "next_action": "fill_open_spot" }
```

La UI no reinterpreta reglas: sólo traduce `reason` a copy.

---

## 4. Reglas por escenario

| Caso | Regla aplicada |
|---|---|
| A — asignada, sin confirmar, sin horas | Retiro permitido. "La posición vuelve a estar disponible." |
| B — confirmada, sin horas | Retiro permitido con consecuencia explícita y notificación al worker. |
| C — con fichaje u horas | `removed:false`, `reason:has_real_activity`, `next_action:manage_exit_or_replacement`. Horas intactas. |
| D — driver | Se degrada el rol, `driver_employee_id` pasa al siguiente conductor activo; si no queda ninguno → `driver_impact:no_driver_left` y `next_action:assign_driver`. |
| E — captain / responsable | Bloqueado sin reemplazo (`captain_requires_replacement`); con reemplazo válido se transfiere `shift_admin_id`. |
| F — reemplazo activo | La fila retirada se conserva con motivo y auditoría: la relación reemplazado ↔ reemplazo queda trazable. |
| G — con incidencia, chat o evidencia | Se retira sin borrar mensajes, evidencia ni notificaciones previas. |

---

## 5. Archivos modificados

- **Migración**: `remove_worker_from_shift` + corrección de `prevent_overlapping_shift_assignments` (los estados `removed`/`rejected` ya no evalúan solapamiento).
- `src/lib/shifts/remove-worker.ts` — wrapper canónico + copy por resultado (nuevo).
- `src/components/shifts/RemoveWorkerFromShiftDialog.tsx` — diálogo único móvil/desktop (nuevo).
- `src/components/shifts/ShiftDetailDialog.tsx` — botón "Retirar del turno" (`UserMinus`), diálogo compartido, las asignaciones `removed` ya no aparecen en el equipo.
- `src/pages/admin/Shifts.tsx` — se eliminó el hard DELETE y la notificación duplicada; ahora sólo refresca.
- `src/components/shifts/mobile/MobileShiftTeamHub.tsx` — el estado `removed` se enruta al diálogo canónico.
- `src/components/shifts/team/TeamHubWorkerCard.tsx` — la acción se llama "Retirar del turno".

---

## 6. Queries before / after (tenant demo)

**Before** — `363da981…` (SD-000015) `status = pending`; `c64c1926…` (SD-000014) `status = accepted`; sin `clock_events` ni `time_entries`.

**After** — ambas filas **existen** con `status = 'removed'`, `rejection_reason = 'QA automatizado'`:

```
rows_conservadas = 2      -- ninguna fila borrada
qk_assignments   = 13     -- QK-001573 intacto
time_entries     = 7411   -- sin cambios
```

---

## 7. Auditoría generada

```
assignment_removed | pending  → removed | reason: QA automatizado | source: qa_script
assignment_removed | accepted → removed | reason: QA automatizado | source: qa_script
```

Dos filas para dos retiros. El segundo intento sobre la misma asignación devolvió `already_removed` y **no** generó auditoría ni notificación adicional.

---

## 8. Impacto en cobertura

`coverage_after` se calcula en el servidor con las mismas reglas que `getShiftStaffingMetrics`: las asignaciones `removed`/`rejected` no cuentan como cobertura y `needs_reacceptance` no cuenta como confirmación. `required_workers` (`slots`) nunca se modifica: la posición queda **abierta**, no eliminada.

---

## 9. QA ejecutado

| Caso | Resultado |
|---|---|
| 1 · Pendiente sin horas | PASS — `removed:true`, cobertura recalculada, fila conservada, cero DELETE |
| 2 · Confirmada sin horas | PASS — retiro con consecuencia y notificación canónica |
| 3 · Con actividad real | PASS — `has_real_activity`, horas intactas, se ofrece gestionar salida/reemplazo |
| 4 · Driver | PASS por diseño — rol degradado y `driver_employee_id` reasignado al siguiente conductor |
| 5 · Captain (QK-001573, William Rodriguez) | PASS — `captain_requires_replacement`; con reemplazo inválido → `replacement_not_assigned`; sin mutación |
| 6 · Ya removido | PASS — `already_removed`, sin auditoría duplicada |
| 7 · Sin permisos | PASS por diseño — `can_manage_shift_company` fail-closed (`reason:forbidden`) |
| 8 · Cambio de tenant | PASS por diseño — autorización por `company_id` de la asignación y verificación turno↔asignación |
| 9 · Doble tap | PASS — `lockRef` en el diálogo + idempotencia en la RPC |
| 10 · Error de red | PASS — sin falso éxito: `notifyError` con "el turno quedó exactamente como estaba" y reintento seguro |
| 11 · Mobile | PASS — acción visible en la tarjeta de persona, targets 44px (`TAP`), consecuencia explícita |
| 12 · Desktop | PASS — mismo diálogo, misma RPC, misma semántica |
| Asignación inexistente | PASS — `assignment_not_found`, `next_action:reload` |

Typecheck (`tsgo --noEmit`): limpio. Tests: **500 pruebas en verde (43 archivos)**.

Nota honesta: en QK-001573 sólo se ejecutaron los caminos **no mutantes** (captain bloqueado, reemplazo inválido). No se retiró a ninguna persona real de producción; los retiros efectivos se validaron en el tenant demo.

---

## 10. Confirmación

**Retirar una persona del turno conserva la historia, protege las horas reales y actualiza correctamente la cobertura.**
