# Sprint 0 — Operations Planning Center
## Architecture & Domain Discovery

**Fecha:** 2026-07-21
**Modo:** Arquitectura y descubrimiento de dominio. **Cero implementación.**
**Autor:** Auditoría técnica basada en inspección estática del repositorio.

---

## Confirmaciones de cumplimiento (obligatorias)

- ✅ Cero writes en base de datos.
- ✅ Cero migraciones ejecutadas o propuestas para ejecución.
- ✅ Cero cambios en RLS.
- ✅ Cero cambios en Attendance, Payroll, Dispatch, Recommendation Engine.
- ✅ Cero componentes productivos creados.
- ✅ Cero cambios en navegación productiva.
- ✅ Cero implementación funcional.
- ✅ Único archivo modificado: este documento en `docs/architecture/`.

---

## Convenciones del reporte

- 🟩 **Hecho confirmado**: verificado citando archivo:línea.
- 🟨 **Inferencia**: derivación razonada, requiere validación posterior.
- 🟦 **Recomendación**: propuesta de diseño; no autoriza implementación.

---

# ENTREGABLE 1 — Current Architecture Inventory

## 1.1 Rutas productivas relacionadas con planificación y ejecución

🟩 Confirmado en `src/App.tsx` (grep por `ops|plan|shift|command|quick|bulk|service`):

| Ruta | Página | Responsabilidad | Estado | Reutilizable en OPC | Riesgo |
|---|---|---|---|---|---|
| `/app/command-center` | `CommandCenterHub` | Hub principal de comandos | Producción | Alto — como shell padre | Fragmentación con `/app/ops` |
| `/app/command-center-classic` | `CommandCenter` | Vista clásica | Legacy | Bajo | Duplicidad |
| `/app/dev-command-center` | `DevCommandCenter` | Dev/Owner | Interna | N/A | — |
| `/app/shifts` | `Shifts` | CRUD de turnos | Producción | Alto — destino final del OPC | Acoplado a modelo turno-céntrico |
| `/app/shift-ops` | `ShiftOperations` | Vista táctica por turno individual | Producción | Alto — subvista dentro de operación | Se debe redefinir como "vista táctica de un turno dentro de una operación" |
| `/app/ops-center` | `OperationsCommandCenter` | Cockpit ops | Producción | Medio | Convivencia con `/app/ops` |
| `/app/daily-ops` | `DailyOps` | Ops del día | Producción | Medio | Similar a OpsHome |
| `/app/ops` | `OpsHome` | Shell unificado (documentado como *pure SHELL that reuses existing hooks and deep-links to canonical destinations*) | Producción | **Muy alto — patrón a seguir por el OPC** | — |
| `/app/service-requests` | `ServiceRequests` | Gestión de peticiones cliente | Producción | **Muy alto — contenedor semántico más cercano a "Operación"** | Semántica actual es "billing/intake", puede tensionarse |
| `/app/service-categories` | `ServiceCategories` | Catálogo de servicios | Producción | Alto | — |
| `/app/shift-requests` | `ShiftRequests` | Solicitudes internas | Producción | Bajo | Ambigüedad con service-requests |
| `/app/bulk-import-shifts` | `BulkImportShifts` | Import CSV masivo | Producción | Alto — puente hacia edge fn | — |
| `/app/backfill-shift/:shiftCode` | `BackfillShift` | Corrección retro | Producción | N/A | — |

🟨 **Inferencia:** hay **7 cockpits** que compiten por el mismo modelo mental. El OPC no debería añadir un octavo sin retirar/absorber al menos uno.

## 1.2 Componentes — creación y edición de turnos

🟩 `src/components/shifts/`:

| Componente | Responsabilidad | Reutilización OPC |
|---|---|---|
| `workspace/QuickCreateWorkspace.tsx` | Workspace completo de creación rápida | **Reutilizar** como editor de cada turno derivado de una operación |
| `workspace/PrePublishDialog.tsx` | Modal "Antes de publicar" (Phase 4, no writes propios) | **Reutilizar** — el OPC lo invoca por turno |
| `workspace/quick-templates.ts` | Presets v2 con `SAFE_KEYS` allowlist y política *fill empty only* | **Reutilizar y extender** como "tipos de operación" |
| `workspace/QuickCreateReadinessHints.tsx` | Hints de completitud | **Reutilizar** |
| `workspace/WorkerPreviewCard.tsx` | Preview de trabajador | **Reutilizar** |
| `workspace/PremiumClientSelector.tsx` | Selector de cliente | **Reutilizar** |
| `workspace/ShiftWorkspaceLayout.tsx` | Layout base | **Reutilizar** |
| `workspace/WorkspaceSummary.tsx` | Resumen | **Reutilizar** |
| `QuickCreatePopover.tsx`, `QuickCreatePopover` / `mobile/MobileQuickCreateShiftSheet.tsx` | Puntos de entrada | Referencia UX |
| `ShiftRepeatSection.tsx` | Repetición nativa (`weekdays \| range \| next_n`, `copyAssignments`) | **Reutilizar** para eje temporal multi-día |
| `ShiftFormFields.tsx` | Campos del formulario | **Reutilizar** |
| `ShiftFormShell.tsx` | Shell del formulario + delegación a publish | **Reutilizar** |
| `ShiftDetailDialog.tsx`, `ShiftEditDialog.tsx` | Ver/editar turno | **Reutilizar** |
| `ShiftLifecycleTimeline.tsx` | Timeline por turno | **Reutilizar** — base para timeline por operación |
| `ShiftRoleSlotsTeamPanel.tsx` | Panel de role slots (Waiter, Captain, etc.) | **Muy alto** — base para "roles de la operación" |
| `ShiftRidesPanel.tsx` | Panel de transporte | **Reutilizar** |
| `ShiftLocationsSection.tsx` | Ubicaciones | **Reutilizar** |
| `ops/ShiftOpsBlocks.tsx`, `ops/AttendanceEvidenceCard.tsx` | Bloques Shift Ops | **Reutilizar** dentro de vista táctica |
| `smart/SmartWorkCard.tsx` | Tarjeta inteligente por turno | **Reutilizar** |
| `integrations/ExportConnecteamBulkDialog.tsx` | Export masivo | **Reutilizar** |

## 1.3 Hooks operativos relevantes

🟩 `src/hooks/`:

| Hook | Responsabilidad | Reutilización OPC |
|---|---|---|
| `useShiftCoverage.tsx` | Cobertura por turno | **Reutilizar** para "coverage de operación" (agregación) |
| `useShiftLiveMap.tsx` | Mapa en vivo | Reutilizar en fase Live |
| `useShiftPresence.tsx` | Presencia | Reutilizar en fase Live |
| `useShiftDraftAutosave.ts` | Autoguardado de borradores | **Reutilizar** — clave para OPC draft de operación |
| `useShiftsConfig.tsx` | Config de turnos | Consumir |
| `useEmployeeAvailability.tsx` | Lee `employee_availability_config` y `_overrides` | **Reutilizar** para matching |
| `useWorkerAvailability.tsx`, `useWorkerCompliance.tsx`, `useWorkerConsent.tsx`, `useWorkerPassport.tsx` | Señales de trabajador | **Reutilizar** en recommendation |
| `useEmployeeReadiness.tsx`, `useEmployeeReputation.tsx`, `useEmployeeReviewStats.tsx` | Señales de reputación/readiness | **Reutilizar** |
| `useEmployeeInvitations.tsx` | Invitaciones (canales `whatsapp \| sms \| email \| copy \| other`) | **Reutilizar** para confirmations |
| `useTodayOperations.tsx` | Base de OpsHome | Referencia patrón |
| `useAuditLog.tsx` | Escribe a `activity_log` | **Reutilizar** para trazabilidad de operaciones |
| `useWorkedShiftHistory.tsx` | Historial real con clock data (documentado *NEVER derives worked time from scheduled start/end*) | **Reutilizar** para memoria operacional |
| `useNotifications.tsx` | Sistema de notificaciones | Reutilizar |
| `useLivePresence.tsx`, `useLocationTracking.tsx`, `useLocationsV2.tsx` | Locations & presencia | Reutilizar |
| `useShiftPresence.tsx`, `useFrontDesk.tsx` | Check-in | Reutilizar |
| `useEffectiveEmployee.tsx`, `useEmployeeRoster.tsx`, `useEmployeeStatus.tsx` | Roster | Reutilizar |

## 1.4 Helpers puros y motores en `src/lib/` y `src/core/`

🟩 Confirmado:

| Archivo | Rol | Reutilización OPC |
|---|---|---|
| `src/core/dispatch-engine.ts` | Motor product-agnostic: `getCandidatesForShift`, `computeMatchScore`, `suggestAssignments`, `executeDispatch`, `CORE_DISPATCH_GUARDS` | **Reutilizar sin cambios** |
| `src/core/workforce-score.ts` | `computeWorkerScore`, `getWorkerReputation` | **Reutilizar** |
| `src/core/operations-intelligence.ts` | Re-exporta `generateAlerts`, `computeCoverage`, `computeCoverageBatch`, `detectNoShowSpike`, `summarizeAlerts` + `generateCoreAlerts` | **Reutilizar** — base del "Operational Health" |
| `src/core/types.ts` | Vocabulario neutro: `WorkAssignment`, `WorkOpportunity`, `WorkerReputation`, `CoreAlert`, `MatchCandidate`, `AssignmentSuggestion`, `DispatchPlan` | **Reutilizar** — vocabulario base del OPC |
| `src/lib/shifts/worker-recommendation.ts` | `rankCandidate`, `RecommendationSignals`, `ReasonChipKey`, `REASON_CHIP_LABEL`, `inferShiftRoleNeeds` | **Reutilizar sin cambios** |
| `src/lib/auto-dispatch.ts` | `evaluateDispatchActions`, `executeAutoDispatch`, `AUTO_SAFETY`, niveles `off \| assist \| semi_auto \| full_auto`, `AUTO_DISPATCH_DEFAULTS` | **Reutilizar** — modo `assist` recomendado para OPC |
| `src/lib/dispatch-writers.ts` | **Único writer legítimo**: `applyDispatchPlan(plan: DispatchPlan)` | **Reutilizar** — encapsular escrituras del OPC aquí |
| `src/lib/shifts/build-pre-publish-review.ts` | Helper puro para PrePublish | **Reutilizar** |
| `src/lib/shifts/pending-flags.ts`, `readiness-grace.ts`, `shift-guards.ts` | Guards de publicación | **Reutilizar** |
| `src/lib/shifts/shift-phase.ts` | Fase del turno (staffing/curso/cierre) | **Reutilizar** para semáforo por operación (agregación) |
| `src/lib/shifts/closeout-review-status.ts` | Badge PRQ | **Reutilizar** |
| `src/lib/shifts/attendance-evidence.ts` | Evidencia de asistencia | **Reutilizar (leer)** — nunca escribir |
| `src/lib/shifts/assignment-coverage.ts` | Coverage por turno | **Reutilizar** |
| `src/lib/shifts/card-display.ts`, `display-name.ts`, `location-status.ts`, `visibility.ts` | Formato/derivaciones | **Reutilizar** |
| `src/lib/shifts/smart-work-card.ts`, `team-actions.ts` | Acciones tipadas | **Reutilizar** |
| `src/lib/shifts/time-corrections.ts` | Correcciones de tiempo | Reutilizar (leer) |
| `src/lib/attendance-resolver.ts` | Documentado como *Single source of truth per assignment* con 6 capas de resolución | **Solo lectura — NO tocar** |
| `src/lib/payroll-*.ts`, `weekly-payroll-reconciliation.ts` | Payroll | **Solo lectura — NO tocar** |
| `src/lib/integrations/connecteam-export.ts` | Export | **Reutilizar** |
| `src/lib/invitation-status.ts`, `invitation-error-messages.ts` | Estados invitación | **Reutilizar** |
| `src/lib/placeholder-name.ts` | Filtro nombres genéricos | **Reutilizar** |

## 1.5 Edge Functions relevantes

🟩 `supabase/functions/`:

| Función | Rol | Reutilización OPC |
|---|---|---|
| `bulk-import-shifts` | Import masivo con schema `ShiftRow` (16+ cols Connecteam-compat) | **Reutilizar** como writer final del OPC |
| `ai-workforce` | Sugerencias con `LOVABLE_API_KEY` (patrón para parser LLM) | **Referencia arquitectónica** — patrón a replicar para `operations-plan-parse` (aún no existe) |
| `send-invite-email`, `send-employee-credentials`, `bulk-portal-invite`, `invite-reminders` | Invitaciones | **Reutilizar** para confirmations |
| `shift-reminders` | Recordatorios | **Reutilizar** |
| `resolve-shift-link` | Deep-link a turnos | Referencia |
| `attendance-qr-resolve`, `kiosk-clock`, `front-desk-checkin` | Attendance | **Solo lectura** |
| `payroll-consolidate`, `billing-*` | Payroll/billing | **Solo lectura** |
| `document-extract`, `document-intake-extract` | 🟨 **Posible base para parser de intake** (grep confirma presencia) | **Reutilizar** — reduce necesidad de crear edge fn nueva |

🟩 **Ningún edge function existente se llama `staff-planning-*`, `operations-planning-*` ni `planning-ai-*`** (grep negativo).

## 1.6 Tablas relevantes (según `src/integrations/supabase/types.ts`)

🟩 Confirmado por inspección directa del tipo generado:

### 1.6.1 `scheduled_shifts` (líneas 12702–12905)

Campos clave: `attendance_mode`, `car_capacity`, `category_id`, `claimable`, `client_id`, `clock_method`, `created_by`, `date`, `day_type`, `deleted_at`, `driver_employee_id`, `end_time`, `import_batch_id`, `job_site_address`, `job_site_location_id`, `location_id`, `meeting_point`, `meeting_point_location_id`, `meeting_time`, `notes`, `operational_version`, `pay_override`, `pay_type`, `publication_status` (`draft | published | cancelled | archived`), `published_at/by`, `qr_attendance_mode`, `qr_token`, `reconciliation_hash`, `shift_admin_id`, `shift_code`, `shift_link_token`, `slots`, `special_instructions`, `start_time`, `status`, `title`, `transportation_notes`, `transportation_required`.

**Contiene ya campos operativos ricos**: transporte, meeting point, driver, categoría, admin del turno, versión operativa, hash de reconciliación.

### 1.6.2 `shift_role_slots` (líneas 14395–14510+)

Campos: `role_type` (enum `service_request_role_type`: `waiter | captain | kitchen_staff | cleaner | bartender | other`), `role_label`, `quantity`, `service_request_id`, `service_request_item_id`, `shift_id`, `notes`, `sort_order`.

🟩 **Este es el vínculo estructural existente entre "petición de servicio" y "turnos"**, tipado por rol.

### 1.6.3 `service_requests` (líneas 13178–13290)

Campos: `cancellation_reason`, `cancelled_at/by`, `client_id`, `client_name_snapshot`, `created_by`, `description`, `end_time`, `gender_requirement`, `headcount_requested`, `location_id`, `location_name`, `notes`, `onsite_contact_name/phone`, `priority`, `request_channel` (`whatsapp | phone | manual | client_link | email`), `request_code`, `request_date`, `request_type` (`staffing_request | schedule_change | cancellation | extra_workers | issue_report | billing_question | general_message`), `requested_by_contact_id`, `roles_requested` (JSON), `service_address`, `service_date`, `start_time`, `status` (**enum de 9 estados que ya cubre gran parte del ciclo**), `title`, `updated_by`.

**Enum `service_request_status`** (línea 17357):
```
new → reviewing → approved_for_scheduling → converted_to_shift → in_progress
   → pending_closure_review → ready_for_billing → invoiced
   (con salida a cancelled desde cualquier estado)
```

🟩 **Este enum es notablemente cercano al state machine que el OPC necesita.**

### 1.6.4 `service_request_items` (líneas 13039–13108)

Campos: `role_type`, `role_label`, `billing_unit` (`hourly | daily | flat`), `quantity_requested`, `requested_bill_rate`, `notes`, `sort_order`.

### 1.6.5 `service_request_shift_links` (líneas 13112–13175)

Puente N:N `service_request(_item) ↔ scheduled_shift`, con `linked_by` (trazabilidad).

### 1.6.6 Otras tablas confirmadas por schema

- `shift_assignments` (con `role_slot_id` FK a `shift_role_slots`).
- `staffing_request_status` enum (líneas 17377–17390): 12 estados incluidos `sourcing`, `partially_assigned`, `fully_assigned`, `scheduled`, `in_progress`, `completed`, `cancelled`. 🟨 Sugiere una segunda entidad relacionada a "staffing request" (a validar si es tabla propia o solo enum reservado).
- `employees` (líneas 4241–…): `can_drive`, `driver_licence`, `has_car`, `has_vehicle` (booleanas y textos). 🟩 Base para transporte.
- `activity_log` (usado por `useAuditLog`, línea 72): base para auditoría de operaciones.
- `employee_availability_config`, `employee_availability_overrides` (usadas por `useEmployeeAvailability.tsx`).
- `clock_events`, `clock_alerts`, `time_entries`, `pay_periods`, `period_base_pay`, `movements` (documentadas en `docs/ARCHITECTURE.md`).
- `reviews`, `review_scores` (mencionadas en `src/core/README.md`).

### 1.6.7 Tablas explícitamente ausentes (grep negativo confirmado)

- ❌ `operations`, `operation_plans`, `operation_snapshot`, `operation_passport`.
- ❌ `shift_template`, `scheduled_shifts_template`, `planning_session`.

## 1.7 Estado del acoplamiento (síntesis)

🟨 **Inferencia clave:** el proyecto ya tiene una separación disciplinada:

- **Lectura pura** → `src/lib/shifts/*`, `src/core/*` (documentado en `src/core/README.md` como *Read-only by default*).
- **Escritura centralizada** → `src/lib/dispatch-writers.ts` (*único punto que aplica planes*).
- **Attendance/Payroll intocables** → múltiples archivos con docstrings prohibiendo modificar (`attendance-resolver.ts`, `useWorkedShiftHistory.tsx`).

El OPC hereda esta higiene si respeta la misma disciplina.

---

# ENTREGABLE 2 — Domain Mapping

Leyenda de clasificación:
- **[EXPL]** ya existe explícitamente
- **[PART]** existe parcialmente
- **[DERIV]** puede derivarse de lo existente
- **[EXT]** requiere extensión de algo existente
- **[NEW?]** *podría* requerir nueva entidad — solo tras justificar

| Concepto | Clasificación | Evidencia | Justificación |
|---|---|---|---|
| **Operation** | **[PART]** | `service_requests` (`types.ts` 13178) + `service_request_items` + `service_request_shift_links` + `shift_role_slots` | El contenedor lógico existe: `service_request` agrupa cliente, fechas, ubicación, canal, prioridad, roles requeridos y turnos generados. Falta: (a) semántica "operativa" (hoy tiende a billing/intake); (b) representación multi-día explícita (`service_date` es un solo día). |
| **Service** | **[EXPL]** | `service_categories` + `service_request_items.role_type` (`waiter\|captain\|kitchen_staff\|cleaner\|bartender\|other`) + `service_request_type` enum | Concepto ya modelado. |
| **Shift** | **[EXPL]** | `scheduled_shifts` (12702) con `publication_status`, `attendance_mode`, `pay_type`, transporte, meeting point, driver | Base madura. |
| **Captain** | **[EXPL/PART]** | `shift_role_slots.role_type = 'captain'`, `scheduled_shifts.shift_admin_id`, componente `CaptainNextActionCard.tsx`, `ShiftCaptainRoom.tsx` | Rol y sala existen; falta el concepto "capitán de la operación" (agregado sobre N turnos). |
| **Core Team** | **[DERIV]** | `shift_assignments`, historial en `useWorkedShiftHistory` | Se puede derivar como intersección de trabajadores que aparecen en ≥N turnos de la operación o histórico con este cliente. |
| **Coverage** | **[EXPL]** | `useShiftCoverage.tsx`, `src/lib/shifts/assignment-coverage.ts`, `src/core/operations-intelligence.ts` (`computeCoverage`, `computeCoverageBatch`) | Base sólida por turno; se agrega por operación. |
| **Gap** | **[DERIV]** | `computeCoverage` retorna deltas; `worker-recommendation` produce candidatos | Se deriva como `requiredSlots - filledSlots` por rol/turno de la operación. |
| **Transportation** | **[EXPL]** | `scheduled_shifts.transportation_required/notes`, `car_capacity`, `driver_employee_id`; `employees.can_drive/has_car/has_vehicle/driver_licence`; `ShiftRidesPanel.tsx` | Modelado. |
| **Overnight** | **[PART]** | `attendance-resolver.ts` documenta *cross-midnight rule*: bloque cuenta como mismo turno operativo hasta 03:00 del día siguiente | Regla existe en resolver; no hay flag explícito `is_overnight` en `scheduled_shifts` (a validar). |
| **Decision** | **[PART]** | Componentes `PrePublishDialog`, `ReplacementSuggestionDialog`, `SendNotificationDialog`, `DuplicateShiftDialog`; no hay tabla de decisiones pendientes | La UI de decisiones existe; **no existe una cola persistente de "decisiones pendientes de operación"**. |
| **Operational Risk** | **[EXPL]** | `src/core/operations-intelligence.ts`: tipos `AlertKind`, `AlertSeverity`, `OpsAlert`; `generateAlerts`, `detectNoShowSpike`; `clock_alerts` tabla | Motor de alertas ya presente. |
| **Operational Health** | **[DERIV]** | Composición de: coverage % + alertas activas + gap por rol + histórico de no-show | Derivable como score agregado sobre señales existentes. |
| **Operational Memory** | **[PART]** | `useWorkedShiftHistory` (histórico real por trabajador), `activity_log`, `reviews`, `review_scores` | Componentes existen; falta agregación por *cliente/tipo de operación* como consulta reusable. |
| **Operation Passport** | **[DERIV]** | Análogo a `PublicPassport.tsx` que existe para trabajadores | Concepto (perfil resumido con memoria + KPIs + versión) puede construirse derivando de tablas existentes; **no requiere tabla nueva en MVP**. |
| **Operation DNA** | **[NEW?]** | Sin evidencia directa | 🟨 Si "DNA" = huella estructural comparable entre operaciones (roles × tiempos × cliente × transporte) para detectar operaciones "similares", **puede materializarse como columna JSON/hash derivada** o como función pura que consume `service_request_items + shift_role_slots + scheduled_shifts`. **Se recomienda derivar como función pura primero; postergar tabla.** |

🟦 **Regla de oro aplicada:** solo `Operation DNA` roza territorio [NEW?], y aún así puede evitarse con una función determinística sin schema nuevo.

---

# ENTREGABLE 3 — Reuse Matrix

Códigos: **[R]** reutilizar sin cambios · **[RE]** reutilizar con extensión · **[EC]** encapsular · **[X]** reemplazar · **[N]** nuevo · **[NA]** no aplica.

| Capacidad | Código | Evidencia | Notas |
|---|---|---|---|
| Quick Create Workspace | **[R]** | `src/components/shifts/workspace/QuickCreateWorkspace.tsx` | Editor por-turno dentro del OPC. |
| Shift creation (single) | **[R]** | `ShiftFormShell`, `ShiftFormFields`, `dispatch-writers.applyDispatchPlan` | Sin cambios. |
| Bulk creation | **[RE]** | `supabase/functions/bulk-import-shifts/index.ts`, `BulkImportShifts.tsx` | Extender para aceptar output del "plan de operación" además de CSV. |
| Employee Picker | **[R]** | `SingleEmployeePicker.tsx`, `EmployeeCombobox.tsx`, `WorkerPreviewCard.tsx` | Sin cambios. |
| Worker recommendations | **[R]** | `src/lib/shifts/worker-recommendation.ts` (`rankCandidate`), `src/core/dispatch-engine.ts` | Sin cambios. |
| Dispatch | **[R]** | `src/lib/auto-dispatch.ts`, `src/lib/dispatch-writers.ts`, `src/core/dispatch-engine.ts` | Sin cambios. OPC arranca en modo `assist`. |
| Invitations | **[R]** | `useEmployeeInvitations`, edge fns `send-invite-email`, `bulk-portal-invite`, `invite-reminders` | Sin cambios. |
| PrePublish | **[R]** | `PrePublishDialog.tsx`, `build-pre-publish-review.ts`, `pending-flags.ts` | Invocado por turno dentro de la operación. |
| Clients | **[R]** | `useClients`, `useBillingClients`, `PremiumClientSelector`, tabla `clients` | Sin cambios. |
| Locations | **[R]** | `useLocationsV2`, tabla `locations` y `job_site_location_id`, `meeting_point_location_id` | Sin cambios. |
| Transport | **[R]** | Campos en `scheduled_shifts` + `ShiftRidesPanel.tsx` + flags en `employees` | Sin cambios. |
| Attendance | **[EC]** | `attendance-resolver.ts`, `useShiftPresence`, `attendance-evidence.ts` | Solo lectura desde OPC. Nunca escribir. |
| Closeout | **[EC]** | `src/lib/shifts/closeout.ts`, `closeout-review-status.ts`, `PayrollReviewQueue` | Solo lectura desde OPC. |
| Payroll | **[EC]** | `payroll-*`, `weekly-payroll-reconciliation.ts` | Solo lectura desde OPC. |
| History | **[R]** | `useWorkedShiftHistory` (docstring: nunca deriva horas de scheduled) | Reutilizar para memoria operacional. |
| Audit trail | **[R]** | `useAuditLog` → `activity_log` (línea 72 en hook) | OPC registra: creación de operación, aprobación humana, publicación en lote. |
| Ops Intelligence | **[R]** | `src/core/operations-intelligence.ts` | Base del panel Health. |
| Cockpits (shells) | **[X]** parcial | `OpsHome.tsx` como patrón | El OPC absorbe/reemplaza al menos uno de los 7 cockpits. |
| Intake libre (WhatsApp/Email/Voice) | **[N]** condicional | 🟨 `document-intake-extract` / `document-extract` edge fns existen | **Antes de crear nuevo parser, validar reutilizar `document-intake-extract`.** Solo si insuficiente → nuevo edge fn `operations-plan-parse`. |
| "Operación" como entidad UI de primera clase | **[N]** UI-only | — | Nueva vista/shell reutilizando piezas existentes. **No requiere nueva tabla si `service_requests` cubre semántica.** |
| Diff / variación entre operaciones | **[N]** helper puro | — | Función pura en `src/lib/operations/diff-operation-plan.ts` (a proponer, no crear). |

---

# ENTREGABLE 4 — Operation Workspace Proposal

## 4.1 Modelo mental

Una **Operación** es la unidad que el operador *piensa*. Un **Turno** es la unidad que el sistema *ejecuta*. El Workspace expone la operación como ciudadano de primera clase; los turnos son la materialización.

## 4.2 Bloques de información (todos derivables hoy, salvo lo indicado)

| Sección | Derivable hoy | Fuente | Nota |
|---|---|---|---|
| Identidad de la operación | ✅ | `service_requests.request_code + title + description` | — |
| Cliente | ✅ | `service_requests.client_id` + `client_name_snapshot` | — |
| Fechas | ⚠️ mono-día hoy | `service_requests.service_date` | 🟨 Multi-día requiere derivar de `service_request_shift_links → scheduled_shifts.date` (rango). No requiere schema nuevo si se acepta que la operación *deriva* su rango. |
| Ubicación | ✅ | `service_requests.location_id/address` + `meeting_point_location_id` en turnos | — |
| Estado | ✅ | `service_requests.status` (9 estados) | Ampliar semánticamente en UI sin tocar enum si se puede. |
| Operation Health | ✅ derivable | Coverage + alertas + histórico | Función pura. |
| Coverage | ✅ | `computeCoverageBatch` sobre los shifts vinculados | — |
| Gap | ✅ derivable | `sum(shift_role_slots.quantity) - count(shift_assignments)` por rol | — |
| Capitán | ✅ | `shift_role_slots.role_type='captain'` + `shift_admin_id` | 🟨 Concepto "capitán de operación" (agregado sobre N turnos) = derivación. |
| Core Team | ⚠️ derivación heurística | `shift_assignments` sobre operación + histórico con cliente | Función pura. |
| Servicios | ✅ | `service_request_items` (rol, cantidad, billing) | — |
| Timeline | ✅ | `ShiftLifecycleTimeline` por turno + orden cronológico de la operación | — |
| Logística / Transporte | ✅ | Campos existentes en `scheduled_shifts` + `ShiftRidesPanel` | — |
| Overnight | ⚠️ | Regla en `attendance-resolver` (cross-midnight hasta 03:00) | Derivable comparando `start/end + date`. |
| Decisiones pendientes | ⚠️ | Componibles desde `pending-flags`, alerts, coverage gaps | 🟨 No hay cola persistente. UI puede computarla al vuelo. |
| Riesgos | ✅ | `operations-intelligence.generateAlerts` filtrado por `shiftIds` de la operación | — |
| Cambios recientes | ✅ | `activity_log` filtrado por entidades de la operación | — |
| Operaciones similares | ⚠️ | Requiere función `findSimilarOperations()` sobre `service_requests + items + shifts` | Función pura + query read-only. |
| Memoria operacional | ⚠️ | `useWorkedShiftHistory` + `activity_log` + `reviews` agregados por cliente/rol | Función pura. |
| Borradores de turnos | ✅ | `scheduled_shifts.publication_status='draft'` + `useShiftDraftAutosave` | — |
| Publicación | ✅ | `PrePublishDialog` invocado por turno; UI puede orquestar publicación en lote | — |
| Ejecución (Live) | ✅ | `useShiftLiveMap`, `useLivePresence`, `useShiftPresence` | — |
| Closeout | ✅ (lectura) | `closeout.ts`, `closeout-review-status.ts` | — |
| Payroll (lectura) | ✅ | `payroll-*` (solo lectura) | — |
| Lessons learned | ⚠️ | `reviews`, `review_scores`, notas de closeout | Agregación posterior a operación. |

## 4.3 Qué requiere evolución futura

🟦 Solo tres piezas:
1. **Rango multi-día explícito de la operación** (hoy derivable, después puede pedir columna `date_range` o vista).
2. **Cola persistente de decisiones pendientes** (hoy computable, después puede pedir tabla `operation_decisions`).
3. **"DNA" comparable** entre operaciones (hoy función pura, después puede pedir hash indexado).

**Ninguno de los tres es MVP.**

---

# ENTREGABLE 5 — Navigation Proposal

## 5.1 Estructura propuesta

```
/app/operations
├── overview          → dashboard agregado (usa OpsHome como patrón)
├── planning          → nueva vista shell (intake + workspace + drafts)
├── active            → operaciones publicadas y en preparación
├── preparation       → subset con confirmations pendientes / gaps
├── live              → reutiliza LiveShiftBoard + LiveMap agrupados por operación
├── closeout          → reutiliza PayrollReviewQueue filtrado por operación
└── history           → memoria + lessons learned
```

## 5.2 Convivencia con rutas actuales

🟦 **No romper hábitos existentes**:

- `/app/shifts` **permanece** como CRUD de turnos individuales. Se añade breadcrumb *"pertenece a operación #123"* cuando un turno tiene `service_request_shift_links`.
- `/app/shift-ops` **permanece** como vista táctica de un turno. Recibe query `?operationId=` para banner de contexto.
- `/app/service-requests` **se redirige suavemente** a `/app/operations/planning` (o queda como sinónimo). La entidad DB sigue siendo `service_requests`; solo cambia el vocabulario UI.
- `/app/ops`, `/app/ops-center`, `/app/daily-ops`, `/app/command-center` **coexisten en Fase 0-2**; en Fase 3 se decide qué absorbe el OPC.

🟨 **Inferencia:** el patrón `OpsHome` (shell + deep-links) permite que el OPC no compita con esos cockpits — los usa como vistas satelitales.

---

# ENTREGABLE 6 — Operation State Machine

## 6.1 Estados propuestos

| Estado OPC | Significado | Mapea a `service_request_status` | Entrada válida | Salida válida | Bloqueos | Acción humana | Automatización permitida |
|---|---|---|---|---|---|---|---|
| **New** | Intake recibido, sin interpretar | `new` | Intake channel (WhatsApp/email/voice/manual) | → Analyzing | — | Ninguna obligatoria | Trigger parser |
| **Analyzing** | Parser LLM extrae estructura | (subestado UI de `new`) | Parser inicia | → Planning / New (si falla) | Ambigüedad no resuelta | Confirmar entidades ambiguas | Sugerencia de entidades (IA) |
| **Planning** | Operador diseña la operación | `reviewing` | Análisis OK | → Seeking Coverage / Cancelled | Falta cliente/ubicación/fechas | Definir servicios y roles | Sugerir templates, similar ops |
| **Seeking Coverage** | Recomendaciones abiertas | (subestado de `reviewing`) | Roles definidos | → Confirming Staff | Cero candidatos | Elegir candidatos | Ranking + dispatch `assist` |
| **Confirming Staff** | Invitaciones enviadas, esperando respuestas | `approved_for_scheduling` | Candidatos elegidos | → Published / Seeking Coverage | Confirmaciones < mínimo | Confirmar / reemplazar | Invitaciones + recordatorios |
| **Published** | Turnos con `publication_status='published'` | `converted_to_shift` | Aprobación humana + PrePublish OK | → Preparing | Turnos siguen draft | Publicar (batch UI) | Ninguna (**publish siempre humano**) |
| **Preparing** | Ventana T-24h a T-0 | (subestado) | Publicación completa | → Live | Cambios pendientes | Confirmar logística/transporte | Recordatorios, alertas ETA |
| **Live** | Al menos un turno en curso | `in_progress` | Primer clock-in | → Pending Closeout | Alertas críticas | Gestión de excepciones | Alertas, dispatch reemplazo |
| **Pending Closeout** | Todos los turnos terminaron, review pendiente | `pending_closure_review` | Fin del último turno | → Payroll Ready | Evidencia insuficiente | Validar attendance | Sugerir cierres |
| **Payroll Ready** | Closeout validado, no bloquea payroll | `ready_for_billing` | Closeout OK | → Learning / Archived | Overrides pendientes | Ninguna nueva | Consolidación (existente) |
| **Learning** | Ventana T+7d para lessons learned | (subestado de `ready_for_billing/invoiced`) | Payroll consolidado | → Archived | — | Registrar notas | Agregar métricas |
| **Archived** | Cerrada, disponible como memoria | `invoiced` (o `ready_for_billing` archivada) | Learning cerrado o timeout | (terminal) | — | Ninguna | — |
| **Cancelled** | Cancelada | `cancelled` | Desde New/Analyzing/Planning/Seeking Coverage/Confirming Staff | (terminal) | Turnos ya publicados | Confirmar cancelación en lote | Notificaciones a afectados |

🟩 **Nota clave:** los 9 estados de `service_request_status` cubren ~85% del state machine propuesto. Los "subestados UI" (`Analyzing`, `Seeking Coverage`, `Preparing`, `Learning`) **no requieren enum nuevo**: son derivaciones UI de `status + shift signals + time windows`.

## 6.2 Separación de estados por capa

🟩 **Cada capa mantiene su enum actual — el OPC no las fusiona:**

| Capa | Enum / fuente | Ubicación |
|---|---|---|
| Estado de operación (OPC) | `service_request_status` + derivaciones UI | `types.ts` 17357 |
| Estado del turno | `scheduled_shifts.status` (text) + `publication_status` enum | `types.ts` 12702 y 17376 |
| Estado de asignación | `shift_assignments.status` (text) | `types.ts` 13415 area |
| Estado de attendance | `ResolvedAttendanceStatus` (6 capas) | `src/lib/attendance-resolver.ts` |
| Estado de closeout | `shift_closeout_reports.status` + `closeout-review-status.ts` reglas | `src/lib/shifts/closeout-review-status.ts` |
| Estado de payroll | `pay_periods.status`, `period_base_pay` presencia | `types.ts` |

🟦 **Regla arquitectónica:** el estado de la operación **agrega y proyecta** los otros, nunca los sobrescribe.

---

# ENTREGABLE 7 — Data Flow

```
[Intake]
 WhatsApp · Email · Excel · Voz · Documento · Formulario
                        │
                        ▼
[Parser]   🟨 reutilizar `document-intake-extract` si el output es utilizable;
           si no, nuevo edge fn `operations-plan-parse` (patrón `ai-workforce`)
                        │
                        ▼
[Entity validation]
  clients (useClients) · locations (useLocationsV2) · workers (useEmployeeRoster)
  → resuelve por nombre / fuzzy match / historial (activity_log)
  → NUNCA crea entidades automáticamente (Regla IA)
                        │
                        ▼
[Operation Workspace]  ← identidad, cliente, fechas, ubicación
                        │
                        ▼
[Services & role needs]  ← service_request_items + shift_role_slots (roles/quantities)
                        │
                        ▼
[Coverage & recommendations]
   ← src/core/dispatch-engine.getCandidatesForShift
   ← src/lib/shifts/worker-recommendation.rankCandidate
   ← src/core/operations-intelligence.computeCoverageBatch
                        │
                        ▼
[Human decisions] (siempre requeridas)
   ← PrePublishDialog (existente) + panel de aprobación por operación (nuevo, UI-only)
                        │
                        ▼
[Draft shifts]
   ← scheduled_shifts.publication_status='draft'
   ← useShiftDraftAutosave para autoguardado
                        │
                        ▼
[PrePublish validation]
   ← build-pre-publish-review.ts + pending-flags.ts + readiness-grace.ts
                        │
                        ▼
[Shift creation infrastructure]
   ← supabase/functions/bulk-import-shifts  (writer masivo)
   ← src/lib/dispatch-writers.applyDispatchPlan (asignaciones)
   ← service_request_shift_links (traza operación ↔ turnos)
                        │
                        ▼
[Invitations & confirmations]
   ← useEmployeeInvitations
   ← edge fns: send-invite-email, bulk-portal-invite, invite-reminders, shift-reminders
                        │
                        ▼
[Attendance]  (opaco al OPC — solo lectura)
   ← attendance-resolver.ts (6 capas)
   ← clock_events, time_entries
                        │
                        ▼
[Closeout]  (opaco al OPC — solo lectura)
   ← closeout.ts, closeout-review-status.ts
   ← shift_closeout_reports
                        │
                        ▼
[Payroll]  (opaco al OPC — solo lectura)
   ← payroll-*, weekly-payroll-reconciliation.ts
   ← pay_periods, period_base_pay
                        │
                        ▼
[Operational memory]
   ← useWorkedShiftHistory (real clock only)
   ← activity_log (useAuditLog)
   ← reviews / review_scores
   ← agregación por cliente + tipo de operación (nueva función pura)
```

🟩 **Puntos donde ya existen readers/writers reutilizables:** cada capa desde "Entity validation" hasta "Operational memory" apunta a un archivo confirmado en el repo.

---

# ENTREGABLE 8 — Dependency Analysis

## 8.1 Matriz de dependencias

| Módulo | OPC depende (lectura) | OPC escribe (via encapsulación) | Debe permanecer desacoplado |
|---|---|---|---|
| Shift creation | ✅ | ✅ vía `bulk-import-shifts` + `applyDispatchPlan` | — |
| Assignments | ✅ | ✅ vía `dispatch-writers` | — |
| Recommendations | ✅ | ❌ (motor determinístico, sin escritura) | Motor sigue product-agnostic (`src/core`) |
| Dispatch | ✅ | ✅ pero **solo `AUTO_SAFETY` guards ya existentes** | Nivel `assist` en fase 1-2 |
| Invitations | ✅ | ✅ vía edge fns existentes | — |
| Attendance | ✅ lectura | ❌ **jamás** | Módulo intocable (docstring explícito) |
| Closeout | ✅ lectura | ❌ | Módulo intocable |
| Payroll | ✅ lectura | ❌ | Módulo intocable |
| Clients | ✅ | ❌ (OPC nunca crea clientes — Regla IA) | — |
| Locations | ✅ | ❌ (OPC nunca crea ubicaciones automáticamente) | — |
| Employee availability | ✅ | ❌ | — |
| Employee ratings | ✅ | ❌ | — |
| Employee work history | ✅ | ❌ | `useWorkedShiftHistory` nunca escribe |
| Driver/vehicle data | ✅ | ❌ | Campos en `employees` y `scheduled_shifts` |
| Audit logs | ❌ | ✅ vía `useAuditLog` | Trazabilidad de operaciones |

## 8.2 Interfaces recomendadas para orquestación

🟦 El OPC **NO llama tablas directamente**; llama a hooks/helpers ya existentes:

- Escritura: **solo** `src/lib/dispatch-writers.ts` + edge fns oficiales (`bulk-import-shifts`, `send-invite-email`, etc.).
- Lectura de recomendaciones: **solo** `src/core/dispatch-engine.ts` y `src/lib/shifts/worker-recommendation.ts`.
- Lectura de intelligence: **solo** `src/core/operations-intelligence.ts`.
- Lectura de attendance/closeout/payroll: hooks y helpers de sus dominios; **nunca joins ad hoc en el OPC**.

---

# ENTREGABLE 9 — Risk Analysis

| # | Riesgo | Probabilidad | Mitigación basada en evidencia |
|---|---|---|---|
| R1 | Duplicación de modelos (Operation vs. Service Request) | **Alta** si se crea tabla nueva | Reutilizar `service_requests + items + links` (E1.6). Justificar con métricas antes de tabla nueva. |
| R2 | Creación innecesaria de tablas | Alta | Regla: cada propuesta de tabla debe demostrar que la derivación es imposible o costosa. |
| R3 | Múltiples fuentes de verdad | Alta | Mantener: `service_requests` = operación; `scheduled_shifts` = ejecución; `time_entries` = attendance; `pay_periods` = payroll. **El OPC no duplica ninguna.** |
| R4 | Desacoplamiento insuficiente | Media | Escritura única vía `dispatch-writers.ts`. Lectura de attendance/payroll solo por hooks encapsulados. |
| R5 | Ruptura de payroll | Baja si se respeta regla | Docstrings existentes prohíben tocar `payroll-*`, `attendance-resolver`, `weekly-payroll-reconciliation`. |
| R6 | Ruptura de attendance | Baja | Igual que R5. |
| R7 | Doble creación de assignments | Media | Todo write pasa por `applyDispatchPlan` que hoy tiene `CORE_DISPATCH_GUARDS` (`src/core/dispatch-engine.ts` línea 32). |
| R8 | Inconsistencia draft ↔ published | Media | `publication_status` enum ya distingue; `useShiftDraftAutosave` + PrePublish protegen la transición. |
| R9 | Ambigüedad Operation ↔ Event | Alta si vocabulario UI cambia sin plan | Fijar vocabulario en Fase 0: *Operación = contenedor multi-día multi-rol; Turno = unidad ejecutable; Servicio = tipo de necesidad*. |
| R10 | Sobrecarga de estados | Media | Reutilizar los 9 estados de `service_request_status` (E6.1) + subestados UI derivados; evitar enum nuevo. |
| R11 | Dependencia excesiva de IA | Media | Reglas IA del prompt: nunca crea clientes/ubicaciones/horarios/asignaciones sin confirmación. Fallback a edición manual siempre disponible. |
| R12 | Recomendaciones no explicables | Baja | `REASON_CHIP_LABEL` en `worker-recommendation.ts` ya provee razones humanas. |
| R13 | Conflictos multi-tenant | Media | Todo query filtra por `company_id`; hooks existentes lo hacen (`useCompany`, `useEmployeeRoster`). El OPC no debe abrir un query sin `company_id`. |
| R14 | RLS | Baja | El OPC no crea tablas → hereda RLS existente. Si alguna vez se añade tabla, seguir plantilla de `docs/ARCHITECTURE.md`. |
| R15 | Performance | Media | Batch reads (`computeCoverageBatch` ya existe). Paginar historia. Evitar N+1 en la lista de operaciones. |
| R16 | Auditoría | Baja | `activity_log` + `useAuditLog` cubren. OPC registra: crear/aprobar/publicar/cancelar operación. |
| R17 | Rollback | Media | Publicación en lote → soportar "despublicar operación" reutilizando `publication_status='draft'` en cascada. Sin borrar `service_request_shift_links` para preservar trazabilidad. |
| R18 | Compatibilidad con datos existentes | Media | `service_requests` con `status` distinto a los mapeados → UI muestra "sin operación estructurada", no bloquea. Turnos huérfanos (sin `service_request_shift_links`) siguen operando como hoy. |

---

# ENTREGABLE 10 — Phased Technical Plan

> Sin implementación. Cada fase se activa por sprint dedicado con aprobación explícita del usuario.

## Phase 0 — Architecture & Documentation (ESTE SPRINT)

- **Alcance:** este documento. Vocabulario, inventario, state machine, riesgos.
- **Dependencias:** ninguna.
- **Reutilización:** N/A.
- **Riesgos:** desalineación con visión de producto — mitigado con revisión humana.
- **Criterio de salida:** aprobación del reporte + fijación de vocabulario.
- **Fuera de alcance:** cualquier código, migración o UI.

## Phase 1 — Planning Intake + Parser + Preview

- **Alcance:** ruta `/app/operations/planning` (shell); textarea de intake; llamada a parser (evaluar reutilizar `document-intake-extract`); preview editable del JSON extraído (no persiste aún).
- **Dependencias:** Phase 0. Edge fn de parser (nueva si `document-intake-extract` no basta).
- **Reutilización:** `QuickCreateWorkspace` como editor de preview; `PremiumClientSelector`, `useClients`, `useLocationsV2` para resolver entidades.
- **Riesgos:** ambigüedad LLM (R11), fallback manual obligatorio.
- **Criterio de salida:** operador puede pegar texto y ver plan estructurado editable.
- **Fuera de alcance:** persistir la operación, generar turnos.

## Phase 2 — Operation Workspace + Draft Generation

- **Alcance:** persistir la operación (evaluar `service_requests` como contenedor); generar drafts en lote vía `bulk-import-shifts` + `service_request_shift_links`; PrePublish por turno; publicación batch con aprobación humana.
- **Dependencias:** Phase 1.
- **Reutilización:** `bulk-import-shifts`, `PrePublishDialog`, `useShiftDraftAutosave`, `useAuditLog`.
- **Riesgos:** R1, R7, R8, R17.
- **Criterio de salida:** operación completa persistida y publicable end-to-end.
- **Fuera de alcance:** dispatch automático, memoria.

## Phase 3 — Coverage + Recommendations + Ratings

- **Alcance:** panel Health de la operación; `computeCoverageBatch` agregado; sugerencias por rol vía `dispatch-engine`; UI de aprobación de candidatos.
- **Dependencias:** Phase 2.
- **Reutilización:** `src/core/dispatch-engine.ts`, `worker-recommendation.ts`, `operations-intelligence.ts`, `useEmployeeReputation`.
- **Riesgos:** R12 (mitigado por `REASON_CHIP_LABEL`).
- **Criterio de salida:** operador ve gap, riesgo y candidatos con razones.
- **Fuera de alcance:** ejecución dispatch semi/auto.

## Phase 4 — Continuity + Transport + Overnight

- **Alcance:** vista Preparing/Live agrupada por operación; panel de transporte agregado; visualización overnight (regla cross-midnight de `attendance-resolver`).
- **Dependencias:** Phase 3.
- **Reutilización:** `ShiftRidesPanel`, `useShiftLiveMap`, `useLivePresence`, campos existentes de transporte.
- **Riesgos:** R15.
- **Criterio de salida:** operador dirige la operación en vivo sin salir del OPC.
- **Fuera de alcance:** cambios a attendance-resolver.

## Phase 5 — Operational Memory + Lessons Learned

- **Alcance:** vista History; función pura `findSimilarOperations()`; agregación de reviews y notas de closeout por cliente/operación; captura de lessons learned (nota de texto libre asociada — evaluar tabla ligera o `notes` en `service_requests`).
- **Dependencias:** Phase 4.
- **Reutilización:** `useWorkedShiftHistory`, `activity_log`, `reviews`, `review_scores`.
- **Riesgos:** R2 (evaluar antes de crear tabla).
- **Criterio de salida:** al iniciar una operación nueva, sistema sugiere "similar a operación X" con métricas.
- **Fuera de alcance:** DNA hash indexado.

## Phase 6 — Operation Intelligence

- **Alcance:** score `Operation Health`; predicción de riesgo (basada en histórico, no LLM); sugerencia de templates dinámica; comparador de variaciones; `diffOperationPlan` helper.
- **Dependencias:** Phase 5.
- **Reutilización:** todo lo anterior.
- **Riesgos:** R11 (mantener determinismo; LLM solo para explicación humana).
- **Criterio de salida:** operador recibe alertas proactivas y sugerencias explicadas.
- **Fuera de alcance:** auto-publicación.

---

# Reglas de IA (referencia normativa del OPC)

## Permitido

Interpretar · estructurar · detectar ambigüedad · recomendar · comparar · resumir · explicar · identificar riesgos.

## Prohibido (bloqueos duros a implementar en cada fase)

- Crear clientes.
- Inventar horarios, ubicaciones o roles.
- Asignar personas sin confirmación humana.
- Publicar turnos sin PrePublish humano.
- Enviar invitaciones sin confirmación.
- Resolver ambigüedad sin escalar al operador.
- Tocar attendance o payroll.
- Convertir patrones históricos en hechos confirmados (siempre "sugerido, confirmar").

---

# Vacíos reales identificados

🟩 Solo tres vacíos genuinamente ausentes:

1. **Shell UI del OPC** (`/app/operations/*`) — no existe.
2. **Parser de intake libre** — a validar si `document-intake-extract` cubre; si no, edge fn nueva `operations-plan-parse` (patrón `ai-workforce`).
3. **Helpers de agregación por operación** — funciones puras: `computeOperationHealth`, `computeOperationCoverage`, `findSimilarOperations`, `diffOperationPlan` — todas sin schema nuevo.

Todo lo demás (motor, writers, guards, dispatch, invitations, PrePublish, drafts, historial, alerts, audit) **ya existe y es reutilizable**.

---

# Conclusión

El Operations Planning Center **puede construirse sobre la infraestructura existente**, encapsulando `service_requests` como contenedor semántico de operación, sin crear tablas nuevas en MVP, sin tocar attendance/payroll/dispatch/recommendation, y sin fragmentar los cockpits actuales si adopta el patrón shell de `OpsHome.tsx`.

El OPC **no debe diseñarse como una feature aislada**: es la futura capa de orquestación que reagrupa las vistas ya construidas alrededor de la unidad mental correcta (la operación), preservando cada dominio como caja negra.

**Nada más se modificó en el repositorio.**
