# P0.1 — Concurrent Service Edit Protection

**Estado:** hallazgo confirmado; sin corrección implementada  
**Fecha de reproducción:** 2026-08-02  
**Separación:** este riesgo no cierra ni sustituye el P0 de persistencia visible del video.

## Alcance y restricciones

Auditoría report-only. No se cambiaron contratos, base de datos, payroll, `time_entries`, RLS ni tenants. No se aplicó reemplazo masivo.

## Reproducción autenticada con dos sesiones

Servicio usado: `MSS-000089`. Ambas sesiones abrieron el editor desktop antes del primer guardado.

1. A abrió el servicio con cliente Banquit Events, transporte desactivado y `meeting_point = null`.
2. B abrió el mismo servicio y conservó ese snapshot.
3. A activó transporte, estableció `meeting_point = "P0.1 A · Lobby norte 0117"` y guardó.
4. La respuesta de A fue `200` y devolvió el punto de encuentro y transporte activado.
5. B cambió únicamente el cliente a BOOSER desde el formulario que seguía abierto.
6. B guardó. La respuesta fue `200`, pero devolvió `meeting_point = null` y `transportation_required = false`.

**Resultado confirmado:** B sobrescribió silenciosamente los cambios de A. La UI anunció éxito en ambas sesiones. Tras la prueba, el cliente se restauró a Banquit Events; no se conservaron datos ficticios del experimento.

## Causa precisa

### Editor desktop

`ShiftEditDialog` transforma todo el estado del formulario mediante `formStateToShiftPayload` y entrega el snapshot completo a `onSave`. En Servicios, `handleEditShift` pasa ese objeto completo a `updateShiftVerified`.

Por tanto, cambiar sólo el cliente también reenvía los valores antiguos de los demás campos editables. La segunda escritura es técnicamente válida y reemplaza cambios concurrentes.

### Editor móvil

`MobileShiftEditSheet` calcula un diff local entre el formulario y el objeto `shift` recibido al abrir. Esto reduce las columnas enviadas y evita el overwrite del escenario exacto si B cambia sólo cliente. Sin embargo, no relee la versión actual ni comprueba que los campos modificados por B sigan partiendo de la misma versión. Dos usuarios modificando la misma columna siguen bajo política last-write-wins.

### `updateShiftVerified`

La función verifica permisos/fila devuelta y compara la respuesta con el payload enviado. **No detecta concurrencia**: no recibe `expected_updated_at`, no añade `.eq("updated_at", expected)` y no usa una columna `version`. En el caso reproducido valida precisamente el snapshot antiguo que acaba de sobrescribir a A, por lo que devuelve éxito.

## Snapshots completos y superficies afectadas

| Superficie | Payload | Protección concurrente | Riesgo |
|---|---|---|---|
| Servicios desktop → `ShiftEditDialog` → `Shifts.handleEditShift` | Snapshot completo | Ninguna | Confirmado: puede revertir campos ajenos |
| Centro de Operaciones → `ShiftEditDialog` → `ShiftOperations.handleEditSave` | Snapshot completo | Ninguna | Mismo mecanismo |
| Edición móvil → `MobileShiftEditSheet` | Diff respecto al snapshot de apertura | Ninguna | No revierte columnas no enviadas; puede perder cambios sobre la misma columna |

No se identificó otro editor de actualización de `scheduled_shifts` usando `formStateToShiftPayload` fuera de estas rutas.

## Columnas expuestas por el snapshot desktop

El payload completo incluye:

- `title`, `date`, `start_time`, `end_time`, `slots`
- `client_id`, `location_id`, `notes`, `claimable`
- `meeting_point`, `meeting_point_location_id`, `meeting_time`
- `job_site_location_id`, `job_site_address`, `special_instructions`
- `transportation_required`, `car_capacity`, `transportation_notes`
- `driver_employee_id` legado
- `pay_type`, `day_type`, `pay_override`
- `shift_admin_id`, `clock_method`, `attendance_mode`
- `qr_attendance_mode`, agregado por el diálogo desktop

Además del caso confirmado, cualquier combinación de estas columnas puede revertirse si B conserva un snapshot anterior y guarda después de A. Las columnas de pago configurables están dentro del snapshot del editor, aunque esta auditoría no modificó payroll ni probó efectos derivados.

## Estado del control optimista

- `scheduled_shifts.updated_at` existe y cambia con cada escritura.
- Los editores no conservan ni envían un `expected_updated_at` como precondición.
- No se observó una columna `version` usada por estas rutas.
- No existe conflicto visible, merge de campos ni recarga obligatoria antes de guardar.
- Comportamiento actual: **last successful write wins**, incluso cuando contiene valores antiguos de otras columnas.

## Evidencia

- `p01-concurrency-evidence/session-a.webm`: A abre, activa transporte, cambia el punto de encuentro y guarda.
- `p01-concurrency-evidence/session-b.webm`: B abre antes, cambia sólo cliente y guarda el snapshot anterior.
- Capturas `01`–`05`: estados de apertura y guardado de ambas sesiones.

## Conclusión

P0.1 queda registrado como riesgo real y reproducible. No se propone todavía un cambio de contrato: cualquier solución debe auditar primero compatibilidad de `expected_updated_at`/versión, UX de conflicto, payloads parciales, timeline/auditoría y todos los callers de `updateShiftVerified`.