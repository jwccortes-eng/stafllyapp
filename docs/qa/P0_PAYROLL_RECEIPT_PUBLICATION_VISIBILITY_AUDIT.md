# P0 — Auditoría del pipeline de publicación y visibilidad de recibos de pago

Fecha: 2026-09-15 · Modo: **solo lectura** · Escrituras ejecutadas: **0**
Periodos auditados: **146** (2026-08-19→25, `86b967e5`), **147** (2026-08-26→09-01, `60bceb71`),
**148** (2026-09-02→08, `b17caedc`) — todos company `00000000-…0001`, status `paid`.

---

## 1. Arquitectura del pipeline

```text
pay_periods (periodo)
  └─ period_base_pay        base_total_pay, approved_total_override, approved_total_source
  └─ movements (+concepts)  extras / deducciones, approval_status, visible_to_worker
        │  RPC publish_pay_statement(_period_id,_employee_id,_source)   ← única vía de creación
        ▼
  pay_statements            status ('published'|'revoked'), frozen_total, frozen_base/extras/deductions,
                            line_count, approved_at, published_at/by, revoked_at/by/reason
        │  RPC worker_pay_statements() / worker_pay_statement_detail()
        ▼
  Portal → /portal/pay-reports ("Mis pagos") → /portal/paystub/:periodId
```

Total congelado en publicación: `frozen_total = COALESCE(ROUND(approved_total_override,2), base + extras − deducciones)`.
El cliente nunca recalcula.

**Visibilidad del trabajador** requiere las tres condiciones del RPC/RLS:
`status='published'` **AND** `published_at IS NOT NULL` **AND**
`employee_id ∈ user_identity_employee_ids(auth.uid())` (registro con `user_id`, o registro
fusionado hacia un registro con `user_id` dentro de la misma empresa).

Por tanto: **"publicado" por sí solo NO garantiza visibilidad.** El eslabón faltante posible es
la cuenta (`employees.user_id`).

---

## 2. Periodo 146 (26 trabajadores con base)

| Métrica | Valor |
|---|---|
| Con datos de nómina (base) | 26 |
| Con total externo aprobado | 26 |
| Con recibo creado | 0 |
| Publicados | 0 |
| Despublicados/revocados | 0 |
| Con movimientos pendientes (bloqueo duro) | 2 |
| Con cuenta | 24 |
| Sin cuenta | 2 |
| Recibos publicados visibles | 0 (no hay recibos) |

## 3. Periodo 147 (60 trabajadores con base)

| Métrica | Valor |
|---|---|
| Con base | 60 · con total externo aprobado 60 |
| Recibos creados | 2 · publicados 2 · revocados 0 |
| Movimientos pendientes | 0 |
| Con cuenta | 51 · sin cuenta 9 |
| Publicados visibles al trabajador | **2 de 2** |

Recibos: `$176.00` (base 176, 0 líneas) y `$2,272.00` (base 762 + extras 1,510, 3 líneas).

## 4. Periodo 148 (68 trabajadores con base)

| Métrica | Valor |
|---|---|
| Con base | 68 · con total externo aprobado 68 |
| Recibos creados | 1 · publicados 1 · revocados 0 |
| Movimientos pendientes | 0 |
| Con cuenta | 56 · sin cuenta 12 |
| Publicados visibles al trabajador | **1 de 1** |

Recibo: `$567.00` (base 1,219 − deducciones 652, 1 línea).

## 5. Publicado vs. visible para el trabajador

Los 8 recibos publicados del sistema (5 en periodo 142 + 2 en 147 + 1 en 148) cumplen las tres
condiciones: `published`, `published_at` presente, empleado con cuenta y **mismo tenant** que el
recibo, ninguno fusionado. **Divergencia publicado→visible = 0.**

El riesgo no es de recibos perdidos, sino de **cobertura**: 154 trabajadores con nómina aprobada
en 146/147/148 y solo 3 recibos publicados.

## 6. Traza de la consulta del portal

- Ruta: `/portal/pay-reports` (`src/pages/portal/PayReports.tsx`) → `fetchWorkerPayStatements()` →
  RPC `worker_pay_statements()` (`STABLE SECURITY DEFINER`).
- Tablas: `pay_statements` ⋈ `pay_periods` ⋈ `companies`. **No** lee `time_entries`,
  `scheduled_shifts`, `period_base_pay` ni `movements` directamente.
- Vinculación: `employee_id IN user_identity_employee_ids(auth.uid())` — nunca por nombre ni teléfono.
- Filtro de publicación: `status='published' AND published_at IS NOT NULL`.
- Filtro de tenant: implícito y correcto — el recibo pertenece al empleado, y el empleado a una
  empresa; no hay parámetro de empresa manipulable por el cliente. **Sin fuga cross-company.**
- Detalle: `worker_pay_statement_detail` (solo líneas aprobadas, `visible_to_worker`, nota visible).
- RLS de respaldo idéntica: *"Employees can view own published statements"*.
- `/portal/payments` (`MyPayments.tsx`, cálculo inseguro sobre `time_entries`) está **desmontada**
  y redirige a `/portal/pay-reports`; el archivo se conserva solo como evidencia forense.
- `/portal/week/:periodId` redirige a `/portal/paystub/:periodId`. No hay segunda verdad montada.

## 7. Histórico Connecteam vs. recibos nativos Stafly

| | Connecteam histórico | Recibo nativo |
|---|---|---|
| Tabla | `historical_payroll_entries` | `pay_statements` (+ `movements`) |
| Acceso | RLS **solo admin/owner/manager** | trabajador ve los propios publicados |
| Vinculación | `matched_employee_id` (puede ser NULL) | `employees.user_id` / identidad canónica |
| Publicación | no existe concepto | `status` + `published_at` + congelado |

Hallazgo: los reportes históricos de Connecteam **no son legibles por el trabajador** (RLS admin).
`src/lib/weekly-pay-breakdown.ts` los consulta con degradación silenciosa, y
`WorkerPayBreakdownDialog.tsx` (que muestra el badge "Histórico Connecteam") **no está montado en
ninguna ruta del portal**. Es decir: lo histórico aparece en pantallas admin, no en "Mis pagos".
No se fusionó ningún modelo de datos.

## 8. Clasificación de bloqueos (derivada de datos reales)

| Código | 146 | 147 | 148 |
|---|---|---|---|
| PUBLISHED | 0 | 2 | 1 |
| PENDING_MOVEMENT (bloqueo duro del RPC) | 2 | 0 | 0 |
| READY_NOT_PUBLISHED (con cuenta o sin ella, sin bloqueo) | 22 | 49 | 55 |
| NO_ACCOUNT (publicable, pero no verá el recibo) | 2 | 9 | 12 |
| NO_APPROVED_TOTAL | 0 | 0 | 0 |
| NO_RECEIPT / NOT_PUBLISHED | cubierto arriba | | |
| IDENTITY_CONFLICT · TENANT_MISMATCH · PORTAL_QUERY_EXCLUDES | 0 | 0 | 0 |

`NO_ACCOUNT` **no** es bloqueo de publicación: es bloqueo de *visibilidad*. Teléfono ausente no se
clasifica nunca como conflicto de identidad.

## 9. Semántica de publicar / despublicar

- Primera publicación: inserta en `pay_statements` con unique `(pay_period_id, employee_id)`,
  congela total/base/extras/deducciones/line_count, sella `approved_at`, `published_at`,
  `published_by`, y enlaza los `movements` aprobados vía `pay_statement_id`.
- Gates: origen válido, periodo existente, empleado del mismo tenant, permiso
  (`is_global_owner` / `aprobar_nomina` / `periods.edit`), y **cero movimientos pendientes**.
- Republicar: `ON CONFLICT DO UPDATE` **recalcula** el congelado y actualiza `published_at`; si los
  datos base cambiaron, **el monto puede cambiar**. No es estrictamente idempotente.
- Despublicar: `status='revoked'` + motivo obligatorio (≥3 caracteres); el recibo desaparece de
  inmediato del portal (RPC y RLS exigen `published`). No borra la fila.
- Notificaciones: **ninguna** se dispara desde estos RPC.
- Auditoría: `activity_log` registra `pay_statement_published` (con total congelado, calculado,
  override y diferencia) y `pay_statement_revoked` (con motivo).

## 10. Preparación para publicación masiva (solo lectura)

La infraestructura ya existe y es segura: `bulk_pay_statement_preview` (STABLE, zero-write) y
`bulk_publish_pay_statements` (delega en `publish_pay_statement`, omite publicados, valida tenant).
Elegibles hoy, si se autorizara: **146 → 24**, **147 → 58**, **148 → 67** (excluye pendientes y ya
publicados). De esos elegibles, 2 / 9 / 12 respectivamente **no verían** el recibo por falta de
cuenta. No se implementó ni ejecutó nada.

## 11. Brechas de UX

La pantalla de periodo no distingue las tres verdades: *total aprobado* ≠ *recibo publicado* ≠
*el trabajador puede verlo*. Jerarquía mínima recomendada, derivable 100 % de tablas actuales:

```text
68 con nómina aprobada
67 listos para publicar
 1 publicado
 1 puede verlo en Mis pagos
12 sin cuenta (verían nada aunque se publique)
 0 errores de publicación
```

Sin silo nuevo: todo sale de `period_base_pay`, `movements`, `pay_statements` y `employees.user_id`.

## 12. Confirmación de cero escrituras

Solo `SELECT` y lectura de código. No se publicó, republicó ni despublicó ningún recibo; no se
tocaron cálculos, `time_entries`, `period_base_pay`, `movements`, totales aprobados, cuentas,
identidad, auth, RLS, pagos, documentos, turnos, tenants ni facturación. Sin correos ni notificaciones.

## 13. Siguiente implementación recomendada

1. Encabezado de periodo con la jerarquía del punto 11 (solo presentación, derivada).
2. Marcar "sin cuenta" como advertencia de visibilidad, nunca como bloqueo financiero.
3. Hacer explícito en la UI que republicar puede recalcular el congelado.
4. Resolver los 2 movimientos pendientes del periodo 146 antes de cualquier publicación.

---

## Veredicto

🟡 **PUBLICATION WORKS — WORKER VISIBILITY / STATUS GAPS FOUND**

La publicación es correcta, congelada, auditada y aislada por tenant, y los 8 recibos publicados sí
llegan al trabajador. Las brechas son de cobertura y de estado visible: 154 trabajadores aprobados
con solo 3 recibos publicados, 23 trabajadores sin cuenta que no verían su recibo, y una pantalla de
periodo que no diferencia aprobado / publicado / visible.
