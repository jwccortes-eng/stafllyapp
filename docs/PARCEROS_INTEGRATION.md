# Parceros Integration Architecture

> StaflyApps → Parceros data sync layer. Last updated: 2026-03-14

## Overview

This document describes the **outbound integration** from StaflyApps to Parceros Marketplace.
Only public, verified, and worker-authorized data leaves StaflyApps.

**Direction:** StaflyApps → Parceros (one-way push)
**Protocol:** HTTPS REST (Edge Functions)
**Auth:** Shared API key (`PARCEROS_API_KEY`) or service-role

---

## Architecture Diagram

```
┌──────────────────────┐         ┌──────────────────────┐
│    StaflyApps DB     │         │   Parceros Platform  │
│                      │         │                      │
│  worker_profiles     │         │  /sync-worker-passport│
│  passport_profiles   │──GET───▶│                      │
│  rep_scores          │         │  /webhook-receiver   │
│  worker_skills       │         │                      │
│  visibility_settings │         └──────────────────────┘
│                      │                   ▲
│  parceros_event_queue│──POST────────────┘
└──────────────────────┘
```

---

## Edge Functions

### `parceros-sync`
Full passport payload assembler.

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `?worker_profile_id=xxx` | `x-parceros-api-key` or service-role |
| POST | `{ worker_profile_ids: [...] }` | Same (max 50) |

**Response:** `ParcerosSyncPayload` (schema v1.0)

### `parceros-webhook`
Event dispatcher for real-time sync.

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `{ event_type, stafly_worker_id, data? }` | service-role only |

**Events:** `worker.updated`, `review.created`, `reputation.updated`, `shift.completed`, `badge.earned`, `passport.consolidated`

---

## Payload Schema (v1.0)

```typescript
{
  schema_version: "1.0",
  generated_at: "ISO-8601",
  source: "stafly_apps",
  worker: {
    stafly_worker_id: "uuid",
    public_slug: "string|null",
    profile: { first_name, headline, city, english_level, years_of_experience, ... },
    skills: [{ name, category, proficiency_level, years_experience }],
    verified_metrics: { total_verified_hours, total_verified_jobs, total_companies_worked, certifications_count },
    reputation: { overall_score, punctuality, quality, service, professionalism, teamwork, presentation, ... },
    badges: [{ badge_code, badge_name, emoji, earned_at }],
    work_history: [{ company_name, role_name, date_start, date_end, total_hours, is_verified }],
    visibility: { show_first_name, show_skills, show_reputation, ... },
    profile_updated_at, passport_updated_at, reputation_updated_at
  }
}
```

---

## Data Exclusion (NEVER exported)

| Category | Examples |
|----------|----------|
| Payroll | Rates, movements, period_base_pay, pay periods |
| Clients | Client names, IDs, contact info |
| PII | Exact addresses, phone, email, SSN/TIN |
| Internal | Manager notes, private documents, chat messages |
| Auth | Access PINs, user_ids, sessions |

---

## Visibility Enforcement

All data is filtered through `worker_visibility_settings`:

- If `show_skills = false` → skills array is empty
- If `show_reputation = false` → all reputation fields are null
- If `show_work_history = false` → work_history is empty
- If `is_available_for_marketplace = false AND is_profile_public = false` → worker is excluded entirely

---

## Event Queue (`parceros_event_queue`)

Internal queue table for outbound events:
- RLS enabled, NO policies (service-role only access)
- Status: `pending` → `sent` | `failed`
- Retry support via `retry_count` field
- Future: cron job to retry failed events

---

## Secrets Required

| Secret | Purpose | Status |
|--------|---------|--------|
| `PARCEROS_API_KEY` | Authenticate Parceros requests | ⏳ Pending |
| `PARCEROS_WEBHOOK_URL` | Target URL for event forwarding | ⏳ Pending |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Over-sharing PII | Visibility settings filter + explicit exclusion list |
| Unauthorized access | API key auth + service-role restriction |
| Stale data | Timestamps on every payload field + event-driven sync |
| Parceros downtime | Event queue with retry mechanism |
| Schema drift | `schema_version` field for forward compatibility |

---

## E2E Testing Plan

### Phase 1: Local Validation
1. Call `parceros-sync` with a test `worker_profile_id`
2. Verify payload structure matches schema
3. Verify excluded fields are NOT present
4. Verify visibility settings are respected
5. Test with `is_available_for_marketplace = false` → expect null

### Phase 2: Event Flow
1. Call `parceros-webhook` with each event type
2. Verify event is queued in `parceros_event_queue`
3. Set `PARCEROS_WEBHOOK_URL` to a request bin
4. Verify forwarded payload arrives correctly

### Phase 3: Integration
1. Configure `PARCEROS_API_KEY` on both sides
2. Parceros calls `parceros-sync` for a real worker
3. Verify data renders correctly on Parceros marketplace
4. Test visibility toggle changes propagate via events

---

## Next Steps

1. **Set `PARCEROS_API_KEY` secret** when Parceros provides it
2. **Set `PARCEROS_WEBHOOK_URL`** when Parceros endpoint is ready
3. **Add DB triggers** on `worker_profiles`, `rep_scores`, `passport_profiles` to auto-dispatch events
4. **Cron job** for retrying failed events in queue
5. **Rate limiting** on `parceros-sync` for external access
