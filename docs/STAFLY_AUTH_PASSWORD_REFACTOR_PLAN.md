# Stafly Auth Password Refactor Plan — PIN Hash Reader Flip

**Sprint:** S6 (design / audit / doc-only)
**Status:** DRAFT — no implementation
**Owner:** Stafly Security
**Date:** 2026-06-22

> Companion to `docs/STAFLY_SECURITY_PHASE_2_PLAN.md`. This sprint is **doc-only**.
> No SQL, RPC, RLS, edge, auth, payroll, write, or backfill changes were made.

---

## 0. Guardrails (S6)

- ✅ No migrations
- ✅ No RPC body changes
- ✅ No edge function changes
- ✅ No RLS changes
- ✅ No auth behavior changes
- ✅ No writes / backfills / grants
- ✅ No feature flags created
- ✅ No reader flip
- ✅ No plaintext deletion
- ✅ No tenant touched (Quality Staff, MyStaff, JKitchen, Stafly Demo, Sandbox, QA — all untouched)
- ✅ Zero impact to payroll / time_entries / scheduled_shifts / shift_assignments / Connecteam

---

## 1. Current `authPassword` flow map

### Definition
`supabase/functions/employee-auth/index.ts:136`
```ts
function authPassword(pin: string): string {
  return AUTH_PWD_PREFIX + pin;
}
```
`AUTH_PWD_PREFIX` is a constant env-side string. The Supabase auth password for every worker is **deterministically derived from the 4-digit PIN**. Two workers with the same PIN have the same Supabase password (scoped by different `email`).

### Call sites

| Site | Line | Operation | Plaintext PIN required? |
|------|------|-----------|--------------------------|
| `activate` | 263 | `auth.admin.createUser({ password: authPassword(pin) })` | YES — new worker sets PIN |
| `login` | 556 | `auth.signInWithPassword({ password: authPassword(pin) })` | YES — every login |
| `provision-pin` (admin) | 770 | `auth.admin.updateUserById(..., { password: authPassword(newPin) })` + UPDATE `access_pin` | YES |
| `bulk repair` | 836 | `updateUserById(..., { password: authPassword(e.access_pin) })` | reads plaintext from DB |
| `change-pin` (worker) | 906 | `updateUserById(..., { password: authPassword(new_pin) })` + UPDATE `access_pin` | YES |

### Downstream consumers of the resulting Supabase session

- `/portal/*` — worker portal (PortalSessionContext)
- `kiosk-clock` — reads `access_pin` plaintext directly (does **not** use Supabase password)
- `front-desk-checkin` — reads `access_pin` plaintext directly
- `provision-pin` admin tooling

### Plaintext dependencies (what blocks the reader flip)

1. `login` compares `employee.access_pin === pin` (line 596) AND signs in with `authPassword(pin)`.
2. `kiosk-clock` and `front-desk-checkin` query `access_pin` directly.
3. Supabase auth password is a pure function of plaintext PIN; we cannot rotate workers' passwords without knowing the current PIN.
4. `bulk repair` flow assumes plaintext is in DB.

### Risk points

- **PIN collisions**: two workers, same PIN → same Supabase password. Email uniqueness is the only thing isolating sessions.
- **PIN rotation = password rotation**: every `change-pin` forces a Supabase admin call. If that call fails silently, password drifts from PIN.
- **`AUTH_PWD_PREFIX` is a secret-of-form, not a secret-of-strength**. If leaked, every account's password = PREFIX + 4 digits (10,000 combos per known email).
- **No lockout / no `pin_attempts`** at the auth layer; rate limiting lives in `auth_rate_limits` table only.

### What cannot change without migration

- The deterministic mapping `pin → auth password`. Any tenant whose workers were activated under the current scheme must continue to authenticate this way until their password is rotated to a non-PIN-derived secret.
- Plaintext `access_pin` reads in `kiosk-clock` and `front-desk-checkin` are out of scope for this sprint and tracked separately.

---

## 2. Refactor options

### Option A — Keep PIN-derived password during transition (status quo + hash mirror)

- **Mechanism:** Continue using `authPassword(pin)` for Supabase auth. Dual-write hash (already in place per S4/S4-B). Verify with bcrypt only in `kiosk-clock` / `front-desk-checkin` once they're ready.
- **Pros:** Zero risk to login/activation. No worker-facing change. Already partially implemented.
- **Cons:** Does **not** unblock plaintext kill. `access_pin` must stay in DB forever for Supabase password rebuild.
- **When it helps:** Bridge phase only. Useful if we want hash-only `kiosk-clock` before touching the portal login.

### Option B — Server-generated random password, decoupled from PIN

- **Mechanism:** On activation/provision/change-pin, generate a long random password (e.g. 32-byte base64). Store nowhere reusable; immediately call `updateUserById`. Worker authentication switches to a **bridge edge function** (`employee-auth/login`) that:
  1. Verifies PIN against `access_pin_hash` (bcrypt).
  2. On success, mints a short-lived Supabase session via `auth.admin.generateLink({ type: 'magiclink' })` or signs in server-side using stored random password.
- **Storage:** Random password is **not** stored. We either (a) re-rotate on every login (heavy) or (b) store it encrypted in a new table `employee_auth_secrets` (KMS-wrapped) accessed only by service_role.
- **Pros:** Plaintext PIN can be nulled. PIN collisions no longer collide auth passwords. Enables true hash-only reader flip.
- **Cons:** Requires a new auth bridge. `signInWithPassword` from the browser no longer works directly — the edge function must return a session (token exchange). Slightly heavier login path.
- **Impact:** Portal login must call edge fn instead of `supabase.auth.signInWithPassword`. Activation flow unchanged from worker POV.

### Option C — Passwordless / OTP / session-token model

- **Mechanism:** PIN entry verifies against `access_pin_hash` server-side; edge function mints a Supabase session via `admin.generateLink` (magic link consumed server-side) or a custom JWT signed with the project's JWT secret.
- **Pros:** No Supabase password at all. Cleanest long-term model. Easy to layer MFA, device binding, lockouts.
- **Cons:** Largest blast radius. Replaces the entire login surface. Requires careful session-refresh handling. Higher engineering cost.
- **UX impact:** Worker still types 4-digit PIN; flow looks identical. Internally, no `signInWithPassword` call.

### Option D — Hybrid bridge with feature flag (recommended path)

- **Mechanism:** Combine A (during rollout) + B (target state) behind `security.pin_auth_mode` per-tenant flag:
  - `legacy` — current behavior (PIN-derived password).
  - `dual` — verify against hash; if hash missing or mismatch, fall back to plaintext compare + PIN-derived password; on success, backfill hash.
  - `hash_only` — verify against hash exclusively; sessions minted via bridge edge fn; plaintext ignored.
- **Pros:** Per-tenant rollout. Self-healing dual mode. Rollback = flip flag back.
- **Cons:** More code paths to test. Flag governance matters.

---

## 3. Recommendation

**Adopt Option D (hybrid bridge) with Option B as the terminal state.**

### Target architecture

| Concern | Target |
|---|---|
| Worker authentication | 4-digit PIN entered in `/portal/login`, `/kiosk/*`, `/front-desk/*` |
| PIN validation | `bcrypt.compare(pin, access_pin_hash)` server-side in edge fn |
| Session minting | Edge fn returns Supabase session (admin-issued); browser stores via `supabase.auth.setSession()` |
| `access_pin_hash` | Source of truth for PIN verification |
| `access_pin` plaintext | Read-only fallback during `dual` mode; nulled after `hash_only` rollout per tenant |
| Reader flip eligibility | Tenant on `dual` for ≥ 14 days with `pin_hash_coverage = 100%` |
| Plaintext null eligibility | Tenant on `hash_only` for ≥ 30 days with zero fallback hits |
| Lockout protection | `auth_rate_limits` extended with `pin_attempts` (future) |
| Rollback | Flip `security.pin_auth_mode` to `legacy` — next login self-heals |
| Per-tenant testing | Stafly Demo → Sandbox/QA → controlled pilot → real tenants |

---

## 4. Phased plan

### S7-A — Feature flag foundation (additive, no behavior change)
- Add `company_settings` rows for namespace `security.pin_auth_mode` (default `legacy`).
- Add `useSecurityFlags()` React hook + `getPinAuthMode(company_id)` edge helper.
- **No call sites wired.** Pure infrastructure.
- Tenants touched: none (default value).

### S7-B — Bridge edge function (demo only)
- Build `employee-auth/login-bridge` action: verifies via hash, mints session via `admin.generateLink`.
- Wire **only** when `security.pin_auth_mode = 'dual' OR 'hash_only'`.
- Enable on **Stafly Demo** only.
- Existing `login` path unchanged for `legacy`.

### S7-C — Dual mode in Sandbox + QA
- Set `pin_auth_mode = 'dual'` on Sandbox + QA Testing.
- Monitor `auth_bridge_log` for fallback hits.
- Real tenants still on `legacy`.

### S7-D — Controlled pilot (one real tenant)
- Choose smallest real tenant (TBD with owner approval).
- 7-day soak. Rollback = flip flag.

### S7-E — Hash-only + plaintext deprecation plan
- After ≥ 30 days dual on a tenant with zero fallback hits, flip to `hash_only`.
- Plaintext null **only after explicit user approval per tenant** — never automatic.

### S7-F (deferred) — `kiosk-clock` + `front-desk-checkin` reader flip
- Out of scope for portal-auth refactor. Tracked separately.

---

## 5. QA matrix

| Scenario | legacy | dual (hash present) | dual (hash missing) | hash_only |
|---|---|---|---|---|
| Activate new worker | ✅ existing | ✅ writes hash + plaintext | n/a | ✅ writes hash only |
| Provision PIN (admin) | ✅ | ✅ | ✅ backfills | ✅ |
| Worker change-pin | ✅ | ✅ | ✅ backfills | ✅ |
| Portal login | password | bcrypt → bridge | bcrypt fail → plaintext fallback → bridge | bcrypt → bridge or fail |
| Reset PIN | ✅ | ✅ | ✅ | ✅ |
| Worker with hash only | n/a | ✅ | n/a | ✅ |
| Worker with plaintext only | ✅ | ✅ via fallback | ✅ via fallback | ❌ blocked — must reset |
| Stafly Demo | smoke pre/post | full QA | inject by deleting hash row | full QA |
| Sandbox / QA Testing | smoke | full QA | dual fallback test | not yet |
| Real tenant | smoke read-only | n/a until S7-D | n/a | n/a |
| `kiosk-clock` | unchanged | unchanged | unchanged | unchanged (S7-F) |
| `front-desk-checkin` | unchanged | unchanged | unchanged | unchanged (S7-F) |

---

## 6. Multi-tenant safety

- Flag is **per-tenant** (`company_settings`).
- Default `legacy` — no tenant changes behavior on deploy.
- Rollout order: Stafly Demo → Sandbox → QA Testing → one real pilot → broader.
- Rollback per tenant = single UPDATE on `company_settings`.
- Owner/developer global view (`selectedCompanyId = null`) reads flag = `legacy`.

---

## 7. Security considerations

- **No PIN in logs.** Edge fn must redact `pin`, `new_pin`, `current_pin`, `password` from all log lines.
- **No password in logs.** `authPassword()` output never logged.
- **No hash in API responses.** `access_pin_hash` never returned to client (already enforced by per-column grants from S1.5).
- **Rate limiting.** Extend `auth_rate_limits` to include `pin_attempts` with exponential backoff. Out of scope for S6.
- **Bcrypt cost = 10** (matches S4 dual-write). Re-evaluate at S7-E.
- **Stolen PIN risk** unchanged — still 4 digits, still bound to phone+company. Future: MFA / device binding.
- **Random password storage (Option B/D terminal)**: never persist plaintext; if persisted at all, KMS-wrap via Supabase Vault.
- **Session expiry**: keep Supabase default (1h access + 60d refresh). Bridge fn does not extend.
- **Audit log**: new `auth_bridge_log` table proposed in S7-B (mode, success, fallback_used, latency). No PII, no PIN.

---

## 8. Payroll safety (explicit)

This plan **does not touch**:
- `time_entries` (zero schema or write changes)
- `scheduled_shifts` (zero changes)
- `shift_assignments` (zero changes)
- `pay_periods` / `period_base_pay` / payroll reconciliation (zero changes)
- Connecteam authority (Connecteam remains payroll source of truth per existing memory)
- Any payroll math, rates, compensation profiles, or reconciliation logic

Payroll remains **completely decoupled** from this refactor in every phase.

---

## 9. Rollback strategy

| Phase | Rollback |
|---|---|
| S7-A | Drop flag rows; no behavior dependency. |
| S7-B | Disable bridge code path (env flag `BRIDGE_ENABLED=false`); demo only. |
| S7-C | `UPDATE company_settings SET value='legacy' WHERE key='security.pin_auth_mode' AND company_id IN (...)` |
| S7-D | Same flag flip; worker re-login self-heals via `dual`'s plaintext fallback. |
| S7-E | Flip back to `dual`. Plaintext null is **NOT** reversible — only run after explicit approval + backup. |

---

## 10. Open questions

1. Does Supabase `admin.generateLink({ type: 'magiclink' })` produce a session token consumable from edge → browser without email round-trip? (Spike needed in S7-B.)
2. Should we adopt custom JWTs signed with project JWT secret instead of magic links? Simpler but bypasses Supabase auth state machine.
3. PIN length: keep 4 digits or upgrade to 6 at hash-only flip? Worker UX vs entropy tradeoff.
4. Lockout policy: counter on `auth_rate_limits` or new `employees.pin_attempts` column?
5. `kiosk-clock` / `front-desk-checkin` plaintext-reader flip — defer to S8?

---

## 11. Files audited (read-only)

- `supabase/functions/employee-auth/index.ts` (lines 136, 209, 263, 274, 311, 346, 556, 596, 770, 829, 836, 878, 889, 906)
- `supabase/functions/kiosk-clock/index.ts` (PIN read, not touched)
- `supabase/functions/front-desk-checkin/index.ts` (PIN read, not touched)
- `docs/STAFLY_SECURITY_PHASE_2_PLAN.md` (S4 / S4-B / S5 history)

## 12. What was NOT touched

- Zero edge function code changes
- Zero RPC body changes
- Zero RLS / grant changes
- Zero migrations
- Zero writes / backfills
- Zero tenant data touched
- Zero payroll / time_entries / shifts touched

---

## 13. Recommendation for Sprint S7

**Start S7-A only**: create the `security.pin_auth_mode` flag infrastructure (table rows + read helpers), wire **no** call sites, default everyone to `legacy`. This is a one-row-per-tenant additive change with zero behavior impact, and it unblocks S7-B (bridge prototype on Stafly Demo) with a single edge deploy.

Defer S7-B until S7-A ships and is observed clean for at least one full day in production (cache invalidation, hook integration).
