# Smart Service Intake — Auditoría de capacidades existentes

Fecha: 2026-08-08
Tipo: **auditoría de solo lectura**. No se modificó código, datos, migraciones ni producción.
Alcance: todo lo que hoy convierte información no estructurada o masiva en Servicios / Turnos / borradores.

---

## 0. Resumen ejecutivo

Existen **dos familias separadas** de "entrada de trabajo":

- **A. Importación masiva desde archivo (Excel/CSV Connecteam)** — madura, con trazabilidad real
  (`import_batches` → `raw_schedule_import_rows` → `normalized_schedule_rows` →
  `migration_shift_mapping` → `scheduled_shifts`), idempotencia por `reconciliation_hash`
  y matching difuso de empleados. **Reutilizable casi tal cual como columna vertebral de Smart Service Intake.**
- **B. Creación individual de un turno** — wizard con borrador **100% local** (sessionStorage +
  localStorage), sin entidad en base de datos hasta el submit. No hay bulk draft ni draft persistido.

**No existe** ningún pipeline de texto libre / imagen / audio / WhatsApp / email → servicio.
La IA existente es de **documentos de identidad** (OCR/visión) y de **sugerencia de asignaciones**,
no de creación de servicios.

Recomendación: **B — existe una base parcial fuerte; extenderla, no construir un pipeline nuevo.**

---

## 1. Inventario de código

### 1.1 Importación de turnos / servicios

| Path | Propósito | Estado | Superficie | Dependencias | Datos |
|---|---|---|---|---|---|
| `src/pages/admin/ImportSchedule.tsx` | Import canónico de horario Connecteam (.xls/.xlsx/.csv, máx 10MB) | **Activo — canónico** | `/app/import-schedule` (links desde TimeClock, CommandCenter, Shifts) | `connecteam-parser`, `employee-matcher`, `schedule-traceability` | `import_batches`, `raw_schedule_import_rows`, `normalized_schedule_rows`, `migration_shift_mapping`, `scheduled_shifts`, `shift_assignments` |
| `src/lib/import/schedule-traceability.ts` | Único módulo real de trazabilidad de import | **Activo** | librería | supabase client | tablas de arriba |
| `src/lib/connecteam-parser.ts` | Parser Excel/CSV → `ShiftGroup` | **Activo** | librería | `safe-xlsx` (ExcelJS) | ninguno |
| `src/lib/connecteam-html-parser.ts` | Parser de export HTML | Activo (compat/export) | librería | — | ninguno |
| `src/pages/admin/ImportConnecteam.tsx` | Import de **horas trabajadas** (fichajes) | **Activo (flujo distinto)** | `/app/import` | parser | escribe en tabla legacy `shifts` (línea ~530) |
| `src/pages/admin/ImportWizard.tsx` | Import alternativo de turnos | **Muerto / huérfano** (ruta registrada, sin navegación) | `/app/import-wizard` | — | `scheduled_shifts`, `shift_assignments` |
| `src/pages/admin/BulkImportShifts.tsx` | Bulk create vía edge function | **Muerto / huérfano** | `/app/bulk-import-shifts` | edge `bulk-import-shifts` | `scheduled_shifts` |
| `src/components/reconciliation/StagedImportWizard.tsx` | Staging de schedule/clock/payroll para conciliación de nómina | Activo (nómina, no creación de turnos) | `/app/staged-reconciliation` | `reconciliation-engine`, `reconciliation-normalizer` | `reconciliation_*`, `normalized_*` |
| `src/pages/admin/InvoicingClientsImport.tsx` | Import masivo de clientes de facturación | Activo | admin facturación | — | `clients`, `billing_clients` |
| `src/lib/integrations/connecteam-export.ts` / `connecteam-compat.ts` | Flujo **inverso** (exportar) | Activo | Shifts | — | lectura |

### 1.2 Drafts / sesión de creación

| Path | Propósito | Estado | Notas |
|---|---|---|---|
| `src/lib/shifts/create-shift-session.ts` | Motor puro de borrador de creación (sessionStorage + copia durable en localStorage, TTL 12h, clave por `user+company+surface`) | **Activo — canónico** | **Cero I/O de red. No existe entidad hasta "Crear turno".** |
| `src/hooks/useCreateShiftSession.ts` | Hook compartido móvil/desktop sobre el motor | Activo | autosave 800ms, persiste en `pagehide` |
| `src/hooks/useShiftDraftAutosave.ts` | **Segundo** autosave local (localStorage, TTL 7d, create/edit) | Activo — **duplicado parcial** | coexiste con el anterior |
| `src/components/shifts/mobile/MobileQuickCreateShiftSheet.tsx` | Wizard móvil 5 pasos → insert final | Activo | inserta en `scheduled_shifts` con `publication_status: published`; idempotencia por ref local |
| `src/components/shifts/workspace/quick-templates.ts` | "Plantillas" = presets de formulario (fill empty only) | Activo — **frontend only** | no hay plantillas en BD |
| `src/components/shifts/DuplicateShiftDialog.tsx` | Duplicar turno a otro día | Activo | **no es recurrencia** |

### 1.3 Duplicados / resolución de entidades

| Path | Propósito | Estado |
|---|---|---|
| `src/lib/employee-matcher.ts` | `normalizeName`, `normalizeEmail`, `EmployeeResolver`, `MatchMethod`, telemetría, ambigüedad | **Activo — motor principal de matching de import** |
| `src/lib/reconciliation-engine.ts` | `resolveEmployeeName`, `detectColumns`, `hashRow` | Activo — **segundo motor paralelo** (nómina) |
| `src/lib/placeholder-name.ts` | Detección de nombres placeholder ("System 3", "Unknown") | Activo — **duplicado manual** en edge `import-inactive-employees` |
| `src/hooks/useIdentityResolution.ts` | Resolución manual (verify/reject/link/merge) + RPC `merge_employees_idempotent` | Activo |
| `src/lib/address/normalize.ts` + `src/lib/address/*` | `StructuredAddress` canónico (Mapbox / manual / legacy), zona operativa, maps URL | Activo |
| `src/hooks/useLocationsV2.tsx`, `LocationPicker`, `SmartLocationField` | Resolución de venue en creación manual | Activo |

**Hueco crítico:** el import trata `address` como **texto libre**; no hay resolución fuzzy de
venue/dirección contra `locations_v2` ni de cliente contra `billing_clients` durante el import.

### 1.4 IA / OCR / audio (edge functions)

| Path | Modelo | Propósito | Escribe | Estado |
|---|---|---|---|---|
| `supabase/functions/document-extract/index.ts` | `google/gemini-2.5-flash` | OCR de documento de identidad, tool-calling `extract_document_fields`, confidence 0-1 → high/medium/low, número siempre enmascarado | **nada** (suggestion-only) | Activo (beta) |
| `supabase/functions/document-intake-extract/index.ts` | `google/gemini-2.5-flash` | OCR + matching heurístico a `employees` (stafly_id > phone > email > nombre) | `document_intake_items` (sugerencias) | Activo |
| `supabase/functions/ai-workforce/index.ts` | `google/gemini-3-flash-preview` | Sugerir asignaciones para turnos **existentes**, tool `suggest_assignments` (score 0-100 + reason) | **nada** | Activo (`/app/ai-workforce`) |
| `supabase/functions/employee-chat/index.ts` | `google/gemini-3-flash-preview` | Chat de nómina para trabajador | nada | Activo |

- **No existe** transcripción de audio/voz, ni STT, ni parsing de PDF (bloqueado explícitamente en v1 de OCR).
- **No existe** IA en payroll/reconciliación: `import-payroll-extras`, `payroll-consolidate` y
  `src/lib/finance/csv-parser.ts` son 100% determinísticos (mapas y regex).
- Sin retry automático; manejo explícito de 429/402; logging solo `console.*` (sin tabla de logs).
- Los dos schemas de extracción de identidad están **duplicados** entre las dos funciones.

---

## 2. Inventario de datos (conteos reales)

| Tabla | Filas | Comentario |
|---|---:|---|
| `migration_raw_imports` | 89.251 | histórico de migración |
| `raw_schedule_import_rows` | 14.739 | **fuente cruda de horarios — datos reales** |
| `normalized_schedule_rows` | 6.193 | post-matching |
| `migration_shift_mapping` | 1.405 | mapeo `reconciliation_hash → shift` |
| `raw_clock_import_rows` / `normalized_clock_rows` | 1.758 / 72 | fichajes |
| `raw_payroll_import_rows` / `normalized_payroll_rows` | 651 / 645 | nómina |
| `import_batches` | 47 | `source='connecteam'`, `batch_type='schedule'`, estados `completed/dry_run/cancelled` |
| `document_intake_batches` / `document_intake_items` | 12 / 6 | 6 con `extracted_json` (IA real usada) |
| `reconciliation_name_resolutions` | 7 | resolución manual de nombres |
| `imports` | 10 | legacy |
| `import_rows`, `finance_import_batches`, `finance_import_extracted_items`, `payroll_import_batches`, `migration_location_mapping` | 0 | **vacías** |

Columnas relevantes existentes:

- `scheduled_shifts.import_batch_id`, `scheduled_shifts.reconciliation_hash`
  (923 turnos con hash, 35 con `import_batch_id`), `publication_status` (**2.117 published / 35 draft**),
  `version` + `operational_version` (VWC), `deleted_at`, `cancelled_*`.
- `shifts` (tabla legacy) — **10 filas**, columna `import_id`.
- `document_intake_items.extracted_json`, `confidence_score`, `confidence_reason`.
- **No existen** `source_type` ni `source_reference` en turnos. El análogo es
  `import_batches.source` + `batch_type` + `migration_shift_mapping.match_status`.
- **No existe** ninguna tabla de plantillas de servicio ni de recurrencia.

---

## 3. Flujos existentes (archivo/texto/audio → extracción → revisión → creación)

| Flujo | Estado |
|---|---|
| Excel/CSV → parseo → matching empleados → **dry run revisable** → creación de `scheduled_shifts` + asignaciones | **COMPLETO** (`ImportSchedule.tsx`) |
| Excel/CSV → staging → resolución de nombres → conciliación de nómina | **COMPLETO** (`StagedImportWizard`) |
| Imagen → OCR → sugerencia → confirmación humana → documento de empleado | **COMPLETO pero sobre documentos de identidad**, no servicios |
| Texto libre / WhatsApp / email / nota pegada → servicio | **NO EXISTE** |
| Audio / nota de voz → servicio | **NO EXISTE** |
| PDF/imagen de horario → servicio | **NO EXISTE** (PDF bloqueado incluso en OCR de identidad) |
| Draft de servicio persistido y revisable en bandeja | **NO EXISTE** (draft es local; `publication_status='draft'` existe pero se usa poco: 35 filas) |

---

## 4. Drafts — respuestas concretas

- **Cómo se crea hoy un draft:** solo en el navegador (`create-shift-session.ts`), nunca en BD.
- **Campos:** `clientId, serviceType, jobSiteAddress, jobSiteLocationId, date, startTime, endTime, slots, team[], driverIds[], transportRequired, driversRequired, meetingPoint, meetingPointLocationId, notes`.
- **Helper canónico:** sí para el **borrador** (`useCreateShiftSession`); **no** para la escritura final
  (cada pantalla hace su propio `insert` a `scheduled_shifts`: Shifts.tsx ×4, StaffingRequests, MobileQuickCreate, ImportSchedule).
- **Bulk draft creation:** no existe.
- **Draft escribe en:** `scheduled_shifts` (nunca en `shifts`).
- **Ambigüedad `shifts` / `scheduled_shifts`:** riesgo **real pero acotado** — `shifts` solo la escribe
  `ImportConnecteam.tsx` (horas trabajadas) y tiene 10 filas. Smart Service Intake debe escribir
  **exclusivamente** en `scheduled_shifts`.

---

## 5. `ImportSchedule` — ¿reutilizable?

**Sí, es la base correcta.** Aporta ya resuelto: batch, filas crudas, filas normalizadas, mapeo,
hash idempotente, dry-run revisable, matching difuso, telemetría de coincidencias, cierre de batch
con contadores y no-coincidencias.

Lo que **no** aporta: entradas que no sean tabulares (texto, imagen, audio), resolución de
cliente/venue, y una bandeja de revisión reutilizable fuera de esa pantalla (la UI de revisión está
acoplada dentro del componente de 1.900 líneas).

`ImportConnecteam.tsx` es un **flujo distinto** (asistencia, no servicios) — no reutilizar.

---

## 6. Clasificación de reutilización

| Pieza | Clase |
|---|---|
| `schedule-traceability.ts` (batches, raw, normalized, mapping, hash) | **A — reutilizar tal cual** |
| `employee-matcher.ts` (`EmployeeResolver`, normalización, ambigüedad) | **A** |
| `placeholder-name.ts` | A (unificar copia en edge) |
| `address/normalize.ts` + `locations_v2` + `LocationPicker` | **B — reutilizar con adaptación** (falta resolución automática) |
| `create-shift-session.ts` / `useCreateShiftSession` (modelo de draft y campos) | **B** |
| Patrón OCR de `document-intake-extract` (tool-calling + confidence + sugerencia sin escritura) | **B — plantilla ideal para el extractor de servicios** |
| `scheduled_shifts.publication_status='draft'` | **B** (ya existe, infrautilizado) |
| `ai-workforce` (`suggest_assignments`) | B (para staffing posterior, no intake) |
| UI de revisión embebida en `ImportSchedule.tsx` | **B** (extraer a componente compartido) |
| `ImportWizard.tsx`, `BulkImportShifts.tsx` (+ edge `bulk-import-shifts`) | **D — duplicado, retirar** |
| `imports`, `import_rows`, tabla `shifts` | **C — legacy** |
| `useShiftDraftAutosave.ts` vs `create-shift-session.ts` | **D — dos autosaves, unificar** |
| Reconciliación (`reconciliation-engine`) como motor de nombres paralelo | C/D para intake (no usar; usar `employee-matcher`) |
| Intake de texto / imagen de horario / audio / email / WhatsApp | **E — falta construir** |
| Detección de servicio duplicado (mismo cliente+fecha+hora+venue) | **E — falta construir** (solo existe hash exacto de Connecteam) |
| Resolución de cliente y venue en intake | **E — falta construir** |
| Bandeja de drafts de servicio persistida | **E — falta construir** |
| Plantillas / recurrencia de servicios | **E — falta construir** |

---

## 7. Riesgo de silo

| Riesgo | Veredicto |
|---|---|
| ¿Duplicaría un importador existente? | **Sí**, si crea su propio batch/rastro. Debe usar `import_batches` + `schedule-traceability`. |
| ¿Duplicaría drafts? | **Sí**, ya hay dos autosaves locales. Debe usar `publication_status='draft'` en `scheduled_shifts`, no un tercer almacén. |
| ¿Duplicaría AI parsing? | **Parcialmente**: no hay extractor de servicios, pero sí patrón OCR + schemas duplicados. Debe extraerse `_shared/` y no crear un 3.º patrón. |
| ¿Duplicaría source tracking? | **Sí**, si inventa `source_type`. Debe extender `import_batches.source/batch_type`. |
| ¿Duplicaría bulk create? | **Sí** — ya hay tres caminos (`ImportSchedule`, `ImportWizard`, `BulkImportShifts`). Retirar los dos huérfanos antes de añadir el cuarto. |
| ¿Crearía otro modelo paralelo de jobs? | **Riesgo alto** si define su propia entidad "intake job". Debe modelarse como un `import_batches` con `batch_type='service_intake'` y `source ∈ {text, image, audio, email, whatsapp}`. |

**Integración propuesta (sin implementar):**
`entrada (texto/imagen/audio)` → `import_batches(batch_type='service_intake', source=<canal>)`
→ `raw_*_import_rows` (payload original íntegro) → edge function de extracción con tool-calling
y `confidence_score` (patrón `document-intake-extract`, suggestion-only)
→ `normalized_*` con cliente/venue/empleados **sugeridos** → bandeja de revisión compartida
(extraída de `ImportSchedule`) → creación en `scheduled_shifts` con `publication_status='draft'`,
`import_batch_id` y `reconciliation_hash`, vía el **mismo** helper de escritura VWC.

---

## 8. Recomendación

**B — Existe una base parcial sólida: extenderla.**

Orden sugerido (no implementado en esta fase):

1. **Higiene previa:** retirar `ImportWizard.tsx`, `BulkImportShifts.tsx` y su edge function; unificar los dos autosaves; unificar el schema OCR en `_shared/`.
2. **Un helper canónico de escritura de servicio** (hoy hay 6+ `insert` dispersos) — precondición para cualquier intake.
3. **Extraer la bandeja de revisión** de `ImportSchedule.tsx` a componente reutilizable.
4. **Extractor de servicios** como edge function con el patrón `document-intake-extract` (tool-calling, confidence, suggestion-only, cero escrituras a `scheduled_shifts`).
5. **Resolución de cliente/venue/dirección** reutilizando `employee-matcher` + `address/normalize` + `locations_v2`.
6. **Detección de duplicado de servicio** (cliente + fecha + ventana horaria + venue) sobre el hash existente.
7. Audio/voz solo después de 1–6, ya que no existe ninguna base de STT.

---

## 9. Confirmación

**No se modificó código, datos, migraciones ni producción durante esta auditoría.**
El único archivo creado es este reporte.
