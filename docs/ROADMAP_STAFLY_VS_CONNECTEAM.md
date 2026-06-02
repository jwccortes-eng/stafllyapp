# StaflyCore vs Connecteam — Roadmap de diferenciación

**Fecha:** 2026-06-02
**Autor:** Lovable agent (audit-only)
**Tipo:** Roadmap / auditoría (NO implementación)
**Posicionamiento objetivo:** *"Run staffing operations from shift request to payroll-ready hours."*

---

## Principio rector

StaflyCore **no compite feature-a-feature** contra Connecteam (suite genérica deskless).
StaflyCore compite como **sistema operativo de staffing**: cobertura, accepted/rejected/pending, reemplazos, no-shows, evidencia de fichaje, closeout, horas listas para payroll, documentos, worker passport, referrals/intake, operación multi-tenant.

Cualquier feature que no fortalezca esa cadena se aplaza o se descarta.

---

## Bloques del roadmap

### Bloque 1 — Demo Operations Readiness

Stafly Demo Company debe poder mostrar la cadena completa shift → coverage → clock → closeout → review sin tocar tenants reales.

| # | Feature | Estado actual | Gap vs Connecteam | Diferencial Stafly | Riesgo | Prioridad | QA requerido | NO tocar |
|---|---|---|---|---|---|---|---|---|
| 1.1 | Stafly Demo Company seed completo | Tenant `d3500000-...0001` con 3 workers, 3 shifts, 4 assignments, 1 time_entry cerrado, badge DEMO. | Connecteam tiene "try it" guiado; nosotros no. | Demo es un tenant real aislado, no un mock; sirve para QA, ventas y onboarding. | Bajo si `is_demo=true` y badge visible. | Alta | Verificar badge en TopBar, aislamiento RLS, 0 escrituras cross-tenant. | Tenants reales, payroll, RLS, auth. |
| 1.2 | Quick Create validado (no drafts huérfanos) | Hardening aplicado: requiere fecha + (title/client/location/worker). Toast si vacío. | Connecteam no expone "create shift" como modal rápido equivalente. | Operador-first: 1 modal, sin drafts basura. | Medio: si se relaja regla vuelve el ruido. | Alta | Repetir las 9 pruebas previas (vacío/cliente/título/ubicación/worker, publication_status, 0 notificaciones, 0 time_entries). | payroll/RLS/time_entries. |
| 1.3 | Workers demo visibles y consistentes | 3 workers seed con PIN 123456. | Connecteam usa usuarios reales. | PIN compartido permite demo sin invitar. | Bajo. | Alta | Login portal con PIN, ver dashboard, fichar. | Auth real, invites productivos. |
| 1.4 | Job sites demo con geofence real | Pendiente: no hay `locations_v2` seed con geofence para demo. | Connecteam tiene geofence visual con radio en mapa. | StaflyCore puede mostrar geofence + evidence panel en mismo flujo. | Bajo si se limita a demo tenant. | Alta | Crear shift demo con job_site asignado, fichar dentro/fuera, ver flag. | locations_v2 productivos. |
| 1.5 | No drafts huérfanos | Resuelto 2026-06-01 vía hardening `handleSaveDraft` + S3 local-only. | N/A | Operación limpia. | Medio si se añaden nuevos modales sin la misma regla. | Alta | Auditar cualquier nuevo `CreateShiftDialogInline`/quick modals. | scheduled_shifts schema. |
| 1.6 | Cero notificaciones accidentales en demo | Pendiente: verificar que `Stafly Demo` no dispara WhatsApp/email a nadie real. | N/A | Confianza demo. | Alto si se filtran SMS reales. | Alta | Forzar publish en demo y confirmar 0 envíos (revisar edge functions + `is_demo` guard). | edge functions productivas. |
| 1.7 | Evidence panel demo-ready | Existe `useShiftPresence` + `clock_events`, falta script seed con GPS + foto + punctuality. | Connecteam muestra "time clock report". | StaflyCore liga evidencia ↔ closeout ↔ revisión, no solo log. | Bajo. | Media | Demo shift con arrival on-time, late, no-show, departure, foto kiosk. | clock_events productivos. |

---

### Bloque 2 — Job Site UX

Resolver la confusión "dirección manual ≠ Job Site" que rompe geofence, mapa y closeout.

| # | Feature | Estado actual | Gap vs Connecteam | Diferencial Stafly | Riesgo | Prioridad | QA requerido | NO tocar |
|---|---|---|---|---|---|---|---|---|
| 2.1 | Separación texto vs `job_site_location_id` | Aplicado: `jobsite_missing` vs `jobsite_unsaved` en `pending-flags.ts`. | Connecteam fuerza job site estructurado. | Permitimos dirección rápida + path para promover a Job Site. | Medio si se confunden flujos. | Alta | Validar copy en `WorkspaceSummary`, `ShiftEditDialog`, `Shifts.tsx`. | scheduled_shifts schema. |
| 2.2 | Copy claro: "Dirección agregada; sin Job Site guardado · mapa/geofence no disponible" | Implementado. | N/A | Lenguaje operador, no técnico. | Bajo. | Alta | QA visual en español. | i18n keys productivas. |
| 2.3 | CTA "Guardar como Job Site" desde dirección manual | **Pendiente.** Hoy el usuario debe ir manualmente a Locations. | Connecteam asocia siempre a job site. | Fricción cero: promover dirección → location estructurada con un click (con preview de geofence). | Medio: crear locations basura si no hay validación. | Media | Requiere dialog: nombre + geofence radius + confirmación. No auto-crear sin acción explícita. | locations_v2 RLS. |
| 2.4 | No geofence falso | Garantizado: sin `job_site_location_id` no hay geofence. | Connecteam siempre tiene geofence. | Honestidad operativa: el panel dice qué falta. | Bajo. | Alta | Verificar que clock_events no marquen `outside_geofence` cuando no hay job_site. | clock_events lógica. |
| 2.5 | Bloqueo de publicación si confusión | `validateForPublish` intacto; dirección manual es warning, no blocker. | Connecteam bloquea sin job site. | Permitimos flexibilidad pero documentamos riesgo. | Medio. | Media | Confirmar que publish requiere al menos: fecha + horario + (location o address). | publish flow. |

---

### Bloque 3 — Command Center Staffing

El verdadero diferencial: una sola vista que un dispatcher usa todo el día.

| # | Feature | Estado actual | Gap vs Connecteam | Diferencial Stafly | Riesgo | Prioridad | QA requerido | NO tocar |
|---|---|---|---|---|---|---|---|---|
| 3.1 | Turnos hoy/mañana en una vista | Existe `DailyOps`, `LiveShiftBoard`, `MobileShiftsView`. Falta consolidar en Command Center. | Connecteam tiene scheduler tradicional. | Vista operativa, no calendario. | Bajo. | Alta | Verificar query scope por `shift_ids` (no 1000-row cap). | scheduled_shifts queries. |
| 3.2 | Coverage real (assigned vs required) | `countStaffed` en `assignment-coverage.ts`. Excluye rejected/removed. | Connecteam muestra open shifts. | Coverage = verdad operativa, no "publicado". | Bajo. | Alta | QA en demo: shift con 2/3 y rejected. | time_entries (no mezclar). |
| 3.3 | Accepted/Rejected/Pending visibles por shift | Datos en `shift_assignments.response_status`. UI parcial. | Connecteam tiene confirmaciones. | StaflyCore tiene los 3 estados + auditoría. | Bajo. | Alta | UI consistente desktop+mobile. | response_status enum. |
| 3.4 | Reemplazos rápidos | `intelligent-replacement-engine` existe (4-factor scoring). | Connecteam tiene swap requests. | Algoritmo propio scoring. | Medio: no auto-asignar sin confirmación. | Alta | QA: trigger replacement en demo, ver candidates ordenados. | dispatch writers. |
| 3.5 | No-shows tracking | `proactive-alerts` + `attendance-grace-period-logic`. | Connecteam alerta lateness. | Stafly diferencia late vs no-show con grace dinámico. | Bajo. | Alta | QA: shift con grace=15min, fichar a +20min → late. | grace logic. |
| 3.6 | Cierre pendiente (closeout queue) | `shift_closeout_reports` + `PayrollReviewQueue` bucket `pendiente-cierre`. | Connecteam no tiene closeout estructurado. | **Diferencial fuerte:** cierre obligatorio antes de payroll. | Bajo. | Alta | QA: shift sin closeout aparece en queue. | final_approval gate. |
| 3.7 | Horas listas para revisar | `Centro de Validación v1` ya existe. | Connecteam exporta a payroll directo. | Stafly mantiene gate humano entre clock y payroll. | Bajo. | Alta | QA: bucket `listo-pago` ≠ pagado. | payroll math. |

---

### Bloque 4 — Time Clock Review

Convertir el clock log en evidencia auditable.

| # | Feature | Estado actual | Gap vs Connecteam | Diferencial Stafly | Riesgo | Prioridad | QA requerido | NO tocar |
|---|---|---|---|---|---|---|---|---|
| 4.1 | Evidence panel por time_entry | Datos: `clock_events` con lat/lng, foto kiosk, punctuality. UI parcial. | Connecteam muestra mapa + foto. | StaflyCore liga evidencia ↔ closeout ↔ payroll review. | Bajo. | Alta | QA: ver entry con GPS + foto + punctuality en demo. | clock_events schema. |
| 4.2 | GPS unavailable explícito | `clock_method='kiosk'` o `latitude IS NULL`. Falta badge "Sin GPS". | Connecteam muestra "location off". | Operador-first: motivo claro, no rojo gratuito. | Bajo. | Media | QA: kiosk clock muestra "Sin GPS · método kiosk". | clock_method enum. |
| 4.3 | Outside geofence flag | Pendiente: no hay columna `outside_geofence` consistente. | Connecteam marca fuera de zona. | Requiere job_site con geofence (Bloque 2). | Medio: falsos positivos sin job_site. | Media | QA: fichar a 500m del job_site → flag. | geofence calc. |
| 4.4 | `review_status` por entry | `time_entries` no tiene columna explícita; hoy se infiere. | Connecteam tiene "approve/reject". | Stafly necesita estado formal: `pending_review/needs_attention/cleared`. | Alto: nueva columna toca payroll path. | Media | Requiere migración con grants + RLS + back-compat. | payroll lectura de time_entries. |
| 4.5 | `needs_review` queue | `Centro de Validación` lo tiene como bucket. | Connecteam: bandeja admin. | Stafly: queue por motivo (GPS / geofence / >16h / open clock). | Bajo. | Alta | QA buckets en demo. | bucket queries. |
| 4.6 | Offline clock (separado como sprint propio) | **Fuera de scope este roadmap.** | Connecteam tiene offline. | Sprint independiente con sync queue. | Alto. | Baja | Diseñar antes de implementar. | clock_events lógica actual. |

---

### Bloque 5 — Closeout Forms

El "cierre de turno" como producto, no como nota suelta.

| # | Feature | Estado actual | Gap vs Connecteam | Diferencial Stafly | Riesgo | Prioridad | QA requerido | NO tocar |
|---|---|---|---|---|---|---|---|---|
| 5.1 | Incidentes | `shift_closeout_reports.incident_count`. | Connecteam Forms genéricos. | Closeout estructurado, no form libre. | Bajo. | Alta | QA: crear closeout con 2 incidentes. | closeout schema. |
| 5.2 | Faltas (workers no-show consignados) | Existe en closeout. | Connecteam log de attendance. | Stafly liga falta ↔ assignment ↔ payroll review. | Bajo. | Alta | QA: closeout marca worker absent → bucket. | payroll. |
| 5.3 | Notas cliente | Pendiente columna específica (`client_notes`). | Connecteam Forms. | Visible en evidencia + opcional export. | Bajo. | Media | Migración mínima. | client schema. |
| 5.4 | Fotos | `clock_events.clock_method='kiosk'` ya guarda foto. Closeout fotos pendiente. | Connecteam adjuntos. | Reutilizar bucket `kiosk-photos` o nuevo `closeout-photos`. | Medio: storage policies. | Media | RLS + signed URLs como W-9. | kiosk-photos policies. |
| 5.5 | Uniform / equipment checklist | Pendiente. | Connecteam Checklists. | Lista corta, no form builder. | Bajo. | Baja | Diseño UX antes de schema. | N/A. |
| 5.6 | `ready_for_admin_review` flag | Existe via `status='submitted'` + `final_approval_*`. | Connecteam: marcar como done. | Stafly: gate explícito Keury antes de payroll. | Bajo. | Alta | QA: closeout submitted → bucket `pendiente aprobación final`. | final_approval trigger. |
| 5.7 | No aprobar payroll automáticamente | **Garantizado:** trigger bloquea. | Connecteam puede exportar directo. | Política de producto: humano siempre en el loop. | Bajo. | Alta | Verificar que ningún path automatice approval. | payroll/period_base_pay. |

---

## Lo que NO se toca en este roadmap

- `payroll calculations` (math, `period_base_pay`, `pay_periods`).
- `time_entries` ya aprobados.
- RLS en tablas críticas (employees, time_entries, scheduled_shifts, payroll_*).
- Auth (signup/login/SMS/HIBP).
- Payments (Stripe/billing).
- Bookings (cliente).
- Parceros codebase (sólo se consume identidad/passport).
- Production data en tenants reales sin aprobación explícita por usuario.
- Schema de tablas reservadas (`auth`, `storage`, `realtime`, etc.).

---

## Priorización sugerida (orden de ejecución)

1. **Bloque 1** (Demo readiness) — bloquea ventas y QA. Sprint corto.
2. **Bloque 2** (Job Site UX) — desbloquea geofence honesto y Bloque 4.
3. **Bloque 3** (Command Center) — diferenciador comercial directo.
4. **Bloque 5** (Closeout) — diferenciador defensivo (Connecteam no lo tiene estructurado).
5. **Bloque 4** (Time Clock Review) — depende de Bloque 2 para geofence real.

Offline clock = sprint independiente futuro.

---

## QA transversal obligatorio en cada bloque

- 0 escrituras a `payroll_*`, `time_entries` aprobados, `pay_periods`, `period_base_pay`.
- 0 cambios RLS sin migración explícita.
- 0 notificaciones (email/SMS/WhatsApp) en tenants `is_demo=true` o `is_test=true`.
- Build pasa, dictionary fallback (ES/EN/HE) funciona.
- Tenant badge visible cuando se opera fuera de producción real.
- Si toca `public.<tabla>` nueva: GRANT + RLS + policy en la misma migración.

---

## Próximos pasos (sin implementar todavía)

1. Validar este roadmap con el usuario.
2. Para cada bloque aprobado, abrir tarea atómica + memoria de seguimiento.
3. Empezar por Bloque 1.4 (Job sites demo con geofence) + Bloque 1.6 (no notificaciones demo) porque desbloquean el resto.
