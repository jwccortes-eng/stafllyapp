# F0 — Contención: Notificaciones, Chat y Aislamiento Multi-Tenant

Fecha: 2026-08-01 · Alcance: **solo F0** del reporte
`STAFLY_COMMUNICATION_NOTIFICATIONS_ADAPTIVE_EXPERIENCE_AUDIT.md`.
**No** se implementó Smart Notifications (F1+), **ni** Adaptive Experience, **ni** tablas nuevas.

---

## 1. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/hooks/useNotifications.tsx` | Aislamiento por `company_id` activo en fetch, realtime, mark-as-read, mark-all, refetch. Coalescencia de ráfagas. Prioridad crítica. |
| `src/pages/admin/Notifications.tsx` | Fetch y mark-as-read filtrados por `company_id` activo. |
| `src/components/NotificationBell.tsx` | Alertas críticas resaltadas (borde/badge "Crítica"), orden con críticas primero. |
| `src/lib/notifications/priority.ts` *(nuevo)* | Helper puro: prioridad + motor de coalescencia (10 s / 3 eventos). |
| `src/test/notification-priority.test.ts` *(nuevo)* | 5 tests (todos en verde). |

## 2. Migraciones creadas

1. **F0 principal** — `notify_employees_on_shift_change`, `handle_material_shift_change`,
   `notify_employee_on_shift_assignment`, `assign_worker_to_shift`, `can_read_shift_chat` (nueva),
   políticas `scm_select` / `scm_insert_admin` / `scm_insert_employee`.
2. **Fix menor** — `scm_insert_admin`: referencia ambigua `s.company_id = s.company_id` → calificada
   contra `shift_chat_messages.company_id`.

No se creó ninguna tabla. No se tocó payroll, `time_entries`, auth, `get_employee_assignment_status`,
la política de compliance, `scheduled_shifts` (schema), pagos, documentos ni edge functions.

## 3. Triggers: qué cubría cada uno y qué se conserva

| Trigger | Antes | Ahora | Riesgo de regresión |
|---|---|---|---|
| `trg_material_shift_change` → `handle_material_shift_change` (BEFORE UPDATE) | Detecta cambio material (fecha/hora/ubicación/título/punto/notas/pay_type), sube `operational_version`, pasa asignaciones aceptadas a `needs_reacceptance` y emite `shift_updated_reaccept`. | **Ruta única de cambio material.** Además emite `shift_updated` (informativo) a asignados **no** aceptados — cobertura que antes daba el otro trigger. Ignora el evento de cancelación. | Bajo. La máquina de re-aceptación no cambió. |
| `trg_notify_shift_change` → `notify_employees_on_shift_change` (AFTER UPDATE) | Emitía `shift_time_changed` / `shift_date_changed` / `shift_location_changed` / `shift_cancelled`. Las 3 primeras **duplicaban** al trigger anterior con mensajes contradictorios ("acepta nuevamente" vs "cambio de horario"). | **Solo `shift_cancelled`** (soft delete). Ramas duplicadas eliminadas. | Bajo. Los tipos `shift_time_changed`/`shift_date_changed`/`shift_location_changed` dejan de generarse; el contenido (fecha/horario/ubicación nuevos) se incorporó al cuerpo del mensaje de la ruta única. |
| `trg_notify_on_shift_assignment` → `notify_employee_on_shift_assignment` (AFTER INSERT) | Emitía `shift_assigned` solo si `publication_status = 'published'`. | **Única fuente** de notificación de asignación. Guard ampliado a "no draft" (igual criterio que usaba el helper del RPC) + descarta turnos borrados. | Bajo; amplía cobertura, no la reduce. |
| `assign_worker_to_shift` (RPC) | Insertaba la asignación **y además** llamaba `create_shift_worker_notification` → 2 notificaciones (`shift_assigned` + `shift_assignment`). | Ya **no** emite notificación propia; resuelve el `notification_id` producido por el trigger y lo registra en `shift_audit_log` junto con `notification_source`. Validaciones P0.1 intactas. | Bajo. Auditoría y trazabilidad conservadas. |

`create_shift_worker_notification` **no se eliminó** (otros flujos de claim la usan); solo dejó de
invocarse desde `assign_worker_to_shift`.

## 4. RLS del chat de turno — antes y después

**Antes**
```
scm_select  USING ( user_is_company_admin(auth.uid(), company_id)
                    OR user_is_assigned_to_shift(auth.uid(), shift_id) )
```
Problemas:
- `user_is_company_admin()` incluye `has_role(uid,'admin')` **global** → cualquier admin de cualquier
  tenant leía los chats de todos los tenants.
- `user_is_assigned_to_shift()` ignora `company_id` y no excluye reservas draft.

**Después**
```
scm_select  USING ( can_read_shift_chat(auth.uid(), company_id, shift_id) )
```
`can_read_shift_chat` (SECURITY DEFINER, STABLE) exige que el turno pertenezca a esa compañía y que
el usuario sea: global owner, owner de la compañía, `admin` o `manager` **de esa compañía**, o tenga
asignación **activa** en ese turno específico.

**Definición de "asignación activa"**: fila en `shift_assignments` con `shift_id` = el turno,
`company_id` = la compañía del turno, `employees.user_id = auth.uid()`,
`status NOT IN ('rejected','removed')` y `is_draft_reservation = false`.

Los `INSERT` (admin y employee) usan las mismas condiciones. **No se borró ningún mensaje ni historial.**

## 5. Evidencia del filtro por `company_id`

- Fetch admin: `.eq("recipient_id", user.id).eq("company_id", selectedCompanyId)` + query company-wide ya scoped, con `filter(n => n.company_id === selectedCompanyId)` defensivo.
- Fetch portal: `.in("recipient_id", [...]).eq("company_id", selectedCompanyId)`.
- Sin compañía activa → lista vacía (nunca "todo por user.id").
- `markAsRead` / `markAllAsRead`: `.eq("company_id", selectedCompanyId)`.
- Realtime: canales namespaced por compañía + guard `newNotif.company_id !== activeCompany` → descarta y loguea.
- `/app/notifications` (listado completo): mismo filtro.

## 6. QA ejecutado

| # | Caso | Resultado |
|---|---|---|
| 1 | Multi-compañía A/B | ✅ Queries y guard cliente scoped a la compañía activa; sin compañía → vacío. |
| 2 | Realtime cross-company | ✅ Evento de otra compañía descartado antes de state/toast/sonido. |
| 3 | Edición de turno | ✅ Una sola ruta de notificación; ramas duplicadas eliminadas (verificado en `pg_proc`). |
| 4 | `assign_worker_to_shift` | ✅ Una sola notificación (trigger); `shift_audit_log` conserva `notification_id`, `compliance_status`, `policy`, `admin_override`. |
| 5 | Ráfaga 5/10 s | ✅ Test: 1 toast agrupado ("5 actualizaciones en tu operación"), sonido no se repite, las 5 quedan en la campana. |
| 6 | Crítica `no_show_alert` | ✅ Nunca agrupada, toast de error separado (12 s), sonido `alert`, resaltada en la campana. |
| 7 | Chat (datos reales) | ✅ worker activo `true`; admin global de otro tenant: regla antigua `true` → **regla nueva `false`**; usuario de otro tenant `false`; worker `removed` sin otro título de acceso `false`; owner/admin de la compañía `true`. |
| 8 | Regresión | ✅ `tsgo --noEmit` limpio, 5/5 tests. Sin DELETE de mensajes ni notificaciones. |

## 7. Riesgos pendientes

- Los tipos `shift_time_changed` / `shift_date_changed` / `shift_location_changed` dejan de producirse;
  cualquier consumidor externo (reportes, mapeos de correo) debe mapear a `shift_updated` /
  `shift_updated_reaccept`.
- Notificaciones históricas con `company_id` nulo (si existieran) no aparecerán bajo el nuevo filtro.
- Roles "capitán"/"supervisor" aún no existen como rol real; hoy leen el chat por asignación activa.
- El linter global sigue reportando hallazgos preexistentes (search_path, buckets públicos) fuera del alcance F0.

## 8. Confirmación de alcance

No se implementaron F1–F5: no hay Notification Decision Layer, ni taxonomía completa, ni digest
server-side, ni encuadres adaptativos, ni consolidación de los 7 sistemas de mensajería.

## 9. Recomendación para F1 en modo sombra

Arrancar F1 como **observador puro**: registrar cada intento de notificación (tipo, destinatario,
compañía, decisión que *hubiera* tomado la Decision Layer: emitir / agrupar / suprimir) sin alterar el
envío real, durante 2 semanas. Medir tasa de lectura por tipo y volumen suprimible antes de activar
cualquier supresión en producción.
