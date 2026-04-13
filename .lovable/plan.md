
## Worker Application & Onboarding Flow

### Phase 1: Database Schema
- Create `job_applications` table with fields: first_name, last_name, phone, email, worker_type, city, availability, can_drive, document_url, ssn_last4, status (pending/reviewing/approved/rejected), company_id, reference_code, notes, reviewed_by, reviewed_at
- RLS: public insert (no auth needed), company-scoped read/update for admins

### Phase 2: Public Applicant Flow (6 screens)
- Route: `/apply/:companySlug` — mobile-first, no auth required
- Step 1: Welcome (company logo + name + CTA)
- Step 2: Basic info (name, phone, email)
- Step 3: Worker type selector (visual cards)
- Step 4: Location & availability
- Step 5: Verification (document upload, optional SSN last 4)
- Step 6: Confirmation with reference number

### Phase 3: Admin Approval Panel
- Route: `/app/applications`
- Tab view: Pending / Reviewing / Approved / Rejected
- Table with avatar, name, type, status, date
- Detail drawer with tabs (Summary, Info, Documents, History)
- Approve/Reject actions that can optionally create an employee record

### Phase 4: Integration
- Add nav item for admin sidebar
- On approval → auto-create employee record + send invitation
- Detect existing users by phone/email

### Key Decisions Needed
1. Should approved applicants auto-become employees, or require a separate step?
2. Document storage: use existing `employee-documents` bucket?
3. SSN field: follow existing policy (last 4 only)?

---

# Configurable Operations Layer — Staged Product Plan

## Architecture Foundation

### What already exists
- **`company_settings`** table: key/value JSON per company, consumed by CompanyConfig page
- **`CompanyConfig.tsx`**: Generic settings renderer with `SettingConfig[]` pattern (toggles, numbers, selects, text)
- **`usePayrollConfig`** hook: Type-safe read of `payroll_config` key with defaults
- **`company_modules`** table: Feature-level toggles per company
- **`company_financial_policies`** table: Already configurable advances/loans

### Storage model
All new settings use `company_settings` with namespaced keys:
```
key: "shifts_config"      → { default_start_time, require_client, ... }
key: "clock_config"       → { grace_period_minutes, gps_enforcement, ... }
key: "onboarding_config"  → { required_fields, auto_invite_on_create, ... }
key: "payroll_config"     → already exists, extended with new fields
```

### Tenant safety
- Every `company_settings` row scoped by `company_id` (FK + RLS)
- Hook reads only for `selectedCompanyId` from `useCompany()`
- SandboxSync already supports `company_settings` sync

---

## Module 1: Shifts & Scheduling

### Standardized (never configurable)
- Draft → Published → Locked lifecycle
- Overlap prevention (DB trigger)
- Audit trail on every mutation
- Shift code auto-generation
- Notification pipeline on assignment/change

### Configurable settings (`shifts_config`)
| Setting | Type | Default | Consumed by |
|---|---|---|---|
| `default_start_time` | string | "08:00" | Create dialog pre-fill |
| `default_end_time` | string | "17:00" | Create dialog pre-fill |
| `default_slots` | number | 1 | Create dialog pre-fill |
| `require_client` | boolean | false | Create validation |
| `require_location` | boolean | false | Create validation |
| `auto_publish` | boolean | false | Create flow (skip draft) |
| `copy_week_assignments` | boolean | true | handleCopyWeek |
| `allow_claims` | boolean | true | Claimable checkbox visibility |
| `max_shift_hours` | number | 16 | Create/edit validation |
| `require_shift_admin` | boolean | false | Publish gate |

### Admin UX: Gear icon in Shifts toolbar → Sheet panel

---

## Module 2: Employee Onboarding

### Standardized
- Profile completeness check
- Rehire protection
- Employer ID auto-assignment
- Invitation lifecycle

### Configurable settings (`onboarding_config`)
| Setting | Type | Default | Consumed by |
|---|---|---|---|
| `required_fields` | string[] | ["first_name","last_name","phone_number"] | QuickAddInviteWizard |
| `require_email` | boolean | false | Create validation |
| `require_emergency_contact` | boolean | false | Profile completeness |
| `require_vehicle_docs` | boolean | false | VehicleDocumentsSection |
| `auto_invite_on_create` | boolean | false | QuickAddInviteWizard |
| `invite_expiry_days` | number | 7 | send-invite-email |
| `welcome_message` | string | "" | Portal first-login banner |

### Admin UX: Section in Company Config page

---

## Module 3: Time Clock & Attendance

### Standardized
- Overlap prevention, anomaly detection, clock audit trail, kiosk auth

### Configurable settings (`clock_config`)
| Setting | Type | Default | Consumed by |
|---|---|---|---|
| `allowed_methods` | string[] | ["manual","gps","qr","kiosk"] | Portal clock UI |
| `gps_radius_meters` | number | 200 | GPS enforcement |
| `gps_enforcement` | "none"\|"warn"\|"block" | "warn" | Clock-in validation |
| `require_photo` | boolean | false | Consolidate existing `clock_photo` key |
| `grace_period_minutes` | number | 15 | Late alert trigger |
| `auto_clock_out_hours` | number | 12 | Cron/edge function |
| `rounding_mode` | "none"\|"15min"\|"30min" | "none" | Payroll consolidation |
| `break_deduction_minutes` | number | 0 | Payroll consolidation |

### Admin UX: Consolidate existing CompanyConfig sections

---

## Module 4: Compensation & Payroll

### Standardized
- Rate hierarchy, period lifecycle, snapshot immutability, anomaly suppression

### Configurable (extend existing `payroll_config`)
| Setting | Type | Default | Consumed by |
|---|---|---|---|
| `ot_multiplier` | number | 1.5 | consolidate_period_base_pay |
| `auto_consolidate_on_close` | boolean | true | Period close flow |
| `require_all_clocks_approved` | boolean | false | Period close gate |
| `min_hours_for_daily_pay` | number | 4 | Daily pay movement logic |
| `show_pay_to_employees` | boolean | false | Portal PayStub visibility |

### Admin UX: Extend existing PayrollSettings page

---

## Shared Infrastructure (build first)

### `useCompanyConfig<T>` hook
- Reads `company_settings` WHERE company_id + key
- Returns typed config merged with defaults
- `updateConfig(partial)` does optimistic upsert
- React Query cache with `[configKey, companyId]`

### `<ModuleSettingsSheet>` component
- Slide-out Sheet with categorized fields
- Supports: toggle, number, text, select, multi-select
- Instant save per field change

---

## Execution Order
| Step | Scope | Deliverable |
|---|---|---|
| 1 | Shared | `useCompanyConfig` hook + `ModuleSettingsSheet` component |
| 2 | Shifts | Gear icon → settings sheet → pre-fill defaults |
| 3 | Shifts | Validation rules wired |
| 4 | Onboarding | Settings section + required_fields + auto_invite |
| 5 | Clock | Consolidate existing + add new settings |
| 6 | Payroll | Extend config + wire ot_multiplier |

Each step independently deployable. Defaults match current behavior (zero breaking changes).

## Deferred (Phase 2)
- Custom fields on entities
- Per-location/per-client config overrides
- Conditional logic / automation rules engine
- Form builder / dynamic forms
