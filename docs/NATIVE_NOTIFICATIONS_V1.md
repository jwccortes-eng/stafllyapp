# Stafly Core Native Notifications v1 — Spec (NOT IMPLEMENTED)

Status: **Documentation only.** No push code, no Capacitor plugin, no edge
function, no DB changes. This file is the agreed-upon scope for the future
native push phase. Do not start implementation without explicit approval.

## Principle

Sound + push must be reserved for events that affect **real day-of operations**
or directly affect the assigned worker / manager. Everything else stays in the
in-app inbox / log and is configurable.

## Critical (push + sound)

### Worker
- New shift assigned
- Open shift available to claim
- Shift time changed
- Shift address changed
- Meeting point changed
- Shift canceled
- Message in shift / work group
- Request approved or rejected

### Admin / Manager
- Critical understaffed shift
- Worker did not arrive
- Long open clock
- Operational message
- Request affecting coverage
- Urgent day-of change

## Non-critical (inbox / log only, configurable, no sound)

- Missing photo
- Missing email
- Missing emergency contact
- Duplicate review
- Data quality items
- Profile incomplete

## Out of scope for v1

- Marketing / engagement pushes
- Daily digests
- Parceros community pings inside Stafly Core

## Implementation notes (for the future phase)

- Use Capacitor Push Notifications + APNs / FCM.
- Reuse existing `notifications` table; add `is_critical` + `delivered_push_at`.
- Sound channel must be distinct for critical vs ambient.
- Quiet hours respected for non-critical only; critical always delivers.
- Per-user preferences live in a `notification_preferences` table; never block
  critical operational alerts via preferences.
- Do NOT touch payroll, time_entries, scheduled_shifts, attendance,
  period_base_pay, documents, kiosk, tenant isolation or Connecteam import logic
  when this phase ships.
