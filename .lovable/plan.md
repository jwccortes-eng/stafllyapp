
# External Candidate / Referral Intake v1

Extiende el ATS existente (`job_applications`) con tracking de referidos por partners de Parceros y clientes B2B logueados en StaflyCore. Pool global sin company hasta que un admin apruebe y elija a qué tenant invitar. Cero cambios a payroll / time_entries / shifts / assignments / employees activos.

## Hallazgos de la auditoría

- `job_applications` ya existe con: `first_name, last_name, phone, email, city, source, status, notes, admin_notes, address_*, languages, draft_data, linked_user_id, duplicate_of_*`.
- RLS actual: `Anyone can submit applications` (INSERT público), admins por company para SELECT/UPDATE.
- **Bloqueador para "pool global":** `company_id` es `NOT NULL`. Hay que relajar este constraint para soportar referrals sin tenant asignado.
- Ya existe smart-identity resolution + fuzzy matching del flujo `/apply` que reutilizaremos para dedupe.

## Cambios de schema (una migración)

1. `ALTER TABLE public.job_applications ALTER COLUMN company_id DROP NOT NULL` (pool global = `company_id IS NULL`).
2. Nuevas columnas (todas opcionales, default NULL):
   - `referral_source text` — texto libre / partner slug
   - `source_partner_company_id uuid` FK → `companies(id)` ON DELETE SET NULL (partner es una company en Parceros)
   - `submitted_by_user_id uuid` FK → `auth.users(id)` ON DELETE SET NULL (quien envió)
   - `opportunity_id uuid` (sin FK por ahora; metadata futura)
   - `preferred_contact_method text` CHECK in ('phone','whatsapp','email','sms')
   - `consent_at timestamptz`
   - `consent_text_version text`
   - `intake_kind text` DEFAULT 'self_apply' CHECK in ('self_apply','partner_referral','client_referral')
   - `routed_company_id uuid` FK → `companies(id)` SET NULL (a qué tenant lo movió el admin)
3. Index parcial: `CREATE INDEX ON job_applications (status) WHERE company_id IS NULL` para la bandeja global.
4. Nuevo enum-like text: extender `status` con valor convencional `pending_review` para referrals (no se cambia el tipo, solo se documenta y se usa). Estados nuevos válidos usados por el código: `pending_review, possible_duplicate, matched_existing_person, needs_contact, approved_to_invite, invited, rejected, archived`.

## RLS adiciones

Sin tocar las 3 policies actuales. Se agregan:

- `Authenticated partners can submit referrals` — INSERT WITH CHECK `auth.uid() = submitted_by_user_id AND intake_kind IN ('partner_referral','client_referral') AND company_id IS NULL`.
- `Submitter can read own referrals` — SELECT USING `auth.uid() = submitted_by_user_id`.
- `Submitter can update own referrals while pending` — UPDATE USING `auth.uid() = submitted_by_user_id AND status = 'pending_review'` WITH CHECK same. (Solo notas/contacto, no campos de routing.)
- `Global owners can manage pool referrals` — ALL USING `is_global_owner(auth.uid()) AND company_id IS NULL`.
- Admin existente sigue viendo las que estén ruteadas a su company (cuando admin asigna `company_id` con approve).

Trigger `before_update`: bloquear que `submitted_by_user_id` cambie a otro user; bloquear que un no-admin escriba `routed_company_id`, `company_id`, `linked_user_id`, `approved_employee_id`, `admin_notes`, `reviewed_*`.

## Backend (edge function)

Nuevo `supabase/functions/referral-submit/index.ts`:
- `verify_jwt = true` (requiere sesión).
- Valida payload con Zod (campos mínimos + consent obligatorio).
- Normaliza teléfono a 10 dígitos.
- Reusa la lógica fuzzy de `resolve-applicant-identity` para detectar duplicados → si hay match alto, set `status='possible_duplicate'` + `duplicate_of_application_id` / `duplicate_of_user_id`.
- INSERT con `company_id=NULL`, `intake_kind`, `submitted_by_user_id=auth.uid()`, `consent_at=now()`, `status='pending_review'`.
- No envía notificaciones a workers, no activa empleado, no toca shifts/payroll.

## Frontend

### Submitter (Parceros + StaflyCore B2B)
- Nueva ruta `/refer` (lazy) con formulario premium-mobile: nombre, apellido, teléfono (SmartPhoneInput), email opcional, ciudad, método preferido de contacto, notas, checkbox de consentimiento obligatorio.
- Disponible para usuarios autenticados (Parceros partner o cliente B2B). Si no hay sesión, redirige a auth con `?next=/refer`.
- Lista "Mis referidos" mostrando estado actual (read-only, no PII de otros).

### Admin Referral Inbox (`/app/referrals`)
- Solo developer/owner inicialmente (global mode).
- Filtros: estado, source/partner, fecha.
- Card por referral con: nombre, contacto, fuente (partner badge), notas, posible duplicado (link al perfil candidato).
- Acciones:
  - **Conectar a persona existente** → set `linked_user_id` + `status='matched_existing_person'`
  - **Rutear a company** → set `routed_company_id` + `company_id` (movemos del pool a la company) + status `approved_to_invite`
  - **Invitar** → handoff a flow existente de invite (no auto-activa worker)
  - **Rechazar / Archivar** → set status correspondiente + `rejection_reason`
- Reutiliza UI tokens del Centro de Validación y MobileAdminHome.

### Sidebar
- Nueva entrada "Referidos" en grupo "Equipo" (admin) y en Parceros nav para partners.

## Boundary y NO-toca

- `payroll`, `time_entries`, `scheduled_shifts`, `shift_assignments`, `payments`, `employees` activos: **0 escrituras**.
- `worker_passport`, marketplace: no escribimos; solo lectura para el dedupe match.
- Auto-activación de worker: **prohibida** por diseño. El paso "Invitar" delega al flow ATS existente que requiere onboarding completo.
- No se crean companies. `routed_company_id` solo apunta a companies ya existentes y activas.
- Smart identity resolution se reutiliza, no se duplica.

## QA plan

Desktop:
- Partner Parceros envía referido → aparece en `/app/referrals` con `company_id=NULL`, status `pending_review`.
- Admin ve referido, ve posible duplicado, conecta a persona existente.
- Admin rutea a Quality Staff → status `approved_to_invite`, `company_id` y `routed_company_id` seteados.
- Otro partner NO ve referidos ajenos (RLS).
- Otro tenant admin NO ve referidos del pool global.

Mobile (390x844):
- Formulario `/refer` usable a una mano, consent visible, mensaje de éxito claro.
- `Mis referidos` lista compacta con estado actual.

DB invariantes post-QA:
- 0 nuevos rows en `employees`, `shift_assignments`, `time_entries`, `scheduled_shifts`, `pay_periods`, `payments`.
- `companies` sin cambios.

## Riesgos

- `company_id` nullable cambia un invariante histórico. Mitigación: índice parcial + RLS explícita para `company_id IS NULL`, y revisar 3-4 callsites admin que asumen `NOT NULL` (sin tocar payroll).
- Spam de partners: mitigación v1 → rate-limit en la edge function (10 submissions / hora / user).
- Dedupe es probabilístico; status `possible_duplicate` siempre requiere revisión humana.

## Entregables

- 1 migración (schema + RLS + grants + trigger + index)
- 1 edge function `referral-submit`
- 1 página submitter `/refer` + componente "Mis referidos"
- 1 página admin `/app/referrals`
- 1 entrada en sidebar admin + 1 en Parceros nav
- Memoria `mem://features/referral-intake-v1`

## Fuera de scope v1 (próximas iteraciones)

- Link público sin login (`/refer/:partnerSlug`) — diferido por riesgo de spam.
- Integración Passport completa (cross-tenant identity link).
- Notificaciones push al partner cuando su referido es aprobado.
- Bulk import CSV de referrals.
