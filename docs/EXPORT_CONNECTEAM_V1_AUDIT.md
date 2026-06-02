# Export Connecteam v1 — Auditoría técnica (read-only)

Fecha: 2026-06-02 · Modo: AUDIT-ONLY · 0 cambios de código, schema, RLS, payroll, time_entries, attendance, portal o production data.

## 1. Archivos / modelos revisados

DB tables:
- `public.scheduled_shifts` (campos completos verificados vía `\d`)
- `public.shift_assignments`
- `public.locations_v2` (job site + meeting point estructurados)
- `public.clients`, `public.service_categories`, `public.employees`

Componentes/hooks tocados como referencia (sin modificar):
- `src/components/shifts/ShiftDetailDialog.tsx` — drawer detalle de turno (admin desktop)
- `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx` — sheet detalle mobile
- `src/components/shifts/types.ts` — `Shift` + `Assignment` + `Employee` (incluye `connecteam_employee_id`)
- `src/lib/import-review/csv-export.ts` — patrón existente de CSV (Blob + a.click)
- `src/lib/connecteam-parser.ts` — referencia del formato semicolon-delimited de Connecteam
- `src/lib/import-platform-configs.ts` — config de plataformas
- `src/hooks/useShiftsConfig.tsx`, `src/hooks/useTodayOperations.tsx`

## 2. Campos disponibles en Stafly (scheduled_shifts + relaciones)

| Campo Stafly | Tabla.Columna | Tipo | Confiable |
|---|---|---|---|
| Fecha | `scheduled_shifts.date` | date | ✅ |
| Hora inicio | `scheduled_shifts.start_time` | time | ✅ |
| Hora fin | `scheduled_shifts.end_time` | time | ✅ |
| Título | `scheduled_shifts.title` | text NOT NULL | ✅ |
| Slots / capacity | `scheduled_shifts.slots` | int (default 1) | ✅ |
| Cliente | `clients.name` via `client_id` | text | ⚠ nullable |
| Job site (estructurado) | `locations_v2` via `job_site_location_id` | name + formatted_address + timezone | ⚠ nullable |
| Job site (texto libre) | `scheduled_shifts.job_site_address` | text | ⚠ legacy fallback |
| Meeting point | `locations_v2` via `meeting_point_location_id` + `meeting_point` text | mixto | ⚠ |
| Meeting time | `scheduled_shifts.meeting_time` | time | opcional |
| Notas operativas | `scheduled_shifts.notes` + `special_instructions` | text | ✅ |
| Categoría / tipo | `service_categories.name` via `category_id` | text | ⚠ nullable |
| Día (full/half) | `scheduled_shifts.day_type` | text | ✅ |
| Pay type | `scheduled_shifts.pay_type` | text | ✅ (no exportar a CT) |
| Legacy shift number | `scheduled_shifts.shift_code` | text | ⚠ solo referencia externa (ver regla legacy) |
| Workers asignados | `shift_assignments` + `employees` | join | ✅ |
| Connecteam ID por worker | `employees.connecteam_employee_id` | text | ⚠ solo si fue importado |
| Employer ID interno | `employees.employer_identification` | text | ✅ per-tenant |
| Timezone | `locations_v2.timezone` via job_site / meeting_point | text | ⚠ opcional, requiere fallback a tz de la company |

## 3. Mapping recomendado Stafly → Connecteam

| Columna Connecteam | Fuente Stafly | Transformación / fallback |
|---|---|---|
| **Date** | `scheduled_shifts.date` | ISO → `MM/DD/YYYY` (formato CT) |
| **Start** | `scheduled_shifts.start_time` | `HH:mm` |
| **End** | `scheduled_shifts.end_time` | `HH:mm` |
| **Timezone** | `locations_v2.timezone` (job_site → meeting_point → company default) | IANA string (`America/New_York`); si falta, default de company |
| **Unpaid break** | ❌ **NO EXISTE** en `scheduled_shifts` | dejar vacío en v1; documentar gap |
| **Paid break** | ❌ **NO EXISTE** | dejar vacío en v1; documentar gap |
| **Shift title** | `scheduled_shifts.title` | tal cual. **NO usar `shift_code`** (regla legacy) |
| **Job** | `clients.name` (preferido) → fallback `service_categories.name` | string; vacío si ambos null |
| **Sub item** | `service_categories.name` cuando `clients.name` ya ocupa Job | opcional; en v1 dejar vacío si no aplica |
| **Address** | `locations_v2.formatted_address` (job_site) → fallback `scheduled_shifts.job_site_address` | string |
| **Users** | join `shift_assignments` (status ∈ `accepted`, `confirmed`, opcional `pending`) → `employees.first_name + last_name` o `connecteam_employee_id` cuando exista | separador CT (`;` o el del template oficial); por defecto solo accepted/confirmed |
| **Shift tags** | ❌ **NO EXISTE** tabla de tags por turno | vacío en v1 |
| **Note** | `scheduled_shifts.notes` + `special_instructions` (concatenadas) + sufijo opcional `· Ref: <shift_code>` | string. Aquí viaja el legacy shift number como referencia, no como título |
| **Number of users** | `scheduled_shifts.slots` | int |
| **Require Approval** | ❌ **NO EXISTE** flag explícito | default `No` (configurable global) |
| **Tasks** | ❌ **NO EXISTE** módulo de tasks | vacío en v1 |

## 4. Campos faltantes (gaps explícitos)

1. **Unpaid break / Paid break** — Stafly no modela break en `scheduled_shifts`. Decisión v1: exportar vacío. Futura opción: añadir `unpaid_break_minutes`, `paid_break_minutes` (no toca payroll, payroll sigue usando `time_entries`).
2. **Shift tags** — no hay tabla `shift_tags`. Decisión v1: vacío.
3. **Require Approval** — no hay columna. Decisión v1: default `No` (o setting global por company).
4. **Tasks / checklist** — no hay módulo. Decisión v1: vacío.
5. **Sub item** — semánticamente ambiguo (Connecteam lo usa como segundo nivel de job). Decisión v1: usar `service_categories.name` solo si `clients.name` ya ocupa Job; si no, vacío.

## 5. Campos ambiguos / riesgos

| Riesgo | Detalle | Mitigación v1 |
|---|---|---|
| Worker sin `connecteam_employee_id` | CT puede crear duplicados si el nombre no matchea exacto | Warning "X workers sin Connecteam ID" antes de descargar |
| `client_id` null + `category_id` null | Job vacío en CT | Bloquear export o marcar Needs review |
| Job site sin `locations_v2` (solo texto legacy `meeting_point` o `job_site_address`) | Address inconsistente | Permitir export con warning |
| Timezone faltante | CT puede interpretar mal horarios cross-tz | Fallback a tz de la company; warning si falta |
| Turnos `draft` / `cancelled` (publication_status) | Contaminar CT con turnos no operativos | Excluir por defecto; admin avanzado puede forzar |
| Turnos importados desde CT (round-trip) | Riesgo de re-importar duplicados | Si `import_batch_id` not null → warning "originado en import" |
| Multi-tenant cross-leak | Operador con varias companies | Scope por `selectedCompanyId` siempre |
| Legacy shift number en Shift title | Romper regla `mem://business-logic/legacy-shift-number-policy` | Solo viaja en Note como `Ref: <code>` |

## 6. Reglas de validación

**Ready** (exportable sin warnings):
- `publication_status = 'published'`
- `client_id` o `category_id` presente
- `job_site_location_id` o `job_site_address` presente
- ≥ 1 assignment en `accepted`/`confirmed`
- Todos los assigned workers con `connecteam_employee_id` o (first+last name confiable)
- `locations_v2.timezone` resuelto (job_site / meeting_point / company default)

**Needs review** (export permitido con warnings visibles):
- Falta timezone (usa fallback)
- 1+ workers sin `connecteam_employee_id`
- Solo `category_id` (sin cliente)
- Job site solo en texto legacy

**Blocked** (export deshabilitado):
- `publication_status` ∈ {`draft`, `cancelled`, `archived`}
- Sin `client_id` y sin `category_id`
- 0 assignments efectivas (accepted/confirmed)
- `scheduled_shifts.deleted_at` not null

## 7. Ubicación UX recomendada del botón

**Desktop** — `src/components/shifts/ShiftDetailDialog.tsx`:
- Nueva sección colapsable **"Integraciones / Exportaciones"** al final del drawer (debajo de `LiveShiftBoard` y `ShiftQRSection`).
- Botón secundario `Exportar a Connecteam` (icon `Download`) que abre un modal `ExportConnecteamPreviewDialog` con:
  - Preview de las 16 columnas CT en tabla simple (sin charts).
  - Banner de estado: Ready / Needs review / Blocked.
  - Warnings listados (workers sin CT ID, timezone faltante, etc.).
  - CTAs: `Cancelar` · `Descargar CSV` (sólo si no Blocked).
- Gated por `canAccessAdminForCompany(selectedCompanyId)` (regla Core de permisos por tenant). **No visible en portal worker.**

**Mobile** — `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx`:
- Acción dentro del sheet existente (no agregar barra nueva, no romper layout 390px).
- Misma lógica de gate y validación. El preview en mobile usa lista vertical (key→value), no tabla.

**Nuevos archivos sugeridos (cuando se implemente, no ahora):**
- `src/lib/integrations/connecteam-export.ts` — pure helpers `buildConnecteamRow(shift, assignments, employees, location, client, category, company)` + `serializeConnecteamCsv(rows)` + `validateShiftForExport(shift, ctx) → {status, warnings[]}`.
- `src/components/shifts/integrations/ExportConnecteamPreviewDialog.tsx` — UI del modal.
- Tests: `src/test/connecteam-export.test.ts` — round-trip vs `parseConnecteamFile` cuando aplique.

Patrón de descarga: reutilizar `downloadCsv()` de `src/lib/import-review/csv-export.ts` (probado).

## 8. Checklist QA mobile (cuando se implemente)

- [ ] Botón visible en `MobileShiftOperationsSheet` sólo para admin del tenant actual.
- [ ] Modal/sheet no rompe altura `max-h-[90vh]` ni scroll interno.
- [ ] Preview en lista vertical (no tabla horizontal), tipografía legible 390px.
- [ ] Warnings visibles antes de `Descargar CSV`.
- [ ] `Descargar CSV` deshabilitado si Blocked, con razón visible.
- [ ] No aparece en `/portal/*` (worker).
- [ ] No genera artifacts en demo cuando QA mode activo (regla `mem://fixes/qa-tenant-mismatch-2026-06-01`).

## 9. Checklist QA desktop

- [ ] Sección "Integraciones / Exportaciones" colapsable, cerrada por defecto.
- [ ] Preview de 16 columnas CT legible (scroll horizontal si necesario).
- [ ] Badge de estado Ready/Needs review/Blocked siempre visible.
- [ ] Warnings con icono y copy ES-first (Admin Desk Spanish-first, regla Core).
- [ ] Export bloqueado si Blocked (botón disabled + tooltip con razón).
- [ ] Funciona con `selectedCompanyId` correcto; cambiar tenant invalida el preview.
- [ ] Legacy `shift_code` aparece sólo en columna Note como `Ref: <code>`, nunca en Shift title.

## 10. Confirmación de áreas NO tocadas

- ❌ 0 cambios en `scheduled_shifts` (schema, writes, triggers).
- ❌ 0 cambios en `shift_assignments` (schema, writes).
- ❌ 0 cambios en `time_entries` / clock_events / clock-in/out.
- ❌ 0 cambios en payroll, `period_base_pay`, `pay_periods`, `payroll_adjustments`, reconciliation.
- ❌ 0 cambios en RLS, policies, grants, auth, edge functions.
- ❌ 0 cambios en worker portal, `/portal/*`, PortalClock, PayReports.
- ❌ 0 cambios en closeout/`shift_closeout_reports`.
- ❌ 0 cambios en payments, bookings, chat, documents.
- ❌ 0 cambios en production data (audit puramente read-only `\d`).
- ✅ Payroll sigue usando exclusivamente `time_entries` reales o validaciones aprobadas; scheduled hours nunca se usan para pago (regla `mem://design/mobile-agenda-system`).
- ✅ Multi-tenant respetado: todo scope por `company_id` / `selectedCompanyId`.

## 11. Recomendación final

**GO** para implementar **Export Connecteam v1** en sprint corto, con alcance estrictamente unidireccional (Stafly → CSV → operador descarga e importa manual en CT).

Razones:
1. 11 de 16 columnas CT mapean directo desde Stafly sin cambios de schema.
2. Los 5 gaps (unpaid break, paid break, shift tags, tasks, require approval) son aceptables como vacíos en v1 y no bloquean la operación de CT.
3. Patrón de CSV ya existe y está probado (`csv-export.ts`).
4. Stafly se posiciona como fuente de creación/organización; CT queda como puente temporal de pago/clock — respeta `mem://backlog/phase-19-timeclock-reality-audit-closed` que dice "CT remains payroll authority".
5. Cero riesgo de regresión: no toca writes, no toca payroll, no toca portal.

**No-Go explícito** para:
- Sincronización bidireccional (push directo via API de CT) — fuera de alcance v1.
- Auto-export programado / cron — v1 es on-demand desde detalle de turno.
- Modificar `scheduled_shifts` para añadir `unpaid_break_minutes`, `shift_tags`, `tasks` — diferir hasta validar volumen real de uso.
- Hacer `shift_code` protagonista en cualquier superficie nueva — regla legacy se respeta.

## 12. Próximos pasos sugeridos (no ejecutar hasta aprobación explícita)

1. Crear `src/lib/integrations/connecteam-export.ts` con `validateShiftForExport` + `buildConnecteamRow` + tests unitarios.
2. Crear `ExportConnecteamPreviewDialog` y wirearlo en `ShiftDetailDialog` + `MobileShiftOperationsSheet`.
3. QA mobile + desktop en Stafly Demo (regla `mem://features/stafly-demo-environment`), nunca en Quality Staff / production.
4. Memoria: cerrar feature como `mem://features/export-connecteam-v1` con archivos tocados + boundaries respetadas.
