# DECISION REGISTER

**Fecha:** 2026-07-22
**Estado global:** Todas las decisiones **OPEN — NOT DECIDED**.

| ID | Decisión pendiente | Estado | Evidencia | Falta | Dominio | Protocolo recomendado |
|----|--------------------|--------|-----------|-------|---------|-----------------------|
| DEC-001 | Tabla canónica: `shifts` vs `scheduled_shifts` | OPEN — NOT DECIDED | Coexistencia en migraciones y código | Uso operativo real y volumetría | Scheduling | MRI Shift Truth |
| DEC-002 | Fuente oficial de attendance: `time_entries` nativa vs reconciliation externa | OPEN — NOT DECIDED | MRI-001, guardrail actual | Política del dueño y plan de convergencia | Attendance / Payroll | MRI Reconciliation Deep Dive |
| DEC-003 | `service_requests`: obligatoria u opcional por política | OPEN — NOT DECIDED | Estructuralmente opcional (VS-001) | Postura de producto | Service Requests | Policy MRI |
| DEC-004 | `shift_closeout_reports`: bloqueante o informativo | OPEN — NOT DECIDED | RPC no consulta closeout | Postura operativa | Operations Intelligence | Operational Closure MRI |
| DEC-005 | Output oficial de payroll (nativo, importado, híbrido) | OPEN — NOT DECIDED | Nativo + `import_id` protegido | Definición formal del dueño | Payroll | Payroll Output MRI |
| DEC-006 | Definición canónica de "operación cerrada" | OPEN — NOT DECIDED | Sin flag único (5+ señales) | Definición cross-dominio | Operations Intelligence | Operational Closure MRI |
| DEC-007 | Writer canónico por etapa | OPEN — NOT DECIDED | Writers dispersos frontend/backend | Mapa completo de writers | Cross-cutting | Write Boundary MRI |
| DEC-008 | Rol futuro de Connecteam | OPEN — NOT DECIDED | Guardrail lo mantiene como fuente final | Roadmap de convergencia | Integrations | Reconciliation Deep Dive |
| DEC-009 | Alcance del pago financiero real (payout) | OPEN — NOT DECIDED | No observado en el sistema | Decisión de producto/finanzas | Payroll | Payout Scope MRI |
| DEC-010 | Fuente canónica del Passport | OPEN — NOT DECIDED | Ambigüedad Directory/Reviews | Ownership y modelo | Reputation & Passport | Passport MRI |
| DEC-011 | Frontera de datos Stafly ↔ Parceros | OPEN — NOT DECIDED | Rutas y tablas compartidas | Contrato de datos | Marketplace | Boundary MRI |
| DEC-012 | Regla oficial de timezone / overnight | OPEN — NOT DECIDED | Divergencia UI (03:00) vs RPC (`clock_in::date`) | Regla única aprobada | Attendance | Time Accuracy MRI |

Ninguna decisión de esta lista puede considerarse resuelta hasta la
publicación de un [ADR](./adr/README.md) aprobado.
