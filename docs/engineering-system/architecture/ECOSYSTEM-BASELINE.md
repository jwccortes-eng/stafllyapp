# ECOSYSTEM BASELINE

**Fecha:** 2026-07-22
**Estado:** ✅ Aprobado (consolida EIP-001A y EIP-001B).
**Alcance:** Comprensión estructural. No autoriza implementación.

---

## 1. Resumen del ecosistema

Stafly + Parceros es un ecosistema SaaS **multi-tenant** enfocado en
workforce operations para empresas de staffing, limpieza, seguridad y
servicios. Su superficie principal es un panel administrativo, un portal de
trabajador (PWA), un portal de cliente, kiosko, front desk y el producto
marketplace Parceros. El sistema muestra **alta madurez** (~400 migraciones
Supabase, cientos de páginas y componentes).

## 2. Stack observado ✅

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind + shadcn/ui |
| Data client | TanStack Query + React Router 6 |
| Backend | Supabase (Postgres 15) |
| Auth | Supabase Auth (JWT) |
| Serverless | Edge Functions (Deno) |
| Mobile | Capacitor 8 |
| PWA | vite-plugin-pwa |
| Pagos SaaS | Stripe |
| AI | Lovable AI Gateway |

## 3. Superficies (Experiences) ✅

- **Stafly Admin** — Command center operativo.
- **Worker Portal (PWA)** — Fichaje, turnos, pagos, chat.
- **Parceros** — Marketplace / comunidad.
- **Client Portal** — Solicitudes y visibilidad.
- **Public / Passport** — Perfiles públicos.
- **Kiosk** — Fichaje compartido.
- **Front Desk** — Recepción operativa.
- **Founder Finance** — Vista de finanzas internas.

> Una superficie **no es** un dominio.

## 4. Dominios observados (resumen)

Ver detalle en [Capability Atlas](../capabilities/CAP-001-ECOSYSTEM-CAPABILITY-ATLAS.md).

Dominios de negocio: Identity & Access, Tenancy, Workforce Directory,
Service Requests, Scheduling, Dispatch & Matching, Attendance, Payroll &
Compensation, Invoicing, SaaS Billing, Reputation & Passport, Marketplace,
Communications, Documents & Compliance, Operations Intelligence,
Integrations.

Capacidades transversales: AI Assistance, Auditability, Notifications,
Reporting.

## 5. Arquitectura general (diagrama)

```
┌───────────────────────────────────────────────────────────┐
│                    SUPERFICIES / CLIENTES                  │
│  Admin · Worker PWA · Parceros · Client · Kiosk · Passport │
└──────────────────────────┬────────────────────────────────┘
                           │ HTTPS + JWT
┌──────────────────────────▼────────────────────────────────┐
│                    LOVABLE CLOUD (Supabase)                │
│   Auth · Edge Functions · Storage · Realtime · Postgres    │
│                    Row Level Security                      │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│              INTEGRACIONES / EXTERNOS                     │
│  Stripe · SMTP · Connecteam · Lovable AI · OpenStreetMap  │
└───────────────────────────────────────────────────────────┘
```

## 6. Puntos fuertes observados ✅

- Aislamiento multi-tenant consistente con RLS.
- Separación clara de superficies por rol.
- Motor de recomendación y despacho ya existente.
- Auditoría vía `activity_log`.
- Consolidación de payroll basada en RPC declarativo con anti-fraude.

## 7. Incertidumbres pendientes 🟡 / 🔴

- Ambigüedad `shifts` vs `scheduled_shifts`.
- Doble truth set en attendance (nativo vs reconciliation).
- Cierre operacional sin flag canónico único.
- Frontera de datos Stafly ↔ Parceros no formalizada.
- Fuente canónica del Passport.

## 8. Enlaces

- [Capability Atlas](../capabilities/CAP-001-ECOSYSTEM-CAPABILITY-ATLAS.md)
- [VS-001 Request-to-Pay](../value-streams/VS-001-REQUEST-TO-PAY.md)
- [MRI-001 Attendance-to-Payroll Truth](../mri/MRI-001-ATTENDANCE-TO-PAYROLL-TRUTH.md)
- [Decision Register](../decisions/DECISION-REGISTER.md)
- [Risk Register](../risks/RISK-REGISTER.md)

---

## Observaciones para futuras inspecciones

- Alcance de RLS por tabla (Security MRI).
- Volumetría real de rutas de creación de turnos (Data MRI).
- Uso operativo de kiosk y front desk (Adoption MRI).
