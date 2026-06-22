# Stafly Auth Password Refactor — Design for PIN Hash Reader Flip

> **Sprint S6 — design-only.** No code, no SQL, no RPC, no edge-function, no RLS, no auth, no payroll, no data changes in this sprint. Companion to `docs/STAFLY_SECURITY_PHASE_2_PLAN.md`.

---

## 1. Why this document exists

S4 added the hash columns (`access_pin_hash`, `pin_hash_version`, `pin_set_at`, `pin_migrated_at`). S4-B mirrored writes in `employee-auth`. S5 cleaned `SECURITY DEFINER` grants. **The reader is still plaintext** because `employee-auth` derives the Supabase auth password directly from the 4-digit PIN:

```ts
// supabase/functions/employee-auth/index.ts:136
const AUTH_PWD_PREFIX = "SF_";
function authPassword(pin: string): string {
  return AUTH_PWD_PREFIX + pin;
}
```

The same scheme is duplicated in `supabase/functions/bulk-portal-invite/index.ts:9`. As long as Supabase auth users have password = `"SF_" + access_pin`, we cannot:

- flip readers to `access_pin_hash`,
- null / drop `access_pin`,
- change PIN length or format,
- rotate the PIN without simultaneously rotating the Supabase password.

**This sprint designs how to break that coupling safely.** No implementation.

---

## 2. Current flow map (audit)

### 2.1 Where the plaintext PIN is touched

| Surface | File | Behavior |
|---|---|---|
| Activation | `employee-auth` action `activate` (L263–411) | Writes `access_pin = pin` + `authPassword(pin)` → `createUser` / `updateUserById`. Then `signInWithPassword({ email: emp_*@employee.internal, password: "SF_"+pin })`. |
| Login | `employee-auth` action `login` (L556–700) | Equality check `employee.access_pin === pin`, then `signInWithPassword`. If the auth user is missing/desynced, it self-heals via `createUser` / `updateUserById({ password: pwd })`. |
| Provision PIN | `employee-auth` action `provision-pin` (L770–793) | Admin generates new 4-digit PIN, writes `access_pin = newPin`, updates auth user password. |
| Change PIN | `employee-auth` action `change-pin` (L878–911) | Worker self-service. Verifies `current_pin === emp.access_pin`, writes new PIN, updates auth password. |
| Sync passwords | `employee-auth` action `sync-pins` (L829–846) | Bulk: for each employee with `access_pin` + `user_id`, calls `updateUserById({ password: "SF_"+access_pin })`. Read-only on `employees`. |
| Bulk portal invite | `bulk-portal-invite/index.ts` (L196, L250) | Same `"SF_" + pin` derivation when seeding/activating portal users. |
| Kiosk clock | `kiosk-clock/index.ts:129` | Pure equality: `employee.access_pin !== pin`. **No Supabase auth involved.** |
| Front-desk check-in | `front-desk-checkin/index.ts:210` | Pure equality: `pin === emp.access_pin`. **No Supabase auth involved.** |

### 2.2 What depends on plaintext PIN

| Dependency | Type | Blocker for reader flip? |
|---|---|---|
| Supabase auth password = `"SF_" + access_pin` | Derived | **Yes (primary)** |
| `employee.access_pin === pin` equality in `login` | Validation | Yes — replaceable by `crypt(pin, access_pin_hash) = access_pin_hash` |
| `employee.access_pin === pin` in `kiosk-clock` | Validation | Yes — same replacement |
| `employee.access_pin === pin` in `front-desk-checkin` | Validation | Yes — same replacement |
| `current_pin === emp.access_pin` in `change-pin` | Validation | Yes — same replacement |
| Self-healing path in `login` (recreates auth user from PIN) | Recovery | Yes — needs an alternative secret to restore |
| `sync-pins` admin tool | Operational | Yes — only meaningful if password ≠ PIN |
| Portal banner "Tu PIN ya está configurado" (`send-employee-credentials`) | UX | No — just reads `employee_has_access_pin` |

### 2.3 What does **not** depend on plaintext PIN

- All RLS policies (use `has_role`, `has_company_role`, `is_global_owner`, etc. — none reference `access_pin`).
- Payroll: `pay_periods`, `period_base_pay`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, `reconciliation_*`, `historical_payroll_entries`, Connecteam pipeline — **zero references** to `access_pin` / `access_pin_hash`.
- Tenant governance (`companies.status`, `is_active` triggers).
- Worker documents storage policies.
- `setup-company`, billing, notifications.

### 2.4 Risk surface today

| Risk | Severity | Notes |
|---|---|---|
| 10⁴ password search space per worker | High | `"SF_"` prefix is a public constant in the repo; if `email = emp_*@employee.internal` is known, brute force = 10k attempts. Supabase auth applies rate limits but the password entropy itself is trivial. |
| PIN plaintext stored in `employees.access_pin` | Medium | Mitigated by column grants + RLS; still readable by admins of the tenant and by anyone who can run a SELECT through a service-role edge function. |
| PIN reuse across tenants (same worker, multiple companies) | Medium | Each `employees` row has its own PIN; not federated. Acceptable. |
| Auth password = PIN means rotating PIN also rotates session secret | Operational | Today this is intentional; the refactor must preserve "change PIN ⇒ all old sessions still valid OR explicitly invalidated" semantics. |

---

## 3. Refactor options

### Option A — Keep "password derived from PIN" during transition

Keep `authPassword(pin) = "SF_" + pin` and only flip the **validation reader** to bcrypt (`crypt(pin, access_pin_hash)`), leaving the Supabase auth password derivation unchanged.

| Pros | Cons / Risks |
|---|---|
| Minimal change. Reader flip becomes a single function swap. | Plaintext PIN is still the de-facto secret because the Supabase password is derived from it. No real entropy gain. |
| Easy rollback (single feature flag). | Cannot null `access_pin` — `sync-pins` and login self-heal both need it. |
| Compatible with current `signInWithPassword` shape. | Brute-force surface against Supabase auth is unchanged. |

**Verdict:** insufficient on its own. Useful only as a **stepping stone** to validate the bcrypt-read path without touching auth.

### Option B — Random, server-managed Supabase password decoupled from PIN

Generate a high-entropy random password per worker (e.g. 32 bytes base64) the first time they activate. Store it server-side in a new column `auth_password_secret` (encrypted at rest via pgsodium or stored only as the Supabase-side password, never in our DB). PIN becomes a **gate** validated against `access_pin_hash`; on PIN success, edge function calls `signInWithPassword` using the worker's stored random password.

| Pros | Cons / Risks |
|---|---|
| Cuts entropy dependency on the 4-digit PIN. | Adds a new secret-management surface. If we store the random password in our DB, that table becomes the new crown jewel. |
| `access_pin_hash` becomes the sole PIN-related secret; `access_pin` can eventually be nulled. | `sync-pins` must be rewritten (no longer derivable from PIN). |
| Compatible with future PIN-attempt lockout (independent of Supabase rate limits). | Lost worker rows lose the auth password too — recovery path = admin reset that mints a new random password and (optionally) a new PIN. |
| Same `signInWithPassword` shape; no client-app changes. | Requires careful storage choice: we strongly recommend **not** persisting the password in our DB. Instead generate-on-activate, push to Supabase auth, and never read it back; mint a fresh one on every PIN change. |

**Variant B′ (recommended):** never store the password. On every PIN write (activate / provision / change / reset), generate a fresh random password, `updateUserById({ password: random })`, and immediately use it in `signInWithPassword` *inside the same edge-function invocation only*. Worker never sees it; admin never sees it; DB never stores it. This decouples Supabase auth entirely from `access_pin` while keeping the worker UX (enter phone + PIN → get session) identical.

### Option C — Passwordless: server-issued session token after PIN validation

Skip `signInWithPassword` entirely. After validating PIN against `access_pin_hash`, the edge function uses Supabase Admin SDK to **mint a session** for the worker directly (`auth.admin.generateLink` → magic link consumed server-side, or a custom JWT signed with the project's JWT secret) and returns `access_token` + `refresh_token` to the client.

| Pros | Cons / Risks |
|---|---|
| Removes the concept of "worker password" entirely. | Highest implementation complexity. Custom JWT minting requires careful claims, expiry, and key rotation. |
| Hash becomes the only PIN-related secret. | Magic-link path adds a synthetic email round-trip — adds latency and a new failure mode. |
| Future-proof for SSO / OTP / WhatsApp-OTP migration. | Diverges from the rest of the Supabase auth surface (admin invites, password recovery emails, etc. still expect a password). |

**Verdict:** strategically attractive long-term but **out of scope** for the PIN-hash reader flip. Defer to a separate "Worker Auth v3" track.

### Option D — Hybrid dual-mode bridge with per-tenant feature flag

Combine Option B′ with a per-tenant flag `security.pin_hash_enabled`:

- **Off (default):** current behavior. Plaintext reader. `"SF_"+pin` password. Zero behavior change.
- **On:** validation reads `access_pin_hash`. On every PIN write, mint a fresh random Supabase password (Option B′). `access_pin` continues to be written (dual-write) until tenant graduates.
- **Locked:** flag becomes "enforced", `access_pin` writes are skipped, eventually nulled.

This is the **recommended** umbrella: it lets Stafly Demo / Sandbox / QA run on the new path while every real tenant stays bit-for-bit identical to today.

---

## 4. Recommended architecture (final)

**Adopt Option D = Option B′ behind a per-tenant feature flag `security.pin_hash_enabled`.**

### 4.1 Worker authentication contract (target)

1. Client posts `{ phone, pin }` to `employee-auth` action `login`.
2. Edge function resolves `employees` row by phone (existing logic, unchanged).
3. **Validation:** if `pin_hash_enabled(company_id) AND access_pin_hash IS NOT NULL` → `extensions.crypt(pin, access_pin_hash) = access_pin_hash`. Otherwise fall back to `access_pin === pin` (legacy).
4. **Session minting:** generate `password = crypto.randomBytes(32).toString("base64url")`, call `updateUserById({ password })`, then `signInWithPassword({ email: emp_*@employee.internal, password })`. Discard `password` from memory. Never logged, never returned.
5. Return session JSON to client (shape unchanged).

### 4.2 Role of each PIN artifact (target)

| Artifact | Role |
|---|---|
| `access_pin` (plaintext) | Legacy reader fallback; written during transition; nulled per-tenant only after S7-D approval. |
| `access_pin_hash` (bcrypt) | New canonical PIN secret. Validated via `crypt()`. |
| `pin_hash_version` | Algorithm pinning (`bcrypt`, future `argon2id`, etc.). |
| `pin_set_at` | Used by future lockout / rotation policy. |
| `pin_migrated_at` | Marker that the row was hash-backfilled (vs. organically dual-written). |
| Supabase auth password | Ephemeral per-login random string. Never derived from PIN. Never stored in our DB. |

### 4.3 PIN write path (target)

Every write site (`activate`, `provision-pin`, `change-pin`, `set_employee_access_pin`, `reset_employee_access_pin`, `bulk-portal-invite` activation) calls a single helper:

```text
write_pin(employee_id, new_pin, mode):
  if mode == 'dual':            # tenant flag off
    employees.access_pin = new_pin
    employees.access_pin_hash = bcrypt(new_pin)
    auth.password = "SF_" + new_pin       # legacy
  elif mode == 'hash':          # tenant flag on
    employees.access_pin = new_pin        # still mirrored
    employees.access_pin_hash = bcrypt(new_pin)
    auth.password = random_32_bytes()     # new
  elif mode == 'hash_only':     # tenant graduated (S7-D)
    employees.access_pin = NULL
    employees.access_pin_hash = bcrypt(new_pin)
    auth.password = random_32_bytes()
```

### 4.4 Anti-lockout rules

- **Never** flip a tenant into `hash` mode without verifying `COUNT(*) FILTER (access_pin IS NOT NULL AND access_pin_hash IS NULL) = 0` for that tenant.
- **Never** flip a tenant into `hash_only` mode without (a) ≥ 1 full payroll cycle in `hash`, (b) explicit owner approval, (c) zero `employee-auth` 401s attributable to hash mismatch in the last 14 days.
- Login fallback: if `crypt()` validation fails but `access_pin === pin` succeeds AND `mode != 'hash_only'`, emit `pin.hash_mismatch_fallback` metric, accept the login, and lazily re-hash. This guarantees we cannot lock out a worker whose hash was somehow corrupted.
- Kiosk and front-desk read the same flag and use the same fallback ladder.

### 4.5 Rollback strategy

- **Per tenant:** flip `security.pin_hash_enabled = false`. Next login falls back to plaintext path; the random Supabase passwords minted under `hash` mode are immediately replaced by `"SF_" + access_pin` on the next login self-heal (or by an admin `sync-pins`).
- **Per worker:** admin `reset_employee_access_pin` always works in either mode.
- **Global:** revert the edge-function deployment. Schema columns are additive — no migration rollback needed.

---

## 5. Phased plan

| Sprint | Scope | Tenants | Behavior |
|---|---|---|---|
| **S7-A** Feature-flag scaffolding | Add `company_settings` row `security.pin_hash_enabled = false` (default). Add `useSecurityFlags` hook + edge-function helper `isPinHashEnabled(company_id)`. No call-site uses it yet. | All (off everywhere) | Bit-for-bit identical to today. |
| **S7-B** Dual-mode reader, demo only | Implement `crypt()` reader + random-password write path inside `employee-auth` only. Flip flag to `on` for Stafly Demo Company (`d3500000-…0001`). Validate full QA matrix. | Stafly Demo | Demo workers authenticate via hash; real tenants unchanged. |
| **S7-C** Extend to Sandbox + QA, then `kiosk-clock` + `front-desk-checkin` | Flip flag for Sandbox + QA Testing. Once stable for 7 days, mirror the dual-mode reader into `kiosk-clock` and `front-desk-checkin`. | Sandbox, QA Testing | All worker auth surfaces use hash for these 3 tenants. |
| **S7-D** Real-tenant pilot | Owner-approved pilot tenant. Monitor metrics for ≥ 1 full payroll cycle. | 1 pilot tenant (TBD) | Real workers authenticate via hash; payroll observably unchanged. |
| **S7-E** Plaintext deprecation plan (design only) | Document criteria for `hash_only` mode and the `access_pin = NULL` migration. **Not executed.** | — | — |
| **S7-F** (gated on explicit approval, not pre-scheduled) | Execute `hash_only` per tenant. | Per approval | Plaintext PIN nulled tenant-by-tenant. |

Each phase has its own approval gate. **No phase deletes plaintext.**

---

## 6. QA matrix (to run during S7-B onward)

Repeat for each tenant profile: **Stafly Demo**, **Sandbox**, **QA Testing**, **real-tenant smoke (read-only)**.

| # | Flow | Worker state | Expected |
|---|---|---|---|
| 1 | Activation (`activate`) | New worker, no `user_id` | Auth user created, `access_pin` + `access_pin_hash` set, session returned. |
| 2 | Activation re-run | `user_id` exists, `access_pin` set | `already_activated` 409. |
| 3 | Login | Worker with hash + plaintext | Hash path succeeds; no fallback metric. |
| 4 | Login | Worker with plaintext only (hash NULL) | Fallback path succeeds; lazy re-hash fires. |
| 5 | Login | Worker with hash, wrong PIN | 401 with rate-limit increment. |
| 6 | Change PIN | Auth worker | Hash updated; new random Supabase password minted; new session works on next login. |
| 7 | Provision PIN (admin) | Worker without PIN | New PIN returned to admin once; hash written; old auth user (if any) password rotated. |
| 8 | Reset PIN (admin RPC) | Worker with PIN | Same as #7. |
| 9 | Kiosk clock | Worker with hash | Hash validation succeeds. |
| 10 | Kiosk clock | Worker plaintext only | Fallback succeeds. |
| 11 | Front-desk PIN | Same matrix | Same results. |
| 12 | Portal session | After #6 | Existing session valid until natural expiry; new logins use new password. |
| 13 | `sync-pins` admin tool | Mixed tenants | In `dual` mode: behaves as today. In `hash` mode: tool refuses (or no-ops) — documented. |
| 14 | Real-tenant smoke | Untouched real tenant | All 13 flows behave exactly as before S7. |
| 15 | Payroll smoke | Any tenant | Connecteam reconciliation period closes with no diff attributable to auth changes. (Should be trivially true — payroll has zero dependency on PIN.) |

---

## 7. Multi-tenant safety

- **Per-tenant flag** stored in `company_settings (namespace='security', key='pin_hash_enabled', value::bool)`.
- **Default off.** New tenants inherit the legacy path.
- **Rollout order, non-negotiable:** Stafly Demo → Sandbox → QA Testing → 1 approved real pilot → expansion.
- **Real tenants** require explicit owner approval per tenant + a 14-day observation window + zero hash-mismatch fallbacks in the last 7 days before they can move to `hash_only`.
- **Rollback** = flip flag off. Tested in S7-A before any tenant goes live.

---

## 8. Security considerations

| Concern | Handling |
|---|---|
| Log hygiene | Never log `pin`, `access_pin`, `access_pin_hash`, generated password, or `pwd` variables. Strip from error messages. Existing `[phone-login]` log already omits PIN — keep it that way. |
| Bcrypt cost | Stay at `bf, 10` (S4 default). Re-evaluate to 12 only after pilot if edge-function latency budget allows (<150 ms p95 per `crypt` call). |
| Rate limit | Reuse existing `auth_rate_limits` for `phone + action='login'`. Add a separate counter `pin_attempts` per `employee_id` populated by the edge function on PIN-validation failures (already a planned column from S3). |
| Lockout | Design only in S6. Implementation gated on S7-B observability. Soft-lock after 10 failed attempts in 15 min; auto-unlock after 15 min; admin `reset` clears counter. |
| Audit log | Each PIN write emits an `activity_log` row with `action ∈ {activate_pin, set_access_pin, reset_access_pin, change_pin}`, `details = {via, hash:'dual'|'hash'|'hash_only'}`. No PIN/hash in payload. |
| Session expiry | Unchanged — driven by Supabase auth project settings. The refactor does not extend or shorten sessions. |
| Stolen PIN risk | Unchanged from today; mitigated by rate limit + lockout (S7-B). Random-password Supabase layer means a stolen PIN cannot be turned into a Supabase password guess. |
| Storage of generated passwords | **None.** Generated in memory, pushed to `auth.admin.updateUserById`, consumed once by `signInWithPassword`, discarded. |
| Key rotation | If we ever need to rotate `pin_hash_version`, lazy re-hash on next successful login (Option B′ already does this for fallback). |

---

## 9. Payroll safety statement

This refactor **does not** touch:

- `pay_periods`, `period_base_pay`, `payroll_adjustments`, `payroll_*`,
- `time_entries`, `clock_events`, `attendance_*`,
- `scheduled_shifts`, `shift_assignments`, `shift_*`,
- `reconciliation_*`, `historical_payroll_entries`,
- Connecteam pipeline (`migration_*`, normalizers, import batches),
- tenant governance (`companies.status`, `is_active`, triggers),
- `setup-company`, billing, notifications, worker documents.

There is **no code path** in the proposed design where PIN/auth state can influence payroll math. Payroll authority continues to be Connecteam truth files reconciled against native `time_entries`, per `mem://business-logic/connecteam-payroll-model` and `mem://features/reconciliation/payroll-audit-and-matching-engine`.

---

## 10. Open questions (resolve in S7-A planning)

1. **Where lives the flag?** `company_settings` (preferred) vs. a new column on `companies`. Recommendation: `company_settings` namespace `security`, value JSONB to allow future flags (`pin_hash_enabled`, `pin_lockout_enabled`, `kiosk_geofence_enforce`, etc.).
2. **`sync-pins` semantics under `hash` mode.** Either (a) refuse with explanatory error, or (b) silently re-roll the random Supabase password for each linked auth user without touching `access_pin`. Recommendation: (b), audit-logged.
3. **Bulk portal invite under `hash` mode.** Must use the same write helper; recommendation: extract `writePinDualOrHash()` into `_shared/` and import from both `employee-auth` and `bulk-portal-invite`.
4. **Kiosk-clock + front-desk-checkin order.** Either flip them together with `employee-auth` per tenant (simpler) or stage them after. Recommendation: together — they share the same PIN, so split modes risk operator confusion.
5. **Observability.** Decide metric sink (existing `activity_log` is OK; consider a tiny `auth_pin_events` table if we want time-series). Defer to S7-A.

---

## 11. What was NOT touched in S6

- No code changes.
- No SQL / migrations / grants.
- No RPC body changes.
- No edge-function deploys.
- No RLS changes.
- No auth configuration changes.
- No payroll, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam, tenant governance, worker documents, `setup-company`, billing.
- No feature flags created.
- No backfills.
- No reader flip.
- No plaintext deletion.
- No `authPassword` refactor.

---

## 12. Recommendation for Sprint S7

**Start S7-A:** create the `company_settings` flag namespace `security.pin_hash_enabled` (default `false` everywhere) plus the read-only helpers (`useSecurityFlags` on the frontend, `isPinHashEnabled()` on the edge side). **Do not wire any call site.** Ship the scaffolding alone so S7-B can flip the flag for Stafly Demo with one row update and a single edge-function deploy.

Gate S7-B through S7-F behind explicit owner approval per memory `mem://constraints/strict-no-regression-policy`.
