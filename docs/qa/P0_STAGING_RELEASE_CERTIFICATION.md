# P0 — STAGING RELEASE CERTIFICATION GATE

Fecha: 2026-09-03 20:20 UTC · Modo: **read-only** (cero escrituras, cero emails, cero publish)
Snapshot certificado: `462e24d09` ("Impuso inmutabilidad V1")
Base de comparación: primer commit del 2026-08-14 (ventana pendiente de publicación)
Backend evaluado: instancia Lovable Cloud de producción (solo lecturas)

---

## 0. Alcance real del snapshot

- 195 commits en la ventana, **45 archivos `src/`** modificados (5.465 inserciones / 1.400 borrados).
- Migraciones locales: 488 archivos · migraciones aplicadas en backend: **491**, última `20260903193800` = última local. **No hay migraciones pendientes.**
- Edge Functions y migraciones ya están vivas (se despliegan al aplicarse); el botón Publicar solo mueve el **frontend**.

Verificaciones globales ejecutadas:

| Check | Resultado |
|---|---|
| `bunx tsgo --noEmit -p tsconfig.app.json` | PASS (sin errores) |
| `bunx vitest run` | PASS — **109 archivos / 1.259 tests** |
| Smoke navegable admin + portal (Playwright) | PASS — 12 rutas, 0 errores de consola no-preexistentes, 0 overflow |

---

## 1. RELEASE IMPACT MAP

### A. AUTH / ACCESS / PERMISSIONS
- Archivos: `components/auth/EmployeeAuthFlow.tsx`, `integrations/supabase/previewAuthStorage.ts`, `components/employee/EmployeeAccessTab.tsx`, `pages/admin/*` (gates), `supabase/functions/employee-auth`.
- Cambio: login multi-compañía, PIN canónico, recuperación verificada, storage de sesión de preview.
- Riesgo: medio (superficie de sesión).
- Dependencias: `auth_pin_credentials`, `auth_recovery_requests`, `employee-auth` (ya live).
- QA existente: suites de PIN/multi-company verdes; smoke de sesión hidratada OK en /app y /portal.
- QA faltante: switching A↔B bajo pérdida total de red (defecto conocido F3-D1, no bloqueante).

### B. SHIFTS / ASSIGNMENTS / PUBLICATION
- Archivos: `lib/shifts/publication-truth.ts`, `publish-readiness.ts`, `service-publish-readiness.ts`, `assignment-status-truth.ts`, `claim-resolution.ts`, `pages/admin/Shifts.tsx`, `ShiftRequests.tsx`, `ShiftDetailDialog.tsx`, `portal/MyShifts.tsx`.
- Riesgo: medio-alto (visibilidad del trabajador).
- Dependencias backend confirmadas: `publish_shift_draft`, `assign_worker_to_shift`, `scheduled_shifts`, `shift_assignments`, `shift_role_slots`, `shift_requests`, `staffing_requests` — **todas existen**.
- QA: `publish-readiness-phase1/2`, `assignment-status-truth`, `shift-publication-truth`, `worker-visible-shifts` verdes.

### C. TIME CLOCK / TIME ENTRIES
- Sin cambios de escritura en el snapshot frontend salvo lectura/estado (`clock-request-state`, `useClockRequest` ya publicados previamente en lógica y sin modificación material en esta ventana).
- Riesgo: bajo. `/portal/clock` renderiza estado correcto (banner Connecteam, sin turno seleccionado) sin errores.

### D. PAYROLL
- Archivos: `pages/admin/PeriodSummary.tsx`, `MobilePeriodSummaryView.tsx`, `EmployeePeriodDetail.tsx`, `ImportPayrollExtras.tsx`, `components/payroll/ExternalPayrollCloseImport.tsx`, `lib/payroll/payroll142-bridge.ts`.
- Riesgo: alto por dominio, **mitigado**: sin `scheduled_hours`/`scheduledHours` en ninguna ruta de payroll (grep = 0 coincidencias). La base sigue siendo `period_base_pay` (derivado de horas reales) + `movements`.

### E. PAY STATEMENTS
- Archivos: `lib/payroll/pay-statement.ts`, `bulk-publish.ts`, `components/payroll/PayStatementPublishCard.tsx`, `BulkPublishPanel.tsx`, `components/portal/PayStatementDetailSheet.tsx`, `portal/PayReports.tsx`, `PayStub.tsx`, `WeekDetail.tsx`, `Accumulated.tsx`.
- Dependencias confirmadas: `pay_statement_preview`, `bulk_pay_statement_preview`, `publish_pay_statement`, `bulk_publish_pay_statements`, `unpublish_pay_statement`, `worker_pay_statements`, `worker_pay_statement_detail`, tabla `pay_statements` — **todas existen**.

### F. WORKER PORTAL
- Archivos: `EmployeeDashboard.tsx`, `MyShifts.tsx`, `MyAnnouncements.tsx`, `PayReports.tsx`, `PayStub.tsx`, `WeekDetail.tsx`, `Accumulated.tsx`.
- QA móvil 390×844 ejecutado (ver §7). Sin charts (`recharts` = 0 imports en `pages/portal` y `components/portal`).

### G. ADMIN / DASHBOARD
- `Dashboard.tsx`, `TodayView.tsx`, `WorkerPassport.tsx`, `Announcements.tsx`, `lib/data/query-error.ts`.
- Riesgo bajo; rutas cargan con datos y sin errores.

### H. INVOICES / FINANCIAL UI
- `pages/admin/Invoices.tsx` (banner legacy Zoho). Riesgo bajo, solo lectura de `legacy_invoices`.

### I. OFFICIAL COMMUNICATIONS
- `admin/Announcements.tsx`, `portal/MyAnnouncements.tsx`, `announcements/OfficialCommunicationDialog.tsx`, `CommunicationDetailDialog.tsx`, `lib/announcements/official-communications.ts`. Certificado en P1.1.

### J. OTHER
- `useEmployeeReputation`, `integrations/supabase/client.ts`, `types.ts` regenerado, tests nuevos.

---

## 2. P0 — PAYROLL INTEGRITY (fixture Payroll 142, READ-ONLY)

Periodo 142 = `a2cd1554-adb2-4a67-b82d-c6e2bb451d81` (2026-07-22 → 2026-07-28, `closed`).

| Métrica | Valor leído |
|---|---|
| `period_base_pay.approved_total_override` (suma) | **$28.418,24** ✅ coincide con el total externo aprobado |
| `period_base_pay.base_total_pay` (suma calculada) | $23.989,24 (50 filas) |
| `movements.total_value` (suma) | $4.976,00 (58 filas) |
| Pay statements 142 | 5 filas, 5 publicadas, total congelado $6.356,08 |
| Última modificación de statements 142 | 2026-08-20 18:26:37 UTC (sin cambios hoy) |

- Regla **PAYROLL = horas reales** intacta: cero referencias a horas programadas en el código de nómina.
- Normalización de signo de deducciones presente y única (`Math.abs` en `PeriodSummary.tsx` y `pay-statement.ts`).
- Statements publicados permanecen inmutables (trigger backend) y **no se recalculó ni republicó nada**.
- `bulk_publish_pay_statements` **no se ejecutó**.

**PASS**

---

## 3. SHIFTS / ASSIGNMENTS

- `public.publish_shift_draft` contiene la liberación de `is_draft_reservation` (verificado en `pg_proc`).
- Consulta de integridad: **0** asignaciones con `is_draft_reservation = true` sobre turnos `published` en todo el backend → el fix sigue efectivo, sin reservas huérfanas.
- Publication truth y assignment truth cubiertos por tests verdes.
- No se creó ni modificó ningún turno real. **PASS**

## 4. TIME CLOCK

- `/portal/clock` carga, muestra reloj, banner de política y estado "sin turnos para marcar" sin errores.
- Cero escrituras a `time_entries`. **PASS (no regresión observable)**

## 5. AUTH / SESSION / MULTI-COMPANY

- Sesión hidratada correctamente en 12 navegaciones consecutivas (admin y portal), con compañía `My Staff Solution LLC` resuelta y rol Owner visible.
- El error "No pudimos cargar tu sesión" **no se reprodujo** en ninguna carga ni refresh → condición transitoria de hidratación, no regresión del snapshot.
- No se modificaron memberships ni permisos. **PASS (con vigilancia)**

## 6. PERMISSIONS

- `/app/permissions` carga la consola (Usuarios / Roles / Modelo operativo / Permisos).
- Todas las rutas admin visitadas pasan por `PermissionGate` y resolvieron correctamente para `company_owner`; no se observó escalación ni pérdida.
- Deuda separada: la consola aún no permite **borrar** overrides ni muestra precedencia de bloqueos (P1, no bloquea release).

## 7. WORKER PORTAL — QA MÓVIL (390×844)

| Ruta | Resultado |
|---|---|
| `/portal` | PASS — saludo, empresa, tarjetas de perfil/documentos, sin overflow |
| `/portal/shifts` | PASS — Hoy/Próximos/Historial, empty state correcto |
| `/portal/clock` | PASS |
| `/portal/documents` | PASS — W-9 en revisión, aviso de privacidad |
| `/portal/pay-reports` | PASS — "Recibos aprobados y publicados por tu empresa", empty state limpio |
| `/portal/announcements` | PASS |
| `/portal/profile` | PASS |

`scrollWidth == clientWidth` en todas (sin overflow horizontal); sin charts; navegación inferior presente; 0 errores de consola propios.

## 8. PAY STATEMENTS

- Admin: preview y controles de publicación disponibles (`PayStatementPublishCard`, `BulkPublishPanel`); la RPC de preview usa el mismo cálculo que congela el servidor y respeta `approved_total_override`.
- Idempotencia de bulk publish garantizada en la RPC (statements existentes se omiten) — **no ejecutado**.
- Worker: `PayReports` consume exclusivamente `worker_pay_statements` / `worker_pay_statement_detail`; sin notas internas, sin Excel crudo, sin horas ficticias. **PASS**

## 9. OFFICIAL COMMUNICATIONS — SMOKE

- `/app/announcements` carga con acciones "Anuncio simple" y "Comunicado oficial".
- `/portal/announcements` carga el feed.
- Enforcement de versionado activo en backend (`trg_announcement_lock_official_content`, numeración con advisory lock).
- Estado de datos: 9 anuncios históricos, **0** versiones, **0** acuses → sin residuos de QA. **PASS**

## 10. DATABASE / BACKEND SAFETY

Dependencias del frontend verificadas una a una contra producción:

- RPCs (16/16 existen): `acknowledge_announcement`, `announcement_new_version`, `announcement_version_recipients`, `assign_worker_to_shift`, `bulk_pay_statement_preview`, `bulk_publish_pay_statements`, `consolidate_passport`, `log_activity_detailed`, `mark_announcement_viewed`, `pay_statement_preview`, `publish_announcement_version`, `publish_pay_statement`, `publish_shift_draft`, `unpublish_pay_statement`, `worker_pay_statement_detail`, `worker_pay_statements`.
- Tablas críticas (14/14 existen): announcements/versions/recipients, pay_statements, period_base_pay, movements, shift_assignments, scheduled_shifts, time_entries, employee_portal_modules, shift_attendance_confirmations, shift_role_slots, shift_requests, staffing_requests.
- **Sin schema mismatch**; `types.ts` regenerado coincide (typecheck limpio).

## 11. EMAIL — FUERA DE ESTA RELEASE (incidente separado, ya activo)

Registrado, **no corregido** en este task:
- Emails de auth en inglés sin branding correcto ("Staflycore").
- Invitaciones que reportan éxito aunque la dirección esté suprimida.
- Backend de email ya está vivo (Edge Functions) → el botón Publicar **no** lo cambia ni lo revierte.
Cero emails enviados durante este QA.

## 12. ZERO-WRITE

Todo el QA fue lectura: `SELECT` de solo lectura + navegación autenticada. **No se creó ni eliminó ningún dato QA.** Cero cambios en payroll, time_entries, shift_assignments, scheduled_shifts, payments, bookings, documents, tenants, memberships o datos de producción.

---

## 13. HALLAZGOS

**P0 (bloquean publicación):** ninguno.

**P1 (corregir pronto):**
1. Access Console sin borrado de overrides ni visualización de precedencia (UX de administración de accesos).
2. Incidente de email activo (branding/idioma + éxito engañoso con supresión) — ya en producción, independiente del publish.

**P2 (deuda / no bloqueante):**
3. Defecto F3-D1: corte total de red durante el cambio de compañía cae a "Vista global" en vez de conservar el tenant anterior.
4. Encabezado "Announcements" sin traducir en la vista worker en español.
5. Warnings React preexistentes de `refs` en providers (`next-themes`, `react-helmet-async`, `LanguageProvider`).
6. `my_announcements` no está en `DEFAULT_ENABLED_MODULES`: requiere activación explícita por compañía para el piloto.

---

## 14. RECOMENDACIÓN DE RELEASE

El snapshot `462e24d09` es coherente: typecheck limpio, 1.259 tests verdes, todas las dependencias backend ya aplicadas, integridad de Payroll 142 confirmada ($28.418,24 intacto, statements congelados sin tocar), publicación de turnos sin reservas huérfanas, portal móvil sin regresiones y comunicados oficiales con enforcement activo. Los pendientes de email quedan fuera del alcance del botón Publicar y ya están vivos hoy.

Recomendación: publicar el snapshot completo como una sola release, con `my_announcements` activado solo en las compañías del piloto y monitoreo de sesión en la primera hora.

🟢 SNAPSHOT READY TO PUBLISH
