# P0 — PUBLISH READINESS SSOT · PHASE 2 (Company Policy Enforcement End-to-End)

Fecha: 2026-08-18 · Alcance: publicación de servicios (admin) · Escrituras de datos: NINGUNA

Fuentes: `P0_PUBLISH_READINESS_PHASE1_REMEDIATION.md`, `P0_PUBLISH_READINESS_REALITY_FAILURE_QK001608.md`,
`P0_PUBLISH_READINESS_SSOT_AUDIT.md`.

## 1. ¿Cuál es ahora el SSOT?

`public.service_publish_readiness(_shift_id uuid)` — función de **solo lectura**, `STABLE`,
`SECURITY DEFINER`, company-scoped por `shift.company_id`. Devuelve:

```json
{ "ok", "terminal", "blockers": [], "warnings": [],
  "mode": "claim|direct",
  "coverage": { "required", "assigned", "open" },
  "company_requirements": { "require_client", "require_location", "require_shift_admin", "max_shift_hours" } }
```

El frontend tiene un **espejo puro** en `src/lib/shifts/publish-readiness.ts`
(`evaluatePublishReadiness` + adapter de fila `resolveDraftPublishReadiness`).
`getServicePublishReadiness` (editor) ya no tiene reglas propias: delega en el espejo y
sólo traduce códigos a copy/CTA/anclas.

Superficies que consumen el mismo resultado: chip "Borradores listos", tarjetas/detalle,
botón Publicar individual, PrePublishDialog, bulk "Publicar listos" y el RPC.

## 2. Requisitos company-scoped aplicados

Leídos de `company_settings.key='shifts_config'` de la empresa del servicio:
`require_client`, `require_location`, `require_shift_admin`, `max_shift_hours`.
No se inventaron requisitos nuevos. Adicionalmente se conservan las reglas que ya existían
en producto: transporte activado exige conductor; duración inválida bloquea.

**Location válida** (auditada, sin endurecer): venue legacy `location_id`, Job Site v2
`job_site_location_id` o **dirección de texto libre** `job_site_address`. El geofence NO es
requisito. El punto de encuentro NUNCA satisface el lugar del servicio (queda como warning
`job_site_unsaved` cuando la dirección es texto libre).

## 3. ¿Frontend y backend coinciden 100%?

Sí en reglas y códigos (`cancelled`, `date`, `start_time`, `end_time`, `duration`, `capacity`,
`assignments`, `job_site`, `client`, `shift_admin`, `driver`) y warnings
(`job_site_unsaved`, `meeting_missing`, `team_pending`). Única diferencia declarada: el editor
añade `title` como validación de formulario (el borrador aún no es fila); no afecta al chip,
al bulk ni al RPC. El backend es autoridad final y revalida siempre.

## 4. QK-001608 → **BLOCKED** (`job_site`, Quality `require_location=true`, sin location).
## 5. QK-001607 → **BLOCKED** (mismo motivo).
## 6. Claimable con ubicación válida y 0 asignaciones → **READY** y publica (0/Y permitido; se muestra warning `team_pending`). Verificado con QK-001584 / QK-001585.
## 7. MyStaff sin cliente (`require_client=true`) → **BLOCKED** (`client`). 6/6 drafts.
## 8. ¿Bulk puede evadir la política? No. `selectPublishableDrafts` filtra por el mismo SSOT y el RPC revalida dentro de la transacción.
## 9. ¿RPC revalida siempre? Sí: `publish_shift_draft` eliminó sus validaciones propias; permiso → `service_publish_readiness` → si `!ok` devuelve blockers → publicación atómica → notificaciones sólo tras éxito.
## 10. ¿Cancelled sigue terminal? Sí: `status='cancelled'`, `publication_status IN ('cancelled','archived')` o `deleted_at` → `terminal=true`, nunca READY.
## 11. ¿Errores identifican segmento real? Sí, se mantiene Phase 1: `shift_ref` del segmento + QK del servicio raíz (`publishFailureLabel`).
## 12. ¿Hubo modificaciones de datos? No. Cero escrituras a servicios, clientes, ubicaciones, asignaciones o configuración. Sin backfill. Ningún servicio problemático fue publicado.
## 13. ¿Payroll/time_entries intactos? Sí. No se tocó lógica financiera; payroll sigue calculando con horas reales de time entries.
## 14. Tenant isolation: la readiness resuelve `shift.company_id` → configuración de ESA empresa. Nunca usa la empresa activa del cliente ni fallback legacy. Empresas sin `shifts_config` caen en el fallback conservador (`require_*=false`, `max_shift_hours=16`), idéntico en ambos lados.

## 15. Censo PRE-FIX / POST-FIX (drafts no terminales, sin locked)

| Empresa | Drafts | READY Phase 1 | READY Phase 2 | Bloqueados por ubicación | Bloqueados por cliente |
|---|---|---|---|---|---|
| Quality Staff by Keury | 75 | 21 | **10** | 29 | 0 |
| My Staff Solution LLC | 6 | 6 | **0** | 4 | 6 |
| Stafly Demo | 3 | 0 | **0** | 0 | 0 |
| JKitchen Staff | 1 | 1 | **1** | 0 | 0 |

Coincide exactamente con el censo del diálogo reportado en la auditoría (Quality 10/21,
MyStaff 0/6, JKitchen 1/1). El SSOT explica las diferencias por código de bloqueo.
**READY reales tras Phase 2: 11.**

## 16. Warnings / deuda restante

- Warnings no bloqueantes: `job_site_unsaved` (dirección libre sin mapa/geofence),
  `meeting_missing`, `team_pending`.
- 29 drafts de Quality y 4 de MyStaff necesitan lugar del servicio real; 6 de MyStaff necesitan
  cliente. **No se completan automáticamente**: requieren decisión humana.
- El editor conserva `title` como validación de formulario (fuera del SSOT backend).
- El chip aún no expone el desglose READY/WARNING/BLOCKED por servicio en la vista de lista;
  el motivo sí aparece en el detalle, el toast y el PrePublishDialog.

## QA ejecutado

`src/test/publish-readiness-phase2.test.ts` (10 casos): location libre READY, venue guardado
READY, QK-1607/1608 BLOCKED, MyStaff sin cliente BLOCKED, JKitchen sin requisitos READY,
direct staffing sin equipo BLOCKED, cancelled nunca READY, shift admin/duración, transporte sin
conductor, y selección de bulk. Phase 1 (8 casos) sin regresión. 18/18 en verde.

## VEREDICTO: 🟢 GO

"Publicar listos" queda habilitado: chip, diálogo y RPC comparten una sola definición y el
backend rechaza cualquier intento que evada la política de compañía.
