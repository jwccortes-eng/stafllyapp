# Stafly Command Center v1 — Demo Pack

**Documento demo/documentación interna para Jorge y equipo comercial/operativo.**  
**Última actualización:** 2026-07-08  
**Alcance:** Documentación únicamente. No modifica código, base de datos, RLS, auth, payroll ni datos reales.

---

## 1. Propósito de este demo

Mostrar en una sola narrativa el flujo completo de **Stafly Command Center v1**:

```text
Shift Ops  →  Time Clock  →  Payroll Review Queue  →  Retorno de estado en Shift Ops
```

Este pack está diseñado para que Jorge pueda presentar Stafly a un cliente, operador o partner sin explicar código, sin abrir múltiples pantallas y sin caer en promesas de payroll que todavía no corresponden al alcance actual.

---

## 2. Dolor del cliente (narrativa comercial)

Hoy muchas operaciones de staffing limpian eventos, almacenes, hoteles o construcción con este combo:

- **WhatsApp** para confirmar workers.
- **Excel** para listar asignaciones.
- **Fotos sueltas** en grupos de WhatsApp como evidencia de asistencia.
- **Connecteam o similar** como registro de fichaje, pero desconectado de la operación real.
- **Revisión de horas** hecha a mano, una semana después, con el worker ya molesto si hay error.

Esto produce:

- No-shows detectados tarde.
- Workers que llegaron pero no marcaron y nadie lo nota.
- Turnos terminados que nunca se cierran formalmente.
- Admin que revisa payroll sin contexto operativo.
- Incertidumbre sobre qué turnos están listos para pagar.

---

## 3. Cómo Stafly lo resuelve

Stafly Command Center v1 le da al admin una **pantalla por turno** que cambia de prioridad según la fase del día:

| Momento | Prioridad en Shift Ops |
|---|---|
| **Antes del turno** | Staffing, confirmación de workers, punto de encuentro, transporte. |
| **Inminente / En curso** | Asistencia, evidencia de fichaje, no-shows, clock-in pendiente. |
| **Después del turno** | Cierre, revisión de horas, ajustes, preparación para payroll. |
| **Cerrado** | Resumen, cronología, estado del Centro de Validación. |

Cada acción crítica deja evidencia. El admin no paga horas que no estén validadas. Payroll sigue basado en **fichajes reales** o en **ajustes aprobados**.

---

## 4. Por qué es mejor que WhatsApp / Excel / Connecteam

| Tema | WhatsApp / Excel / Connecteam | Stafly Command Center v1 |
|---|---|---|
| **Staffing** | Confirmaciones dispersas en chats. | Cards de asignados, candidatos y riesgos en un solo lugar. |
| **Asistencia** | Fotos sueltas, sin contexto de turno. | Validación admin con razón obligatoria, ligada al worker y al turno. |
| **Fichaje** | Correcciones aisladas. | Time Clock enfocado al turno (`/app/timeclock?shiftId=...`). |
| **Revisión horas** | Revisión manual posterior. | Centro de Validación enfocado al turno (`/app/payroll-review-queue?shiftId=...`). |
| **Estado de cierre** | No hay estado visible. | Badge en Shift Ops: sin cierre, en revisión, requiere corrección, aprobado, listo para payroll. |
| **Auditabilidad** | Se pierde en chats. | Cronología y notas por turno. |
| **Seguridad de payroll** | Fácil pagar horas sin evidencia. | Payroll no se modifica automáticamente; requiere ajustes aprobados. |

---

## 5. Flujo demo paso a paso

### Paso 0 — Abrir Shift Ops con un turno específico

URL de inicio:

```text
/app/shift-ops?id=<shiftId>
```

Reemplazar `<shiftId>` con el UUID real del turno. Ideal para demostraciones con datos de staging.

### Paso 1 — Leer el chip de fase

En la parte superior de Shift Ops aparece un chip que indica la fase operativa del turno:

| Fase | Ejemplo de copy | Color semántico |
|---|---|---|
| `Antes · en 2d` | Turno futuro, más de 1 hora de distancia. | Neutro / azul suave. |
| `Empieza en 45m` | Turno inminente. | Info. |
| `En curso · 2h 15m` | Turno en progreso. | Éxito. |
| `Terminó hace 1h` | Turno terminado, aún no cerrado. | Advertencia. |
| `Cerrado` | Turno locked / archived / cancelled / completed. | Apagado. |

Este chip se calcula en frontend con `getShiftPhase` usando `date`, `start_time`, `end_time` y `status` del turno. No hace consultas a base de datos adicionales.

### Paso 2 — Ver el orden de prioridad por fase

Según la fase, Shift Ops reordena los bloques visibles para mostrar primero lo urgente.

- **Antes:** primero `SmartSummaryCard`, `MissingItemsCard`, `StaffingRequiredBanner`, `AssignedTeamCard`, `CandidatesCard`.
- **Inminente / En curso:** sube `AttendanceEvidenceCard` con asistencia y evidencia de fichaje.
- **Después:** sube el bloque de preparación para cierre con botones a Time Clock y Payroll Review Queue.
- **Cerrado:** resumen, cronología y estado de retorno del Centro de Validación.

### Paso 3 — Revisar asistencia y evidencia

Dentro de `AttendanceEvidenceCard` se ve:

- Estado por worker: `Fichaje completo`, `En turno`, `Presente sin clock`, `Falta clock-in`, `Falta clock-out`, `Ausente`, etc.
- KPIs agregados.
- Última validación admin con su razón.
- Botones de acción: Llamar, Marcar presente, Marcar tarde, Marcar ausente, Cerrar clock-out, Revisar horas.

Regla clave de demo:

> **“Las validaciones admin son evidencia operativa. No cambian payroll. Payroll se calcula con fichajes reales o ajustes aprobados en el Centro de Validación.”**

### Paso 4 — Usar CTA a Time Clock

En el bloque de asistencia y cierre, pulsar el botón que lleva a:

```text
/app/timeclock?shiftId=<shiftId>
```

Esto abre Time Clock ya filtrado al turno, para corregir clocks abiertos o revisar fichajes reales.

### Paso 5 — Usar CTA a Payroll Review Queue

En el bloque de cierre/preparación, pulsar el botón que lleva a:

```text
/app/payroll-review-queue?shiftId=<shiftId>
```

Esto abre el Centro de Validación enfocado al turno, mostrando los buckets de pendientes de ese turno:

- `requiere-corrección`
- `pendiente-cierre`
- `en-revisión-maria`
- `pending-final`
- `listo-pago`
- `closeout`
- `day-pay`
- etc.

Desde allí el admin puede aprobar/rechazar ajustes que sí impactan payroll.

### Paso 6 — Volver a Shift Ops y ver el badge de estado del Centro de Validación

Regresar a:

```text
/app/shift-ops?id=<shiftId>
```

Junto al chip de fase aparece ahora un **badge de estado de cierre/revisión** derivado de `shift_closeout_reports`:

| Estado | Copy del badge | Color | Significado |
|---|---|---|---|
| `no_data` | Sin estado de cierre | Neutro | Turno futuro o sin evaluación. |
| `no_closeout` | Sin cierre enviado | Advertencia | Turno pasado sin cierre del capitán. |
| `in_review` | Cierre enviado · en revisión | Advertencia | Cierre enviado, esperando revisión. |
| `needs_correction` | Requiere corrección | Peligro | Rechazado o necesita seguimiento. |
| `pending_final` | Aprobado por María · pendiente final | Info | Aprobado operativamente, falta aprobación final. |
| `ready_for_payroll` | Aprobado · pasa a payroll | Éxito | Aprobación final completada. |

El badge es un chip clickeable que navega de nuevo a `/app/payroll-review-queue?shiftId=<shiftId>`.

---

## 6. Checklist de escenarios para demo

Marcar cada escenario que se va a mostrar. Se recomienda preparar turnos de staging para cada uno.

### Escenario A — Turno futuro (> 1 hora)

- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Confirmar chip: `Antes · en Xd` o `Antes · en Xh`.
- [ ] Confirmar que arriba aparecen: Staffing, Candidatos, Resumen inteligente.
- [ ] `AttendanceEvidenceCard` aparece, pero no es la primera prioridad.
- [ ] Badge de cierre: `Sin estado de cierre`.

### Escenario B — Turno inminente o en curso

- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Confirmar chip: `Empieza en Xm` o `En curso · Xh Ym`.
- [ ] Confirmar que `AttendanceEvidenceCard` sube de prioridad.
- [ ] Mostrar worker con `Falta clock-in` o `Presente sin clock`.
- [ ] Mostrar CTA a `/app/timeclock?shiftId=<shiftId>`.
- [ ] Badge de cierre: `Sin estado de cierre` o `Sin cierre enviado` si ya pasó.

### Escenario C — Turno terminado (sin cierre)

- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Confirmar chip: `Terminó hace Xh`.
- [ ] Confirmar que arriba aparece el bloque de preparación para cierre.
- [ ] Mostrar CTA a `/app/payroll-review-queue?shiftId=<shiftId>`.
- [ ] Badge de cierre: `Sin cierre enviado`.

### Escenario D — Turno con cierre enviado

- [ ] Preparar un turno con fila en `shift_closeout_reports.status = 'submitted'`.
- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Badge: `Cierre enviado · en revisión`.
- [ ] Clic al badge y navegar a `/app/payroll-review-queue?shiftId=<shiftId>`.
- [ ] Mostrar bucket `en-revisión-maria` con el turno.

### Escenario E — Turno que requiere corrección

- [ ] Preparar un turno con `review_status = 'rejected'` o `status = 'rejected'`.
- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Badge: `Requiere corrección`.
- [ ] Clic al badge y navegar a `/app/payroll-review-queue?shiftId=<shiftId>`.
- [ ] Mostrar bucket `requiere-corrección` con el turno.

### Escenario F — Turno pendiente de aprobación final

- [ ] Preparar un turno con `status = 'reviewed'` y `review_status = 'approved'`.
- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Badge: `Aprobado por María · pendiente final`.
- [ ] Clic al badge y navegar a `/app/payroll-review-queue?shiftId=<shiftId>`.
- [ ] Mostrar bucket `pending-final` con el turno.

### Escenario G — Turno aprobado para payroll (opcional)

- [ ] Preparar un turno con `final_approval_status = 'approved'`.
- [ ] Abrir `/app/shift-ops?id=<shiftId>`.
- [ ] Badge: `Aprobado · pasa a payroll`.
- [ ] Clic al badge y navegar a `/app/payroll-review-queue?shiftId=<shiftId>`.
- [ ] Mostrar bucket `listo-pago` con el turno.

---

## 7. Talking points de venta seguros

### ✅ Decir en demo

- **“No cambia payroll automáticamente.”**
  - Shift Ops y Attendance no escriben en `payroll_adjustments` ni `time_entries`.
  - Las validaciones admin solo crean `shift_notes` de tipo `attendance_validation`.

- **“Payroll se basa en fichajes reales y ajustes aprobados.”**
  - `time_entries` es la fuente de horas pagadas.
  - `payroll_adjustments` aprobados son los únicos ajustes que impactan.

- **“Cada acción crítica deja evidencia.”**
  - Validaciones admin exigen razón.
  - Cada ajuste aprobado/rechazado queda registrado.
  - `shift_timeline` y `shift_notes` guardan cronología.

- **“El admin ve qué resolver primero.”**
  - Shift Ops reordena bloques por fase del turno.
  - Centro de Validación agrupa turnos por estado de revisión.
  - Badge de retorno indica si el turno está bloqueado, en revisión o listo.

### ❌ No decir en demo

- **No decir “pagado”.** El badge `Aprobado · pasa a payroll` significa que el turno está listo para el flujo de payroll, no que el dinero ya fue transferido.
- **No decir “payroll limpio”.** Nunca afirmar que el turno no tiene problemas de payroll sin revisar todos los buckets del Centro de Validación.
- **No prometer reconciliation completa por shift.** La reconciliación de payroll sigue siendo por periodo; no garantizar que un solo turno resuelve todo.
- **No vender realtime.** Si la pantalla no muestra actualización automática en vivo, no decir que es realtime.

---

## 8. Screenshots requeridos

Guardar en la carpeta `docs/demo/screenshots/` con los nombres exactos.

### 8.1 `shift-ops-command-center.png`

- URL: `/app/shift-ops?id=<shiftId>`
- Capturar: chip de fase, badge de estado, bloques principales, CTA a Time Clock y PRQ.
- Idealmente: turno en curso o terminado para mostrar ambos chips.

### 8.2 `time-clock-focus.png`

- URL: `/app/timeclock?shiftId=<shiftId>`
- Capturar: Time Clock filtrado al turno, lista de fichajes, botón de corregir/cerrar clock.

### 8.3 `payroll-review-shift-focus.png`

- URL: `/app/payroll-review-queue?shiftId=<shiftId>`
- Capturar: Centro de Validación enfocado, buckets del turno, turno resaltado en la lista.

### 8.4 `closeout-status-badge.png`

- URL: `/app/shift-ops?id=<shiftId>`
- Capturar: primer plano del badge de estado de cierre junto al chip de fase.
- Idealmente: mostrar 2 estados distintos (por ejemplo `Requiere corrección` y `Aprobado · pasa a payroll`).

---

## 9. QA demo checklist

Antes de cualquier presentación externa, validar:

### Desktop (1280x900 o mayor)

- [ ] Shift Ops carga con `?id=<shiftId>`.
- [ ] Chip de fase visible y correcto.
- [ ] Bloques reordenados según la fase.
- [ ] `AttendanceEvidenceCard` visible en turnos en curso/terminados.
- [ ] CTA a `/app/timeclock?shiftId=<shiftId>` funciona.
- [ ] CTA a `/app/payroll-review-queue?shiftId=<shiftId>` funciona.
- [ ] Badge de estado de cierre visible y correcto.
- [ ] Badge navega a `/app/payroll-review-queue?shiftId=<shiftId>`.
- [ ] No se ejecutan `POST`, `PATCH`, `PUT` ni `DELETE` al montar la página.

### Mobile (390x844 o similar)

- [ ] Shift Ops carga sin errores de layout.
- [ ] Chip de fase y badge de cierre visibles sin scroll.
- [ ] Bloques principales accesibles con scroll.
- [ ] CTAs a Time Clock y PRQ funcionan.
- [ ] No se ejecutan `POST`, `PATCH`, `PUT` ni `DELETE` al montar la página.

### Deep-links

- [ ] `/app/shift-ops?id=<shiftId>` abre el turno correcto.
- [ ] `/app/timeclock?shiftId=<shiftId>` filtra por el turno.
- [ ] `/app/payroll-review-queue?shiftId=<shiftId>` enfoca el turno y resuelve el periodo.
- [ ] Volver a `/app/shift-ops?id=<shiftId>` muestra badge actualizado.

### Seguridad

- [ ] Ningún paso del demo modifica payroll sin aprobación explícita.
- [ ] Ningún paso del demo crea `time_entries` sin autorización.
- [ ] Ningún paso del demo modifica `shift_closeout_reports` desde Shift Ops.
- [ ] Todos los writes observados en la demo son intencionales (ej. aprobación de ajuste en PRQ).

---

## 10. Límites de venta seguros

| Promesa | Límite real | Copy seguro |
|---|---|---|
| “Pagado” | No Stafly no ejecuta transferencias. | “Listo para el flujo de payroll” / “Aprobado para pasar a payroll”. |
| “Payroll limpio” | Shift Ops no verifica todo el periodo. | “Este turno no tiene cierre pendiente” / “Aprobado por el flujo de revisión”. |
| “Reconciliation completa” | Reconciliation es por periodo, no por turno aislado. | “El Centro de Validación muestra los pendientes del periodo del turno”. |
| “Realtime” | Shift Ops no recarga automáticamente cada segundo. | “Actualiza al abrir o navegar; cada fase del turno muestra lo urgente”. |
| “Auto-corrección” | No se corrige payroll automáticamente desde Shift Ops. | “Cada corrección requiere aprobación en el Centro de Validación”. |

---

## 11. Qué NO cambió con este documento

Este pack es **documentation-only**. No se modificó:

- `src/**` (código fuente).
- `time_entries`
- `payroll_adjustments`
- `pay_periods`
- `payroll_review_notes`
- `shift_closeout_reports`
- `scheduled_shifts`
- `shift_assignments`
- `shift_notes`
- `shift_timeline`
- `movements`
- `reconciliation_*`
- `compensation_*`
- `payroll_rate_snapshots`
- Edge functions.
- Storage policies.
- Auth.
- RLS.
- Migrations.
- Tenant/company activation.
- Production data.
- Workflows CI.

---

## 12. Archivos de este demo pack

- `docs/demo/STAFly_COMMAND_CENTER_DEMO_PACK.md` — este documento.
- `docs/demo/screenshots/shift-ops-command-center.png` — placeholder/real.
- `docs/demo/screenshots/time-clock-focus.png` — placeholder/real.
- `docs/demo/screenshots/payroll-review-shift-focus.png` — placeholder/real.
- `docs/demo/screenshots/closeout-status-badge.png` — placeholder/real.

---

## 13. Recomendación de siguiente paso

**Sprint 44 recomendado:** Demo recordings / Looms.

- Grabar 4 Looms cortos (3-5 min cada uno):
  1. **Antes del turno:** staffing y confirmación.
  2. **Durante el turno:** asistencia, no-show y clock evidence.
  3. **Después del turno:** cierre y Centro de Validación.
  4. **Estado de retorno:** cómo Shift Ops muestra el resultado de PRQ.
- Generar un deck de 5 slides con los talking points y screenshots.
- Preparar un turno de “demo limpio” en staging por cada escenario del checklist.
- Opcional: crear un modo “demo” que congele el reloj para que el chip de fase no cambie durante la presentación.

---

**Fin del demo pack.**
