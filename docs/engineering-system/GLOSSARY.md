# GLOSSARY — Vocabulario provisional del ecosistema

**Fecha:** 2026-07-22
**Estado:** Provisional. Términos sujetos a validación por MRI futuros.

---

## Tabla de términos

| Término | Definición provisional | Entidad / Tabla | Ambigüedad | Estado |
|---------|-----------------------|-----------------|------------|--------|
| Company / Tenant | Unidad de aislamiento multi-tenant | `companies` | Ninguna observada | ✅ Fact |
| Employee | Persona vinculada a una company | `employees` | Puede o no tener `user_id` | ✅ Fact |
| Worker | Rol operativo genérico; incluye Employee y Candidate | Varias | Solapamiento con Employee y Parceros | 🟡 Hypothesis |
| Candidate | Trabajador aplicable pero no asignado | `?` | Fuente canónica no confirmada | 🔴 Insufficient |
| Service Request | Solicitud de servicio de un cliente | `service_requests` | Opcional como origen de turnos | ✅ Fact |
| Shift | Turno productivo | `shifts` | Coexiste con `scheduled_shifts` | ⚠️ Ambiguo |
| Scheduled Shift | Turno planificado | `scheduled_shifts` | Rol real respecto a `shifts` no confirmado | 🟡 Hypothesis |
| Assignment | Vínculo worker↔turno | `shift_assignments` | — | ✅ Fact |
| Clock Event | Evento GPS de fichaje | `clock_events` | **No** alimenta consolidación nativa | ✅ Fact |
| Time Entry | Registro autoritativo de horas | `time_entries` | Input canónico del RPC nativo | ✅ Fact |
| Closeout | Reporte de cierre de turno | `shift_closeout_reports` | **No** bloquea consolidación | ✅ Fact |
| Pay Period | Ventana de nómina | `pay_periods` | — | ✅ Fact |
| Period Base Pay | Base pay consolidado por periodo | `period_base_pay` | Filas con `import_id` protegidas | ✅ Fact |
| Movement | Novedad de nómina (bono/deducción) | `movements` | — | ✅ Fact |
| Reconciliation | Proceso paralelo externo (Connecteam) | — | Guardrail declara como fuente final | 🟡 Hypothesis |
| Invoice | Factura al cliente | `invoices` | Estados draft→paid | ✅ Fact |
| Billable Service Block | Bloque facturable | `billable_service_blocks` | Sin conexión autoritativa a `period_base_pay` | ✅ Fact |
| Reputation | Puntuación del worker | `reviews`, `review_scores` | — | ✅ Fact |
| Passport | Perfil público del worker | — | Fuente canónica sin confirmar | 🔴 Insufficient |
| **Payroll Prepared** | Base pay consolidado y movimientos aplicados | `period_base_pay` | **≠ trabajador pagado** | 🧭 Distinción obligatoria |
| **Worker Paid** | Ejecución financiera al trabajador | — | **No observada** en el sistema | 🔴 Insufficient |
| **Invoice Paid** | Factura marcada como pagada | `invoices.status` | **≠ pago externo conciliado** salvo evidencia | 🧭 Distinción obligatoria |

---

## Reglas semánticas destacadas

- **Payroll prepared ≠ worker paid.**
- **Invoice marked paid ≠ externally reconciled payment**, salvo evidencia adicional (webhook Stripe, extracto ACH).
- Cualquier término marcado 🟡 o 🔴 **no puede** utilizarse como base de decisión sin MRI de soporte.
