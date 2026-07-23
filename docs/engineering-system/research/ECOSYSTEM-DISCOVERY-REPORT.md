# ECOSYSTEM DISCOVERY REPORT

**Fecha:** 2026-07-23
**Autor:** Principal Architect + Auditor (read-only)
**Estado:** ✅ Auditoría descriptiva. Cero código, cero migraciones, cero refactor.
**Alcance:** Observación estructural del ecosistema Stafly + Parceros a partir de código, tablas, hooks, rutas, Edge Functions y documentación existente.

> **Regla de la sesión.** Este documento **no diseña** el futuro. Solo describe la realidad. Cada afirmación se etiqueta como:
> - ✅ **Hecho** — verificable en código o esquema.
> - 🟡 **Inferencia** — deducción razonable a partir de hechos concordantes.
> - 🔴 **Hipótesis** — interpretación que requiere validación posterior.

---

## Índice
- Parte 1 — Modelo Conceptual (1–8)
- Parte 2 — Arquitectura (9–14)
- Parte 3 — Evaluación Estratégica (15–17)
- Parte 4 — Reflexión Final: el ecosistema emergente

---

# PARTE 1 · MODELO CONCEPTUAL

## 1. Persona

### ✅ Hechos

Una misma "persona" puede estar representada simultáneamente por **hasta 7 entidades** en el sistema actual:

| Representación | Tabla / origen | Rol |
|---|---|---|
| Cuenta de autenticación | `auth.users` (Supabase Auth) | Identidad de login (JWT). Existe solo si la persona se autenticó alguna vez. |
| Perfil de plataforma | `profiles` | Datos ligeros vinculados a `auth.users`. |
| Empleado del tenant | `employees` (84 columnas) | Persona operativa dentro de una `company`. Puede existir **sin** `user_id` (empleado importado, aún no invitado). |
| Alias del empleado | `employee_aliases` | Nombres alternativos observados en imports/reconciliation. |
| Perfil de ecosistema | `worker_profiles` | Perfil portable cross-tenant (skills, idiomas, experiencia, visibilidad). |
| Pasaporte público | `passport_profiles` (+ `passport_work_history`, `passport_metrics`, `passport_publications`) | Vitrina pública gateada por slug. |
| Candidato / applicant | `job_applications`, `contractor_w9`, `document_intake_items` | Persona en proceso de ingreso. |
| Invitado pendiente | `employee_invitations` | Persona conocida por email/teléfono, sin `auth.users` todavía. |
| Empleado histórico | `employee_archive_records`, `historical_payroll_entries` | Persona sin cuenta activa pero con evidencia de trabajo. |

### 🟡 Inferencias

- **No existe una identidad canónica única.** El "puente" oficial más frecuente en código es la triple llave `employees.user_id` ↔ `auth.users.id` ↔ `worker_profiles.user_id`, pero:
  - `employees.user_id` es **nullable** (evidencia: `useEmployeeInvitations`, `WorkerDuplicates`, `EmployeeMerge`).
  - `worker_profiles.user_id` puede aterrizar antes o después de crear el `employee`.
  - `worker_profiles.employee_id` existe **paralelamente** a `user_id` (doble camino de resolución).
- La resolución de identidad se hace **por búsqueda difusa** en `useIdentityResolution.ts` y en las páginas `WorkerDuplicates`, `EmployeeMerge`, `UnifiedPersonProfile` — señal de que la unicidad no está garantizada estructuralmente.

### 🔴 Hipótesis

- La persona **no es una entidad**; es un **acuerdo emergente** entre 3 subsistemas (Auth, Employees-por-tenant, Worker Profile ecosistémico) unificados a posteriori por herramientas de merge.

---

## 2. Organización

### ✅ Hechos

| Concepto | Tabla | Qué representa |
|---|---|---|
| Tenant / empresa operadora | `companies` (31 columnas) | Aislamiento multi-tenant. Contiene `status`, `source`, `is_test`, `is_demo`, `brand_color`, `logo_url`, `slug`, `invite_code`. |
| Sub-configuración por tenant | `company_settings`, `company_modules`, `company_financial_policies`, `company_compensation_rules`, `company_cutover_dates`, `company_users` | Configuración modular activable por tenant. |
| Cliente final (a quien se factura) | `clients` + `billing_clients` + `billing_client_locations` + `client_contacts` | **Dos capas separadas** (ver §12). |
| Ubicaciones operativas | `locations`, `locations_v2` | Sitios donde ocurre el trabajo. Coexisten dos versiones. |
| Cuenta SaaS / suscripción | `subscriptions`, `promo_codes`, `promo_redemptions` | Facturación de Stafly a la company. |

### 🟡 Inferencias

- `companies` **modela dos cosas al mismo tiempo**: (a) tenant de plataforma y (b) empresa comercial suscrita. La misma tabla contiene flags de aislamiento (`is_test`, `is_demo`, `status='suspended'`) y flags comerciales (`source`).
- **No existe una entidad "Provider" ni "Partner" ni "Recruiter"** como tabla propia. Estos roles están:
  - En **rutas de producto** (`/parceros`, `PublicPassport`, `Refer`) sin respaldo de una entidad organizacional distinta.
  - En **relaciones** dentro de `worker_profiles` (pasaporte cross-tenant) y `worker_client_preferences` (afinidad worker↔cliente).

### 🔴 Hipótesis

- La única organización real es `companies`. Toda otra forma organizacional (partner, recruiter, marketplace) es una **superficie de UI** proyectada sobre las mismas entidades.

---

## 3. Relación persona ↔ organización

### ✅ Hechos

La relación **no está unificada**. Vive distribuida en al menos 6 tablas:

| Relación | Tabla | Qué expresa |
|---|---|---|
| Empleado de tenant | `employees.company_id` | Vínculo operativo autoritativo. |
| Rol de usuario en tenant | `user_roles(user_id, company_id, role)` | Autorización (`app_role` enum, chequeada por `has_role`). |
| Vínculo user↔company | `company_users(user_id, company_id)` | Membresía plana usada por `useCompany` para no-admins. |
| Rol de aplicante | `job_applications` | Persona candidata a un tenant. |
| Preferencias worker↔cliente | `worker_client_preferences` | Afinidad/exclusión worker↔billing_client. |
| Contratista fiscal | `contractor_w9` | Persona como contratista W-9 de un tenant. |

### 🟡 Inferencias

- Hay **tres fuentes de verdad para "esta persona pertenece a este tenant"**:
  1. `employees.company_id` (operativa).
  2. `user_roles.company_id` (autorización).
  3. `company_users.company_id` (membresía visible en `useCompany`).
- Los tres deben estar consistentes; no hay evidencia de un constraint que lo garantice.

### 🔴 Hipótesis

- El sistema modela la relación como **rol funcional + membresía + payload operativo**, sin un contrato explícito de "Membership". Esto explica por qué `WorkerDuplicates` y `EmployeeMerge` son piezas críticas.

---

## 4. Identidad

### ✅ Hechos

Existen **múltiples identificadores canónicos coexistentes**:

- `auth.users.id` — identidad de sesión (JWT).
- `employees.id` — identidad operativa por tenant.
- `worker_profiles.id` — identidad ecosistémica cross-tenant.
- `passport_profiles.slug` — identidad pública.
- `employees.employee_number` + `employee_aliases` — identidad legacy/import (Connecteam).
- `contractor_w9.id` — identidad fiscal.

Piezas de código que evidencian la fragmentación:
- `src/hooks/useIdentityResolution.ts`
- `src/pages/admin/WorkerDuplicates.tsx`
- `src/pages/admin/EmployeeMerge.tsx`
- `src/pages/admin/UnifiedPersonProfile.tsx`
- `docs/ECOSYSTEM_PROFILE_STANDARD.md` (declara explícitamente el modelo de 4 capas L1–L4).

### 🟡 Inferencias

- La identidad **canónica declarada** por la documentación es el modelo de 4 capas (`profile-layers.ts`): L1 fiscal, L2 tenant, L3 ecosistema, L4 público.
- La identidad **canónica implementada** todavía es el `employee` por tenant. `worker_profile` existe pero solo se lee en superficies de Parceros/Passport (evidencia: solo `useWorkerProfile`, `useWorkerPassport`, `useWorkerConsent` lo consumen).

### 🔴 Hipótesis

- El sistema está en **transición documentada pero no ejecutada** desde una identidad tenant-céntrica (`employees`) hacia una identidad ecosistémica (`worker_profiles`). El estándar E1 (`docs/ECOSYSTEM_PROFILE_STANDARD.md`) marca los componentes explícitamente como `foundation-only — do not wire until E2`.

---

## 5. Pasaporte

### ✅ Hechos

El "Passport" existe como **subdominio completo** con 4 tablas dedicadas:

| Tabla | Contenido observado |
|---|---|
| `passport_profiles` (15 col, 4 policies) | Perfil público accesible por `slug`. Vinculado por `worker_profile_id`. |
| `passport_work_history` (11 col) | Historial de experiencia publicable. |
| `passport_metrics` (7 col) | Métricas ordenables (`sort_order`). |
| `passport_publications` (12 col) | Publicaciones/portfolio. |

Tablas de soporte:
- `worker_visibility_settings` — controla qué se expone.
- `worker_consent_records` — versionado de consentimientos.
- `profile_verification_log` — trazabilidad de verificaciones.
- `profile_access_log` — auditoría de lecturas.

Superficies:
- `src/pages/PublicPassport.tsx` — vitrina pública.
- `src/pages/admin/WorkerPassport.tsx` — vista admin.
- `src/hooks/useWorkerPassport.tsx` — lectura por slug o por `worker_profile_id`.

### 🟡 Inferencias

- El pasaporte intenta resolver **portabilidad de reputación** cross-tenant.
- La responsabilidad declarada es **separar la vitrina pública de la operativa**: el pasaporte **no** contiene payroll ni PII sensible.
- El sistema conserva **evidencia de acceso** (`profile_access_log`) sugiriendo que el pasaporte se considera un recurso protegido incluso siendo público.

### 🔴 Hipótesis

- El pasaporte está diseñado como **superficie de confianza portátil**, no como perfil social. Su valor no es "quién soy" sino "qué he demostrado en el ecosistema".

---

## 6. Evidencias

### ✅ Hechos — dónde viven las evidencias verificables

| Categoría | Tabla(s) |
|---|---|
| Turnos planificados | `scheduled_shifts`, `shifts`, `shift_role_slots`, `shift_assignments` |
| Fichaje GPS | `clock_events`, `clock_alerts`, `location_events`, `location_sessions`, `location_presence` |
| Horas autoritativas | `time_entries` |
| Cierre operativo | `shift_closeout_reports`, `closure_quality_log`, `shift_reviews`, `shift_review_tags`, `review_scores`, `review_dimension_scores` |
| Consolidación de pago | `period_base_pay`, `payroll_adjustments`, `payroll_interpreted_entries`, `payroll_rate_snapshots`, `payroll_review_notes`, `historical_payroll_entries` |
| Reconciliación externa | `reconciliation_*` (25+ tablas) |
| Facturación | `invoices`, `invoice_lines`, `invoice_payments`, `invoice_activity_log`, `billable_service_blocks` |
| Documentos | `employee_documents`, `worker_documents`, `application_documents`, `document_intake_batches`, `document_intake_items`, `document_review_events`, `contractor_w9`, `tax_forms_1099` |
| Reputación | `rep_scores`, `rep_events`, `rep_badges`, `rep_worker_badges`, `review_flags` |
| Auditoría transversal | `activity_log`, `sensitive_data_audit_log`, `finance_audit_log`, `shift_audit_log`, `truth_resolution_log` |
| Comunicaciones | `announcements`, `channel_messages`, `chat_messages`, `client_messages`, `internal_messages`, `notifications` |
| Reclutamiento | `job_applications`, `employee_invitations`, `flash_jobs`, `flash_job_responses` |

### 🟡 Inferencia

Las evidencias están **fuertemente distribuidas** y **duplicadas por diseño defensivo**: existe casi siempre una tabla nativa + una tabla de auditoría + una tabla de reconciliación paralela.

---

## 7. Evolución

### ✅ Hechos

Existen múltiples **rastros de evolución de una persona**, aunque nunca se declaró como tal:

- `employee_archive_records` — historia de reingreso/salida.
- `historical_payroll_entries` — histórico de compensación.
- `rep_scores` + `rep_events` — reputación agregada y evento por evento.
- `passport_work_history` — narrativa profesional publicable.
- `worker_experience_records` — experiencia declarada.
- `compensation_change_log`, `compensation_analysis_summary` — evolución económica.
- `activity_log` — evolución conductual.
- `truth_resolution_log` — evolución de qué "verdad" ganó en cada resolución.

### 🟡 Inferencias

- El sistema **acumula historia por defecto** (soft delete, snapshots, event logs).
- No existe una **timeline unificada de la persona**; existen 8+ streams paralelos que un consumidor debería componer.

### 🔴 Hipótesis

- El sistema **ya se comporta como un ecosistema con memoria**, aunque nunca se haya diseñado una entidad "carrera" o "trayectoria". La evolución **emerge** de la persistencia agresiva de eventos.

---

## 8. Consentimiento

### ✅ Hechos

Piezas explícitas:
- `worker_consent_records` (11 col, 4 policies) — versionado por `consent_type` + `document_version`, con `granted_at`, `revoked_at`, `user_agent`.
- `worker_visibility_settings` (15 col) — control granular de qué se publica.
- `notification_preferences` — consentimiento de canales.
- `email_unsubscribe_tokens`, `suppressed_emails` — consentimiento negativo verificable.
- `data_export_requests` — GDPR-style export.
- `profile_verification_log`, `profile_access_log` — auditoría de accesos.
- `.lovable/memory/features/portal/parceros-consent-adoption-e5-8.md` — memoria de un proceso de adopción de consentimientos.
- `useWorkerConsent.tsx` — API `grantConsent` / `revokeConsent` / `hasConsent`.

### 🟡 Inferencias

- El consentimiento está modelado como **evento revocable versionado**, no como flag booleano.
- Es un pilar del sub-modelo Passport/Parceros, no del sub-modelo Staffing operativo (los `employees` no requieren consentimiento explícito para su company).

### 🔴 Hipótesis

- El sistema entiende consentimiento como **frontera entre "trabajar para un tenant" (contrato laboral implícito) y "aparecer en el ecosistema" (elección explícita del trabajador)**. Son dos regímenes distintos.

---

# PARTE 2 · ARQUITECTURA

## 9. Flujo completo de una persona

**Reconstrucción a partir de rutas, hooks y tablas observadas.** ✅ Hechos con 🟡 inferencias marcadas.

```
[ Descubrimiento ]
  Landing / PublicLanding / Refer / Apply
        │ (job_applications, referral-submit edge fn)
        ▼
[ Aplicación ]
  Apply.tsx → job_applications (49 col)
  document-intake-extract → document_intake_items
  resolve-applicant-identity → intento de match contra employees / worker_profiles
        │
        ▼
[ Invitación ]
  employee_invitations (22 col) ← creada por InviteEmployees / bulk-portal-invite
  send-invite-email / send-employee-credentials edge fns
  invitation → token → AcceptInvite.tsx / JoinCompany.tsx / ActivateAccount.tsx
        │
        ▼
[ Activación ]
  Auth.tsx → auth.users (Supabase Auth)
  AuthCallback.tsx → profiles + company_users + user_roles
  CompleteProfile.tsx → employees (link user_id) + worker_profiles
        │
        ▼
[ Onboarding ]
  EmployeeOnboarding.tsx / OnboardingWizard.tsx
  employee_onboarding_documents, worker_documents, contractor_w9
        │
        ▼
[ Relación operativa ]
  employees.company_id + user_roles(role, company_id)
  concept_employee_rates, compensation_profiles
        │
        ▼
[ Trabajo ]
  service_requests → shifts / scheduled_shifts → shift_role_slots
  shift_assignments (worker↔shift)
  shift_attendance_confirmations
        │
        ▼
[ Fichaje ]
  PortalClock.tsx / KioskDevices / front-desk-checkin edge fn
  clock_events (GPS) + time_entries (autoritativo)
  clock_alerts, location_events, location_presence
        │
        ▼
[ Cierre ]
  shift_closeout_reports, shift_reviews, review_scores
  closure_quality_log, truth_resolution_log
        │
        ▼
[ Consolidación de pago ]
  payroll-consolidate edge fn → RPC consolidate_period_base_pay
  period_base_pay, payroll_adjustments, movements
  payroll_review_notes → PayrollReviewQueue
        │  (paralelo: reconciliation_* stack — Connecteam)
        ▼
[ Documentos fiscales ]
  contractor_w9, tax_forms_1099
        │
        ▼
[ Facturación al cliente ]  ─── paralelo ───
  billable_service_blocks, billing_events → invoices → invoice_payments
        │
        ▼
[ Reputación e historia ]
  rep_scores/rep_events → worker_profiles
  passport_profiles + passport_work_history + passport_metrics
  employee_archive_records si sale
        │
        ▼
[ Reingreso ]
  WorkerDuplicates + EmployeeMerge + useIdentityResolution
  reutiliza worker_profile existente; crea nuevo employees si es nuevo tenant
```

**🟡 Inferencia clave.** El flujo real está diseñado para que la persona **entre múltiples veces** desde puntos distintos (referral, apply, invite, kiosk walk-in, migration import) y sea **fusionada a posteriori**.

---

## 10. Mapa Conceptual

| Entidad | Responsabilidad | Qué representa | Quién la modifica | Quién la consume | Relaciones clave | Madurez |
|---|---|---|---|---|---|---|
| `auth.users` | Autenticación | Identidad de sesión | Supabase Auth | Todo | ↔ `profiles`, `employees`, `worker_profiles` | ✅ Estable |
| `profiles` | Perfil ligero | Datos básicos post-login | AuthCallback | UI genérica | 1↔1 con `auth.users` | ✅ Estable |
| `companies` | Tenant + empresa comercial | Aislamiento + branding | Admin/Owner | Todo | 1↔N con casi todo | ⚠️ Sobrecargada |
| `company_users`, `user_roles` | Membresía + autorización | Persona↔tenant + rol | Admin | `useCompany`, `has_role` | ↔ `auth.users`, `companies` | 🟡 Paralelas |
| `employees` (84 col) | Empleado operativo por tenant | Trabajador de una company | Admin, self | Todo staffing | ↔ `user_id`, `worker_profiles.employee_id` | ⚠️ Sobrecargada |
| `employee_aliases` | Alias legacy | Nombres alternativos | Import/Reconciliation | Matching | ↔ `employees` | ✅ Estable |
| `employee_invitations` | Invitación pendiente | Persona pre-activación | Admin | AcceptInvite | ↔ email/phone | ✅ Estable |
| `worker_profiles` | Perfil ecosistémico | Identidad cross-tenant | Worker | Parceros, Passport | ↔ `user_id`, `employee_id` | 🟡 Adopción parcial |
| `worker_visibility_settings` | Control de exposición | Qué publica | Worker | Passport, Parceros | ↔ `worker_profiles` | ✅ Estable |
| `worker_consent_records` | Consentimientos versionados | Autorización granular | Worker | Passport, Parceros | ↔ `worker_profiles` | ✅ Estable |
| `worker_profile_skills`, `worker_languages`, `worker_experience_records`, `worker_documents` | Payload ecosistémico | Skills/idiomas/exp | Worker | Passport, Parceros | ↔ `worker_profiles` | ✅ Estable |
| `passport_profiles` (+3) | Vitrina pública | Reputación portátil | Worker + system | PublicPassport | ↔ `worker_profiles` | 🟡 En despliegue |
| `contractor_w9`, `tax_forms_1099` | Fiscal L1 | Datos fiscales | Worker + admin | Payroll, invoicing | ↔ `employees` | ✅ Estable |
| `service_requests` | Demanda del cliente | Solicitud original | Admin/Cliente | Scheduling | ↔ `clients`, `shifts` | 🟡 Opcional |
| `shifts` vs `scheduled_shifts` | Turno productivo vs planificado | Ambos co-existen | Admin | Todo staffing | Solapan | ⚠️ Ambiguo |
| `shift_assignments` | worker↔turno | Vínculo asignado | Admin/Auto-dispatch | Todo staffing | ↔ `employees`, `shifts` | ✅ Estable |
| `clock_events` vs `time_entries` | Evidencia GPS vs verdad de horas | Dos capas | Portal/Kiosk | Payroll | `clock_events` no alimenta RPC | ⚠️ Ambiguo |
| `period_base_pay` | Base pay consolidado | Salida del RPC | Edge fn | PayrollReview | ↔ `pay_periods` | ✅ Estable |
| `movements` | Novedades de nómina | Ajustes | Admin | Payroll | ↔ `employees` | ✅ Estable |
| `reconciliation_*` (25+) | Verdad externa | Connecteam import | Migration/Import | Payroll paralelo | ↔ `employees`, `time_entries` | 🟡 Paralela |
| `invoices`, `invoice_lines`, `billable_service_blocks` | Facturación cliente | Ingresos | Admin | Invoicing | ↔ `billing_clients` | ✅ Estable |
| `clients` vs `billing_clients` | Cliente operativo vs fiscal | Dos capas | Admin | Requests/Invoicing | Solapan | ⚠️ Duplicidad |
| `locations` vs `locations_v2` | Sitios | Dos versiones | Admin | Scheduling | Solapan | ⚠️ Duplicidad |
| `activity_log`, `sensitive_data_audit_log`, `finance_audit_log`, `shift_audit_log`, `truth_resolution_log`, `profile_access_log` | Auditoría | Trazabilidad | Sistema | Compliance | Transversal | ✅ Fuerte |

---

## 11. Fuentes de verdad

| Dato | Fuente principal (✅) | Fuentes secundarias observadas | Riesgo |
|---|---|---|---|
| Email | `auth.users.email` | `employees.email`, `profiles.email`, `worker_profiles`, `employee_invitations.email` | Divergencia |
| Teléfono | `employees.phone` | `worker_profiles`, `employee_invitations`, `contractor_w9` | Divergencia |
| Nombre legal | `employees.legal_name` | `contractor_w9`, `employees.first_name/last_name`, aliases | Divergencia |
| Display name | `worker_profiles.display_name` | `passport_profiles`, `employees` | Divergencia baja |
| Foto | `employees.avatar_url` (🟡) | `worker_profiles`, `passport_profiles` | Divergencia baja |
| Documentos genéricos | `worker_documents` | `employee_documents`, `application_documents`, `document_intake_items` | 4 buzones distintos |
| W-9 | `contractor_w9` | `employee_onboarding_documents` (referencia) | ✅ Único |
| Skills | `worker_profile_skills` | — | ✅ Único |
| Horas trabajadas | `time_entries` (RPC nativo) | `clock_events`, `reconciliation_final_records`, `historical_payroll_entries` | 🟡 Doble truth set |
| Base pay | `period_base_pay` | `reconciliation_final_records`, `historical_payroll_entries`, `payroll_interpreted_entries` | 🟡 Doble camino |
| Reputación | `rep_scores` | `review_scores`, `passport_metrics` | Derivada |
| Rol en tenant | `user_roles` | `company_users`, `employees.role_template` | 🟡 Triple |
| Cliente | `billing_clients` (facturación) | `clients` (operativo) | ⚠️ Duplicidad |
| Ubicación | `locations_v2` (🟡 nueva) | `locations` (legacy) | ⚠️ Duplicidad |
| Employee ID canónico | `employees.id` | `employees.employee_number`, `employee_aliases`, `worker_profiles.employee_id`, migration mappings | Múltiple |

---

## 12. Duplicidades

### ✅ Hechos

1. **Persona.** `employees`, `worker_profiles`, `passport_profiles`, `contractor_w9`, `job_applications`, `employee_invitations`, `profiles` — 7 representaciones.
2. **Turnos.** `shifts` ↔ `scheduled_shifts` (glosario oficial marca la ambigüedad como no resuelta).
3. **Horas.** `time_entries` (nativo) ↔ `reconciliation_final_records` (Connecteam) ↔ `historical_payroll_entries` (import histórico).
4. **Payroll.** `period_base_pay` ↔ `payroll_interpreted_entries` ↔ `reconciliation_final_records`.
5. **Cliente.** `clients` (operativo) ↔ `billing_clients` (fiscal) ↔ `billing_client_locations`.
6. **Ubicación.** `locations` ↔ `locations_v2`.
7. **Documentos.** `employee_documents` ↔ `worker_documents` ↔ `application_documents` ↔ `document_intake_items` ↔ `employee_onboarding_documents`.
8. **Mensajería.** `announcements`, `channel_messages`, `chat_messages`, `client_messages`, `internal_messages`, `conversations`, `client_conversation_threads`, `channel_members`, `conversation_members`, `shift_chat_messages`.
9. **Reputación.** `rep_scores`/`rep_events`/`rep_badges` ↔ `review_scores`/`review_dimension_scores`/`review_submissions` ↔ `shift_reviews`.
10. **Command Centers de UI.** `CommandCenter`, `CommandCenterHub`, `DevCommandCenter`, `MigrationCommandCenter`, `OperationsCommandCenter`, `FrontDeskHub`, `KioskHub`, `AdminHub`, `OpsHome`, `Today`, `TodayView`, `DailyOps`, `Dashboard`, `OwnerDashboard`.
11. **Import.** `ImportWizard`, `ImportConnecteam`, `ImportSchedule`, `ImportTimeClock`, `ImportPayrollExtras`, `ImportReview`, `ImportInactiveEmployees`, `BulkImportShifts`, `InvoicingClientsImport`.
12. **Membresía persona↔tenant.** `employees.company_id`, `user_roles.company_id`, `company_users.company_id`.

---

## 13. Fragmentación

**Conceptos representados por múltiples modelos:**

| Concepto | Modelos concurrentes | Naturaleza de la fragmentación |
|---|---|---|
| Identidad | 4 capas L1–L4 documentadas, ~7 tablas | Vertical (layered) + horizontal (por tenant) |
| Turno | `shifts` + `scheduled_shifts` + `shift_role_slots` + `staffing_requests` + `service_requests` + `service_request_shift_links` | Ciclo de vida distribuido |
| Verdad de horas | Nativa vs Reconciliation vs Legacy | Doble truth set con guardrails cruzados |
| Cliente | Operativo (`clients`) vs Fiscal (`billing_clients`) | Ley operativa vs ley fiscal |
| Comunicación | 10+ tablas de mensajes | Por canal, no por conversación |
| Reputación | 3 sistemas (rep_*, review_*, passport_metrics) | Por audiencia (interno / evaluación formal / público) |
| Command Center | 14+ páginas de "home" | Por rol y por superficie |
| Onboarding | `job_applications` + `employee_invitations` + `application_configs` + `application_events` + `application_documents` + `document_intake_*` | Por origen de entrada |

---

## 14. Modelo Emergente

### 🔴 Interpretación (hipótesis principal del reporte)

El código no describe una aplicación de staffing. Describe un **ecosistema de trabajo distribuido con memoria**, cuya estructura implícita parece ser:

```
                     ┌────────────────────────────┐
                     │       PERSONA (L1–L4)      │
                     │  identidad multicapa con   │
                     │  consentimiento versionado │
                     └─────────────┬──────────────┘
                                   │  N:M  (con evidencia + consentimiento)
                     ┌─────────────▼──────────────┐
                     │      RELACIÓN OPERATIVA    │
                     │  employee ↔ company        │
                     │  applicant, invitee,       │
                     │  contractor, alumni        │
                     └─────────────┬──────────────┘
                                   │
                     ┌─────────────▼──────────────┐
                     │        EVIDENCIA           │
                     │  turnos, fichajes, horas,  │
                     │  reviews, documentos,      │
                     │  reputación, pagos         │
                     └─────────────┬──────────────┘
                                   │  (proyectada al ecosistema)
                     ┌─────────────▼──────────────┐
                     │       PASAPORTE PÚBLICO    │
                     │  reputación portable       │
                     │  gateada por consent       │
                     └────────────────────────────┘
```

**Observaciones que sostienen esta lectura:**
- La persistencia agresiva de historia (§7) muestra intención de **memoria de largo plazo**.
- La existencia de `worker_profiles` **desacoplado de `employees`** revela que el sistema ya no ve al trabajador como propiedad de un tenant.
- El `passport_profiles` implementa la conclusión lógica: la reputación **sobrevive al tenant**.
- Los `worker_consent_records` versionados formalizan que el trabajador **cede visibilidad selectivamente**, no acceso permanente.

---

# PARTE 3 · EVALUACIÓN ESTRATÉGICA

## 15. Capacidades del ecosistema

| Capacidad | Cobertura | Madurez | Fortalezas | Limitaciones |
|---|---|---|---|---|
| Identidad multicapa | L1 ✅ L2 ✅ L3 🟡 L4 🟡 | 🟡 Documentada, adopción parcial | Estándar formal (`profile-layers.ts`) | No wired en producción |
| Organizaciones | 1 tipo (`companies`) | ✅ Alta | Aislamiento RLS sólido | Sobrecargada (tenant+comercial) |
| Relaciones persona↔org | 3 modelos paralelos | ⚠️ Media | Multi-rol soportado | Sin contrato Membership unificado |
| Documentos | 5 buzones distintos | 🟡 Media | Auditoría fuerte | Sin repositorio único |
| Confianza / Reputación | 3 subsistemas | 🟡 Media | Multi-audiencia | Sin agregador canónico |
| Oportunidades | `flash_jobs`, `service_requests`, `staffing_requests`, `shift_requests` | 🟡 Media | Múltiples entradas | Sin funnel unificado |
| Payroll | Nativo + Reconciliation | ✅ Alta operacional | RPC con anti-fraude | Doble truth set |
| Asistencia | GPS + Kiosk + Front Desk + Portal | ✅ Alta | Multi-canal | `clock_events` no autoritativo |
| Comunicación | 10+ tablas | ⚠️ Fragmentada | Cobertura amplia | Sin thread canónico |
| Campañas / Anuncios | `announcements`, `announcement_reactions` | ✅ Media | — | — |
| Reclutamiento | `job_applications` + intake pipeline | ✅ Media | Con `application_configs` | Aislado del passport |
| Servicios (catálogo) | `service_categories`, `service_request_items` | ✅ Media | — | — |
| Verificación | `profile_verification_log`, `worker_consent_records` | ✅ Sólida | Trazabilidad completa | — |
| Passport / portabilidad | 4 tablas + slug + RPC público | 🟡 En despliegue | Diseño limpio L4 | Adopción incipiente |
| Auditoría | 6+ logs transversales | ✅ Excelente | — | Ausencia de dashboard unificado |
| Multi-tenant | RLS + `has_role` + `user_roles` | ✅ Excelente | Patrón canónico | 3 fuentes de membresía |
| Facturación cliente | `invoices` + service blocks | ✅ Alta | — | Desacoplada de payroll |
| SaaS billing | Stripe + `subscriptions` | ✅ Estable | — | — |

---

## 16. Fortalezas / principios que parecen ya existir

### ✅ Hechos observados como patrones recurrentes

1. **Trazabilidad por defecto** — cada mutación importante tiene su log (`activity_log`, `sensitive_data_audit_log`, `finance_audit_log`, `shift_audit_log`, `truth_resolution_log`, `profile_access_log`, `invoice_activity_log`).
2. **Multitenancy consistente** — `company_id` presente en la mayoría de tablas + RLS + `has_role` como patrón canónico.
3. **Separación de identidad tenant vs ecosistémica** — `employees` ↔ `worker_profiles` es una decisión estructural intencional.
4. **Consentimiento versionado** — no booleano, sino evento con `document_version`, `user_agent`, `revoked_at`.
5. **Anti-fraude declarativo** — el RPC de payroll expone `>16h` guardrail; el `truth_resolution_log` registra qué fuente ganó.
6. **Modularidad por tenant** — `company_modules` permite activar capacidades sin desplegar código.
7. **Estándares documentados** — `ECOSYSTEM_PROFILE_STANDARD.md`, `DATABASE_ARCHITECTURE.md`, engineering-system (CAP-001, VS-001, MRI-001).
8. **Reintento y merge asumidos** — `WorkerDuplicates`, `EmployeeMerge`, `useIdentityResolution` reconocen que la fragmentación es normal.
9. **Historia inmutable** — soft delete, snapshots (`payroll_rate_snapshots`), archives (`employee_archive_records`).
10. **Frontera fiscal aislada** — `contractor_w9`, `tax_forms_1099` no se mezclan con datos operativos.

---

## 17. Inconsistencias (solo documentación, sin propuesta)

1. **Doble modelo de turno** `shifts` vs `scheduled_shifts` — glosario lo marca ⚠️ Ambiguo.
2. **Doble truth set de horas** nativo vs Connecteam/Reconciliation (MRI-001).
3. **Doble entidad Cliente** `clients` (operativo) vs `billing_clients` (fiscal).
4. **Doble entidad Ubicación** `locations` vs `locations_v2`.
5. **Triple membresía persona↔tenant** `employees`, `user_roles`, `company_users` sin constraint cruzado.
6. **Fragmentación de documentos** 5 buzones distintos sin repositorio unificado.
7. **Fragmentación de mensajería** 10+ tablas, sin thread canónico.
8. **Fragmentación de reputación** 3 subsistemas (`rep_*`, `review_*`, `passport_metrics`).
9. **Onboarding fragmentado** por origen (apply/invite/import/kiosk) sin funnel único.
10. **Command Centers duplicados** — 14+ páginas "home" en admin/portal.
11. **Ambigüedad "billing"** — SaaS (`subscriptions`) vs cliente final (`invoices` + `billing_clients`).
12. **`companies` sobrecargada** como tenant y como cuenta comercial.
13. **Estándar E1 no wired** — `profile-layers.ts` + componentes `foundation-only` desde hace ≥1 sprint.
14. **Cierre operacional sin flag único** — se compone de 5+ señales según VS-001.
15. **Passport aún no es fuente canónica** — el glosario lo marca 🔴 Insufficient.
16. **`worker_profiles` con doble puente** (`user_id` + `employee_id`) sin política de precedencia declarada.
17. **`clock_events` no alimenta el RPC de payroll** — pero es la superficie con más UX de fichaje.

---

# PARTE 4 · REFLEXIÓN FINAL — Ecosystem Discovery Report

## ¿Qué ecosistema ya existe?

Existe, hoy, un **ecosistema de trabajo con memoria portátil** compuesto por:

- Una **identidad multicapa** (L1 fiscal, L2 tenant, L3 ecosistema, L4 público) parcialmente construida, con la infraestructura de tablas ya lista.
- Un **tejido de organizaciones** modelado por una sola entidad (`companies`) que se comporta simultáneamente como tenant técnico y como cuenta comercial.
- Un **conjunto denso de relaciones** persona↔organización distribuidas en tres modelos paralelos (operativo, autorización, membresía).
- Una **arquitectura de evidencia** con historia inmutable, auditoría transversal, doble verificación (nativo + reconciliation) y anti-fraude declarativo.
- Un **subsistema de reputación portátil** (Passport) que ya trata al trabajador como sujeto que sobrevive al tenant, con consentimientos versionados.
- Un **motor operativo de staffing** (service_requests → shifts → assignments → clock → payroll → invoicing) sólido pero con puntos de ambigüedad conocidos y documentados.

## ¿Qué filosofía parece emerger del código?

Del código emergen —**sin haber sido enunciadas**— cinco convicciones:

1. **El trabajador no pertenece al tenant.** `worker_profiles` + `passport_profiles` existen precisamente para que la reputación viaje con la persona.
2. **La verdad se compone de evidencias, no de aserciones.** Todo dato importante deja rastro; nada se sobrescribe sin log.
3. **La identidad es acordada, no impuesta.** Merge, duplicates, aliases, invitations: el sistema asume que las personas entran múltiples veces y se reconcilian a posteriori.
4. **El consentimiento es un evento revocable, no un flag.** Está versionado y auditado.
5. **La aplicación es solo una superficie del ecosistema.** Stafly, Parceros, Kiosk, Front Desk, Passport, Founder Finance son manifestaciones distintas del mismo tejido de personas, relaciones y evidencias.

## ¿Qué capacidades existen aunque nunca hayan sido documentadas?

- **Timeline profesional distribuido** — reconstructible desde 8+ streams (payroll, reviews, archives, events, rep_events, work_history, activity_log, truth_resolution_log).
- **Portabilidad de reputación cross-tenant** — Passport ya no depende de la company.
- **Resolución de identidad tolerante a fallos** — merge, aliases, duplicates.
- **Auditoría forense** — recomponer "quién hizo qué, cuándo, sobre qué persona" es factible.
- **Modularidad por tenant** — `company_modules` habilita capacidades sin release.
- **Doble sistema de verdad de horas con guardrails** — RPC nativo respeta filas importadas.
- **Onboarding multiorigen** — la persona puede entrar por 6 puertas distintas y ser fusionada.

## ¿Qué principios parecen haber guiado la evolución?

- **Preservar antes que optimizar.** Persistencia agresiva y logs redundantes.
- **Aislar antes que compartir.** RLS + `company_id` + `user_roles.company_id`.
- **Documentar antes que wire.** E1 shipped como foundation-only; standards antes que implementación.
- **Composición antes que reemplazo.** `locations_v2` convive con `locations`; `worker_profiles` convive con `employees`.
- **Consentimiento antes que exposición.** Passport, Parceros y Referrals dependen de `worker_consent_records`.
- **Auditoría antes que confianza.** Todo dato sensible tiene log dedicado.

## ¿Qué preguntas estratégicas deberían responderse antes de diseñar la siguiente generación del ecosistema?

Estas preguntas se **listan para el registro**; este reporte no las responde.

1. **¿Cuál es la entidad canónica de "Persona"?** ¿`worker_profiles`, `employees`, `auth.users`, o una nueva entidad "Person" por encima de las tres?
2. **¿`companies` es un tenant o un cliente comercial?** ¿Debe dividirse la responsabilidad?
3. **¿Existe una entidad "Membership" que unifique `employees` + `user_roles` + `company_users`?**
4. **¿Cuál es la fuente autoritativa única de "horas trabajadas"** cuando existen nativo, Connecteam y legacy?
5. **¿El Passport es el perfil canónico** al que apuntan todas las superficies (incluido Stafly Admin), o sigue siendo la vitrina secundaria?
6. **¿Cuál es el contrato de precedencia** entre `worker_profiles.user_id` y `worker_profiles.employee_id`?
7. **¿Puede consolidarse la mensajería** en un modelo de conversación única (thread + participants + messages)?
8. **¿Debe existir un `Person Timeline`** como agregado explícito, o mantenerse como composición on-demand?
9. **¿Qué es un "cliente"?** ¿`clients` (operativo), `billing_clients` (fiscal), o una entidad unificada con capas?
10. **¿Cuándo el ecosistema deja de ser Stafly + Parceros y empieza a ser una plataforma cuyas superficies son intercambiables?**

---

## Cumplimiento del protocolo

- **Código modificado:** ninguno.
- **Migraciones creadas:** ninguna.
- **Tablas/RLS/policies tocadas:** ninguna.
- **Refactor propuesto:** ninguno.
- **Archivos escritos:** únicamente este reporte en `docs/engineering-system/research/ECOSYSTEM-DISCOVERY-REPORT.md`.

Fin del reporte. Listo para revisión y para decidir qué preguntas estratégicas se investigan primero.
