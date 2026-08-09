# P0 — Smart Intake: crear borradores con entidades pendientes

Fecha: 2026-08-09 · Alcance: modelo de readiness de intake + UI de revisión.
Sin cambios en payroll, `time_entries`, `shift_assignments`, CSV de Connecteam,
ELDM, diccionario de tenant, entity matching, auth, RLS ni tenants.

## 1. Causa raíz

`canCreateDraft` mezclaba los tres niveles de readiness: exigía cliente/venue
confirmados, hora de fin y personal para permitir el borrador. Con el input real
de Imperial (9 fechas, venue sin vincular, hora aproximada, meseros pendientes)
los 9 servicios quedaban bloqueados y el CTA mostraba "Crear 0 borradores".

## 2. Tres niveles separados

`getCandidateReadiness` (`src/lib/intake/candidate.ts`) devuelve:

| Nivel | Campo | Requisitos |
|---|---|---|
| A. READY_TO_CREATE_DRAFT | `readyToCreateDraft` / `draftBlockers` | `company_id` autenticado, `service_date`, referencia identificable, no duplicado exacto, no creado ya |
| B. READY_TO_PUBLISH | `publishGaps` | + hora inicio/fin, personal, cliente y venue vinculados |
| C. READY_TO_EXPORT_CONNECTEAM | `exportGaps` | + Job/Sub item resuelto y horario real |

`canCreateDraft` solo evalúa el nivel A. Publicación y exportación conservan sus
reglas intactas (`getServiceOperationalReadiness`, `validateShiftForExport`).

## 3. No se pierde lo detectado

`buildDraftPayload` (`src/lib/intake/create-draft-service.ts`):

- `publication_status='draft'`, `status='open'`, sin asignaciones ni notificaciones.
- Título con la entidad detectada ("Imperial — …").
- `job_site_address` preserva el venue crudo cuando no hay `location_id`.
- `client_id` / `location_id` quedan en `null`: no se inventa vínculo.
- `slots` en `null` cuando el personal está pendiente (pendiente ≠ 0).
- Bloque de pendientes legible en `notes` (`buildPendingBlock`): "Imperial —
  pendiente de vincular", "Hora de fin pendiente", "Cantidad de personal pendiente".
- `import_batch_id` y `reconciliation_hash` preservados → idempotencia por batch.

## 4. UI

- CTA: "Crear 9 borradores" con subtexto "9 borradores se crearán. Todos
  necesitan completar información antes de exportar."
- Tarjetas: badge "Imperial — pendiente de vincular" y "Aprox. 17:00" / "Pendiente".
- Panel de éxito: "9 borradores creados" + desglose de pendientes (venue, hora
  final, personal) y CTA "Revisar borradores".
- La resolución asistida (`EntityResolutionSheet`) sigue disponible después de
  crear el borrador: vincular no recrea el servicio.

## 5. Idempotencia

Reintentar el mismo batch reutiliza la fila existente por
(`company_id`, `reconciliation_hash`) y devuelve `reused` — nunca 9 drafts extra.

## 6. QA

Input exacto del video → 9 servicios detectados, 9 `READY_TO_CREATE_DRAFT`,
0 publicables, 0 exportables. Al completar Imperial Aug 30 (venue, hora final,
Job) ese servicio pasa a `exportGaps: []` sin afectar a los otros ocho.

Regresión en `src/test/smart-intake-multi-date.test.ts` (bloque
"READY_TO_CREATE_DRAFT con entidades pendientes") más la actualización de
`smart-service-intake-phase1..4`. Suite: 757 tests verdes; los 7 fallos restantes
son la deuda previa documentada en `docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`.
Typecheck limpio.

---

**Stafly permite crear borradores de Servicios a partir de información real aunque
existan entidades o campos pendientes, preservando esos pendientes para
completarlos después y manteniendo separadas las reglas de creación, publicación y
exportación a Connecteam.**
