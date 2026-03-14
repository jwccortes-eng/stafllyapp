
# StaflyApps — Roadmap de Desarrollo v3

> Última actualización: 2026-03-14
> Arquitecto: AI · Product scope: StaflyApps SaaS + Parceros Marketplace

---

## Tabla Resumen de Fases

| Fase | Nombre | Objetivo | Estado | Módulos clave |
|------|--------|----------|--------|---------------|
| 1 | Fundación | Auth, empresas, multi-tenant, roles | ✅ Completo | Auth, Companies, Roles, Profiles |
| 2 | Operación básica | Turnos, clientes, ubicaciones, reloj | ✅ ~90% | Shifts, Clients, Locations, TimeClock, GPS |
| 3 | Experiencia del empleado | Portal móvil, chat, anuncios, docs | ✅ ~85% | Portal, Announcements, Chat, Documents |
| 4 | Reportes y nómina | Periodos, importación, consolidación, pagos | ✅ ~90% | PayPeriods, Movements, Reports, Exports |
| 5 | Reputation Engine | Evaluaciones, scores, badges, leaderboard | ✅ ~80% | Reviews, RepScores, RepEvents, Badges |
| 6 | Worker Passport | Perfil verificado, métricas, privacidad | ✅ ~70% | PassportProfiles, WorkHistory, Metrics |
| 7 | Optimización UX/UI | Pulido, performance, PWA, onboarding | 🔄 ~40% | Toda la UI, PWA, Onboarding Wizard |
| 8 | Preparación Parceros | Marketplace, matching, gig economy | 🔜 ~10% | WorkerProfiles, ServiceCategories, Matching |

---

## FASE 1: Fundación del Sistema

### 1. Objetivo
Establecer la base técnica: autenticación, multi-tenancy, roles, y estructura de datos core. Sin esto nada funciona.

### 2. Módulos
- Landing page
- Autenticación (admin + empleado)
- Empresas (multi-tenant)
- Perfiles de usuario
- Roles y permisos (RBAC)

### 3. Funcionalidades específicas
- [x] Landing page con CTA → registro
- [x] Auth admin: email + password → Supabase Auth
- [x] Auth empleado: teléfono + PIN → edge function `employee-auth`
- [x] Registro self-service → `setup-company` edge function
- [x] Provisioning automático: empresa + módulos + trial Pro 14d
- [x] Multi-tenant: aislamiento por `company_id` en todas las tablas
- [x] Roles: developer > owner > admin > manager > supervisor > employee
- [x] `user_roles` table + `has_role()` security definer function
- [x] `company_users` para relación usuario↔empresa
- [x] `profiles` table para datos adicionales del usuario
- [x] `company_modules` para activar/desactivar features por empresa
- [x] `company_settings` para configuración granular
- [x] RLS en todas las tablas con filtro `company_id`
- [x] `module_permissions` y `action_permissions` para permisos granulares
- [x] `role_templates` para plantillas de permisos

### 4. Cambios en base de datos
- Tables: `companies`, `company_users`, `profiles`, `user_roles`, `company_modules`, `company_settings`, `module_permissions`, `action_permissions`, `role_templates`
- Enums: `app_role` (developer, owner, admin, manager, supervisor, employee)
- Functions: `has_role()`, `has_module_permission()`, `has_action_permission()`, `is_global_owner()`, `handle_new_user()`, `handle_new_user_role()`
- RLS: Políticas basadas en `company_id` + role checks

### 5. Cambios en frontend
- `useAuth` hook con role resolution
- `useCompany` hook con company selection + module gating
- `CompanyProvider` context
- `AdminLayout` / `EmployeeLayout` con guards
- `ModuleGate` component
- Sidebar con badges de plan + lock icons

### 6. Cambios en backend
- Edge function `setup-company`: provisioning completo
- Edge function `employee-auth`: auth por PIN
- Edge function `invite-admin`: invitación de admins
- Edge function `admin-reset-password`
- Auth email hook para emails personalizados

### 7. Dependencias
- Ninguna (es la base)

### 8. Pruebas
- Registro de nueva empresa → empresa creada con módulos activos
- Login admin → acceso a dashboard
- Login empleado → acceso a portal
- RLS: usuario A no ve datos de empresa B
- Roles: employee no accede a /app/*

### 9. Riesgos técnicos
- **RLS recursivo**: mitigado con `SECURITY DEFINER` functions
- **Escalación de privilegios**: roles en tabla separada, nunca en profiles
- **Rate limiting en auth empleado**: implementado con `auth_rate_limits`

### 10. Criterios de completado
- [x] Un owner puede crear empresa, invitar admins, asignar roles
- [x] Un empleado puede registrarse con PIN y acceder al portal
- [x] RLS bloquea acceso cross-tenant al 100%
- [x] Permisos granulares funcionan para manager/supervisor

**Estado: ✅ COMPLETO**

---

## FASE 2: Operación Básica

### 1. Objetivo
Digitalizar la operación diaria: programar turnos, asignar empleados, registrar asistencia con GPS, gestionar clientes y ubicaciones.

### 2. Módulos
- Clientes
- Ubicaciones (con geofencing)
- Programación de turnos
- Asignación de turnos
- Clock-in / Clock-out
- GPS y geofencing
- Vista "Hoy" operativa
- Mapa en vivo

### 3. Funcionalidades específicas
- [x] CRUD clientes con contacto, estado, soft-delete
- [x] CRUD ubicaciones con coordenadas, geofence_radius
- [x] Turnos: crear, editar, duplicar, soft-delete
- [x] Vistas: día, semana, mes, por empleado, por job
- [x] Asignaciones: asignar empleados a turnos, validar solapamiento
- [x] Shift requests: empleados solicitan turnos (claimable shifts)
- [x] Clock-in/out con captura GPS (lat, lng, accuracy, device, address)
- [x] Validación de solapamiento de fichajes
- [x] Geofencing: alerta `OUTSIDE_GEOFENCE` si está fuera del radio
- [x] Detección de fraude: `GPS_LOW_ACCURACY`, `DEVICE_DUPLICATION`, `SUSPICIOUS_MOVEMENT`
- [x] Today View: dashboard operativo con timeline + forzar salida
- [x] Live Map: mapa Leaflet con workers activos, ubicaciones, alertas
- [x] Notificaciones automáticas: cambio horario, cancelación, cambio ubicación
- [ ] **PENDIENTE**: Fichaje con foto
- [ ] **PENDIENTE**: Geofencing enforcement (bloquear clock-in fuera de radio)

### 4. Cambios en base de datos
- Tables: `clients`, `locations`, `scheduled_shifts`, `shift_assignments`, `shift_requests`, `time_entries`, `clock_events`, `clock_alerts`, `employee_location_history`
- Triggers: `prevent_overlapping_shift_assignments`, `prevent_overlapping_time_entries`, `notify_employees_on_shift_change`, `notify_managers_on_shift_request`
- Functions: `auto_assign_shift_code()`

### 5. Cambios en frontend
- Páginas: Shifts, TimeClock, Clients, Locations, TodayView, LiveMap
- Componentes: ShiftCard, ShiftDetailDialog, ShiftEditDialog, DayView, WeekView, MonthView, ShiftFilters, CoverageReport
- Clock components: MonthClockView, TimesheetView, DayDetailView
- GPS helper: `src/lib/geo-helpers.ts`

### 6. Cambios en backend
- Edge function `shift-reminders`: recordatorios de turnos
- Edge function `bulk-import-shifts`: importación masiva

### 7. Dependencias
- **Fase 1**: Auth + Companies + Employees (requerido)
- Módulo de empleados debe estar creado para asignar turnos

### 8. Pruebas
- Crear turno → asignar empleado → notificación recibida
- Clock-in → GPS capturado → geofence validado
- Solapamiento de turnos → error mostrado
- Today View muestra empleados activos en tiempo real
- Live Map muestra markers correctos

### 9. Riesgos técnicos
- **Precisión GPS**: en interiores puede ser baja → alertas `GPS_LOW_ACCURACY`
- **Solapamiento masivo**: triggers de validación pueden ser lentos con muchos empleados
- **Realtime**: Live Map depende de polling + Supabase Realtime

### 10. Criterios de completado
- [x] Un admin puede crear turnos y asignar empleados
- [x] Un empleado puede hacer clock-in/out con GPS
- [x] Las alertas de geofencing se generan correctamente
- [x] La vista "Hoy" refleja el estado operativo real
- [ ] Fichaje con foto funcional
- [ ] Geofencing enforcement activo

**Estado: ✅ ~90% COMPLETO**

---

## FASE 3: Experiencia del Empleado

### 1. Objetivo
Portal de autoservicio móvil tipo "Uber Driver" donde el empleado gestiona su vida laboral: turnos, pagos, documentos, chat, anuncios.

### 2. Módulos
- Portal del empleado (dashboard)
- Mis turnos
- Reloj (portal)
- Chat con IA
- Anuncios
- Perfil del empleado
- Documentos
- Disponibilidad
- Recursos

### 3. Funcionalidades específicas
- [x] Dashboard con resumen: próximo turno, horas de la semana, balance pendiente
- [x] Mis Turnos: lista con mapas, detalles, estado
- [x] Reloj portal: clock-in/out con GPS, break tracking
- [x] Chat IA: asistente para preguntas laborales
- [x] Anuncios: muro social con reacciones emoji
- [x] Perfil: datos personales, foto, skills, certificaciones
- [x] Documentos: subida y categorización
- [x] Disponibilidad: config semanal + overrides por fecha
- [x] Navegación móvil: bottom tabs + FAB para clock
- [x] Claimable shifts: reclamar turnos abiertos
- [x] W-9: formulario de contractor
- [ ] **PENDIENTE**: Push notifications (PWA)
- [ ] **PENDIENTE**: Onboarding wizard post-registro empleado

### 4. Cambios en base de datos
- Tables: `employee_documents`, `employee_availability_config`, `employee_availability_overrides`, `employee_portal_modules`, `announcement_reactions`, `chat_messages`
- Permisos por módulo del portal

### 5. Cambios en frontend
- Páginas portal: EmployeeDashboard, MyShifts, PortalClock, PortalChat, PortalProfile, MyPayments, MyAnnouncements, PortalResources, MyW9
- EmployeeLayout con bottom navigation
- FloatingDock para acciones rápidas
- Responsive design mobile-first

### 6. Cambios en backend
- Edge function `employee-chat`: Chat IA con Lovable AI gateway
- Storage bucket `employee-documents` (privado)
- Storage bucket `employee-avatars` (público)

### 7. Dependencias
- **Fase 1**: Auth empleado funcional
- **Fase 2**: Turnos y clock para mostrar datos

### 8. Pruebas
- Empleado ve sus turnos asignados
- Clock-in/out desde portal funciona con GPS
- Chat IA responde correctamente
- Documentos se suben y categorizan
- UI responsive en móvil (320px-428px)

### 9. Riesgos técnicos
- **Performance móvil**: bundles grandes en 3G → code splitting necesario
- **PWA reliability**: service worker cache strategies
- **Chat IA costs**: rate limiting por usuario

### 10. Criterios de completado
- [x] Empleado puede gestionar toda su vida laboral desde el portal
- [x] UI funciona bien en mobile
- [x] Chat IA responde preguntas básicas
- [ ] Push notifications funcionan en PWA
- [ ] Onboarding wizard para nuevos empleados

**Estado: ✅ ~85% COMPLETO**

---

## FASE 4: Reportes y Nómina

### 1. Objetivo
Sistema completo de nómina semanal: importación de horas, consolidación, novedades, resumen con net pay, exportaciones, y envío de recibos.

### 2. Módulos
- Periodos de pago
- Importación de horas (Excel, Connecteam)
- Consolidación base pay
- Novedades (movements)
- Conceptos de nómina
- Resumen de periodo
- Reportes (individual, comparativo, discrepancias)
- Exportaciones (Excel, PDF)
- Envío de recibos por email

### 3. Funcionalidades específicas
- [x] CRUD periodos de pago con estados (draft → processing → closed)
- [x] Import TimeClock: Excel → mapeo columnas → match empleados → guardar
- [x] Import Schedule: turnos desde Connecteam
- [x] Import Payroll Extras: novedades masivas desde Excel
- [x] Consolidación `consolidate_period_base_pay`: regular + overtime + daily pay
- [x] Overtime threshold configurable (default 40h/semana)
- [x] Novedades: earnings + deductions + bonuses con approval workflow
- [x] Conceptos: calc_mode (per_unit, fixed, percentage), rate_source (default, employee, shift)
- [x] Period Summary: base pay + earnings - deductions = net pay
- [x] Employee Report: detalle individual por periodo
- [x] Comparison Report: periodo vs periodo
- [x] Discrepancy Report: horas fichaje vs horas programadas
- [x] Unpaid Shifts Report
- [x] Monetization Report
- [x] Export Excel (ExcelJS) y PDF (jsPDF)
- [x] Envío de recibos por email (Resend)
- [x] Portal empleado: PayStub, MyPayments, Accumulated
- [ ] **PENDIENTE**: Validar flujo completo con datos reales de producción
- [ ] **PENDIENTE**: Auto-close de periodos (cron)

### 4. Cambios en base de datos
- Tables: `pay_periods`, `period_base_pay`, `movements`, `concepts`, `concept_employee_rates`, `shifts` (tabla legacy), `import_batches`
- Enums: `calc_mode`, `concept_category`, `rate_source`
- Functions: `consolidate_period_base_pay()`
- Edge function cron: `auto-close-periods`

### 5. Cambios en frontend
- Páginas: PayPeriods, ImportTimeClock, ImportSchedule, ImportPayrollExtras, ImportWizard, Movements, PeriodSummary, EmployeeReport, ComparisonReport, DiscrepancyReport, UnpaidShiftsReport, MonetizationReport, PayrollSettings
- Portal: PayStub, MyPayments, Accumulated, WeekDetail

### 6. Cambios en backend
- Edge function `payroll-consolidate`
- Edge function `send-payroll-email` (Resend)
- Edge function `import-inactive-employees`
- Edge function `import-payroll-extras`
- Edge function `auto-close-periods`
- Connecteam parser: `src/lib/connecteam-parser.ts`

### 7. Dependencias
- **Fase 1**: Empresas + Empleados
- **Fase 2**: Turnos + TimeClock (para consolidación)
- **Fase 3**: Portal empleado (para mostrar pagos)

### 8. Pruebas
- Importar Excel → horas mapeadas correctamente
- Consolidar periodo → base pay calculado con overtime
- Agregar novedades → net pay actualizado
- Exportar PDF → recibo legible
- Empleado ve su PayStub correcto

### 9. Riesgos técnicos
- **Precisión numérica**: redondeos en overtime calculations
- **Concurrencia**: dos admins consolidando el mismo periodo simultáneamente
- **Import Excel**: formatos inconsistentes entre empresas
- **Email deliverability**: con Resend, verificar dominio

### 10. Criterios de completado
- [x] Flujo completo: importar → consolidar → novedades → resumen → exportar → enviar
- [x] Net pay correcto: base + earnings - deductions
- [x] Overtime calculado correctamente con threshold configurable
- [ ] Validado con datos reales de Quality Staff
- [ ] Auto-close de periodos funcional

**Estado: ✅ ~90% COMPLETO**

---

## FASE 5: Reputation Engine

### 1. Objetivo
Sistema bidireccional de evaluación y reputación laboral. Los managers evalúan empleados post-turno, se generan scores automáticos, badges y leaderboard.

### 2. Módulos
- Evaluaciones post-turno (shift reviews)
- Reputation scores
- Reputation events
- Badges automáticos
- Performance score (0-100)
- Leaderboard
- Admin panel de reputación

### 3. Funcionalidades específicas
- [x] ShiftReviewForm: formulario de evaluación por dimensiones (puntualidad, calidad, servicio, profesionalismo, presentación)
- [x] Review bidireccional: manager→empleado y empleado→empresa
- [x] Trigger `trg_shift_review_rep`: review → rep_events automático
- [x] Trigger `trg_rep_events_recalc`: rep_events → recalculate_rep_score()
- [x] Performance Score ponderado: Punctuality 25%, Quality 25%, Service 15%, Professionalism 15%, Teamwork 10%, Presentation 10%
- [x] Badges automáticos en `employee_badges` / `rep_badges`
- [x] Leaderboard page
- [x] Admin ReputationPanel
- [x] Notificación automática post-clockout → "⭐ Evaluación pendiente"
- [x] PendingReviewsWidget en Dashboard
- [ ] **PENDIENTE**: Trust Score (combinación de verificación + reputación)
- [ ] **PENDIENTE**: Career levels (Bronze → Silver → Gold → Platinum → Elite)
- [ ] **PENDIENTE**: Decay de scores (reducir peso de eventos antiguos)

### 4. Cambios en base de datos
- Tables: `shift_reviews`, `rep_scores`, `rep_events`, `rep_badges`, `employee_badges`
- Enums: `rep_event_source`, `rep_event_category`
- Functions: `recalculate_rep_score()`, `trigger_shift_review_to_rep_event()`, `trigger_recalculate_rep_score()`
- Triggers: `trg_shift_review_rep`, `trg_rep_events_recalc`, `trg_review_on_clockout`

### 5. Cambios en frontend
- Components: ShiftReviewForm, ShiftReviewButton, EmployeePerformanceScore, PendingReviewsWidget, ReputationAdminPanel, ReputationProfile
- Pages: Leaderboard
- Hooks: useReputation, useEmployeeReputation

### 6. Cambios en backend
- Todo resuelto con triggers y functions de DB (no edge functions adicionales)

### 7. Dependencias
- **Fase 2**: Turnos + Clock (para saber cuándo evaluar)
- **Fase 6**: Worker Passport consume los scores

### 8. Pruebas
- Clock-out → notificación de review pendiente aparece
- Manager completa review → rep_events creados → score recalculado
- Score refleja ponderaciones correctas
- Leaderboard ordena por score
- Badge se otorga automáticamente al alcanzar criterio

### 9. Riesgos técnicos
- **Bias en reviews**: sin calibración, los scores pueden ser inconsistentes
- **Performance de triggers**: cascade de triggers (review → events → score) puede ser lento
- **Gaming**: empleados podrían manipular si tienen auto-review

### 10. Criterios de completado
- [x] Pipeline automático: clockout → notificación → review → score
- [x] Performance Score calcula correctamente con ponderaciones
- [x] Dashboard muestra reviews pendientes
- [ ] Trust Score implementado
- [ ] Career levels funcionales
- [ ] Decay de scores

**Estado: ✅ ~80% COMPLETO**

---

## FASE 6: Worker Passport

### 1. Objetivo
Perfil profesional verificado basado en historial real de trabajo. El "LinkedIn verificado" del trabajador operativo.

### 2. Módulos
- Passport profiles
- Work history (consolidado automático)
- Passport metrics (KPIs)
- Privacy controls (publicaciones)
- Consolidación automática

### 3. Funcionalidades específicas
- [x] `passport_profiles`: perfil con display_name, slug, bio, total_hours, total_jobs, reputation_score
- [x] `passport_work_history`: historial por empresa, verificado automáticamente
- [x] `passport_metrics`: KPIs (horas, trabajos, empresas, score)
- [x] `passport_publications`: controles de privacidad granulares por sección
- [x] `consolidate_passport()`: función que agrega datos de shifts + time_entries + rep_scores
- [x] `consolidate_all_passports()`: consolidación masiva
- [x] Cron semanal: `consolidate-passports-weekly` (lunes 3AM)
- [x] UI admin: WorkerPassport page con botón "Consolidar"
- [x] Toggle de visibilidad pública/privada
- [ ] **PENDIENTE**: Página pública del passport (por slug)
- [ ] **PENDIENTE**: QR code para compartir passport
- [ ] **PENDIENTE**: Verificación de habilidades por terceros
- [ ] **PENDIENTE**: Export PDF del passport

### 4. Cambios en base de datos
- Tables: `worker_profiles`, `passport_profiles`, `passport_work_history`, `passport_metrics`, `passport_publications`
- Functions: `consolidate_passport()`, `consolidate_all_passports()`
- Cron: `consolidate-passports-weekly`

### 5. Cambios en frontend
- Pages: WorkerPassport (admin)
- Hooks: useWorkerPassport, useWorkerProfile, useWorkerConsent

### 6. Cambios en backend
- Consolidation via DB functions (no edge functions)
- Cron via pg_cron

### 7. Dependencias
- **Fase 2**: Shifts + TimeClock (fuente de horas)
- **Fase 5**: Reputation Score (se incluye en passport)

### 8. Pruebas
- Consolidar passport → work history refleja empleos reales
- Métricas calculadas correctamente (horas, jobs, empresas)
- Privacidad: secciones ocultas no se muestran
- Cron ejecuta semanalmente sin errores

### 9. Riesgos técnicos
- **Data accuracy**: horas de shifts vs time_entries pueden diferir
- **Privacidad GDPR**: controles de publicación deben ser robustos
- **Performance cron**: consolidar todos los passports puede ser lento con muchos workers

### 10. Criterios de completado
- [x] Passport se genera automáticamente con datos reales
- [x] Controles de privacidad funcionales
- [x] Consolidación manual y automática funcionan
- [ ] Página pública accesible por slug
- [ ] QR code generado
- [ ] Export PDF

**Estado: ✅ ~70% COMPLETO**

---

## FASE 7: Optimización UX/UI

### 1. Objetivo
Pulir la experiencia de usuario, mejorar performance, completar PWA, y refinar el onboarding para conversión.

### 2. Módulos
- PWA completa
- Onboarding wizard
- Performance optimization
- Accessibility
- Design system refinement
- Error handling

### 3. Funcionalidades específicas
- [x] PWA manifest + service worker
- [x] App icons (192, 512)
- [x] Responsive design en todas las páginas
- [x] Error boundary global
- [x] Loading skeletons
- [x] Empty states con ilustraciones
- [ ] **PENDIENTE**: Onboarding wizard post-registro (importar empleados, config nómina)
- [ ] **PENDIENTE**: Push notifications (web push)
- [ ] **PENDIENTE**: Offline mode (service worker cache)
- [ ] **PENDIENTE**: Code splitting por ruta (lazy loading)
- [ ] **PENDIENTE**: Bundle size optimization
- [ ] **PENDIENTE**: Accessibility audit (ARIA, keyboard nav, contrast)
- [ ] **PENDIENTE**: i18n (español + inglés)
- [ ] **PENDIENTE**: Dark mode completo
- [ ] **PENDIENTE**: Capacitor: builds nativos iOS/Android
- [ ] **PENDIENTE**: Performance audit (Lighthouse >90)

### 4. Cambios en base de datos
- Ninguno significativo (esta fase es frontend-heavy)

### 5. Cambios en frontend
- Lazy imports para todas las rutas
- Service worker strategies
- i18n framework
- Accessibility improvements
- Design token refinement en index.css

### 6. Cambios en backend
- Web push subscription storage
- Push notification edge function

### 7. Dependencias
- **Fases 1-6**: Todas las features deben estar estables

### 8. Pruebas
- Lighthouse score >90 en performance, accessibility, SEO
- PWA installable en Chrome, Safari, Samsung Internet
- Offline: páginas cacheadas se muestran sin conexión
- Mobile: funcional en 320px-428px
- Accessibility: navegable por teclado, screen reader compatible

### 9. Riesgos técnicos
- **Bundle size**: el proyecto ya es grande (~40+ páginas admin)
- **Service worker bugs**: cache invalidation es complejo
- **Capacitor**: APIs nativas pueden requerir plugins específicos

### 10. Criterios de completado
- [ ] Onboarding wizard funcional
- [ ] Push notifications en PWA
- [ ] Lighthouse >90
- [ ] i18n español/inglés
- [ ] Dark mode completo

**Estado: 🔄 ~40% COMPLETO**

---

## FASE 8: Preparación para Marketplace Parceros

### 1. Objetivo
Preparar la arquitectura para el marketplace de talento Parceros: workers independientes pueden ser contratados por empresas, matching por IA, gig economy.

### 2. Módulos
- Worker profiles (marketplace-ready)
- Service categories
- Staffing requests
- AI matching/workforce
- Invoicing
- Public worker directory
- Rating cruzado (empresa↔worker)

### 3. Funcionalidades específicas
- [x] `worker_profiles` table con user_id bridge
- [x] `service_categories` para categorizar servicios
- [x] Staffing requests page
- [x] Invoicing system
- [x] AI Workforce: sugerencias de asignación por IA
- [ ] **PENDIENTE**: Worker registration flow (sin empresa)
- [ ] **PENDIENTE**: Public worker directory / search
- [ ] **PENDIENTE**: Matching algorithm (skills + location + availability + reputation)
- [ ] **PENDIENTE**: Gig/shift marketplace (empresas publican, workers aplican)
- [ ] **PENDIENTE**: Payment escrow / split
- [ ] **PENDIENTE**: Worker onboarding independiente
- [ ] **PENDIENTE**: Dual rating: empresa califica worker + worker califica empresa
- [ ] **PENDIENTE**: Prefijos `sa_*` / `pc_*` para aislar flujos
- [ ] **PENDIENTE**: API pública para integraciones externas

### 4. Cambios en base de datos
- Tables nuevas: `pc_gig_listings`, `pc_applications`, `pc_matches`, `pc_payments`
- Extensión: `worker_profiles` con campos de marketplace (hourly_rate, availability_radius, preferred_categories)
- Views: `public_worker_directory` (filtrada por privacidad)

### 5. Cambios en frontend
- Nuevo flujo de registro para workers independientes
- Marketplace UI: browse gigs, apply, track
- Dashboard worker independiente
- Perfil público del worker

### 6. Cambios en backend
- Edge function para matching AI
- Edge function para payment processing
- Stripe Connect para split payments
- API pública (ya existe `external-api` base)

### 7. Dependencias
- **Fase 1**: Auth + Profiles
- **Fase 5**: Reputation Engine (scoring para matching)
- **Fase 6**: Worker Passport (perfil verificado)
- **Fase 7**: UX pulida para conversión

### 8. Pruebas
- Worker se registra sin empresa → perfil creado
- Empresa publica gig → workers aplican → matching sugiere top candidates
- Rating cruzado funciona
- Pagos se procesan correctamente

### 9. Riesgos técnicos
- **Complejidad**: marketplace es un producto separado en sí mismo
- **Legal**: clasificación worker vs employee varía por jurisdicción
- **Pagos**: Stripe Connect compliance, KYC
- **Escalabilidad**: matching con miles de workers requiere índices optimizados

### 10. Criterios de completado
- [ ] Workers pueden registrarse independientemente
- [ ] Empresas pueden publicar gigs
- [ ] Matching AI funciona con reputation + skills + location
- [ ] Pagos procesados correctamente
- [ ] Rating cruzado funcional

**Estado: 🔜 ~10% (solo esqueleto)**

---

## Análisis Estratégico

### 🔴 Partes más críticas para estabilidad

1. **Autenticación + Roles + RLS** (Fase 1) — Si falla, todo falla. Escalación de privilegios es el riesgo #1.
2. **Consolidación de nómina** (Fase 4) — Errores en cálculo de pay = problemas legales.
3. **Clock-in/out + GPS** (Fase 2) — Es la fuente de verdad para horas trabajadas.
4. **Multi-tenancy isolation** (Fase 1) — Fuga de datos entre empresas es catastrófico.

### 🟡 Partes para probar primero con usuarios reales

1. **Portal del empleado** (Fase 3) — Es la cara del producto para el 90% de usuarios.
2. **Flujo de turnos** (Fase 2) — Crear → asignar → notificar → fichar.
3. **Importación de Excel** (Fase 4) — Cada empresa tiene formatos diferentes.
4. **Onboarding self-service** (Fase 7) — Primera impresión = conversión.

### 🟢 Partes que pueden esperar

1. **Capacitor native builds** — PWA es suficiente para MVP
2. **i18n** — Mercado inicial es hispanohablante
3. **Marketplace Parceros** — Producto separado, priorizar SaaS primero
4. **Dark mode** — Nice-to-have, no crítico
5. **Career levels y Trust Score** — Pueden lanzarse post-MVP
6. **API pública** — Solo necesaria cuando haya integraciones externas

### 🚀 Funcionalidades para primera versión funcional (MVP)

| # | Funcionalidad | Fase |
|---|--------------|------|
| 1 | Auth admin + empleado | 1 |
| 2 | Gestión de empresa + roles | 1 |
| 3 | CRUD empleados | 1 |
| 4 | CRUD clientes + ubicaciones | 2 |
| 5 | Crear + asignar turnos | 2 |
| 6 | Clock-in/out con GPS | 2 |
| 7 | Portal empleado básico (turnos + clock) | 3 |
| 8 | Importar horas | 4 |
| 9 | Consolidar base pay | 4 |
| 10 | Resumen de periodo + export | 4 |

> **Con estos 10 items una empresa puede operar su día a día completo.**

---

## Orden de Implementación Recomendado

```
Fase 1 (Fundación) ✅
    ↓
Fase 2 (Operación) ✅
    ↓
Fase 4 (Nómina) ✅         ← Paralelo con Fase 3
Fase 3 (Portal) ✅          ← Paralelo con Fase 4
    ↓
Fase 5 (Reputation) ✅
    ↓
Fase 6 (Passport) ✅
    ↓
Fase 7 (UX/UI Polish) 🔄   ← Hacer ANTES de Fase 8
    ↓
Fase 8 (Parceros) 🔜       ← Solo cuando SaaS esté sólido
```

### Dependencias críticas

```
Auth (F1) ──→ Todo
Empleados (F1) ──→ Turnos (F2) ──→ Clock (F2) ──→ Nómina (F4)
                                        ↓
                                  Reviews (F5) ──→ Passport (F6)
                                        ↓
                                  Matching AI (F8)
```

---

> **Próximos pasos inmediatos**: Completar los pendientes de Fases 2-6 (fichaje con foto, trust score, página pública passport, validación con datos reales) y luego enfocarse en Fase 7 (onboarding wizard, push notifications, performance).
