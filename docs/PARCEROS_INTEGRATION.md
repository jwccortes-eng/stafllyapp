# Parceros Integration Architecture

> StaflyApps → Parceros data sync layer. Last updated: 2026-03-14

## Overview

Outbound integration from StaflyApps to Parceros Marketplace.
Only public, verified, and worker-authorized data leaves StaflyApps.

**Direction:** StaflyApps → Parceros (one-way push)
**Protocol:** HTTPS REST (Edge Functions)
**Auth:** `x-api-key` header with shared `PARCEROS_API_KEY`

---

## Endpoints Used

### StaflyApps → Parceros (outbound calls)

| Parceros Endpoint | Method | Header | Purpose |
|---|---|---|---|
| `{PARCEROS_BASE_URL}/sync-worker-passport` | POST | `x-api-key: {PARCEROS_API_KEY}` | Push verified worker passport data |
| `{PARCEROS_BASE_URL}/webhook-receiver` | POST | `x-api-key: {PARCEROS_API_KEY}` | Forward real-time events |

### StaflyApps Internal (edge functions)

| Function | Method | Auth | Purpose |
|---|---|---|---|
| `parceros-sync` | GET/POST | Service-role or admin user (getClaims) | Build payload & optionally push |
| `parceros-webhook` | POST | Service-role only | Queue & forward events |

---

## Secrets Required

| Secret | Purpose | Where Used |
|---|---|---|
| `PARCEROS_API_KEY` | Authenticate all calls TO Parceros | `x-api-key` header on outbound |
| `PARCEROS_BASE_URL` | Base URL of Parceros API (e.g. `https://api.parceros.app`) | URL construction |

---

## Request Examples

### POST /sync-worker-passport

```json
// Headers
{
  "Content-Type": "application/json",
  "x-api-key": "pk_parceros_xxxx"
}

// Body
{
  "external_worker_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "display_name": "Jorge Cortés",
  "skills": ["Cleaning", "Floor Care", "Window Washing"],
  "years_experience": 5,
  "english_level": "intermediate",
  "total_hours_worked": 1240.5,
  "total_verified_jobs": 312,
  "total_companies_worked": 4,
  "reputation_score": 87.5,
  "ratings_breakdown": {
    "punctuality": 4.2,
    "quality": 4.5,
    "service": 3.8,
    "professionalism": 4.0,
    "teamwork": 3.9,
    "presentation": 4.1
  },
  "certifications_count": 2,
  "work_history_summary": "CleanCo (Floor Technician); BrightStaff (General Cleaner); ProServ (Team Lead)",
  "last_synced_at": "2026-03-14T15:30:00.000Z",
  "source": "staflyapps",
  "external_data": { "...full ParcerosSyncPayload v1.0 for audit..." }
}
```

### POST /webhook-receiver

```json
// Headers
{
  "Content-Type": "application/json",
  "x-api-key": "pk_parceros_xxxx"
}

// Body
{
  "event_type": "reputation.updated",
  "source": "staflyapps",
  "external_worker_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "payload": {
    "overall_score": 88.2,
    "previous_score": 87.5,
    "trigger": "new_review"
  },
  "timestamp": "2026-03-14T15:35:00.000Z"
}
```

---

## Auth Changes from v1

| Before (v1) | After (v2 — current) |
|---|---|
| `x-parceros-api-key` header | `x-api-key` header |
| `authorization.includes(serviceRoleKey)` check | Strict `Bearer {serviceRoleKey}` comparison |
| Mixed auth patterns | Service-role OR getClaims() for admin users |

---

## Data Flow

```
┌──────────────────────┐                    ┌──────────────────────┐
│    StaflyApps         │                    │   Parceros Platform  │
│                       │                    │                      │
│  parceros-sync        │                    │                      │
│  ├─ buildWorkerPayload│                    │                      │
│  ├─ toParcerosSyncBody│───POST────────────▶│  /sync-worker-passport│
│  └─ pushWorkerPassport│   x-api-key        │                      │
│                       │                    │                      │
│  parceros-webhook     │                    │                      │
│  ├─ queue event       │───POST────────────▶│  /webhook-receiver   │
│  └─ forward           │   x-api-key        │                      │
│                       │                    └──────────────────────┘
│  parceros_event_queue │
│  (retry failed events)│
└──────────────────────┘
```

---

## Event Types

| Event | When | Payload |
|---|---|---|
| `worker.updated` | Profile, skills, or availability change | Partial worker data |
| `review.created` | New shift review submitted | Review scores |
| `reputation.updated` | rep_score recalculated | New/old scores |
| `shift.completed` | Time entry approved with clock_out | Shift summary |
| `badge.earned` | New badge awarded | Badge info |
| `passport.consolidated` | Weekly consolidation ran | Updated metrics |

---

## Retry Logic

1. Event queued in `parceros_event_queue` with `status: pending`
2. Forward attempted immediately
3. On success: `status: sent`, `sent_at` set
4. On failure: `status: failed`, `error_message` set, `retry_count++`
5. **Cron job** (to be configured) retries failed events:
   - Max 5 retries
   - Exponential backoff: 1m, 5m, 15m, 60m, 360m
   - After max retries: `status: dead_letter`

---

## Data Exclusion (NEVER exported)

| Category | Examples |
|---|---|
| Payroll | Rates, movements, period_base_pay, pay periods |
| Clients | Client names, IDs, contact info |
| PII | Exact addresses, phone, email, SSN/TIN |
| Internal | Manager notes, private documents, chat messages |
| Auth | Access PINs, user_ids, sessions |

---

## E2E Testing Plan (1 Worker)

### Prerequisites
1. Set secrets: `PARCEROS_API_KEY`, `PARCEROS_BASE_URL`
2. Have a worker_profile with `is_available_for_marketplace = true`
3. Worker has: skills, rep_score, passport data, visibility settings

### Step 1: Read Payload (no push)
```bash
curl -X GET \
  "https://{PROJECT_REF}.supabase.co/functions/v1/parceros-sync?worker_profile_id={WP_ID}" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}"
```
**Validate:**
- ✅ Response contains `payload` and `parceros_body`
- ✅ `parceros_body.external_worker_id` matches worker_profile_id
- ✅ `parceros_body.source` === `"staflyapps"`
- ✅ Skills array has correct names
- ✅ No payroll, client, or PII data present
- ✅ Visibility settings respected (toggle off skills → empty array)

### Step 2: Push to Parceros
```bash
curl -X POST \
  "https://{PROJECT_REF}.supabase.co/functions/v1/parceros-sync" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"worker_profile_ids": ["{WP_ID}"], "push": true}'
```
**Validate:**
- ✅ `push_results[0].pushed === true`
- ✅ `push_results[0].status === 200`
- ✅ `parceros_event_queue` has entry with `status: sent`
- ✅ `profile_access_log` has entry with `access_type: parceros_push`
- ✅ **On Parceros side**: Worker passport appears/updates correctly

### Step 3: Send Event
```bash
curl -X POST \
  "https://{PROJECT_REF}.supabase.co/functions/v1/parceros-webhook" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"event_type": "reputation.updated", "stafly_worker_id": "{WP_ID}", "data": {"overall_score": 88}}'
```
**Validate:**
- ✅ `forwarded === true`
- ✅ `parceros_event_queue` has entry with `status: sent`
- ✅ **On Parceros side**: Event logged, reputation updated

### Step 4: Failure Handling
1. Set `PARCEROS_BASE_URL` to an invalid URL
2. Push again → should get `pushed: false`
3. Check `parceros_event_queue`: entry with `status: failed`, `error_message` set
4. Restore correct URL
5. (Future) Cron retry picks up and succeeds

### Step 5: Visibility Enforcement
1. Set `show_reputation = false` in worker_visibility_settings
2. Push again
3. Verify `reputation_score: null` and empty `ratings_breakdown` in Parceros

---

## Next Steps

1. ⏳ Configure `PARCEROS_API_KEY` and `PARCEROS_BASE_URL` secrets
2. ⏳ Set up cron job for retry of failed events
3. ⏳ Add DB triggers on `worker_profiles`, `rep_scores` to auto-dispatch events
4. ⏳ Rate limiting on parceros-sync for abuse prevention
5. ⏳ Monitoring dashboard for sync health
