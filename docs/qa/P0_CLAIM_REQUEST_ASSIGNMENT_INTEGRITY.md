# P0 — Claim / Request Assignment Integrity

Fuente: `docs/qa/P0_WORKER_CROSS_SHIFT_CAPABILITY_INVENTORY.md`.
Principio: **reutilizar la ruta canónica**. No se creó ningún motor de conflicto nuevo.

---

## 1. Ruta anterior de aprobación

`src/pages/admin/ShiftRequests.tsx` → `handleApprove`:

1. Conteo local de asignaciones (`count(*)` sobre `shift_assignments`, **sin filtrar estados**:
   `rejected` y `removed` consumían cupo).
2. `supabase.from("shift_assignments").insert({ status: 'confirmed' })` — **INSERT directo**.
3. `update` de `shift_requests` a `approved` (paso independiente: si el insert fallaba después
   de una condición de carrera, la solicitud podía quedar en estado incoherente).
4. Notificación manual + `log_activity_detailed`.

Saltaba: compliance (`get_employee_assignment_status`), elegibilidad, duplicados canónicos,
`shift_audit_log`, política de empresa, y el estado real del servicio (cancelado/eliminado).

La RPC `resolve_shift_request` tampoco era canónica: insertaba/actualizaba `shift_assignments`
directamente y aprobaba la solicitud **antes** de crear la asignación.

## 2. Ruta nueva / canónica

```
worker claim  →  shift_requests (pending)
              →  admin approve  →  resolve_shift_request (RPC única)
                                    ├─ lock request + lock scheduled_shifts (FOR UPDATE)
                                    ├─ revalidación de estado ACTUAL
                                    ├─ capacidad (SSOT de estados)
                                    ├─ assign_worker_to_shift  ← ruta canónica de staffing
                                    │    ├─ can_manage_shift_company (tenant + permiso)
                                    │    ├─ empleado activo y de la misma empresa
                                    │    ├─ get_employee_assignment_status (compliance/override)
                                    │    ├─ duplicado activo
                                    │    └─ trigger prevent_overlapping_shift_assignments
                                    ├─ set_shift_assignment_state → confirmed/accepted
                                    ├─ UPDATE shift_requests → approved  (solo al final)
                                    └─ shift_audit_log (claim_approved)
```

Frontend: `ShiftRequests.tsx` sólo llama `resolveShiftRequest()` de
`src/lib/shifts/team-actions.ts` (aprobar y rechazar). No calcula capacidad ni escribe estados.

## 3. Inserts directos eliminados

| Lugar | Antes | Ahora |
|---|---|---|
| `ShiftRequests.tsx` | `insert` en `shift_assignments` | ninguno |
| `ShiftRequests.tsx` | `update` en `shift_requests` | ninguno (lo hace la RPC) |
| `ShiftRequests.tsx` | `insert` en `notifications` | ninguno (`create_shift_worker_notification`) |
| `resolve_shift_request` (SQL) | `INSERT/UPDATE shift_assignments` inline | `assign_worker_to_shift` + `set_shift_assignment_state` |

## 4. Validaciones reutilizadas (ninguna reimplementada)

- `can_manage_shift_company` — permiso y tenant del actor.
- `get_employee_assignment_status` + `has_active_assignment_override` — compliance/elegibilidad.
- `prevent_overlapping_shift_assignments` — solape real (mismo día, intervalos cruzados).
- Duplicado activo por `(shift_id, employee_id)` dentro de `assign_worker_to_shift`.
- `set_shift_assignment_state` — transición auditada a `confirmed/accepted`.
- `create_shift_worker_notification` — notificación única.
- `shift_audit_log` — traza existente.

Añadidas sólo en la RPC (no existían en ninguna capa): capacidad con estados canónicos,
servicio cancelado/eliminado, y bloqueo de fila para concurrencia.

## 5. Estados que consumen capacidad

Excluidos (NO consumen cupo), alineados con
`src/lib/shifts/assignment-status-truth.ts`:

`rejected`, `removed`, `declined`, `cancelled`, `canceled`, `unassigned`, `replaced`.

Consumen cupo: `pending`, `accepted`, `confirmed`, `scheduled` (y cualquier estado desconocido,
fail-closed en capacidad).

## 6. Concurrency QA (último cupo)

`SELECT ... FROM scheduled_shifts WHERE id = ... FOR UPDATE` serializa las aprobaciones del
mismo servicio. Con `slots = 1`:

- Aprobación A → asignación creada, cupo 1/1.
- Aprobación B (en paralelo) → espera el lock, recuenta y falla con `no_capacity:1/1`.
  La solicitud B **permanece pending**; no hay overbooking.

La capacidad del frontend ya no participa en la decisión.

## 7. Overlap QA

| Escenario | Resultado esperado | Mecanismo |
|---|---|---|
| Asignado 09:00–12:00, request 11:00–15:00 | BLOQUEA | trigger `prevent_overlapping_shift_assignments` (`start < other_end AND end > other_start`) |
| Asignado 09:00–12:00, request 17:00–23:00 | PERMITE | sin cruce de intervalos |
| Dos servicios el mismo día sin solape | PERMITE | no existe regla "un servicio por día" |
| Estado `rejected`/`removed` previo | no genera solape | el trigger los ignora |

La creación de la solicitud (claim) **no** se bloquea por tener otro servicio el mismo día.
El backend sigue siendo la autoridad final en la aprobación.

## 8. Tenant QA

Triple barrera: `can_manage_shift_company(company_id de la solicitud)`,
`scheduled_shifts.company_id = shift_requests.company_id`, y
`employees.company_id = shift_requests.company_id`, más la validación propia de
`assign_worker_to_shift` (`employee_wrong_company`). Cross-tenant es imposible.

## 9. Audit trail

Sin tablas nuevas. Cada aprobación deja en `shift_audit_log`:
`company_id`, `shift_id`, `assignment_id`, `employee_id`, `actor_user_id`, `action`
(`claim_approved` / `claim_rejected`), `before_data` (con `request_id`),
`after_data` (`assignment_id`, `assignment_status`, `capacity_before`, `slots`, `path`,
`notification_id`), `reason`, `source`, `created_at`.
Además `assign_worker_to_shift` escribe su propia fila `assignment_created`.

## 10. Atomicidad

Todo ocurre dentro de la función plpgsql: si `assign_worker_to_shift`, el trigger de solape o
la capacidad fallan, la transacción se revierte completa y la solicitud **no** queda aprobada.
El `UPDATE` a `approved` se ejecuta **después** de existir la asignación.

## 11. Payroll / dominios protegidos

Sin cambios en: `time_entries`, payroll, `scheduled_shifts` (schema y datos), auth, RLS,
pagos, chat, documentos, tenants, membresías, roles operativos, historial de producción.
Payroll sigue usando horas reales de `time_entries`. Sin backfill.

## 12. Juliana Quintero (solo lectura, sin escrituras)

| Registro | Fecha | Horario | Estado |
|---|---|---|---|
| QK-001646 | 2026-08-18 | 09:00–09:01 | confirmed |
| QK-001578 | 2026-08-18 | 17:30–23:00 | confirmed |
| QK-001584 | 2026-09-02 | 17:00–23:00 | **request pending** |

Sin solape; ambos assignments válidos. El request sigue pendiente: no se aprobó nada en
producción.

## 13. Deuda restante

- La UI de claim no muestra todavía el contexto "otro servicio el mismo día" (informativo).
- `ShiftRequests.tsx` sigue leyendo el conteo de `slots` sólo para mostrar; la decisión es del
  backend.
- Otras superficies de alta masiva (importaciones, duplicación, auto-dispatch) siguen creando
  asignaciones directamente; fuera de alcance de este P0.

## 14. Veredicto

🟢 **GO** — la aprobación de solicitudes ya no puede crear asignaciones fuera de la ruta
canónica, ni sobrepasar cupo, ni generar solapes, ni dejar solicitudes falsamente aprobadas.
