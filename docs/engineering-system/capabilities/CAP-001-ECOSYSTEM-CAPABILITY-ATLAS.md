# CAP-001 — Ecosystem Capability Atlas

**Versión:** 1.0
**Fecha:** 2026-07-22
**Estado:** ✅ Aprobado.

Consolidación de las capacidades observadas del ecosistema Stafly +
Parceros. Ninguna capacidad implica implementación autorizada.

---

## 1. Dominios de negocio

| ID | Dominio | Tipo | Evidencia | Confianza | Decisiones pendientes |
|----|---------|------|-----------|-----------|-----------------------|
| D01 | Identity & Access | Core | `auth`, `company_users`, roles | Alta | Frontera de sesiones Parceros |
| D02 | Tenancy | Core | `companies`, RLS por `company_id` | Alta | — |
| D03 | Workforce Directory | Core | `employees`, `worker_profile` | Alta | Fuente canónica del Passport |
| D04 | Service Requests | Supporting | `service_requests`, `client_requests` | Media | Obligatoriedad como origen |
| D05 | Scheduling | Core | `shifts`, `scheduled_shifts` | Media | Tabla canónica (DEC-001) |
| D06 | Dispatch & Matching | Core | `shift_assignments`, `src/core/dispatch-engine.ts` | Alta | — |
| D07 | Attendance | Core | `time_entries`, `clock_events`, resolver | Alta | Divergencia UI vs RPC |
| D08 | Payroll & Compensation | Core | `pay_periods`, `period_base_pay`, `movements`, `consolidate_period_base_pay` | Alta | Output oficial (DEC-005) |
| D09 | Invoicing | Core | `invoices`, `billable_service_blocks` | Media | Pipeline paralelo a payroll |
| D10 | SaaS Billing | Supporting | `billing-*` edge functions, Stripe | Alta | — |
| D11 | Reputation & Passport | Supporting | `reviews`, `review_scores` | Media | Fuente canónica |
| D12 | Marketplace (Parceros) | Core (Parceros) | rutas `/parceros/*` | Media | Frontera de datos |
| D13 | Communications | Supporting | `announcements`, chat, notificaciones | Alta | — |
| D14 | Documents & Compliance | Supporting | W-9, 1099, `documents` | Media | — |
| D15 | Operations Intelligence | Supporting | live map, `clock_alerts`, closeouts | Alta | Cierre operacional |
| D16 | Integrations | Generic | Connecteam, external-api, Stripe | Media | Rol futuro de Connecteam |

## 2. Capacidades transversales

| ID | Capacidad | Evidencia |
|----|-----------|-----------|
| X01 | AI Assistance | `ai-workforce`, `employee-chat`, Lovable AI Gateway |
| X02 | Auditability | `activity_log`, triggers, `useAuditLog` |
| X03 | Notifications | `notifications`, templates, multichannel |
| X04 | Reporting | Reports admin, exports Excel/PDF, dry-runs |

## 3. Experiencias / Superficies

> Una superficie **no es** un dominio. Es un canal de entrega.

- Stafly Admin
- Worker Portal (PWA)
- Parceros
- Client Portal
- Public / Passport
- Kiosk
- Front Desk
- Founder Finance

## 4. Cadena de valor observada

```
Demand → Scheduling → Dispatch → Attendance → Payroll   (worker path)
                                     │
                                     └─→ Billable Blocks → Invoicing  (client path)
```

Los dos caminos son **paralelos**. No hay puente autoritativo confirmado
entre `period_base_pay` y `billable_service_blocks`.

## 5. Solapamientos y ambigüedades ⚠️

- `shifts` ↔ `scheduled_shifts` (ver DEC-001).
- Attendance nativa (`time_entries`) ↔ Reconciliation (Connecteam) (ver DEC-002).
- "Billing" ambiguo: SaaS billing (Stripe) vs client invoicing.
- Múltiples "Command Centers" con superposición de propósito.

## 6. Entidades críticas

- `companies`, `employees`, `shifts`/`scheduled_shifts`, `shift_assignments`,
  `time_entries`, `clock_events`, `pay_periods`, `period_base_pay`,
  `movements`, `invoices`, `billable_service_blocks`, `service_requests`.

## 7. Priorización de MRI (P0 candidatos)

1. Scheduling (Shift Truth) — DEC-001.
2. Attendance (Time Accuracy) — DEC-004, divergencia overnight.
3. Payroll (Output oficial) — DEC-005.
4. Identity & Tenancy — límites de sesión.

Ver [STATUS](../STATUS.md) para candidatos de próximos MRI.

---

## Observaciones para futuras inspecciones

- Volumetría por dominio (cuál se usa realmente en producción).
- Adopción real de Marketplace vs Directory tradicional.
- Cobertura de auditoría (`activity_log`) por dominio.
