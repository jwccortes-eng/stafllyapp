# Ecosystem Profile Standard v1

> **Status:** Foundations (Phase E1). Components shipped but **not yet wired**
> to any production surface. Wiring begins in Phase E2 after explicit approval.

This document defines the canonical 4-layer model for worker identity across
the Stafly ecosystem (Core, Parceros, Public Passport), consolidating lessons
from `PublicPassport`, `ConsentCenterCard`, `WorkerPassport` (legacy),
`PortalProfile`, `CompleteProfile`, `EmployeeOnboarding`, `ProfileSummaryGrid`
and `UnifiedPersonProfile`.

The full plan (phases E1–E7, risks, rollback) lives in `.lovable/plan.md`.

---

## 1. Principles

1. **One source of truth per layer.** `employees` (tenant), `worker_profiles`
   (ecosystem), `passport_profiles` (public).
2. **Visible layer ≠ stored layer.** Never expose SSN/EIN/PIN/phone/email/
   address outside the tenant-scoped admin surface.
3. **Source labeling required** when legacy + new systems coexist
   (inherited from Phase 1B.2 / 1B.3).
4. **Granular, versioned consent** before publishing any data cross-tenant
   (Parceros, public Passport, Referrals).
5. **Progressive editing.** The worker fills the profile over time; admin
   only unlocks operationally critical fields.
6. **Spanish-first operator copy** (Admin Desk) + ES/EN/HE worker portal.
7. **Zero regression** to payroll / time_entries / RLS / auth.

---

## 2. Layer model

```
┌──────────────────────────────────────────────────────────┐
│ L4 · Passport público (passport_profiles + RPC)          │  ← anyone with slug
│    display_name, primary_role, skills, reputation, KPIs  │
├──────────────────────────────────────────────────────────┤
│ L3 · Ecosystem profile (worker_profiles)                 │  ← Parceros + cross-tenant
│    bio, skills, languages, experience, visibility        │
├──────────────────────────────────────────────────────────┤
│ L2 · Tenant employee (employees)                         │  ← tenant admin
│    phone, email, address, comp, docs, photo, ssn_last4   │
├──────────────────────────────────────────────────────────┤
│ L1 · Fiscal / sensitive (contractor_w9, secrets)         │  ← admin + owner worker
│    tin_last4, signed PDF, EIN/SSN never in clear         │
└──────────────────────────────────────────────────────────┘
```

Rule: **data moves up a layer only with explicit consent and verification.**
Data moves down (public → private) automatically when consent is revoked.

---

## 3. Field standard

| Field              | L1 | L2 | L3 | L4 | Editable by            |
|--------------------|----|----|----|----|------------------------|
| legal_name         | ✓  | ✓  | —  | —  | admin tenant           |
| display_name       | —  | ✓  | ✓  | ✓  | worker                 |
| photo (reviewed)   | —  | ✓  | ✓  | ✓  | worker → admin approves|
| phone / email      | —  | ✓  | —  | —  | worker self-service    |
| address            | —  | ✓  | —  | —  | worker                 |
| emergency_contact  | —  | ✓  | —  | —  | worker                 |
| ssn_last4 / tin_last4 | ✓ | — | — | — | worker (W-9 flow)     |
| primary_role       | —  | ✓  | ✓  | ✓  | admin + worker         |
| skills / languages | —  | —  | ✓  | ✓  | worker                 |
| experience         | —  | —  | ✓  | ✓ (gated) | worker          |
| reputation_score   | —  | —  | ✓  | ✓ (gated) | system          |
| consent_records    | —  | —  | ✓  | —  | worker                 |

The same matrix is encoded in `src/lib/profile-layers.ts` via
`getLayerForField` and `canEditField` for programmatic use.

---

## 4. Components (Phase E1)

Reusable, presentational, with **no business-logic coupling**.

| Component                 | Path                                                       |
|---------------------------|------------------------------------------------------------|
| `ProfileLayerBadge`       | `src/components/profile-standard/ProfileLayerBadge.tsx`    |
| `SourceProvenanceBadge`   | `src/components/profile-standard/SourceProvenanceBadge.tsx`|
| `ConsentGate` (stub)      | `src/components/profile-standard/ConsentGate.tsx`          |
| `profile-layers` (types)  | `src/lib/profile-layers.ts`                                |

All three components are tagged `@status foundation-only — do not wire until
E2 approved`. They must not be imported into any production surface until
Phase E2 is explicitly approved.

Components deferred to later phases: `ProfileFieldRow`, `ProfileReadinessCard`
(multi-layer), `ProfileSwitcher`, canonized `PhotoReviewStatusChip`.

---

## 5. Non-regression rules (inherited and reinforced)

- **Do not touch:** `payroll_*`, `time_entries`, `pay_periods`,
  `period_base_pay`, `shift_assignments`, `clock_events`, `employees` RLS,
  auth, `auth_rate_limits`, payroll/clock edge functions.
- **Do not expose:** full SSN/EIN, PIN, raw phone/email cross-tenant,
  address cross-tenant.
- **Do not reintroduce:** double photo upload (Phase 1B.1), full SSN in
  activation (Phase 1A.1), reputation score without source label
  (Phase 1B.2 / 1B.3).
- Each phase ships its own mobile + desktop QA and is registered in memory.
