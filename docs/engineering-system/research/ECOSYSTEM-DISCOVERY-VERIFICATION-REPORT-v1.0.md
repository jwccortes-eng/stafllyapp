# ECOSYSTEM DISCOVERY VERIFICATION REPORT v1.0

**Fecha:** 2026-07-23
**Autor:** Auditor read-only
**Alcance:** Validación científica del documento `docs/engineering-system/research/ECOSYSTEM-DISCOVERY-REPORT.md`.
**Protocolo:** Solo lectura. Cero código, cero migraciones, cero refactor, cero propuestas de futuro.

> **Pregunta única a responder.** ¿Qué partes del Ecosystem Discovery Report representan la realidad operativa actual y cuáles representan una arquitectura preparada para el futuro pero todavía no adoptada completamente?

**Convenciones de estado:**
- ✅ **Confirmado** — evidencia directa en código, esquema o rutas.
- 🟨 **Parcialmente confirmado** — infraestructura existe, adopción incompleta.
- 🔵 **Foundation preparado** — tablas/componentes existen; no están conectados a superficies productivas (frecuentemente por decisión deliberada).
- ⚪ **No demostrado** — afirmación razonable no verificable con la evidencia disponible.
- ❌ **Contradicho por el código.**

---

## PARTE 1 — Validación del Reporte, sección por sección

### §1 Persona (7 representaciones)
**Estado: ✅ Confirmado.**
Evidencia directa en `src/integrations/supabase/types.ts` y en el inventario de tablas: `auth.users`, `profiles`, `employees` (84 col), `employee_aliases`, `worker_profiles`, `passport_profiles`, `job_applications`, `contractor_w9`, `employee_invitations`, `employee_archive_records`. Todas existen.
La 🔴 hipótesis "persona = acuerdo emergente" queda **🟨 parcialmente confirmada**: existen efectivamente las herramientas de merge (`useIdentityResolution`, `WorkerDuplicates`, `EmployeeMerge`, `UnifiedPersonProfile` — grep confirma los 4 archivos), pero no hay evidencia de una tabla `person` unificada. La ausencia es un hecho; la interpretación de "acuerdo emergente" es una inferencia coherente.

### §2 Organización
**Estado: ✅ Confirmado** en su parte fáctica. `companies` (31 col) contiene simultáneamente flags de tenant (`is_test`, `is_demo`, `status`) y comerciales (`source`, `subscriptions`). No existen tablas `partners`, `providers`, `recruiters`.
🔴 Hipótesis "toda otra organización es superficie de UI": **🟨 parcialmente confirmada**. Correcto para partner/recruiter (no hay tabla). Matiz: `clients` + `billing_clients` sí son entidades organizacionales adicionales, no meras superficies — el reporte lo reconoce en §12 pero la hipótesis §2 lo desatiende.

### §3 Relación persona ↔ organización (triple membresía)
**Estado: ✅ Confirmado.** `employees.company_id`, `user_roles(user_id, company_id, role)` y `company_users(user_id, company_id)` coexisten. `useCompany.tsx` líneas 132–137 usa `company_users` como fuente para no-admins; `useAuth` usa `user_roles`. No hay constraint cruzado observable en el esquema documentado.

### §4 Identidad — 4 capas L1–L4
**Estado: 🔵 Foundation preparado (verificado).**
- `src/lib/profile-layers.ts` existe con tipos y helpers puros — cabecera literal: `@status foundation-only — do not wire until E2 approved`.
- `src/components/profile-standard/{ProfileLayerBadge, SourceProvenanceBadge, ConsentGate}.tsx` idénticamente marcados.
- Grep confirma que **ningún consumidor productivo** importa `profile-layers` fuera del propio módulo.
- La 🔴 hipótesis "transición documentada pero no ejecutada" queda **✅ confirmada como decisión deliberada** (no como olvido): el propio código declara el estado foundation-only.

### §5 Pasaporte
**Estado: 🟨 Parcialmente confirmado.**
- Infraestructura: ✅ 4 tablas `passport_*` + `worker_visibility_settings` + `worker_consent_records` + `profile_access_log` + `profile_verification_log` — todas presentes.
- Ruta pública: ✅ `src/App.tsx:270` monta `/passport/:slug → PublicPassport`.
- Vista admin: ✅ `src/pages/admin/WorkerPassport.tsx` (montada).
- Adopción de escritura: 🟨 los hooks de consumo (`useWorkerPassport`, `useWorkerProfile`, `useWorkerConsent`) existen pero solo lo referencian ~5 archivos productivos según grep (`useWorkerProfile` 6 hits, `passport` 6 archivos). Cross-tenant como "fuente canónica de reputación" es **⚪ no demostrado**: no hay ruta admin que consulte pasaporte de otro tenant durante flujos operativos.

### §6 Evidencias
**Estado: ✅ Confirmado.** Todas las categorías y tablas listadas existen en el inventario de tablas. La inferencia de "duplicación defensiva" es 🟨 razonable pero no probada como intención — es interpretación.

### §7 Evolución / historia
**Estado: ✅ Confirmado** en cuanto a existencia de streams (`employee_archive_records`, `historical_payroll_entries`, `rep_scores/events`, `passport_work_history`, `worker_experience_records`, `compensation_change_log`, `activity_log`, `truth_resolution_log`).
La 🔴 hipótesis "ecosistema con memoria" es **🟨 hipótesis defendible**: la persistencia es un hecho; la intención de "memoria de largo plazo" es interpretación no verificada por ADR.

### §8 Consentimiento
**Estado: ✅ Confirmado.**
- `worker_consent_records` (11 col, 4 policies), `worker_visibility_settings` (15 col), `notification_preferences`, `email_unsubscribe_tokens`, `suppressed_emails`, `data_export_requests` — todos existen.
- `src/hooks/useWorkerConsent.tsx` y `src/components/portal/ConsentCenterCard.tsx` consumen la tabla en producción.
- Consumo cross-superficie: 🟨 principalmente Portal/Parceros. Los flujos de `employees` no requieren consent para operar.

### §9 Flujo completo de una persona
**Estado: 🟨 Parcialmente confirmado.**
- Etapas Descubrimiento → Trabajo → Cierre → Payroll → Facturación → Reingreso: ✅ todas las tablas y edge functions existen (`referral-submit`, `resolve-applicant-identity`, `bulk-portal-invite`, `payroll-consolidate`, `document-intake-extract`).
- Etapa "Reputación e historia → passport": 🔵 la tabla existe, la escritura automática desde cierre operativo hacia `passport_*` **no está demostrada** — no hay edge function o trigger `passport-publish` observable.
- El flujo como diagrama lineal es una **reconstrucción**; el reporte lo marca como 🟡 inferencia, correcto.

### §10 Mapa Conceptual (tabla de madurez)
**Estado: ✅ Confirmado en su mayoría.**
Correcciones y matices:
- `worker_profiles` "Adopción parcial" → ✅ confirmado (6 archivos productivos usan la tabla).
- `passport_profiles` "En despliegue" → 🟨 confirmado (ruta pública live, pero sin pipeline automático de publicación).
- `shifts` vs `scheduled_shifts` "Ambiguo" → ✅ confirmado (glosario oficial + `src/lib/shifts/visibility.ts` referencia la ambigüedad).

### §11 Fuentes de verdad
**Estado: ✅ Confirmado.** El doble truth set de horas está adicionalmente documentado en `docs/engineering-system/mri/MRI-001-ATTENDANCE-TO-PAYROLL-TRUTH.md`. La triple membresía y las divergencias de email/phone son verificables por esquema.

### §12 Duplicidades (12 puntos)
**Estado: ✅ Confirmado.** Todas verificables contra el inventario de tablas y rutas.

### §13 Fragmentación
**Estado: ✅ Confirmado** como observación. La clasificación por "naturaleza de la fragmentación" es interpretativa pero razonable.

### §14 Modelo Emergente (interpretación principal)
**Estado: 🔴 Hipótesis correctamente etiquetada.** El diagrama Persona → Relación → Evidencia → Pasaporte es coherente con la evidencia pero **no demostrable como diseño intencional**. El código nunca declara este modelo; el reporte lo reconoce como interpretación.

### §15–17 Evaluación estratégica
Las tablas de capacidades, fortalezas e inconsistencias son ✅ verificables punto por punto. Nada contradictorio con el código.

### Parte 4 — Reflexión Final
Cinco "convicciones que emergen del código": **🟨 hipótesis defensibles**, no hechos. Están correctamente presentadas como interpretación.

---

## PARTE 2 — Adoption Ledger

Leyenda: **Op** = Operativo · **Op-P** = Operativo parcial · **Fnd** = Foundation preparado · **Lgy** = Legacy · **Exp** = Experimental · **Dc** = Desconectado.

| Concepto | Infraestructura | Uso real (rutas) | Escritura | Lectura | Estado |
|---|---|---|---|---|---|
| Auth | `auth.users`, Supabase Auth | Toda la app | Supabase Auth | Todo | **Op** |
| Profiles | `profiles` | `AuthCallback`, layouts | `AuthCallback.tsx` | Layouts, headers | **Op** |
| Employees | `employees` (84 col) | Admin completo, Portal, Payroll | Admin, imports, invitations | Todo staffing/payroll | **Op** |
| Worker Profiles | `worker_profiles` | `PublicPassport`, `WorkerPassport` (admin), `PortalProfile`, `ConsentCenterCard`, `ReplacementSuggestionDialog` | Worker (portal), `useWorkerProfile` | Passport + Portal (~6 archivos) | **Op-P** |
| Passport | `passport_profiles` +3 | `/passport/:slug`, `admin/WorkerPassport`, `passport-pdf` | Worker + system (manual) | Ruta pública + admin | **Op-P** |
| Worker Consent | `worker_consent_records` | `ConsentCenterCard`, `ConsentGate` (foundation), Parceros adoption | `useWorkerConsent.grantConsent/revokeConsent` | Portal + Passport | **Op-P** |
| Worker Visibility | `worker_visibility_settings` | Portal profile, Passport | Worker | Passport/Parceros | **Op** |
| Identity Resolution | `useIdentityResolution.ts` + `WorkerDuplicates` + `EmployeeMerge` + `UnifiedPersonProfile` + `IdentityResolutionDrawer` | Admin merge flows, FrontDesk, LiveMap | Admin | Admin merge UI | **Op** |
| Companies | `companies` (31 col) | Todo el ecosistema | Owner/Admin | Todo | **Op** (sobrecargada: tenant + comercial) |
| User Roles | `user_roles` + `has_role` RPC | RLS + guards `useAuth` | Admin | Todo autorizado | **Op** |
| Company Users | `company_users` | `useCompany.tsx` para no-admins | Admin/invite flow | `useCompany` | **Op** (paralelo a `user_roles`) |
| Invitations | `employee_invitations` (22 col), `bulk-portal-invite`, `send-invite-email` | `InviteEmployees`, `AcceptInvite`, `JoinCompany`, `ActivateAccount` | Admin | Wizard aceptación | **Op** |
| Applications | `job_applications` (49 col), `application_configs`, `application_events`, `document_intake_*`, `resolve-applicant-identity` | `Apply.tsx`, `admin/Applications`, `admin/Referrals` | Público + admin | Admin recruitment | **Op** |
| Payroll | `period_base_pay`, `payroll_adjustments`, `payroll_interpreted_entries`, `payroll_rate_snapshots`, RPC + `payroll-consolidate` edge fn | `PayrollReviewQueue`, `MobilePeriodSummaryView`, `PayrollSettings` | Edge fn + admin | Admin + Portal (PayStub) | **Op** |
| Reconciliation | `reconciliation_*` (25+ tablas) | `MigrationCommandCenter`, `migration-*-sync` edge fns | Migration/import | Admin migration UI | **Op-P** (paralelo, no unificado con payroll nativo) |
| Documents | 5 buzones (`employee_documents`, `worker_documents`, `application_documents`, `document_intake_items`, `employee_onboarding_documents`) + `contractor_w9`, `tax_forms_1099` | Portal (`MyDocuments`, `MyW9`), Admin, `document-intake-extract`, `document-extract` | Worker + admin + edge fn | Multi-superficie | **Op** (fragmentado) |
| Reputation | `rep_scores`, `rep_events`, `rep_badges`, `rep_worker_badges`, `useReputation`, `useEmployeeReputation` | `admin/Leaderboard`, `WorkerPassport` | Sistema + admin | Admin + Passport | **Op-P** |
| Reviews | `review_*` + `shift_reviews`, `generate-reviews` edge fn | `admin/QualityDashboard`, review flows | Sistema + admin | Admin + agregadores rep | **Op** |
| Services | `service_categories`, `service_request_items`, `service_requests` (32 col), `service_request_shift_links` | `useServiceRequests`, `admin/ServiceRequests`, `admin/CommandCenter`, `useClientExperience`, cliente | Admin + cliente | Admin/Cliente | **Op** |
| Campaigns / Announcements | `announcements`, `announcement_reactions` | `admin/Notifications`, `portal/MyAnnouncements` | Admin | Portal + Admin | **Op** |
| Flash Jobs | `flash_jobs` (22 col), `flash_job_responses`, `parceros-sync`, `parceros-webhook` | `parceros/ParcerosCommunity`, `parceros/FlashJobDetail` | Parceros system | Parceros app | **Op-P** (solo superficie Parceros) |
| Opportunities | `flash_jobs` + `service_requests` + `staffing_requests` + `shift_requests` | Superficies dispersas | Múltiples | Múltiples | **Op-P** (sin funnel unificado) |
| Worker Skills | `worker_skills`, `worker_profile_skills` | `useWorkerProfile.addSkill/removeSkill`, `PortalProfile` | Worker | Portal + Passport | **Op** |
| Worker Languages | `worker_languages` | `useWorkerProfile.addLanguage`, Portal | Worker | Portal + Passport | **Op** |
| Worker Experience | `worker_experience_records` | `useWorkerProfile`, Portal, Passport | Worker | Portal + Passport | **Op** |
| Passport Metrics | `passport_metrics` | `useWorkerPassport`, `PublicPassport` | Sistema (manual/derivado) | Ruta pública | **Op-P** (sin pipeline automático demostrable) |
| Worker Timeline | 8+ streams (payroll, reviews, archives, activity_log, rep_events, work_history, truth_resolution_log, employee_location_history) | Ninguna vista unificada | Múltiples | Reconstructible manualmente | **Dc** como concepto (existen los streams, no la vista) |
| Profile Standard (L1–L4) | `profile-layers.ts`, `ProfileLayerBadge`, `SourceProvenanceBadge`, `ConsentGate` | Ninguno productivo (grep) | — | — | **Fnd** (marcados `foundation-only` en código) |

---

## PARTE 3 — Flujos Reales

### Caso A — Persona existente en Quality intenta ingresar a My Staff

**Qué ocurre hoy** (reconstruido de `useAuth`, `useCompany`, `AuthCallback`, `useIdentityResolution`, RLS):

1. La persona ya autenticada tiene `auth.users.id` + `profiles` + al menos un `user_roles(company_id=Quality, role=...)` y un `company_users(company_id=Quality)` — evidencia: `useCompany.tsx` líneas 132–137 lee `company_users` para no-admins.
2. Al intentar acceder a My Staff, `useCompany` resuelve el tenant activo desde `safeLocalStorage.getItem("selectedCompanyId")` y `user_roles`. **No hay lookup por identidad ecosistémica**: la resolución es tenant-céntrica.
3. Si el `user_id` **no** tiene registro en `company_users`/`user_roles` para My Staff, la RLS de `employees` bloquea acceso. No hay flujo automático de "onboarding cross-tenant".
4. Para que la persona aparezca en My Staff, un admin de My Staff debe:
   - a) invitarla vía `employee_invitations` (email/phone) — `bulk-portal-invite` edge fn, o
   - b) crearla como `employees` con `user_id=NULL` y luego vincularla (importación).
5. En (a), al aceptar la invitación (`AcceptInvite.tsx`), se crea un **nuevo `employees.id`** para My Staff. `auth.users.id` se reutiliza. `worker_profiles.user_id` puede quedar apuntando al mismo `user_id` si ya existía.
6. `useIdentityResolution.ts` puede intervenir en `WorkerDuplicates` / `IdentityResolutionDrawer` **solo si un humano lo dispara desde admin**. No hay resolución automática en el path de invitación observable.

**Qué se reutiliza:** `auth.users.id`, `profiles`, `worker_profiles` (si comparte `user_id`), skills/languages/experience/documents/consent asociados a `worker_profile_id`, historial de `passport_*`, `rep_scores` (agregados por `worker_profile_id`/`user_id`).

**Qué se duplica:** `employees` (nueva fila por tenant), `user_roles` (nueva fila), `company_users` (nueva fila), `employee_number` (nuevo), potencialmente `employee_documents` si el nuevo tenant re-solicita documentación (los buzones `worker_documents` vs `employee_documents` son distintos).

**Qué se ignora:** No hay señal automática hacia My Staff de la reputación de Quality (`rep_scores`, `review_scores`) — la única forma es consulta manual del pasaporte público si el worker lo tiene abierto.

**Identidad conservada:** `auth.users.id`, `worker_profiles.id`, `passport_profiles.slug` (si existía).
**Identidad nueva:** `employees.id`, `employee_number`, `user_roles.id`, `company_users.id`.
**Dónde puede terminar duplicada:** si la invitación se envía a un email/phone distinto al que ya existía y `useIdentityResolution` no se ejecuta, se puede crear un **segundo `worker_profile`** o quedar sin vinculación al `worker_profile` previo (evidencia: `WorkerDuplicates.tsx` existe precisamente para reparar esto).

### Caso B — Quality necesita completar un turno sin trabajadores suficientes

**Capacidades reales existentes hoy** (sin proponer nuevas):

1. **Reassignment dentro del tenant.**
   - `src/components/shifts/ReplacementSuggestionDialog.tsx` (usa `worker_profiles` para sugerir).
   - Dispatch/matching en `src/core/dispatch-engine.ts` + `useWorkerAvailability`, `useEmployeeRoster`, `useWorkerCompliance`.
   - **Scope: solo empleados del tenant Quality.**

2. **Publicación como shift claimable.**
   - `scheduled_shifts.claimable = true` + status `open/published` (ver `src/lib/shifts/visibility.ts`).
   - Portal (`MyShifts`, `PortalShiftDetail`) muestra a empleados del **mismo tenant**.
   - **RLS confirma: no hay visibilidad cross-tenant.**

3. **Flash Jobs (Parceros).**
   - Tabla `flash_jobs` (22 col) + `flash_job_responses` + edge fns `parceros-sync`, `parceros-webhook`.
   - Superficie: `src/pages/parceros/ParcerosCommunity.tsx`, `FlashJobDetail.tsx`.
   - **Es la única capacidad demostrable de conectar demanda con personas fuera del tenant.**
   - Evidencia de flujo end-to-end desde Quality Ops UI hasta publicación en Parceros: **⚪ no demostrable** — no encontré botón en Shift Ops que publique a Parceros; la publicación aparece originada desde el subdominio Parceros.

4. **Staffing Requests.** `staffing_requests` (32 col, 2 policies) existe como tabla; no encontré ruta admin que la use como marketplace cross-tenant.

5. **Referrals.** `src/pages/Refer.tsx`, `admin/Referrals`, edge fn `referral-submit`, `job_applications`. Sirve para reclutar personas **hacia** Quality, no para pedir prestada capacidad de otro tenant.

6. **Worker Client Preferences.** `worker_client_preferences` expresa afinidad worker↔billing_client dentro del tenant.

**Dónde termina el flujo:** dentro de `flash_jobs` + `flash_job_responses`. No hay evidencia de un handshake automático que cree `shift_assignments` cross-tenant. La adjudicación probablemente requiere que el worker sea aceptado como `employees` del tenant destino (ruta convencional de invitación).

**Conclusión Caso B:** el sistema tiene **capacidad parcial** cross-tenant vía Flash Jobs/Parceros. El resto de la demanda extra se resuelve **intra-tenant** (reassign, claimable, invite).

---

## PARTE 4 — Capability Gap Matrix

| Necesidad operacional | Capacidad existente | Evidencia | Cobertura |
|---|---|---|---|
| Reconocer una persona existente | `useIdentityResolution`, `WorkerDuplicates`, `EmployeeMerge`, `resolve-applicant-identity` edge fn | Archivos verificados | **Alta manual / Baja automática** |
| Actualizar identidad | `useWorkerProfile.updateProfile`, `EmployeeMerge`, `UnifiedPersonProfile` | Archivos verificados | **Alta** |
| Continuar historia (misma persona, nuevo tenant) | Reutilización de `worker_profiles`, `passport_*`, `rep_scores` por `user_id` | Grep de hooks; `employees.id` es nuevo por tenant | **Media** — historia ecosistémica sí; historia operativa se re-inicializa |
| Invitar a otra organización | `employee_invitations`, `bulk-portal-invite`, `send-invite-email` | Edge fns + `AcceptInvite.tsx` | **Alta** (invita al mismo tenant); no hay "invitar tu perfil ecosistémico a un tenant vecino" |
| Reutilizar documentos | 5 buzones separados; `worker_documents` es cross-tenant, `employee_documents` es por tenant | Inventario tablas | **Baja** — no hay política automática de reutilización |
| Compartir consentimiento | `worker_consent_records` versionado; `ConsentGate` (foundation) | `useWorkerConsent` productivo, `ConsentGate` foundation-only | **Media** |
| Construir reputación | `rep_scores`, `rep_events`, `review_*`, `passport_metrics` | Hooks + Leaderboard | **Alta** intra-tenant; **Media** portable |
| Mostrar experiencia | `worker_experience_records`, `passport_work_history` | Portal + Passport | **Alta** |
| Buscar oportunidades | Parceros Flash Jobs, Portal claimable shifts | `parceros/*`, `MyShifts` | **Media** (fragmentado por audiencia) |
| Conectar organizaciones | Ninguna tabla de "org↔org"; solo persona↔org | Grep de esquema | **Nula** |

---

## PARTE 5 — Concept Validation

| Concepto | ¿Existe en código? | Tipo de existencia | Evidencia |
|---|---|---|---|
| **Persona** | Sí, fragmentada | Distribuida en 7 tablas | Inventario tablas |
| **Organización** | Sí | Entidad única sobrecargada (`companies`) | `companies` 31 col |
| **Relación** | Sí, triple | Sin contrato unificado | `employees` + `user_roles` + `company_users` |
| **Oportunidad** | Sí, plural | 4 modelos (`flash_jobs`, `service_requests`, `staffing_requests`, `shift_requests`) | Inventario |
| **Evidencia** | Sí | Distribuida y auditada agresivamente | 12 categorías §6 |
| **Identidad** | Parcial | L1+L2 operativos; L3 parcial; L4 diseñado | `profile-layers.ts` foundation-only |
| **Consentimiento** | Sí | Evento versionado revocable | `worker_consent_records` + `useWorkerConsent` |
| **Evolución** | Sí, implícita | Emerge de persistencia; no hay entidad "carrera" | 8+ streams |
| **Confianza** | Solo infraestructura | `profile_verification_log`, `worker_consent_records`, badges | No hay score agregado "trust" |
| **Reputación** | Sí, plural | 3 subsistemas paralelos | `rep_*` + `review_*` + `passport_metrics` |
| **Pasaporte** | Sí, operativo parcial | 4 tablas + ruta pública + admin | `/passport/:slug` |

---

## PARTE 6 — Arquitectura Emergente (con evidencia)

**El sistema se comporta simultáneamente como los tres primeros modelos, con pesos distintos:**

- **Software de staffing:** ✅ **Peso dominante en la producción diaria.** Evidencia: 118 páginas admin, todo el stack `shifts / scheduled_shifts / shift_assignments / time_entries / period_base_pay / invoices` está `Op`. Las mutaciones críticas viven aquí.
- **Plataforma SaaS multi-tenant:** ✅ **Peso estructural.** Evidencia: RLS + `has_role` + `company_id` + `subscriptions` + `promo_codes` + `company_modules` + branding + auditoría por tenant.
- **Ecosistema de personas y organizaciones:** 🟨 **Peso emergente, no dominante.** Evidencia positiva: `worker_profiles`, `passport_*`, `worker_consent_records`, `parceros/*`, `flash_jobs`. Evidencia limitante: `profile-layers` foundation-only; sin handshake cross-tenant automatizado; sin org↔org.

**Conclusión con evidencia:** el sistema **hoy es** un SaaS multi-tenant de staffing **con una capa ecosistémica preparada y parcialmente activa** (Passport + Parceros + Consent). La lectura como "ecosistema completo" del reporte original es una hipótesis proyectiva sostenida por la infraestructura, no por la adopción productiva.

---

## PARTE 7 — Reality Score

Escala: Infraestructura = qué tan completo está el modelo/DB. Adopción = qué tanto lo usan superficies productivas hoy.

| Área | Infraestructura | Adopción | Observaciones |
|---|---:|---:|---|
| Identidad | 85% | 45% | L1/L2 wired; L3 parcial; L4 solo Passport lectura |
| Personas | 90% | 70% | Fragmentación real; merge manual funciona |
| Organizaciones | 80% | 90% | `companies` sobrecargada pero universalmente adoptada |
| Relaciones | 75% | 80% | Triple membresía en uso; sin contrato Membership |
| Pasaporte | 90% | 30% | Tablas + ruta pública; pipeline de publicación ausente |
| Payroll | 95% | 95% | Doble truth set convivente con guardrails |
| Reclutamiento | 85% | 65% | `job_applications` + intake operativo; aislado del passport |
| Documentos | 80% | 60% | 5 buzones; sin unificación |
| Oportunidades | 70% | 40% | 4 modelos; sin funnel; Flash Jobs solo en Parceros |
| Reputación | 80% | 55% | Múltiples fuentes; sin agregador canónico |
| Consentimiento | 90% | 50% | Motor completo; consumo concentrado en Passport/Parceros |
| Auditoría | 95% | 75% | 6+ logs; sin dashboard forense unificado |

*Los porcentajes son estimaciones cualitativas ancladas en conteo de rutas/hooks productivos que tocan cada área — no son mediciones cuantitativas de cobertura.*

---

## PARTE 8 — Conclusión

### 1. Partes del Discovery Report completamente demostradas
- §1 (7 representaciones de Persona), §3 (triple membresía), §6 (dónde viven las evidencias), §8 (mecánica de consentimiento), §11 (fuentes de verdad), §12 (12 duplicidades), §13 (fragmentación) — todas verificables con el esquema y grep del código.
- §4 en su **hecho de foundation-only**: el estado "no wired" está literalmente escrito en los archivos.
- Existencia del Passport como subdominio (§5) y su ruta pública montada.

### 2. Partes que requieren investigación adicional
- **Pipeline automático de publicación de reputación al pasaporte** (§9 nodo "Reputación e historia"): no hay evidencia de edge function o trigger; podría estar en jobs programados no inventariados.
- **Uso real de `staffing_requests`** — tabla existe con 32 columnas y 2 policies; no encontré rutas admin claras que la consuman como marketplace.
- **Consumo cross-tenant del Passport durante flujos operativos** — hay ruta pública, falta demostrar si Shift Ops/Dispatch la consulta.
- **Política de precedencia entre `worker_profiles.user_id` y `worker_profiles.employee_id`** — el reporte lo señala como pendiente; sigue pendiente.
- **Handshake concreto Parceros → tenant** para adjudicación de un `flash_job` a un `shift_assignment` real.

### 3. Partes que representan visión futura, no realidad operativa
- **Modelo de 4 capas L1–L4 wired en toda la app** — hoy es foundation-only por diseño explícito.
- **Timeline profesional unificado de la persona** — reconstructible, no construido.
- **Contrato "Membership" unificado** — no existe.
- **Entidad "Person" canónica por encima de auth/employees/worker_profile** — no existe.
- **Marketplace/handshake org↔org** — no existe estructura.
- **`clock_events` como fuente autoritativa** — sigue siendo evidencia auxiliar; `time_entries` domina.
- **Agregador canónico de reputación cross-subsistema** — no existe.
- **La lectura "ecosistema completo con memoria portable"** — hipótesis defensible por la infraestructura, no realidad adoptada por las superficies productivas.

### 4. Descubrimientos nuevos durante la validación
- **Deliberación explícita del estado foundation-only.** Los 4 archivos de `profile-standard` + `profile-layers.ts` declaran textualmente `do not wire until E2 approved`. Esto confirma que el "gap" identificado en el Discovery Report **no es una inconsistencia; es una estrategia deliberada de evolución por etapas** (foundation-first). El proyecto envía el estándar antes que el consumo.
- **Asimetría entre Passport lectura y Passport escritura.** La ruta pública está viva y el hook admin existe, pero la **escritura desde eventos operativos hacia `passport_*`** no es demostrable en el código actual. El pasaporte se llena principalmente por acción manual del worker.
- **Parceros es la única superficie cross-tenant productiva.** El resto del ecosistema (Stafly admin, Portal, Kiosk, Front Desk) opera intra-tenant estricto.
- **`worker_profiles` tiene adopción baja fuera de Passport/Parceros/Portal.** Grep muestra apenas 6 archivos productivos, uno de ellos (`ReplacementSuggestionDialog`) es el único uso operativo dentro de Shift Ops.
- **`useCompany` y `useAuth` usan fuentes de membresía distintas** (`company_users` vs `user_roles`), lo cual amplifica la triple membresía documentada en §3.

### 5. Ecosistema que emergería si la evolución continúa como hoy
Interpretación estricta a partir de la evidencia:

- Se consolidará como un **SaaS multi-tenant de staffing operacionalmente maduro**, con crecimiento continuo del stack de reconciliación y payroll.
- La **capa ecosistémica (Passport + Parceros + Consent) crecerá lateralmente**, mantenida como sub-producto conectado por consentimiento del worker, no como reemplazo del modelo tenant-céntrico.
- La **identidad multicapa L1–L4 permanecerá como estándar documental** mientras no exista el hito E2; el modelo `employees` seguirá siendo el consumo canónico.
- Las **duplicidades convivientes** (`shifts`/`scheduled_shifts`, `locations`/`locations_v2`, `clients`/`billing_clients`, doble truth set de horas) **no se resolverán por deriva natural**: el patrón observado es "componer, no reemplazar". Convivirán con guardrails y logs.
- La **portabilidad cross-tenant** dependerá de flujos manuales asistidos (invitations + merge + Passport lectura) salvo que Parceros absorba un handshake formal.

**No hay evidencia** de que el sistema evolucione espontáneamente hacia:
- Una entidad Person unificada.
- Un contrato Membership único.
- Un dashboard forense transversal.
- Un funnel de oportunidades cross-tenant automatizado.

Esos saltos requerirían decisiones deliberadas, no continuidad.

---

## Anexo — Principios aplicados

- Diferenciación explícita entre hecho / inferencia / hipótesis en cada juicio.
- Ninguna afirmación sobre intenciones del equipo salvo cuando el código las declara (ej. `foundation-only`).
- Priorización del comportamiento observable (rutas montadas, hooks consumidos, tablas escritas) sobre la documentación aspiracional.
- Cuando el Discovery Report presentaba una hipótesis correctamente etiquetada, esta verificación la deja en su nivel original si la evidencia no permitía ascenderla a hecho.
- Las capacidades parcialmente implementadas fueron interpretadas como **estrategia deliberada** cuando el código lo declara explícitamente (Profile Standard E1) y como **inconsistencia operativa** cuando no hay tal declaración (triple membresía, doble truth set de horas — este último documentado como riesgo controlado en MRI-001).
