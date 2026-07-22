# VS-001 — Request-to-Pay Value Stream

**Fecha:** 2026-07-22
**Estado:** ✅ Aprobado con observaciones.

> **No existe una tubería única.** El flujo Request-to-Pay del ecosistema
> es en realidad un conjunto de rutas paralelas.

---

## 1. Actores

- Cliente (solicitante).
- Admin / Manager (operación).
- Worker (ejecución).
- Sistema (RPCs, edge functions, integraciones).

## 2. Puntos de entrada de demanda (múltiples ✅)

- Admin manual (creación directa de turnos).
- Importación masiva (CSV / Connecteam).
- Service Request desde Client Portal.
- Deep-links y API externa.
- Recurrencias / templates.

> **Service Request es opcional.** No todo turno proviene de una solicitud
> estructurada.

## 3. Etapas observadas

1. **Demand** — captura (Service Request u otras).
2. **Scheduling** — `shifts` / `scheduled_shifts` (ver DEC-001).
3. **Dispatch** — `shift_assignments`, motor de matching.
4. **Execution** — `clock_events` + `time_entries` (attendance).
5. **Closeout** — `shift_closeout_reports` (informativo, no bloqueante).
6. **Payroll (worker path)** — `consolidate_period_base_pay` → `period_base_pay` + `movements`.
7. **Invoicing (client path, paralelo)** — `billable_service_blocks` → `invoices`.

## 4. Entidades puente

| Entre | Puente | Estado |
|-------|--------|--------|
| Attendance ↔ Payroll | `time_entries` | ✅ Confirmado |
| Attendance ↔ Invoicing | `billable_service_blocks` | 🟡 Ruta paralela |
| Payroll ↔ Invoicing | — | 🔴 **Sin puente autoritativo** |

## 5. Writers observados (parcial)

- RPC `consolidate_period_base_pay` (payroll).
- Frontend writers vía hooks (attendance, movements, invoices).
- Edge functions de billing (Stripe) y payroll email.
- Integraciones externas (Connecteam).

> La frontera exacta de writers requiere MRI (Write Boundary).

## 6. Puntos de control

- Aprobación de `time_entries`.
- Cierre de `pay_periods`.
- Publicación de payroll.
- Marca "paid" en `invoices`.

## 7. Rutas paralelas y excepciones

- Reconciliation externa (Connecteam) puede sobrescribir la ruta nativa.
- Facturas manuales sin `billable_service_blocks` asociados.
- Ajustes vía `payroll_adjustments` con rol no confirmado.

## 8. Reglas críticas (semántica) 🧭

- **Payroll consolidado ≠ pago financiero al trabajador.** No se observó ACH/payout.
- **Invoice "paid" ≠ cobro externo conciliado**, salvo evidencia adicional.
- **No existe criterio canónico único de "operación cerrada"** (ver DEC-006).

## 9. Riesgos observados ⚠️

Ver [Risk Register](../risks/RISK-REGISTER.md).

## 10. Decisiones pendientes 🧭

Ver [Decision Register](../decisions/DECISION-REGISTER.md).

## 11. Diagramas

### Flujo principal

```
Demand ──► Scheduling ──► Dispatch ──► Attendance ──► Closeout
                                             │
                          ┌──────────────────┴──────────────────┐
                          ▼                                     ▼
                   Payroll (worker)                Invoicing (client)
                          │                                     │
                          ▼                                     ▼
                  period_base_pay                          invoices
                          │                                     │
                          ▼                                     ▼
                  [worker paid?] 🔴                   [externally reconciled?] 🔴
```

### Rutas paralelas de demanda

```
Admin manual ─┐
Imports ──────┤
Service Req. ─┼─► shifts / scheduled_shifts ─► shift_assignments
Deep-links ───┤
Recurrencias ─┘
```

## 12. Confianza global

Media. Rutas principales confirmadas; volumetría y adopción por ruta **no
observadas**.

---

## Observaciones para futuras inspecciones

- Medir % de turnos originados por Service Request.
- Confirmar existencia (o ausencia) de puente `period_base_pay` ↔ `billable_service_blocks`.
- Confirmar semántica del estado `paid` en `invoices`.
