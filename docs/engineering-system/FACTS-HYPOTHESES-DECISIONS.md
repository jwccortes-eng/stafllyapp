# FACTS · HYPOTHESES · DECISIONS

**Fecha:** 2026-07-22
**Fuente:** EIP-001A/B, CAP-001, VS-001, MRI-001.

---

## ✅ Hechos confirmados

1. Stack observado: React 18 + TypeScript + Vite + Tailwind + shadcn/ui; backend Supabase (Postgres + Edge Functions + Auth + Storage); Capacitor para mobile.
2. Arquitectura multi-tenant con aislamiento por `company_id` y RLS habilitado en tablas de negocio.
3. Coexisten `shifts`, `scheduled_shifts` y `shift_assignments`.
4. Existen **múltiples puntos de entrada de demanda** (admin manual, imports, service requests, deep-links, integraciones).
5. `service_requests` **no es estructuralmente obligatoria** para generar turnos.
6. `clock_events` **no** alimenta directamente `consolidate_period_base_pay`; actúa como evidencia auxiliar.
7. `time_entries` **es leída** por el RPC nativo `consolidate_period_base_pay`.
8. `shift_closeout_reports` **no bloquea** la consolidación de payroll.
9. `period_base_pay.import_id` protege filas importadas frente a sobrescritura por el RPC nativo.
10. Worker Pay e Invoicing son **pipelines paralelos** sin conexión autoritativa directa entre `period_base_pay` y `billable_service_blocks`.
11. **No se observó** ejecución bancaria del pago al trabajador (sin ACH/Stripe Payout confirmado).
12. Reconciliation / Connecteam continúa **declarada como fuente final** en el guardrail actual del sistema.
13. RPCs de corrección de tiempo aplican separación de roles (requester/reviewer).

---

## 🟡 Hipótesis vigentes

1. **Rol exacto de `scheduled_shifts`** frente a `shifts`. No confirmado si es planificación previa, snapshot, o duplicado.
2. **Reconciliation como fuente actual** con payroll nativo como target futuro.
3. **Divergencia overnight** entre UI resolver (cutoff 03:00) y RPC SQL (`clock_in::date`).
4. **Rol real de `payroll_adjustments`** dentro de la cadena de consolidación.
5. **Frontera de datos Stafly ↔ Parceros**: qué entidades cruzan, cuáles no.
6. **Fuente canónica del Passport** (Reputation vs Directory vs Reviews).

---

## 🧭 Decisiones pendientes

Ver [Decision Register](./decisions/DECISION-REGISTER.md).

Ninguna decisión listada está resuelta. Todas están en estado
**OPEN — NOT DECIDED**.
