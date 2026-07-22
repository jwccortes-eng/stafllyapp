# RISK REGISTER

**Fecha:** 2026-07-22
**Alcance:** Riesgos **de comprensión**, no vulnerabilidades de seguridad.

| ID | Riesgo | Evidencia | Impacto | Probabilidad aparente | Estado | MRI recomendado |
|----|--------|-----------|---------|----------------------|--------|-----------------|
| RSK-001 | Dual payroll truth (nativo vs Connecteam) | MRI-001, guardrail | Alto | Alta | OPEN — REQUIRES VALIDATION | Reconciliation Deep Dive |
| RSK-002 | Divergencia UI resolver vs RPC (cutoff overnight) | MRI-001 | Alto | Media | OPEN — REQUIRES VALIDATION | Time Accuracy |
| RSK-003 | Ambiguous shift source (`shifts` vs `scheduled_shifts`) | CAP-001, DEC-001 | Alto | Alta | OPEN — REQUIRES VALIDATION | Shift Truth |
| RSK-004 | Optional request linkage (turnos sin Service Request) | VS-001 | Medio | Alta | OPEN — REQUIRES VALIDATION | Policy MRI |
| RSK-005 | Orphan `time_entries` (sin assignment/shift) | Inferido | Medio | Media | OPEN — REQUIRES VALIDATION | Attendance Integrity |
| RSK-006 | Frontend direct writers a tablas de dominio | Inferido | Alto | Media | OPEN — REQUIRES VALIDATION | Write Boundary |
| RSK-007 | Manual invoices sin `billable_service_blocks` | VS-001 | Medio | Media | OPEN — REQUIRES VALIDATION | Invoicing MRI |
| RSK-008 | Unclear operational closure (sin flag único) | DEC-006 | Medio | Alta | OPEN — REQUIRES VALIDATION | Operational Closure |
| RSK-009 | Legacy Connecteam parallel path | Guardrail | Alto | Alta | OPEN — REQUIRES VALIDATION | Reconciliation |
| RSK-010 | Timezone handling no confirmado | MRI-001 | Alto | Media | OPEN — REQUIRES VALIDATION | Time Accuracy |
| RSK-011 | Duplicate `time_entries` | Inferido | Medio | Media | OPEN — REQUIRES VALIDATION | Attendance Integrity |
| RSK-012 | Documentation drift (docs ↔ código) | Repositorio existente | Medio | Alta | OPEN — REQUIRES VALIDATION | Docs Audit |
| RSK-013 | Ambiguous vocabulary ("billing", "shift", "worker") | CAP-001, GLOSSARY | Medio | Alta | OPEN — REQUIRES VALIDATION | Glossary MRI |

Cada riesgo es de **comprensión**. Ninguno afirma la existencia de un
fallo funcional o de seguridad.
