# StaflyApps + Parceros — Arquitectura de Base de Datos

> **Versión**: 1.0  
> **Fecha**: 2026-03-14  
> **Estado**: Diseño aprobado — pendiente de implementación  

---

## Visión general

```
┌─────────────────────────────────────────────────────────────────┐
│                    NÚCLEO COMPARTIDO (A)                        │
│  users · worker_profiles · worker_skills · worker_documents     │
│  worker_visibility_settings · worker_experience_records         │
└────────────┬──────────────────────────┬─────────────────────────┘
             │                          │
     ┌───────▼───────┐          ┌───────▼───────┐
     │  STAFLYAPPS   │          │   PARCEROS    │
     │  Dominio B    │          │   Dominio C   │
     │               │          │               │
     │ companies     │          │ mkt_profiles  │
     │ shifts        │          │ job_posts     │
     │ time_entries  │          │ bookings      │
     │ payroll       │          │ applications  │
     │ gps_logs      │          │ messages      │
     └───────┬───────┘          └───────┬───────┘
             │                          │
     ┌───────▼──────────────────────────▼───────┐
     │         MOTORES COMPARTIDOS               │
     │  D. Reputation Engine                     │
     │  E. Worker Passport                       │
     │  F. Disponibilidad y Mapa                 │
     │  G. Auditoría y Seguridad                 │
     └───────────────────────────────────────────┘
```

---

## Convenciones

| Convención | Regla |
|---|---|
| Primary Key | `id uuid DEFAULT gen_random_uuid()` |
| Timestamps | `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()` |
| Soft delete | `deleted_at timestamptz NULL` donde aplique |
| Autoría | `created_by uuid NULL`, `updated_by uuid NULL` donde aplique |
| Naming | `snake_case`, singular para tablas, plural para enums cuando tenga sentido |
| Foreign Keys | `ON DELETE CASCADE` solo en relaciones de composición; `RESTRICT` o `SET NULL` en asociaciones |
| Índices | Declarados explícitamente; compuestos cuando hay queries frecuentes multi-columna |
| RLS | Toda tabla con `company_id` tendrá política RLS por empresa |

---

## Enums globales

```sql
-- ─── Núcleo ───
CREATE TYPE user_global_type        AS ENUM ('worker', 'client', 'admin', 'system');
CREATE TYPE auth_provider            AS ENUM ('email', 'phone_pin', 'google', 'apple', 'magic_link');
CREATE TYPE verification_status      AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE profile_visibility       AS ENUM ('private', 'limited', 'public');
CREATE TYPE english_level            AS ENUM ('none', 'basic', 'intermediate', 'advanced', 'native');
CREATE TYPE document_type            AS ENUM ('id_card', 'passport', 'driver_license', 'w9', 'certification', 'background_check', 'other');
CREATE TYPE proficiency_level        AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
CREATE TYPE experience_source        AS ENUM ('manual', 'stafly_import', 'marketplace_import', 'linkedin');

-- ─── StaflyApps ───
CREATE TYPE company_role             AS ENUM ('super_admin', 'company_admin', 'manager', 'supervisor', 'employee');
CREATE TYPE shift_type               AS ENUM ('hourly', 'daily', 'weekend_job', 'transport', 'other');
CREATE TYPE shift_status             AS ENUM ('draft', 'published', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE pay_type                 AS ENUM ('hourly', 'daily', 'fixed', 'transport');
CREATE TYPE assignment_status        AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'no_show');
CREATE TYPE attendance_status        AS ENUM ('pending', 'present', 'late', 'absent', 'partial');
CREATE TYPE gps_log_type             AS ENUM ('clock_in', 'clock_out', 'live_ping');
CREATE TYPE gps_verification         AS ENUM ('verified', 'approximate', 'failed');
CREATE TYPE payroll_period_status    AS ENUM ('open', 'pending_review', 'closed', 'paid');
CREATE TYPE payroll_entry_status     AS ENUM ('draft', 'reviewed', 'approved', 'exported', 'paid');
CREATE TYPE adjustment_type          AS ENUM ('income', 'deduction', 'transport', 'correction', 'other');
CREATE TYPE review_visibility        AS ENUM ('internal', 'passport', 'marketplace');

-- ─── Parceros ───
CREATE TYPE mkt_profile_status       AS ENUM ('draft', 'pending_review', 'active', 'paused', 'suspended');
CREATE TYPE mkt_rate_type            AS ENUM ('hourly', 'fixed', 'daily');
CREATE TYPE job_budget_type          AS ENUM ('hourly', 'fixed', 'daily');
CREATE TYPE job_status               AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE job_visibility           AS ENUM ('public', 'invite_only');
CREATE TYPE invitation_status        AS ENUM ('sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled');
CREATE TYPE application_status       AS ENUM ('applied', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE booking_status           AS ENUM ('confirmed', 'in_progress', 'completed', 'cancelled', 'disputed');

-- ─── Reputation Engine ───
CREATE TYPE reputation_source        AS ENUM ('shift_review', 'marketplace_review', 'attendance', 'no_show', 'cancellation', 'completion_bonus', 'manual_adjustment');

-- ─── Disponibilidad y Mapa ───
CREATE TYPE availability_status      AS ENUM ('available', 'unavailable', 'busy', 'offline');
CREATE TYPE location_type            AS ENUM ('exact', 'approximate', 'hidden');
CREATE TYPE map_visibility_mode      AS ENUM ('hidden', 'approximate_only', 'exact_when_booked');

-- ─── Auditoría ───
CREATE TYPE audit_action_type        AS ENUM ('create', 'update', 'delete', 'approve', 'reject', 'export', 'login', 'logout', 'assign', 'publish', 'unpublish');
CREATE TYPE product_name             AS ENUM ('staflyapps', 'parceros', 'shared');
CREATE TYPE severity_level           AS ENUM ('low', 'medium', 'high', 'critical');
```

---

## A. Núcleo compartido

### A1. `users`

> Identidad central. Cada persona tiene exactamente un registro.

```sql
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text UNIQUE,
  phone                text UNIQUE,
  first_name           text NOT NULL,
  last_name            text NOT NULL,
  full_name            text GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  profile_photo_url    text,
  preferred_language   text DEFAULT 'es',
  timezone             text DEFAULT 'America/New_York',
  global_user_type     user_global_type DEFAULT 'worker',
  last_login_at        timestamptz,
  is_active            boolean DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz
);

CREATE INDEX idx_users_active ON users (is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email  ON users (email)     WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone  ON users (phone)     WHERE phone IS NOT NULL;
```

**Nota de integración**: En la implementación actual, `auth.users` de Supabase Auth maneja la autenticación. Esta tabla `users` sería un **wrapper** o **alias view** que referencie `auth.users.id` como FK, o bien se utilice `profiles` como puente. La decisión de migración se tomará en fase de implementación para no romper el sistema actual.

---

### A2. `user_auth_identities`

```sql
CREATE TABLE user_auth_identities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          auth_provider NOT NULL,
  provider_user_id  text NOT NULL,
  is_primary        boolean DEFAULT false,
  created_at        timestamptz DEFAULT now(),

  UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_auth_identities_user ON user_auth_identities (user_id);
```

---

### A3. `worker_profiles`

> Perfil laboral base. Compartido entre StaflyApps y Parceros.

```sql
CREATE TABLE worker_profiles (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_slug                     text UNIQUE,
  date_of_birth                   date,
  gender                          text,
  primary_phone                   text,
  emergency_contact_name          text,
  emergency_contact_phone         text,
  city                            text,
  state                           text,
  country                         text DEFAULT 'US',
  zip_code                        text,
  headline                        text,
  bio                             text,
  english_level                   english_level,
  years_of_experience             integer,
  referred_by                     uuid REFERENCES users(id) ON DELETE SET NULL,
  manager_reference_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  profile_completion_percent      integer DEFAULT 0,
  is_profile_public               boolean DEFAULT false,
  is_available_for_marketplace    boolean DEFAULT false,
  verification_status             verification_status DEFAULT 'unverified',
  created_at                      timestamptz DEFAULT now(),
  updated_at                      timestamptz DEFAULT now(),
  deleted_at                      timestamptz,

  UNIQUE (user_id)
);

CREATE INDEX idx_wp_city_state      ON worker_profiles (city, state) WHERE deleted_at IS NULL;
CREATE INDEX idx_wp_public          ON worker_profiles (is_profile_public) WHERE is_profile_public = true;
CREATE INDEX idx_wp_marketplace     ON worker_profiles (is_available_for_marketplace) WHERE is_available_for_marketplace = true;
CREATE INDEX idx_wp_verification    ON worker_profiles (verification_status);
```

---

### A4. `worker_skills`

```sql
CREATE TABLE worker_skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  category    text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_ws_category ON worker_skills (category) WHERE is_active = true;
```

---

### A5. `worker_profile_skills`

```sql
CREATE TABLE worker_profile_skills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill_id            uuid NOT NULL REFERENCES worker_skills(id) ON DELETE CASCADE,
  proficiency_level   proficiency_level,
  years_experience    integer,
  is_primary          boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),

  UNIQUE (worker_profile_id, skill_id)
);

CREATE INDEX idx_wps_profile ON worker_profile_skills (worker_profile_id);
CREATE INDEX idx_wps_skill   ON worker_profile_skills (skill_id);
```

---

### A6. `worker_languages`

```sql
CREATE TABLE worker_languages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  language_code       text NOT NULL,           -- ISO 639-1: 'en', 'es', 'pt'
  proficiency_level   proficiency_level NOT NULL,
  created_at          timestamptz DEFAULT now(),

  UNIQUE (worker_profile_id, language_code)
);
```

---

### A7. `worker_documents`

```sql
CREATE TABLE worker_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id     uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  document_type         document_type NOT NULL,
  file_url              text NOT NULL,
  file_name             text,
  verification_status   verification_status DEFAULT 'unverified',
  is_private            boolean DEFAULT true,   -- NUNCA público por defecto
  expires_at            timestamptz,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_wd_profile ON worker_documents (worker_profile_id);
CREATE INDEX idx_wd_type    ON worker_documents (document_type);
```

**🔒 Seguridad**: Documentos con `is_private = true` jamás se exponen en APIs públicas ni en el marketplace.

---

### A8. `worker_experience_records`

```sql
CREATE TABLE worker_experience_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  title               text NOT NULL,
  company_name        text NOT NULL,
  description         text,
  start_date          date,
  end_date            date,
  is_current          boolean DEFAULT false,
  source_type         experience_source DEFAULT 'manual',
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_wer_profile ON worker_experience_records (worker_profile_id);
```

---

### A9. `worker_visibility_settings`

```sql
CREATE TABLE worker_visibility_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id           uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  show_photo                  boolean DEFAULT true,
  show_first_name             boolean DEFAULT true,
  show_last_name              boolean DEFAULT false,
  show_city                   boolean DEFAULT true,
  show_reputation             boolean DEFAULT true,
  show_experience             boolean DEFAULT true,
  show_skills                 boolean DEFAULT true,
  show_work_history           boolean DEFAULT false,
  show_approximate_location   boolean DEFAULT true,
  show_exact_location         boolean DEFAULT false,
  profile_visibility          profile_visibility DEFAULT 'private',
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);
```

---

## B. Dominio StaflyApps

### B1. `sa_companies`

> Prefijo `sa_` para tablas nuevas de StaflyApps que convivan con las actuales durante migración.

```sql
CREATE TABLE sa_companies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  legal_name        text,
  slug              text UNIQUE NOT NULL,
  company_code      integer UNIQUE,
  logo_url          text,
  tax_id            text,
  email             text,
  phone             text,
  address_line_1    text,
  address_line_2    text,
  city              text,
  state             text,
  zip_code          text,
  country           text DEFAULT 'US',
  payroll_close_day integer DEFAULT 15,
  payroll_close_time time DEFAULT '23:59',
  payroll_timezone  text DEFAULT 'America/New_York',
  invite_code       text,
  is_active         boolean DEFAULT true,
  is_sandbox        boolean DEFAULT false,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_companies_active ON sa_companies (is_active) WHERE is_active = true;
```

---

### B2. `sa_company_users`

```sql
CREATE TABLE sa_company_users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_profile_id   uuid REFERENCES worker_profiles(id) ON DELETE SET NULL,
  role                company_role NOT NULL DEFAULT 'employee',
  is_primary_company  boolean DEFAULT false,
  is_active           boolean DEFAULT true,
  joined_at           timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  UNIQUE (company_id, user_id)
);

CREATE INDEX idx_sacu_user    ON sa_company_users (user_id);
CREATE INDEX idx_sacu_role    ON sa_company_users (role);
CREATE INDEX idx_sacu_company ON sa_company_users (company_id);
```

---

### B3. `sa_clients`

```sql
CREATE TABLE sa_clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  code            text,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  notes           text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_sa_clients_company ON sa_clients (company_id) WHERE deleted_at IS NULL;
```

---

### B4. `sa_locations`

```sql
CREATE TABLE sa_locations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES sa_clients(id) ON DELETE SET NULL,
  name              text NOT NULL,
  address_line_1    text NOT NULL,
  address_line_2    text,
  city              text NOT NULL,
  state             text NOT NULL,
  zip_code          text,
  country           text DEFAULT 'US',
  latitude          double precision,
  longitude         double precision,
  geofence_radius   integer DEFAULT 200,      -- metros
  google_maps_url   text,
  instructions      text,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_loc_company   ON sa_locations (company_id);
CREATE INDEX idx_sa_loc_client    ON sa_locations (client_id);
CREATE INDEX idx_sa_loc_city      ON sa_locations (city, state);
```

---

### B5. `sa_shifts`

```sql
CREATE TABLE sa_shifts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  client_id               uuid REFERENCES sa_clients(id) ON DELETE SET NULL,
  location_id             uuid REFERENCES sa_locations(id) ON DELETE SET NULL,
  title                   text NOT NULL,
  description             text,
  shift_code              text,
  shift_type              shift_type DEFAULT 'hourly',
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  timezone                text DEFAULT 'America/New_York',
  required_workers        integer DEFAULT 1,
  assigned_workers_count  integer DEFAULT 0,
  status                  shift_status DEFAULT 'draft',
  requires_transport      boolean DEFAULT false,
  transport_units_needed  integer,
  pay_type                pay_type DEFAULT 'hourly',
  hourly_rate             decimal(10,2),
  daily_rate              decimal(10,2),
  fixed_rate              decimal(10,2),
  notes_internal          text,
  notes_employee          text,
  claimable               boolean DEFAULT false,
  created_by              uuid REFERENCES users(id),
  updated_by              uuid REFERENCES users(id),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  deleted_at              timestamptz
);

CREATE INDEX idx_sa_shifts_company  ON sa_shifts (company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sa_shifts_date     ON sa_shifts (starts_at);
CREATE INDEX idx_sa_shifts_status   ON sa_shifts (status);
CREATE INDEX idx_sa_shifts_location ON sa_shifts (location_id);
CREATE INDEX idx_sa_shifts_client   ON sa_shifts (client_id);
```

---

### B6. `sa_shift_assignments`

```sql
CREATE TABLE sa_shift_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id              uuid NOT NULL REFERENCES sa_shifts(id) ON DELETE CASCADE,
  worker_profile_id     uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  company_user_id       uuid REFERENCES sa_company_users(id) ON DELETE SET NULL,
  assignment_status     assignment_status DEFAULT 'pending',
  assigned_at           timestamptz DEFAULT now(),
  responded_at          timestamptz,
  response_note         text,
  check_in_required     boolean DEFAULT true,
  check_out_required    boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  UNIQUE (shift_id, worker_profile_id)
);

CREATE INDEX idx_sa_assign_shift    ON sa_shift_assignments (shift_id);
CREATE INDEX idx_sa_assign_worker   ON sa_shift_assignments (worker_profile_id);
CREATE INDEX idx_sa_assign_status   ON sa_shift_assignments (assignment_status);
```

---

### B7. `sa_time_entries`

```sql
CREATE TABLE sa_time_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_assignment_id     uuid REFERENCES sa_shift_assignments(id) ON DELETE SET NULL,
  worker_profile_id       uuid NOT NULL REFERENCES worker_profiles(id),
  company_id              uuid NOT NULL REFERENCES sa_companies(id),
  clock_in_at             timestamptz,
  clock_out_at            timestamptz,
  break_minutes           integer DEFAULT 0,
  total_minutes_worked    integer,
  total_hours_worked      decimal(8,2),
  attendance_status       attendance_status DEFAULT 'pending',
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_te_assignment ON sa_time_entries (shift_assignment_id);
CREATE INDEX idx_sa_te_worker     ON sa_time_entries (worker_profile_id);
CREATE INDEX idx_sa_te_company    ON sa_time_entries (company_id);
CREATE INDEX idx_sa_te_status     ON sa_time_entries (attendance_status);
```

---

### B8. `sa_gps_logs`

```sql
CREATE TABLE sa_gps_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id         uuid NOT NULL REFERENCES sa_time_entries(id) ON DELETE CASCADE,
  log_type              gps_log_type NOT NULL,
  latitude              double precision NOT NULL,
  longitude             double precision NOT NULL,
  accuracy_meters       double precision,
  address_text          text,
  device                text,
  verification_status   gps_verification DEFAULT 'approximate',
  captured_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_gps_entry   ON sa_gps_logs (time_entry_id);
CREATE INDEX idx_sa_gps_type    ON sa_gps_logs (log_type);
CREATE INDEX idx_sa_gps_captured ON sa_gps_logs (captured_at);
```

**🔒 Seguridad**: GPS exacto es dato interno de empresa. Nunca se expone al marketplace.

---

### B9. `sa_payroll_periods`

```sql
CREATE TABLE sa_payroll_periods (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES sa_companies(id) ON DELETE CASCADE,
  period_name         text,
  period_start_date   date NOT NULL,
  period_end_date     date NOT NULL,
  close_due_at        timestamptz,
  closed_at           timestamptz,
  status              payroll_period_status DEFAULT 'open',
  delay_days          integer,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_pp_company ON sa_payroll_periods (company_id);
CREATE INDEX idx_sa_pp_dates   ON sa_payroll_periods (period_start_date, period_end_date);
CREATE INDEX idx_sa_pp_status  ON sa_payroll_periods (status);
```

---

### B10. `sa_payroll_entries`

```sql
CREATE TABLE sa_payroll_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id   uuid NOT NULL REFERENCES sa_payroll_periods(id) ON DELETE CASCADE,
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id),
  company_id          uuid NOT NULL REFERENCES sa_companies(id),
  regular_hours       decimal(8,2) DEFAULT 0,
  overtime_hours      decimal(8,2) DEFAULT 0,
  total_hours         decimal(8,2) DEFAULT 0,
  regular_amount      decimal(12,2) DEFAULT 0,
  overtime_amount     decimal(12,2) DEFAULT 0,
  transport_amount    decimal(12,2) DEFAULT 0,
  bonus_amount        decimal(12,2) DEFAULT 0,
  deduction_amount    decimal(12,2) DEFAULT 0,
  total_amount        decimal(12,2) DEFAULT 0,
  payroll_status      payroll_entry_status DEFAULT 'draft',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  UNIQUE (payroll_period_id, worker_profile_id)
);

CREATE INDEX idx_sa_pe_period   ON sa_payroll_entries (payroll_period_id);
CREATE INDEX idx_sa_pe_worker   ON sa_payroll_entries (worker_profile_id);
CREATE INDEX idx_sa_pe_company  ON sa_payroll_entries (company_id);
CREATE INDEX idx_sa_pe_status   ON sa_payroll_entries (payroll_status);
```

---

### B11. `sa_payroll_adjustments`

```sql
CREATE TABLE sa_payroll_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_entry_id    uuid NOT NULL REFERENCES sa_payroll_entries(id) ON DELETE CASCADE,
  adjustment_type     adjustment_type NOT NULL,
  amount              decimal(12,2) NOT NULL,
  reason              text NOT NULL,
  notes               text,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_pa_entry ON sa_payroll_adjustments (payroll_entry_id);
```

---

### B12. `sa_employee_reviews`

```sql
CREATE TABLE sa_employee_reviews (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES sa_companies(id),
  shift_id                    uuid REFERENCES sa_shifts(id) ON DELETE SET NULL,
  shift_assignment_id         uuid REFERENCES sa_shift_assignments(id) ON DELETE SET NULL,
  worker_profile_id           uuid NOT NULL REFERENCES worker_profiles(id),
  reviewer_user_id            uuid NOT NULL REFERENCES users(id),
  punctuality_score           integer CHECK (punctuality_score BETWEEN 1 AND 5),
  service_attitude_score      integer CHECK (service_attitude_score BETWEEN 1 AND 5),
  personal_presentation_score integer CHECK (personal_presentation_score BETWEEN 1 AND 5),
  communication_score         integer CHECK (communication_score BETWEEN 1 AND 5),
  work_quality_score          integer CHECK (work_quality_score BETWEEN 1 AND 5),
  comments                    text,
  review_visibility           review_visibility DEFAULT 'internal',
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_er_worker   ON sa_employee_reviews (worker_profile_id);
CREATE INDEX idx_sa_er_shift    ON sa_employee_reviews (shift_id);
CREATE INDEX idx_sa_er_company  ON sa_employee_reviews (company_id);
```

---

### B13. `sa_report_exports`

```sql
CREATE TABLE sa_report_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES sa_companies(id),
  report_type   text NOT NULL,
  filters_json  jsonb,
  file_url      text,
  exported_by   uuid NOT NULL REFERENCES users(id),
  exported_at   timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_sa_re_company ON sa_report_exports (company_id);
```

---

## C. Dominio Parceros

### C1. `pc_marketplace_profiles`

```sql
CREATE TABLE pc_marketplace_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id     uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  display_name          text NOT NULL,
  headline              text,
  short_bio             text,
  public_photo_url      text,
  service_radius_miles  integer,
  minimum_rate          decimal(10,2),
  currency              text DEFAULT 'USD',
  is_accepting_jobs     boolean DEFAULT true,
  profile_status        mkt_profile_status DEFAULT 'draft',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_pc_mp_worker    ON pc_marketplace_profiles (worker_profile_id);
CREATE INDEX idx_pc_mp_accepting ON pc_marketplace_profiles (is_accepting_jobs) WHERE profile_status = 'active';
CREATE INDEX idx_pc_mp_status    ON pc_marketplace_profiles (profile_status);
```

---

### C2. `pc_marketplace_services`

```sql
CREATE TABLE pc_marketplace_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  category    text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

---

### C3. `pc_marketplace_profile_services`

```sql
CREATE TABLE pc_marketplace_profile_services (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_profile_id  uuid NOT NULL REFERENCES pc_marketplace_profiles(id) ON DELETE CASCADE,
  marketplace_service_id  uuid NOT NULL REFERENCES pc_marketplace_services(id) ON DELETE CASCADE,
  rate_type               mkt_rate_type,
  rate_amount             decimal(10,2),
  created_at              timestamptz DEFAULT now(),

  UNIQUE (marketplace_profile_id, marketplace_service_id)
);
```

---

### C4. `pc_job_posts`

```sql
CREATE TABLE pc_job_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id    uuid NOT NULL REFERENCES users(id),
  company_name          text,
  title                 text NOT NULL,
  description           text,
  service_category      text,
  location_text         text,
  latitude              double precision,
  longitude             double precision,
  starts_at             timestamptz,
  ends_at               timestamptz,
  budget_type           job_budget_type,
  budget_amount         decimal(12,2),
  worker_count_needed   integer DEFAULT 1,
  status                job_status DEFAULT 'draft',
  visibility            job_visibility DEFAULT 'public',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_pc_jp_status    ON pc_job_posts (status);
CREATE INDEX idx_pc_jp_category  ON pc_job_posts (service_category);
CREATE INDEX idx_pc_jp_starts    ON pc_job_posts (starts_at);
CREATE INDEX idx_pc_jp_creator   ON pc_job_posts (created_by_user_id);
```

---

### C5. `pc_job_invitations`

```sql
CREATE TABLE pc_job_invitations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id             uuid NOT NULL REFERENCES pc_job_posts(id) ON DELETE CASCADE,
  marketplace_profile_id  uuid NOT NULL REFERENCES pc_marketplace_profiles(id) ON DELETE CASCADE,
  invited_by_user_id      uuid NOT NULL REFERENCES users(id),
  invitation_status       invitation_status DEFAULT 'sent',
  sent_at                 timestamptz DEFAULT now(),
  responded_at            timestamptz,
  message                 text,
  created_at              timestamptz DEFAULT now(),

  UNIQUE (job_post_id, marketplace_profile_id)
);

CREATE INDEX idx_pc_ji_job     ON pc_job_invitations (job_post_id);
CREATE INDEX idx_pc_ji_profile ON pc_job_invitations (marketplace_profile_id);
CREATE INDEX idx_pc_ji_status  ON pc_job_invitations (invitation_status);
```

---

### C6. `pc_job_applications`

```sql
CREATE TABLE pc_job_applications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id             uuid NOT NULL REFERENCES pc_job_posts(id) ON DELETE CASCADE,
  marketplace_profile_id  uuid NOT NULL REFERENCES pc_marketplace_profiles(id) ON DELETE CASCADE,
  application_status      application_status DEFAULT 'applied',
  proposed_rate           decimal(10,2),
  message                 text,
  applied_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  UNIQUE (job_post_id, marketplace_profile_id)
);

CREATE INDEX idx_pc_ja_job     ON pc_job_applications (job_post_id);
CREATE INDEX idx_pc_ja_profile ON pc_job_applications (marketplace_profile_id);
```

---

### C7. `pc_marketplace_bookings`

```sql
CREATE TABLE pc_marketplace_bookings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id             uuid NOT NULL REFERENCES pc_job_posts(id),
  marketplace_profile_id  uuid NOT NULL REFERENCES pc_marketplace_profiles(id),
  booked_by_user_id       uuid NOT NULL REFERENCES users(id),
  booking_status          booking_status DEFAULT 'confirmed',
  agreed_rate             decimal(10,2),
  agreed_rate_type        mkt_rate_type,
  start_at                timestamptz,
  end_at                  timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX idx_pc_mb_job     ON pc_marketplace_bookings (job_post_id);
CREATE INDEX idx_pc_mb_profile ON pc_marketplace_bookings (marketplace_profile_id);
CREATE INDEX idx_pc_mb_status  ON pc_marketplace_bookings (booking_status);
```

---

### C8. `pc_marketplace_messages`

```sql
CREATE TABLE pc_marketplace_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_key  text NOT NULL,     -- formato: "user1_user2" ordenado
  sender_user_id    uuid NOT NULL REFERENCES users(id),
  recipient_user_id uuid NOT NULL REFERENCES users(id),
  job_post_id       uuid REFERENCES pc_job_posts(id) ON DELETE SET NULL,
  message_text      text NOT NULL,
  attachment_url    text,
  is_read           boolean DEFAULT false,
  sent_at           timestamptz DEFAULT now()
);

CREATE INDEX idx_pc_mm_conversation ON pc_marketplace_messages (conversation_key);
CREATE INDEX idx_pc_mm_sender       ON pc_marketplace_messages (sender_user_id);
CREATE INDEX idx_pc_mm_recipient    ON pc_marketplace_messages (recipient_user_id, is_read);
```

---

### C9. `pc_marketplace_reviews`

```sql
CREATE TABLE pc_marketplace_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            uuid NOT NULL REFERENCES pc_marketplace_bookings(id),
  reviewer_user_id      uuid NOT NULL REFERENCES users(id),
  reviewed_user_id      uuid NOT NULL REFERENCES users(id),
  worker_profile_id     uuid REFERENCES worker_profiles(id),
  rating_overall        integer NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_punctuality    integer CHECK (rating_punctuality BETWEEN 1 AND 5),
  rating_communication  integer CHECK (rating_communication BETWEEN 1 AND 5),
  rating_quality        integer CHECK (rating_quality BETWEEN 1 AND 5),
  comments              text,
  is_public             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_pc_mr_booking  ON pc_marketplace_reviews (booking_id);
CREATE INDEX idx_pc_mr_worker   ON pc_marketplace_reviews (worker_profile_id);
CREATE INDEX idx_pc_mr_reviewed ON pc_marketplace_reviews (reviewed_user_id);
```

---

## D. Reputation Engine

### D1. `rep_scores`

```sql
CREATE TABLE rep_scores (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id         uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  overall_score             decimal(4,2) DEFAULT 0,
  punctuality_score         decimal(4,2),
  attendance_score          decimal(4,2),
  communication_score       decimal(4,2),
  service_score             decimal(4,2),
  presentation_score        decimal(4,2),
  quality_score             decimal(4,2),
  reliability_score         decimal(4,2),
  total_reviews_count       integer DEFAULT 0,
  total_completed_jobs      integer DEFAULT 0,
  total_completed_shifts    integer DEFAULT 0,
  total_hours_worked        decimal(10,2) DEFAULT 0,
  no_show_count             integer DEFAULT 0,
  cancellation_count        integer DEFAULT 0,
  score_version             integer DEFAULT 1,
  last_calculated_at        timestamptz,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX idx_rep_worker ON rep_scores (worker_profile_id);
CREATE INDEX idx_rep_overall ON rep_scores (overall_score DESC);
```

---

### D2. `rep_events`

```sql
CREATE TABLE rep_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  source_type         reputation_source NOT NULL,
  source_id           uuid,
  event_weight        decimal(4,2),
  event_score         decimal(4,2),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_repe_worker ON rep_events (worker_profile_id);
CREATE INDEX idx_repe_source ON rep_events (source_type, source_id);
CREATE INDEX idx_repe_date   ON rep_events (created_at);
```

---

### D3. `rep_badges`

```sql
CREATE TABLE rep_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_code  text UNIQUE NOT NULL,
  badge_name  text NOT NULL,
  emoji       text,
  description text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

---

### D4. `rep_worker_badges`

```sql
CREATE TABLE rep_worker_badges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  reputation_badge_id uuid NOT NULL REFERENCES rep_badges(id) ON DELETE CASCADE,
  granted_at          timestamptz DEFAULT now(),
  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now(),

  UNIQUE (worker_profile_id, reputation_badge_id)
);

CREATE INDEX idx_rwb_worker ON rep_worker_badges (worker_profile_id);
```

---

## E. Worker Passport

### E1. `passport_profiles`

```sql
CREATE TABLE passport_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id           uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  passport_slug               text UNIQUE NOT NULL,
  display_name                text NOT NULL,
  primary_role                text,
  summary_text                text,
  total_verified_jobs         integer DEFAULT 0,
  total_verified_hours        decimal(10,2) DEFAULT 0,
  total_companies_worked      integer DEFAULT 0,
  total_marketplace_jobs      integer DEFAULT 0,
  overall_reputation_score    decimal(4,2),
  english_level               english_level,
  passport_visibility         profile_visibility DEFAULT 'private',
  generated_at                timestamptz,
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX idx_pp_worker     ON passport_profiles (worker_profile_id);
CREATE INDEX idx_pp_slug       ON passport_profiles (passport_slug);
CREATE INDEX idx_pp_visibility ON passport_profiles (passport_visibility) WHERE passport_visibility != 'private';
```

---

### E2. `passport_work_history`

```sql
CREATE TYPE passport_source AS ENUM ('stafly_shift', 'marketplace_booking', 'imported_experience');

CREATE TABLE passport_work_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id         uuid NOT NULL REFERENCES passport_profiles(id) ON DELETE CASCADE,
  source_type         passport_source NOT NULL,
  source_id           uuid,
  company_name        text NOT NULL,
  role_name           text,
  date_start          date,
  date_end            date,
  total_hours         decimal(8,2),
  is_verified         boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_pwh_passport ON passport_work_history (passport_id);
CREATE INDEX idx_pwh_source   ON passport_work_history (source_type, source_id);
```

---

### E3. `passport_metrics`

```sql
CREATE TABLE passport_metrics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id           uuid NOT NULL REFERENCES passport_profiles(id) ON DELETE CASCADE,
  metric_code           text NOT NULL,
  metric_label          text NOT NULL,
  metric_value          text NOT NULL,
  metric_display_order  integer DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_pm_passport ON passport_metrics (passport_id);
```

---

### E4. `passport_publications`

```sql
CREATE TABLE passport_publications (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id               uuid NOT NULL REFERENCES passport_profiles(id) ON DELETE CASCADE UNIQUE,
  publish_photo             boolean DEFAULT true,
  publish_reputation        boolean DEFAULT true,
  publish_work_history      boolean DEFAULT false,
  publish_skills            boolean DEFAULT true,
  publish_languages         boolean DEFAULT true,
  publish_city              boolean DEFAULT true,
  publish_hours             boolean DEFAULT true,
  publish_companies_count   boolean DEFAULT true,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);
```

---

## F. Disponibilidad y Mapa

### F1. `map_worker_availability`

```sql
CREATE TABLE map_worker_availability (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id     uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  availability_status   availability_status DEFAULT 'offline',
  available_from        timestamptz,
  available_until       timestamptz,
  preferred_shift_type  shift_type,
  notes                 text,
  updated_at            timestamptz DEFAULT now(),
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_mwa_worker ON map_worker_availability (worker_profile_id);
CREATE INDEX idx_mwa_status ON map_worker_availability (availability_status) WHERE availability_status = 'available';
```

---

### F2. `map_location_snapshots`

```sql
CREATE TABLE map_location_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  latitude            double precision NOT NULL,
  longitude           double precision NOT NULL,
  accuracy_meters     double precision,
  location_type       location_type DEFAULT 'approximate',
  captured_at         timestamptz DEFAULT now(),
  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_mls_worker   ON map_location_snapshots (worker_profile_id);
CREATE INDEX idx_mls_captured ON map_location_snapshots (captured_at DESC);
CREATE INDEX idx_mls_expires  ON map_location_snapshots (expires_at) WHERE expires_at IS NOT NULL;
```

**🔒 Seguridad**: Ubicación exacta solo visible para empresas con booking activo. Público = solo `approximate`.

---

### F3. `map_worker_status`

```sql
CREATE TABLE map_worker_status (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id           uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE UNIQUE,
  is_visible_on_map           boolean DEFAULT false,
  visibility_mode             map_visibility_mode DEFAULT 'hidden',
  last_location_snapshot_id   uuid REFERENCES map_location_snapshots(id) ON DELETE SET NULL,
  updated_at                  timestamptz DEFAULT now(),
  created_at                  timestamptz DEFAULT now()
);

CREATE INDEX idx_mws_visible ON map_worker_status (is_visible_on_map) WHERE is_visible_on_map = true;
```

---

### F4. `map_service_zones`

```sql
CREATE TABLE map_service_zones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  zone_name           text,
  city                text NOT NULL,
  state               text NOT NULL,
  country             text DEFAULT 'US',
  radius_miles        integer,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_msz_worker ON map_service_zones (worker_profile_id);
CREATE INDEX idx_msz_city   ON map_service_zones (city, state);
```

---

## G. Auditoría y Seguridad

### G1. `audit_logs`

```sql
CREATE TABLE audit_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id     uuid REFERENCES users(id),
  actor_email       text,
  domain_name       product_name NOT NULL,
  entity_name       text NOT NULL,
  entity_id         text,
  action_type       audit_action_type NOT NULL,
  old_values_json   jsonb,
  new_values_json   jsonb,
  company_id        uuid,
  metadata_json     jsonb,
  ip_address        inet,
  user_agent        text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_al_actor    ON audit_logs (actor_user_id);
CREATE INDEX idx_al_domain   ON audit_logs (domain_name);
CREATE INDEX idx_al_entity   ON audit_logs (entity_name, entity_id);
CREATE INDEX idx_al_company  ON audit_logs (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_al_date     ON audit_logs (created_at DESC);
```

---

### G2. `permission_policies`

```sql
CREATE TABLE permission_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name    product_name NOT NULL,
  role_name       text NOT NULL,
  permission_code text NOT NULL,
  created_at      timestamptz DEFAULT now(),

  UNIQUE (product_name, role_name, permission_code)
);
```

---

### G3. `security_events`

```sql
CREATE TABLE security_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id),
  event_type      text NOT NULL,
  severity        severity_level DEFAULT 'low',
  description     text,
  metadata_json   jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_se_user     ON security_events (user_id);
CREATE INDEX idx_se_type     ON security_events (event_type);
CREATE INDEX idx_se_severity ON security_events (severity) WHERE severity IN ('high', 'critical');
CREATE INDEX idx_se_date     ON security_events (created_at DESC);
```

---

## Diagrama de relaciones

```
                    ┌──────────┐
                    │  users   │
                    └─────┬────┘
                          │ 1:1
                    ┌─────▼──────────┐
                    │ worker_profiles │
                    └──┬──┬──┬──┬──┬─┘
                       │  │  │  │  │
         ┌─────────────┘  │  │  │  └─────────────────┐
         │                │  │  │                     │
    ┌────▼─────┐   ┌──────▼──▼──▼──────┐    ┌────────▼────────┐
    │ sa_      │   │  Reputation       │    │ pc_marketplace  │
    │ company  │   │  Engine (D)       │    │ _profiles       │
    │ _users   │   │                   │    └────────┬────────┘
    └────┬─────┘   │ rep_scores        │             │
         │         │ rep_events        │    ┌────────▼────────┐
    ┌────▼─────┐   │ rep_worker_badges │    │ pc_job_posts    │
    │ sa_      │   └───────────────────┘    │ pc_bookings     │
    │ shifts   │                            │ pc_reviews      │
    │ sa_time  │   ┌───────────────────┐    └─────────────────┘
    │ sa_gps   │   │ Worker Passport   │
    │ sa_pay   │   │ (E)               │
    └──────────┘   │                   │
                   │ passport_profiles │
                   │ passport_history  │
                   │ passport_metrics  │
                   └───────────────────┘

                   ┌───────────────────┐
                   │ Map & Availability│
                   │ (F)               │
                   │                   │
                   │ map_availability  │
                   │ map_snapshots     │
                   │ map_worker_status │
                   │ map_service_zones │
                   └───────────────────┘
```

---

## Reglas de seguridad y visibilidad

| Regla | Implementación |
|---|---|
| GPS exacto = interno empresa | `sa_gps_logs` nunca se expone en APIs públicas |
| Documentos privados por defecto | `worker_documents.is_private = true` |
| Passport opt-in | `passport_visibility != 'private'` para publicar |
| Ubicación pública = aproximada | `map_worker_status.visibility_mode` controla nivel |
| Datos empresa aislados | RLS por `company_id` en todo dominio B |
| Reviews internas vs públicas | `review_visibility` en B12; `is_public` en C9 |
| Documentos sensibles (W-9, TIN) | Solo `tin_last4` en vistas; acceso auditado |

---

## Estrategia de migración desde esquema actual

> ⚠️ **No romper el desarrollo actual.** Migración gradual.

### Fase 1 — Coexistencia
- Crear tablas nuevas con prefijos (`sa_`, `pc_`, `rep_`, `map_`, `passport_`)
- Las tablas actuales (`companies`, `employees`, `shifts`, etc.) siguen funcionando
- Crear `worker_profiles` como nueva capa que referencia `employees.id` + `auth.users.id`

### Fase 2 — Puentes de datos
- Crear vistas que unifiquen datos actuales con nuevas tablas
- Edge Functions sincronizadoras que alimenten `rep_scores` desde `shift_reviews` actuales
- Passport se genera desde datos existentes + nuevas tablas

### Fase 3 — Migración progresiva
- Nuevas features escriben en tablas nuevas
- Features existentes se migran una a una
- Se eliminan tablas legacy cuando ya no tienen dependencias

### Fase 4 — Parceros como producto independiente
- Dominio C se despliega con su propio frontend
- Comparte `worker_profiles`, `rep_*`, `passport_*` y `map_*`
- API Gateway controla qué datos cruzan entre productos

---

## APIs futuras entre productos

| API Endpoint | Dirección | Datos compartidos |
|---|---|---|
| `GET /api/worker/{slug}/passport` | Parceros → Passport | Perfil público, métricas, historial verificado |
| `POST /api/reputation/recalculate` | StaflyApps → Rep Engine | Eventos de reviews, attendance, no-shows |
| `GET /api/workers/available` | Parceros → Map | Trabajadores disponibles con ubicación aproximada |
| `POST /api/reputation/event` | Parceros → Rep Engine | Reviews del marketplace |
| `GET /api/worker/{id}/reputation` | Ambos → Rep Engine | Score consolidado |
| `PATCH /api/worker/{id}/visibility` | Worker → Núcleo | Configuración de privacidad |

---

## Recomendaciones de escalabilidad

1. **Partición por fecha**: `sa_gps_logs`, `map_location_snapshots`, `audit_logs` y `rep_events` deben particionarse por rango de fecha cuando superen 10M filas
2. **Materialized views**: `rep_scores` puede ser una materialized view con refresh periódico en lugar de tabla calculada en tiempo real
3. **Read replicas**: Queries de Parceros (marketplace search, map) deben ir a réplica de lectura
4. **Cache layer**: Passport público y reputation scores son excelentes candidatos para Redis/CDN cache (TTL 5-15 min)
5. **Event sourcing**: `rep_events` ya sigue este patrón; mantenerlo para trazabilidad completa
6. **Separate schemas**: En producción a escala, considerar `CREATE SCHEMA parceros;` y `CREATE SCHEMA staflyapps;` para aislamiento más fuerte

---

## Resumen de tablas por dominio

| Dominio | Tablas | Prefijo |
|---|---|---|
| **A. Núcleo** | 9 tablas | `users`, `worker_*` |
| **B. StaflyApps** | 13 tablas | `sa_*` |
| **C. Parceros** | 9 tablas | `pc_*` |
| **D. Reputation** | 4 tablas | `rep_*` |
| **E. Passport** | 4 tablas | `passport_*` |
| **F. Mapa** | 4 tablas | `map_*` |
| **G. Auditoría** | 3 tablas | `audit_*`, `permission_*`, `security_*` |
| **Total** | **46 tablas** | — |
