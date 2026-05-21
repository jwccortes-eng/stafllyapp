
# Worker Update Center v1 — Plan

Planning-only. No migrations, no RLS changes, no portal permission changes, no payroll/time_entries/shifts/notification edits. No worker is blocked by this plan.

Worker tone (global): *"Queremos mantener tu perfil listo para recibir trabajos y cobrar sin problemas."*

---

## 1. Requirement matrix

Categories × levels. "Level" = when it becomes required.

| Category | Fields / sources | Level | Blocks (when overdue) |
|---|---|---|---|
| Identity | first_name, last_name, date_of_birth, gender (optional display) | Before assignment | assignment, claim |
| Contact | phone_number (verified), email | Required immediately | claim, accept |
| Address | address_structured (line/city/state/zip) | Before payroll | payroll-sensitive shifts |
| Emergency contact | emergency_contact_name, emergency_contact_phone | Before assignment | assignment |
| Work profile | employee_role, skills, languages, professional_summary | Recommended | none |
| Availability | worker_availability windows | Recommended | none (visibility only) |
| Documents — core | W-9 / W-4 / Government ID / SSN_last4 | Before payroll | payroll-sensitive shifts, payout visibility |
| Documents — role | Food handler, OSHA, NDA, contracts | Before document-sensitive shifts | only those shift types |
| Driver/vehicle | has_car, driver_licence, vehicle insurance doc | Required for drivers only | driver-tagged shifts |
| Captain readiness | captain training ack, captain agreement | Required for captains only | captain assignment |
| Portal access | portal_access_enabled, PIN set, photo uploaded | Required immediately | login UX nag (not block) |
| Compliance acks | Code of conduct, anti-harassment, app TOS, privacy | Before assignment | assignment |
| Payroll readiness | bank info OR check-pay ack, W-9/W-4 approved | Before payroll | new period inclusion warning (admin-side, not worker block in v1) |

Never used as eligibility logic: gender, country_code (display only), languages-as-skill (recommendation only).

---

## 2. Deadline model

Per requirement instance:

```
requested_at → friendly_reminder → required_by → grace_until → restricted_from
       ↑                ↑                 ↑              ↑              ↑
     created        T-14 / T-7         due date     +N days        hard scope cut
```

- **Friendly reminder**: portal banner + checklist item, dismissible per session.
- **Required-by date**: copy turns serious, banner pinned.
- **Grace period** (configurable per company, default 7 days): warning + countdown.
- **Semi-blocking screen**: full-screen interstitial on portal entry with "Actualizar ahora" and "Recordar después" (allowed up to N times during grace).
- **Restricted access**: scope-limited, never global lockout.

**Restrictable scopes** (must be explicit per requirement):
- accept new shifts
- claim open shifts
- be auto-assigned
- clock in on document-sensitive shifts
- take captain role
- take driver role

**Always accessible regardless of overdue state**:
- /portal/profile, /portal/documents (upload), /portal/support
- /portal/pay-reports (legal/payroll history visibility)
- compliance messages and the Update Center itself
- emergency contact admin

---

## 3. Worker portal UX

New surface: `/portal/update-center` plus inline hooks across portal.

Components:
- **PortalUpdateBanner** — appears on /portal home when ≥1 active requirement; collapses to chip after dismiss.
- **CompletionProgressCard** — % ready, segmented by category, with "Continuar" CTA.
- **MissingItemsChecklist** — grouped by category, each row: icon, title, due chip (Pendiente / Vence en Xd / Vencido), inline CTA (Subir documento, Actualizar teléfono, Firmar, etc.).
- **DueDateChip** variants: `neutral`, `warning`, `serious`, `overdue`.
- **CategoryDrawer** — opens the right existing flow (document uploader, phone editor, address editor, ack modal).
- **FriendlyWarningBanner** — on shift accept/claim if requirement blocks scope.
- **SemiBlockingScreen** — full-screen interstitial; lists overdue items, primary CTA "Actualizar ahora", secondary "Hablar con soporte".

Mobile 390×844: stack cards, 44px tap targets, bottom nav preserved, no horizontal overflow.

Friendly empty state: *"Tu perfil está al día. Te avisaremos cuando necesitemos algo."*

---

## 4. Admin UX

New surface: `/app/compliance-center` (or tab inside existing Documents & Compliance).

Views:
- **Missing info queue**: table of workers with ≥1 open requirement, sortable by overdue/grace/required-by.
- **Per-worker compliance drawer**: requirements list with status, due dates, last reminder sent, last worker view, current restriction scope, audit trail.
- **Bulk actions**: re-request, extend grace, mark not required (with reason), mark complete (manual evidence).
- **Filters**: category, level, scope blocked, company (tenant-scoped via canAccessAdminForCompany).
- **KPI strip**: # workers compliant / in grace / overdue / restricted.

Embedded into existing employee profile via new "Cumplimiento" deep-link from the ProfileSummaryGrid Cumplimiento card.

---

## 5. Automation / reminder plan

Cadence per requirement:
- T-14d: portal banner appears (silent).
- T-7d: portal banner + 1 in-app notification.
- T-2d: portal banner serious + push (if iOS/Android available) + email.
- Day 0 (required_by): pinned banner, push, email.
- Grace start: SMS opt-in only; one nudge.
- Grace mid: admin queue surfaces worker.
- Grace end → restriction: portal interstitial; SMS once; admin notified.

Anti-spam rules:
- max 1 channel per 24h
- max 3 reminders per requirement before manual admin action required
- no SMS at night (worker tz, 21:00–08:00)
- one consolidated message per worker per day across all requirements

Channels priority: portal → push → email → SMS. Admin queue always.

---

## 6. Proposed data model (NOT created in v1)

```
worker_profile_requirements      -- catalog of possible requirements
  id, company_id, key, category, level,
  default_required_by_offset_days, default_grace_days,
  blocks_scope text[], applies_to jsonb (role/driver/captain filters),
  copy_key, version, active

worker_requirement_status        -- one row per (worker × requirement)
  id, company_id, employee_id, requirement_id,
  status enum(pending, in_grace, overdue, restricted, complete, waived, not_applicable),
  requested_at, required_by, grace_until, restricted_from,
  completed_at, completed_evidence jsonb,
  waived_by, waived_reason,
  notification_count, last_notified_at, last_seen_at

worker_update_requests           -- explicit admin ask
  id, company_id, employee_id, requirement_id,
  requested_by, requested_at, message, channel, dismissed_at

worker_update_events             -- audit trail (append-only)
  id, company_id, employee_id, requirement_id,
  event_type enum(requested, viewed, dismissed, reminded, completed,
                  grace_started, restricted, waived, reactivated),
  actor enum(system, worker, admin),
  actor_id, channel, payload jsonb, created_at
```

RLS posture (future): worker reads only own rows; admin scoped by company_id via canAccessAdminForCompany; events insert-only from defined RPCs.

---

## 7. Rules engine

Pure functions, stateless, computed from current employee + documents + acks + worker_requirement_status. No payroll mutation.

```ts
computeProfileCompletion(worker) → { pct, missingByCategory }
computeComplianceReadiness(worker) → { ok, blockingRequirements[] }
computePayrollReadiness(worker) → { ok, missing[] } // read-only, does not gate existing payroll
computeDriverReadiness(worker) → { ok, missing[] }
computeShiftEligibility(worker, shift) → { eligible, reasons[] } // checks blocks_scope
computePortalRestriction(worker) → { scopes: Set<Scope>, interstitial: boolean }
```

v1 wires `computeShiftEligibility` to UI hints only (banners/warnings), never to backend acceptance until Phase 3 approval.

---

## 8. Copy examples (Spanish-first)

- **Friendly reminder banner**: *"Queremos mantener tu perfil listo para recibir trabajos y cobrar sin problemas. Te faltan {n} datos."*
- **Serious reminder**: *"Faltan {n} datos importantes. Completa antes del {required_by} para seguir aceptando turnos."*
- **Deadline warning**: *"Hoy vence: {item}. Si no lo completas hoy, tu acceso a algunos turnos quedará limitado."*
- **Semi-blocking screen**: *"Necesitamos actualizar tu información antes de continuar. Esto toma menos de 2 minutos."* CTA: *Actualizar ahora* · *Hablar con soporte*
- **Overdue restriction (scoped)**: *"Tu cuenta no puede aceptar nuevos turnos hasta completar: {item}. Tu historial de pago y soporte siguen disponibles."*
- **Admin queue label**: *"Datos pendientes de actualización · {count} trabajadores"*
- **Empty state**: *"Todo al día. Gracias por mantener tu información actualizada."*

---

## 9. Implementation phases

Each phase ships behind a feature flag, tenant-scoped, disabled by default.

- **Phase 0 — Read-only audit (this plan)**: no code, no DB.
- **Phase 1 — Catalog + read-only Update Center**
  - Static requirement catalog in code (no new tables).
  - `/portal/update-center` displays computed missing items from existing data (employees, employee_documents, employee_onboarding_documents, worker_availability).
  - Banner on /portal home. No deadlines, no restrictions.
  - Admin: read-only compliance tab fed by same rules engine.
- **Phase 2 — Persistence + admin control**
  - Create `worker_profile_requirements`, `worker_requirement_status`, `worker_update_events`.
  - Admin can set required_by / grace_until per worker × requirement.
  - Worker UI shows due chips. Still no enforcement.
- **Phase 3 — Soft enforcement**
  - Friendly warning banners on shift accept/claim screens when computeShiftEligibility flags blocks.
  - SemiBlockingScreen on portal entry during grace.
  - Still no backend block on accept/claim.
- **Phase 4 — Scoped enforcement**
  - Backend-side guard on accept/claim/assignment for restricted scopes.
  - Driver/captain scope gates.
  - All changes RLS-reviewed, payroll math untouched.
- **Phase 5 — Automation**
  - Reminder cadence cron edge function.
  - Multi-channel (portal → push → email → SMS) with anti-spam guards.

Approval gate required before each phase. No phase starts without explicit go.

---

## 10. Risks & safety notes

- **Existing workers must not be locked out** at Phase 1–3. Restriction only after Phase 4 review and tenant opt-in.
- **Payroll history must remain visible** regardless of compliance state.
- **Document upload and support must remain accessible** always.
- **Gender must not gate eligibility**; display-only.
- **SSN/EIN never exposed**; only ssn_last4 referenced in UI/rules.
- **Audit trail mandatory** from Phase 2 onward — every automated request, reminder, restriction, and waiver logged in `worker_update_events`.
- **Tenant scoping**: admin views and reminders must use canAccessAdminForCompany; never bare has_role(admin).
- **Anti-spam**: hard caps per worker per day across all channels; quiet hours respected.
- **No regression** on /portal, /apply, /auth, /app — wrap new components in Error Boundaries; phase rollout behind per-tenant feature flag.
- **Reversibility**: every restriction must be one-click revertible by admin (waive + audit event).

---

## Deliverables for next loop (when approved)

- Phase 1 PR: catalog file, rules engine module, `/portal/update-center` read-only, admin compliance tab read-only.
- No DB migration, no RLS, no payroll, no enforcement.
