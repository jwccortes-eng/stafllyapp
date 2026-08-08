# Smart Service Intake — Fase 1: carril canónico consolidado

Fecha: 2026-08-08
Fuente: `docs/qa/SMART_SERVICE_INTAKE_EXISTING_CAPABILITIES_AUDIT.md`
Alcance: infraestructura reutilizable. **Sin audio, sin WhatsApp, sin nuevas tablas, sin borrado de legacy.**

---

## 1. Pipeline canónico

```text
import_batches (batch_type: 'schedule' | 'service_intake', source: <canal>)
   └─> raw_schedule_import_rows        (input crudo íntegro, row_hash)
        └─> normalized_schedule_rows   (post-matching, opcional por canal)
             └─> BANDEJA DE REVISIÓN   (humano decide)
                  └─> scheduled_shifts (publication_status = 'draft')
```

- `batch_type = 'service_intake'` para intake no tabular; `'schedule'` sigue siendo el del import Connecteam.
- `source` ∈ `excel | csv | pasted_text | whatsapp_text | image | screenshot | pdf | email | voice_note`.
- **No se creó ninguna tabla.** Verificado en base: `import_batches` no tiene CHECK sobre `batch_type` ni `source`, así que los nuevos valores entran sin migración.
- **No existe `service_intake_jobs`** ni ningún modelo paralelo de jobs.

## 2. Helper canónico de creación

`src/lib/intake/create-draft-service.ts`

| Garantía | Implementación |
|---|---|
| Sólo `scheduled_shifts` | única tabla tocada; test verifica que no aparecen `shifts`, `shift_assignments`, `time_entries` |
| No publica | `publication_status='draft'`, `status='open'`, `claimable=false`, `published_at/by = null` |
| Tenant seguro | `company_id` del contexto autenticado; `tenant_mismatch` bloquea si el candidato es de otra compañía |
| Source tracking | preserva `import_batch_id` y escribe `reconciliation_hash = company|batch|row` |
| Idempotente | pre-check por `(company_id, reconciliation_hash)` + re-check tras error de inserción (carrera) → `reused` |
| Verificación real | relee la fila y exige `publication_status='draft'` y `company_id` correcto, si no → `persistence_check_failed` |
| Individual y lote | `createDraftServiceFromCandidate` / `createDraftServicesFromCandidates` (un bloqueo no aborta el lote) |
| Cero efectos laterales | no asigna personas, no notifica, no toca payroll |

## 3. Modelo canónico de candidato

`src/lib/intake/candidate.ts` — `ServiceCandidate` con: `sourceBatchId`, `sourceRowId`/`sourceReference`, `companyId`, `serviceDate`, `startTime`, `endTime`, `clientCandidate`, `venueCandidate`, `locationCandidate`, `serviceType`, `requestedWorkers`, `roleCandidates`, `notes`, `confidenceByField`, `missingFields`, `duplicateStatus`, `reviewStatus`.

Las inferencias viajan como `CandidateRef` (`raw`, `suggestedId`, `suggestedLabel`, `confidence`, `requiresConfirmation`) y **sólo pasan a `resolvedId` tras confirmación humana**. `canCreateDraft()` es la regla única compartida por la UI y el helper.

## 4. Bandeja de revisión compartida

`src/components/intake/ServiceIntakeReviewInbox.tsx` — una sola bandeja para todos los canales.

- Mobile: cards, edición inline, aceptar/excluir, CTA único inferior.
- Desktop: filtros (por revisar / falta info / duplicados / aceptados / creados), búsqueda, selección múltiple, acciones masivas, corrección rápida.
- No escribe en base: emite intenciones (`onPatch`, `onAccept`, `onExclude`, `onConfirmMatch`, `onCreateDrafts`).
- Reutilización desde Excel/CSV: `src/lib/intake/schedule-adapter.ts` convierte `RawShiftRow` (el tipo que ya usa `ImportSchedule`) en candidatos canónicos. Es **opt-in**: `ImportSchedule.tsx` no fue modificado, su flujo actual sigue intacto.

## 5. Resolución cliente / venue

`src/lib/intake/entity-resolution.ts` — puro, sobre catálogos ya cargados (clients, billing_clients, locations_v2).

- `normalizeEntityName` reutiliza `normalizeName` de `employee-matcher` y descarta ruido comercial (`the`, `hall`, `banquet`, `llc`…).
- Similitud por Levenshtein + contención: `Millenium` → `The Millennium Hall`, `Zemer` → `Zemer Banquet`.
- Match exacto y único → `resolvedId`. Cualquier otro caso → "Posible coincidencia" con `requiresConfirmation = true`.
- **Nunca crea cliente ni venue.** Un venue ambiguo mantiene el candidato en `needs_input` y bloquea la creación.

## 6. Duplicados

`src/lib/intake/duplicate.ts` — criterios: `company_id` (aislamiento estricto), `service_date`, cliente, venue, ventana horaria, `service_type` y `source reference`.

- `exact_duplicate`: misma referencia de origen, o cliente+venue+horario → **bloquea la creación**.
- `possible_duplicate`: exige `reviewStatus='accepted'` explícito antes de crear.
- `no_match`: flujo normal.

Nunca se crea un duplicado en silencio.

## 7. IA — sólo interfaz

`src/lib/intake/extraction-contract.ts` define `ServiceIntakeExtractor`, `ExtractionRequest`, `ExtractionResult` y `assertExtractionResult`. Patrón suggestion-only idéntico al de documentos: confianza por campo, input crudo preservado, cero escrituras de negocio.

**No se tocó `document-intake-extract` ni `document-extract`.** El schema de identidad y el de servicios se mantienen separados a propósito: se comparte infraestructura (gateway, tool-calling, confidence, logging), no el contrato semántico.

## 8. Drafts — frontera documentada

| | Draft local | Draft persistido |
|---|---|---|
| Qué es | trabajo en progreso antes de existir una fila | Servicio real en estado borrador |
| Dónde vive | `sessionStorage` + `localStorage` (`create-shift-session.ts`, `useShiftDraftAutosave.ts`) | `scheduled_shifts.publication_status='draft'` |
| Quién lo crea | el operador escribiendo en un formulario | el helper canónico tras revisión |
| Visible para otros | no | sí (misma compañía) |
| Se pierde al cerrar | puede expirar (12h / 7d) | no |

No se eliminó ni unificó ningún autosave: requiere análisis de dependencias previo (dos consumidores distintos: wizard móvil y formularios de escritorio).

## 9. Legacy / huérfanos — clasificación (sin borrar)

| Pieza | Referencias reales | Clasificación |
|---|---|---|
| `ImportWizard.tsx` | sólo `App.tsx:75,363` (ruta `/app/import-wizard`, tras `ModuleGate`) | **quarantine** — sin navegación entrante; retirar en fase posterior con evidencia de tráfico |
| `BulkImportShifts.tsx` | sólo `App.tsx:74,362` | **quarantine** — mismo caso |
| edge `bulk-import-shifts` | sólo desde `BulkImportShifts.tsx` | **quarantine** — se retira junto con su única pantalla |
| `imports` / `import_rows` | 10 / 0 filas; usadas por `ImportConnecteam.tsx` (flujo de horas) | **keep** — flujo distinto, sigue activo |
| `finance_import_*` | 0 filas; usadas por `founder-finance/Imports.tsx` | **keep** — producto separado |
| `payroll_import_batches` | 0 filas; superficies de payroll | **keep** — dominio payroll, fuera de alcance |
| tabla legacy `shifts` | 10 filas; único escritor `ImportConnecteam.tsx` | **migrate** (fase posterior) — el carril de intake nunca la toca |
| `StagedImportWizard` | activo en `/app/staged-reconciliation` | **keep** — conciliación de nómina, no intake |

## 10. Seguridad

- `company_id` **siempre** del contexto autenticado (`CreateDraftContext`); nunca se lee del contenido importado, ni del texto, ni de la imagen.
- Discrepancia de tenant a mitad de revisión → `blocked / tenant_mismatch`, sin escritura.
- Detección de duplicados descarta filas de otras compañías antes de comparar.
- Se apoya en las RLS existentes de `scheduled_shifts` e `import_batches`; no se modificó ninguna política, grant, función ni edge function.
- Cero cambios en payroll, `time_entries`, `shift_assignments`, documentos, campañas activas y lógica de partners.

## 11. QA

Suite `src/test/smart-service-intake-phase1.test.ts` — **21 tests en verde**; typecheck sin errores.

| # | Validación | Resultado |
|---|---|---|
| 1-3 | Excel/CSV y dry run existentes intactos | ✅ `ImportSchedule.tsx` y su pipeline no fueron modificados; suites `connecteam-parser` / `connecteam-export` / `connecteam-compat` sin cambios |
| 4 | Candidato revisado crea sólo draft | ✅ payload verificado campo a campo |
| 5 | Retry no duplica | ✅ segundo intento devuelve `reused`, cero inserts |
| 6 | Lote crea N drafts correctos | ✅ 2 creados, 1 bloqueado por falta de datos |
| 7 | Posible duplicado bloquea creación automática | ✅ requiere `accepted` explícito |
| 8 | Venue ambiguo pide confirmación | ✅ `requiresConfirmation` bloquea hasta `confirmRef` |
| 9 | Cambio de tenant no contamina el batch | ✅ `tenant_mismatch` |
| 10 | `scheduled_shifts` recibe `import_batch_id` | ✅ |
| 11 | Cero writes a `shifts` legacy | ✅ tablas tocadas auditadas en el test |
| 12 | Cero impacto payroll / time_entries | ✅ ninguna referencia en el carril |

## 12. Archivos creados

```text
src/lib/intake/candidate.ts             modelo canónico + reglas de gate
src/lib/intake/entity-resolution.ts     cliente / venue / alias, suggestion-only
src/lib/intake/duplicate.ts             detector canónico de duplicados
src/lib/intake/extraction-contract.ts   contrato IA (sólo interfaz)
src/lib/intake/batch.ts                 import_batches con batch_type='service_intake'
src/lib/intake/create-draft-service.ts  helper único de escritura
src/lib/intake/schedule-adapter.ts      reutilización desde ImportSchedule
src/lib/intake/index.ts
src/components/intake/ServiceIntakeReviewInbox.tsx
src/test/smart-service-intake-phase1.test.ts
```

Archivos modificados de producción: **ninguno**. Migraciones: **ninguna**. Tablas nuevas: **ninguna**.

---

**Confirmación:** Stafly tiene un único carril canónico para convertir información importada en Servicios draft, reutilizando la infraestructura existente y sin crear otro sistema paralelo.
