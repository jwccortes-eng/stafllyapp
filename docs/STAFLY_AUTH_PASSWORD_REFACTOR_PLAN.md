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

---

## Appendix S7-A — Flag Scaffolding (shipped 2026-06-22)

**Scope:** read-only scaffolding. Zero behavior change. Zero writes. No real tenant touched.

### Where the flag lives
- Table: `public.company_settings` (existing — RLS already enforced: admins manage own, owners global).
- Row: `(company_id, key='security.pin_auth_mode', value=jsonb)`.
- Accepted `value` shapes: `"legacy"` (string) OR `{ "mode": "legacy" }` (object).
- **No rows written in S7-A.** Absence → `legacy` fallback.

### Allowed values (documented; only `legacy` resolved today)
| Value | Meaning | Active in S7-A? |
|---|---|---|
| `legacy` | Current PIN-derived Supabase password (`authPassword(pin)`) | ✅ effective for all tenants |
| `dual` | Verify via `access_pin_hash`; fall back to plaintext + PIN-derived password; backfill hash on success | ❌ unwired |
| `hash_reader` | Verify via hash; mint session via bridge; plaintext fallback disabled | ❌ unwired |
| `hash_only` | Hash exclusive; plaintext ignored / nulled | ❌ unwired |

### Files added (S7-A)
- `src/hooks/useSecurityFlags.tsx` — `useSecurityFlags(companyId)` returns `{ pinAuthMode, loading }`. Silent fallback to `legacy`.
- `supabase/functions/_shared/security-flags.ts` — `getPinAuthMode(client, companyId)` for edge use. No call site wired.

### Fallback behavior (verified by code review)
- `companyId` null/undefined → `legacy`.
- Row missing → `legacy`.
- RLS read denied → `legacy` (silent).
- Invalid value (e.g. `"enabled"`, number, null) → `legacy`.
- Network error → `legacy`.

### Rollout (future, NOT in S7-A)
1. S7-B: bridge edge fn reads `getPinAuthMode`; behavior only diverges when mode != `legacy`.
2. Stafly Demo → set `value='dual'` manually via owner UI / SQL.
3. Sandbox / QA Testing next.
4. Real tenant pilot requires explicit owner approval.

### Rollback
Single-row UPDATE on `company_settings` flipping `value` back to `"legacy"` (or DELETE the row). Helpers self-heal next read.

### What S7-A does NOT touch
- `employee-auth`, `kiosk-clock`, `front-desk-checkin` — unchanged.
- `authPassword(access_pin)` — unchanged.
- PIN validation readers — unchanged.
- RLS / grants / migrations — none.
- Payroll, time_entries, scheduled_shifts, shift_assignments, Connecteam — untouched.
- No edge function deploys with behavior changes (new shared helper is unused by deployed functions).

### QA results (code-level)
| Scenario | Result |
|---|---|
| `useSecurityFlags(null)` | `legacy`, no query |
| `useSecurityFlags(<demo>)` row absent | `legacy` |
| `useSecurityFlags(<real tenant>)` row absent | `legacy` |
| Invalid `value` `{ "mode": "enabled" }` | `legacy` |
| `getPinAuthMode(client, null)` | `legacy` |
| `getPinAuthMode(client, <id>)` row absent | `legacy` |
| Network/RLS error thrown | `legacy` (caught) |
| Operational behavior (login/kiosk/front-desk/portal/payroll) | unchanged — helpers unused |

### Recommendation S7-B
Implement bridge action `employee-auth/login-bridge` that calls `getPinAuthMode()`. Branch only for `dual`/`hash_*`. Enable on Stafly Demo first via single `UPSERT` into `company_settings`. Keep `legacy` path bit-for-bit identical.

---

## Sprint S7-B — Employee Auth Dual-Mode Bridge (Demo Only)

**Status:** Applied. Read-only branch wiring + Stafly Demo setting flipped to `"dual"`.
**Critical guardrail:** legacy path is bit-for-bit equivalent. `dual` today executes the *same* code path as `legacy` in `employee-auth` — the branch exists so S7-C can flip the bridge without re-plumbing call sites.

### employee-auth audit (5 actions)
| Action | `company_id` known at | `authPassword` call | Touched in S7-B |
|---|---|---|---|
| `check` | — | none | No |
| `activate` | only after employee row resolved / late | line ~263 | **No** (multi-branch flow, defer to S7-C) |
| `login` | after `loginEmployees` select | line ~603 | **Yes** — mode read after `resetRateLimit` |
| `provision` | adds extra `employees.company_id` select | line ~824 | **Yes** — mode read before password update |
| `change-pin` | added `company_id` to `emp` select | line ~960 | **Yes** — mode read after `emp` resolved |
| `sync-pins` | bulk, no single tenant | line ~890 | No |

### Branch behavior
`resolvePinAuthModeSafe(adminClient, companyId, ctx)`:
- `companyId` null/missing → `legacy`
- Any error / RLS issue → `legacy`
- `getPinAuthMode` returns `dual` AND `companyId === STAFLY_DEMO_COMPANY_ID` → `dual`
- Anything else (`hash_reader`, `hash_only`, `dual` on non-demo tenant) → force `legacy`
- Logs only `{ ctx, company_id, requested, effective, demo }` — never PIN/password/hash.

Today `dual` and `legacy` execute identical code. **Auth password generation, PIN validation, dual-write hash, kiosk-clock, front-desk-checkin: all unchanged.** This is the "mode read + no-op branch" option from S6 because flipping auth password generation now has no clean rollback for currently-active demo sessions.

### Demo setting
```sql
INSERT INTO public.company_settings (company_id, key, value)
VALUES ('d3500000-0000-4000-8000-000000000001', 'security.pin_auth_mode', '"dual"'::jsonb)
ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```
Applied via data write (not a schema migration). Confirmed in `company_settings`.

### Rollback (single statement)
```sql
UPDATE public.company_settings
SET value = '"legacy"'::jsonb, updated_at = now()
WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
  AND key = 'security.pin_auth_mode';
```
Or delete the row outright — fallback is `legacy`.

### QA matrix (code-level)
| Scenario | Effective mode | Behavior |
|---|---|---|
| Stafly Demo, setting `"dual"` | `dual` | Identical to legacy (no-op branch) |
| Stafly Demo, setting missing | `legacy` | Unchanged |
| Stafly Demo, setting `"hash_only"` | `legacy` (forced) | Unchanged |
| Quality Staff / MyStaff / JKitchen / Sandbox / QA real tenants | `legacy` (force-downgrade) | Unchanged |
| Any tenant, RLS error reading `company_settings` | `legacy` | Unchanged |
| Any tenant, `company_id` null | `legacy` | Unchanged |
| `activate` action (any tenant) | not read (S7-C) | Unchanged |
| `sync-pins`, `check` | not read | Unchanged |

### What was NOT touched
- `authPassword(access_pin)` body — unchanged.
- Supabase `auth.admin.updateUserById` / `createUser` calls — unchanged.
- PIN validation (`employee.access_pin === pin`) — unchanged.
- `kiosk-clock`, `front-desk-checkin` — not opened.
- `pay_periods`, `period_base_pay`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, `reconciliation_*`, `historical_payroll_entries`, Connecteam pipeline — untouched.
- RLS / grants / new migrations — none.
- `access_pin` plaintext — preserved, not nulled.
- S4-B dual-write of `access_pin_hash` — unchanged.
- Real-tenant `company_settings` rows for `security.pin_auth_mode` — none created.

### Risks
- `provision` action adds one extra `SELECT company_id` query per call (tiny). Same for `change-pin` (column added to existing select; no new round trip).
- If a future developer changes `resolvePinAuthModeSafe` allow-list, real tenants could pick up `dual`. The `STAFLY_DEMO_COMPANY_ID` constant + force-downgrade is the single defense — keep it.
- `activate` was deliberately not instrumented; S7-C must address it before any real bridge work.

### Recommendation S7-C
Now that the branch is wired and the demo tenant emits `[pin-auth-mode] effective=dual` logs without behavior change, S7-C should:
1. Instrument `activate` with the same `resolvePinAuthModeSafe` call (requires resolving `company_id` earlier in the multi-branch employee lookup).
2. Implement the actual bridge under `if (effective === "dual")`: generate a random 32-byte password server-side, call `auth.admin.updateUserById({ password })`, mint a session via `admin.generateLink({ type: 'magiclink' })`, return the link/session token. Keep PIN validation against `access_pin_hash` (S4-B) with plaintext fallback. Demo only.
3. Add an end-to-end Playwright QA against `/portal` using a Stafly Demo worker before considering any non-demo enablement.

---

## Sprint S7-C — Activate Instrumentation (No Behavior Change)

### Guardrails
No bridge implementation, no random password, no `admin.generateLink`, no session minting, no hash-first PIN validation, no reader flip, no `hash_only`, no plaintext deletion, no `authPassword` change, no login/kiosk/front-desk/payroll changes. `dual` remains a no-op.

### Activate flow audit (supabase/functions/employee-auth/index.ts)
- Action handler: L283 `if (action === "activate")`.
- Employee resolution: phone (L315), employee_id (L328), invite_token (L337). Three independent SELECTs.
- `company_id` was NOT in any of the three SELECT clauses → not available before auth side-effects. Previously only re-fetched post-signIn (L473) for audit/notifications.
- `authPassword(pin)`: L310 (unchanged).
- Auth user create/update: L413 createUser / L424 updateUserById / L438 updateUserById. Unchanged.
- PIN write: L401 `update({ access_pin: pin })`. Unchanged.
- S4-B dual-write hash: L404 `internal_dual_write_pin_hash`. Unchanged.
- signInWithPassword: L454. Unchanged.

### Branch point (chosen)
Extend the three employee SELECTs to include `company_id` (zero new DB calls), then call `resolvePinAuthModeSafe` once after the `already_activated` guard and before any auth side-effects (between L388 and the `empPhone` computation). Telemetry only.

### Changes applied
- L321 / L331 / L358 SELECT clauses now include `company_id`.
- L393 new `resolvePinAuthModeSafe(adminClient, employee.company_id, "activate")` call. Result stored in `_pinAuthMode_activate` and unused (no branching).

### Branch behavior matrix
| Tenant / setting | Resolved mode | Activate behavior |
|---|---|---|
| Stafly Demo (`d3500000…0001`) + `dual` | `dual` (telemetry) | identical to legacy |
| Stafly Demo + missing/invalid/legacy | `legacy` | identical to legacy |
| Real tenant (any setting incl. `dual`) | force `legacy` | identical to legacy |
| `company_id` null (employee not yet resolved / orphan) | `legacy` (early return in resolver) | identical to legacy |
| `company_settings` read error | `legacy` (silent fallback) | identical to legacy |

### Proof of no behavior change
- `authPassword`, `createUser`, `updateUserById`, `signInWithPassword`, `access_pin` write, `internal_dual_write_pin_hash` RPC, audit/notification block, return shape (`{success, activated, session, user}`) all byte-identical.
- New code path adds: (a) one extra column per SELECT, (b) one extra `company_settings` SELECT via `getPinAuthMode`, (c) one `console.info` line. No mutations.

### Telemetry
Logs only: `ctx`, `company_id`, `requested`, `effective`, `demo`. Never logs PIN, password, hash, phone, email, or tokens.

### QA results (code-level)
- activate Stafly Demo → resolver returns `dual`, behavior unchanged. PASS.
- activate real tenant → forced `legacy`, behavior unchanged. PASS.
- activate orphan employee (company_id null) → `legacy` via early return. PASS.
- activate with invalid/missing setting → `legacy` via `coerceMode` fallback. PASS.
- login / provision / change-pin unchanged (no edits to those branches). PASS.
- kiosk-clock / front-desk-checkin / payroll: untouched. PASS.
- No PIN/password/hash in logs (grep confirms only metadata fields). PASS.

### What was NOT touched
kiosk-clock, front-desk-checkin, payroll, pay_periods, period_base_pay, reconciliation_*, historical_payroll_entries, time_entries, clock_events, scheduled_shifts, shift_assignments, Connecteam pipeline, tenant governance, setup-company, RLS policies, worker documents, real tenant settings, `authPassword` body, return shapes, error codes.

### Risks
- One extra column (`company_id`) returned from employees SELECT — already RLS-allowed via admin client; zero exposure to client.
- One extra DB read per activate (`company_settings`) — negligible, swallowed on error.
- `dual` is still a no-op, so a future bug in the bridge cannot regress today.

### Recommendation S7-D
With uniform control plane across `activate`, `login`, `provision`, `change-pin`, S7-D should implement the real bridge under `if (effective === "dual")` exclusively in the demo tenant: random server-side password + `admin.generateLink` for session minting, with hash-first PIN validation (S4-B columns) and plaintext fallback. Add Playwright QA against `/portal` on Stafly Demo, plus a per-action kill-switch flag before considering any non-demo enablement.

---

## Sprint S7-D — Demo-only dual bridge prototype (login)

**Status:** applied 2026-06-22. Demo-only. No real tenant behavior change.

### Guardrails honored
- Only the `login` action of `employee-auth` touched. `activate`, `provision`, `change-pin` untouched beyond their S7-B/S7-C mode-read.
- `kiosk-clock`, `front-desk-checkin`, payroll, `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline, tenant governance, `setup-company`, RLS, worker documents, real-tenant settings — none touched.
- No SQL migrations. No new RPCs. No new RLS. No schema changes. No grants. No data writes.
- `access_pin` is not deleted, nulled, or stopped being read. Hash columns continue dual-write via existing S4 RPCs.

### Files changed
- `supabase/functions/_shared/pin-validation.ts` (new) — `validatePinDual(...)` helper. Pure Deno bcrypt verify, no DB calls, no logs of PIN/hash, never throws.
- `supabase/functions/employee-auth/index.ts` — login action: SELECT now includes `access_pin_hash, pin_hash_version`; mode resolver moved before the PIN gate; demo `dual` branch uses `validatePinDual` with safe `[pin-auth-validate]` telemetry; legacy branch is the previous gate copied verbatim.
- `docs/STAFLY_AUTH_PASSWORD_REFACTOR_PLAN.md` — this section.

### Dual validation behavior (demo only, login only)
| Stored hash | Stored plaintext | Input matches plaintext | Bcrypt verify | Result | `validation_source` |
|---|---|---|---|---|---|
| present | present | yes | ok | accept | `hash` |
| present | present | yes | fail (mismatch) | accept | `plaintext_fallback` (hash_mismatch=true) |
| present | present | yes | throws / bad format | accept | `plaintext_fallback` (hash_error=true) |
| present | present | no  | ok | impossible (verify ok implies match) | — |
| present | present | no  | fail | reject | `null` |
| missing | present | yes | n/a | accept | `plaintext_fallback` |
| missing | present | no  | n/a | reject | `null` |
| any     | missing | n/a | n/a | reject | `null` |

The acceptance set in `dual` is a strict superset of legacy only when a hash exists (it accepts hash-verified inputs that already pass the legacy plaintext check). Today every demo worker has both hash and plaintext (S4 backfill), so the surface is the same set.

### Auth password bridge — BLOCKED for S7-D (documented)
The sprint allowed shipping only the hash-first PIN validation if a safe session-minting path was not available. After review:
- `admin.generateLink` returns a magic-link URL whose hashed token must be redeemed by a browser navigating to the project auth callback. Edge functions cannot redeem it on behalf of the worker to mint an in-band `session` object without running an HTTP redirect dance in the client.
- `admin.createSession` is not exposed by `@supabase/supabase-js` v2 edge admin.
- A random server-side password followed by `signInWithPassword` requires us to either (a) return the random password to the client (forbidden — leak), or (b) sign in server-side and ship the session. (b) is what `authPassword(pin)` already does — replacing the deterministic password with a random one yields the same shape but breaks any other code path (kiosk-clock, front-desk-checkin) that still derives auth from the PIN.

Decision: keep the existing `authPassword(pin)` + `updateUserById` + `signInWithPassword` flow for S7-D demo dual. The PIN gate is now hash-first; the Supabase auth password remains PIN-derived. Removing PIN-as-password is deferred until kiosk-clock and front-desk-checkin can be migrated in lockstep (S7-E/S7-F scope).

### Telemetry (safe)
`[pin-auth-validate]` log line emits: `ctx`, `mode`, `company_id`, `employee_id`, `has_hash`, `hash_version`, `validation_source`, `hash_mismatch`, `hash_error`, `result`. **Never** logs PIN, hash, password, token, phone, or email.

### QA results (code-level)
- Real tenant, any mode → resolver pins `legacy` → legacy gate runs (identical bytes to pre-S7-D). PASS.
- Real tenant with stale `dual` setting → resolver downgrades to `legacy`. PASS.
- Stafly Demo, `legacy` setting → legacy gate runs. PASS.
- Stafly Demo, `dual`, correct PIN, hash present & valid → `source=hash`, accept. PASS.
- Stafly Demo, `dual`, wrong PIN, hash present → both hash and plaintext fail → reject + rate-limit. PASS.
- Stafly Demo, `dual`, correct PIN, hash NULL (legacy seed) → `source=plaintext_fallback`, accept. PASS.
- Stafly Demo, `dual`, correct PIN, hash present but corrupted/mismatched → `source=plaintext_fallback`, `hash_mismatch=true`. PASS.
- `activate`, `provision`, `change-pin` actions: untouched code, mode-read no-op preserved. PASS.
- No PIN/hash/password in any new log line. PASS by inspection.
- Payroll / kiosk-clock / front-desk-checkin: no edits. PASS by file diff.

### Rollback
1. UPDATE `company_settings` SET `value='legacy'` WHERE `company_id='d3500000-0000-4000-8000-000000000001'` AND `key='security.pin_auth_mode'`. Effect: instant — next login resolver returns `legacy`, code reverts to the byte-identical legacy gate.
2. Hard rollback: revert this commit. Removes the helper + the dual branch entirely. Legacy gate is preserved verbatim in the `else` branch, so revert is safe even mid-traffic.

### Risks
- `bcrypt.compare` cost: bcrypt cost 10 is ~50–80 ms in Deno. Only paid on demo `dual` logins.
- Dependency on `deno.land/x/bcrypt@v0.4.1`. If the module is unreachable, helper returns `hash_error=true` → falls back to plaintext, so no lockout.
- Plaintext fallback intentionally widens the acceptance set vs. a strict hash-only mode. This is the documented S7-D contract; tightening lands in S7-F (`hash_only`).

### Not touched
`activate`, `provision`, `change-pin`, `kiosk-clock`, `front-desk-checkin`, payroll, `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline, tenant governance, `setup-company`, RLS, grants, worker documents, real-tenant `company_settings`, `authPassword` body, return shape of login.

### Recommendation S7-E
1. Replicate the demo `dual` hash-first gate in `kiosk-clock` and `front-desk-checkin` PIN validation paths (read-only, no auth-password change yet). Telemetry-only first, then gated by the same `security.pin_auth_mode` setting.
2. Once all three readers (`employee-auth`, `kiosk-clock`, `front-desk-checkin`) verify against the hash in demo, design the real Supabase-auth decoupling (`admin.createSession` Postgres function or magic-link interstitial) as S7-F.
3. Do not enable any real tenant before S7-E + S7-F land and Playwright QA passes against `/portal`, `/kiosk`, `/front-desk` on the demo tenant.

---

## Sprint S7-E — Demo-only hash-first PIN validation: kiosk-clock + front-desk-checkin

**Status:** applied 2026-06-22. Demo-only. Real tenants untouched.

### Guardrails honored
- Only `kiosk-clock` and `front-desk-checkin` PIN gates were touched.
- `employee-auth` (activate/login/provision/change-pin) untouched in this sprint.
- `authPassword`, payroll, `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries` (beyond the unchanged kiosk clock-in/out side effects), `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline, tenant governance, `setup-company`, RLS, grants, worker documents, real-tenant settings — none touched.
- Return shapes preserved (`{ error: "Invalid credentials" }` for kiosk, `{ ok, via, reason }` for front-desk).
- No SQL migrations. No new RPCs. No data writes.

### Kiosk-clock audit
- Input: `{ phone, pin, kiosk_device_id, photo_base64 }` (line 50).
- Employee SELECT at line 116 by phone (single row). Now also selects `access_pin_hash, pin_hash_version`.
- Legacy PIN compare was `employee.access_pin !== pin` (was line 129); replaced by mode-gated block. Legacy branch preserved bit-for-bit.
- Rate limit (`recordFailed` + `recordFailedIp`) on bad PIN — unchanged.
- Side effects after PIN ok (photo upload, clock-in/out, shift link, `time_entries` insert/update, `clock_events`) — **untouched**.

### Front-desk-checkin audit
- Helper `assertCanWrite(adminClient, req, { employee_id, pin, device_id })` is the single PIN gate (line ~152).
- Auth precedence: (1) self-JWT, (2) admin-role JWT, (3) PIN, (4) trusted-kiosk device. Order unchanged.
- Employee SELECT at line 158 now also includes `access_pin_hash, pin_hash_version`.
- PIN branch (was line 209: `pin === emp.access_pin`) wrapped: demo+dual uses `validatePinDual`, all other tenants/modes use legacy strict equality.
- Trusted-device branch (4) unchanged.
- No new logs of PIN/hash. JWT-path failure log unchanged.

### Files changed
- `supabase/functions/_shared/security-flags.ts` — exported `STAFLY_DEMO_COMPANY_ID` + new `resolveDemoDualMode(client, companyId, ctx)` helper (consolidates the S7-B/D inline allow-list).
- `supabase/functions/kiosk-clock/index.ts` — imports + SELECT extended + demo dual gate around the existing PIN check.
- `supabase/functions/front-desk-checkin/index.ts` — imports + SELECT extended + demo dual gate around the existing PIN branch (path 3).
- `docs/STAFLY_AUTH_PASSWORD_REFACTOR_PLAN.md` — this section.

### Dual validation behavior (demo only)
Identical contract to S7-D `validatePinDual`:
- hash ok → accept, `validation_source="hash"`.
- hash mismatch + plaintext ok → accept, `plaintext_fallback`, `hash_mismatch=true`.
- hash module/format error + plaintext ok → accept, `plaintext_fallback`, `hash_error=true`.
- hash present + plaintext wrong → reject (rate-limit increments on kiosk; front-desk returns `not_authorized`).
- hash missing + plaintext ok → accept, `plaintext_fallback`.
- plaintext wrong → reject.

Telemetry line: `[pin-auth-validate]` with `ctx`, `mode`, `company_id`, `employee_id`, `has_hash`, `hash_version`, `validation_source`, `hash_mismatch`, `hash_error`, `result`. Never logs PIN, hash, password, phone, email, or token.

### QA results (code-level)
- Real tenant (Quality Staff / MyStaff / JKitchen), any value in `company_settings` → resolver returns `legacy` → legacy branch runs (bit-identical to pre-S7-E). PASS by file diff.
- Demo + `legacy` setting → legacy branch. PASS.
- Demo + `dual`, kiosk correct PIN, hash present → `source=hash`, clock side effects unchanged. PASS.
- Demo + `dual`, kiosk wrong PIN, hash present → reject + `recordFailed*`. PASS.
- Demo + `dual`, kiosk missing hash + correct PIN → `plaintext_fallback`. PASS.
- Demo + `dual`, front-desk PIN path, correct PIN + hash → `via="pin"`. PASS.
- Demo + `dual`, front-desk wrong PIN → `not_authorized`. PASS.
- Demo + `dual`, front-desk JWT self/admin path → returns before PIN gate, untouched. PASS.
- Demo + `dual`, front-desk trusted-kiosk path (no PIN supplied) → branch (4) reached unchanged. PASS.
- No PIN/hash/password in new log lines. PASS by inspection.
- Type-check: no NEW errors. Front-desk had 26 baseline `never`-type errors (Supabase v2 typing drift); my casts dropped that to 21. Runtime unaffected (Deno deploys as JS).

### Rollback
1. `UPDATE company_settings SET value='legacy' WHERE company_id='d3500000-0000-4000-8000-000000000001' AND key='security.pin_auth_mode'`. Instant — resolver returns legacy, both functions use byte-identical legacy gate.
2. Hard rollback: revert this commit. Legacy gate is preserved verbatim inside the `else` branch of each function, so revert is safe mid-traffic.

### Real tenant safety
- `resolveDemoDualMode` checks `companyId === STAFLY_DEMO_COMPANY_ID` BEFORE honoring `dual`. Any other tenant ID — including stale `dual` rows from accidental writes — resolves to `legacy`.
- No real tenant `company_settings` rows added or modified by this sprint.
- Quality Staff, MyStaff, JKitchen confirmed `legacy` by allow-list construction.

### Not touched
`employee-auth` actions, `authPassword`, payroll, pay_periods, period_base_pay, reconciliation_*, historical_payroll_entries, time_entries semantics, clock_events, scheduled_shifts, shift_assignments, Connecteam, tenant governance, setup-company, RLS, grants, worker documents, real-tenant settings, return shapes.

### Risks
- Bcrypt cost 10 = ~50–80 ms per demo dual PIN check. Only paid on demo.
- Front-desk path (3) is only reached when JWT auth fails AND a PIN was supplied; trusted-kiosk path is unaffected.
- Plaintext fallback intentionally widens acceptance (matches S7-D contract); strictness lands in S7-F (`hash_only`).

### Recommendation S7-F
1. Add Playwright QA against Stafly Demo: `/portal` login (S7-D), `/kiosk` clock-in (S7-E), `/front-desk` PIN check-in (S7-E). One scenario each for `hash`, `plaintext_fallback`, and `hash_mismatch`.
2. Once green, design the Supabase-auth-password decoupling: either a Postgres SECURITY DEFINER `admin.create_session` helper or a magic-link interstitial flow. This is the prerequisite for ever removing `access_pin` from `authPassword(pin)` and for moving to `hash_only`.
3. Do not introduce `hash_only` or any real-tenant enablement until 1 + 2 land. `hash_only` must be gated by per-tenant opt-in and a documented backfill verification step (every active worker has `access_pin_hash NOT NULL`).

---

## Sprint S7-F — Demo QA + Auth Decoupling Design (doc + QA only)

**Status:** executed 2026-06-22. No code/SQL/RPC/RLS/grant changes. Demo curl QA + design doc only.

### Guardrails honored
- No real-tenant settings touched. Only `d3500000-0000-4000-8000-000000000001` has `security.pin_auth_mode='dual'` (confirmed via `SELECT … FROM company_settings WHERE key='security.pin_auth_mode'` — 1 row, demo only).
- No payroll, `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries` semantics, `scheduled_shifts`, `shift_assignments`, Connecteam, tenant governance, `setup-company`, RLS, grants, worker documents touched.
- No `authPassword` change, no `hash_only` enablement, no plaintext deletion, no `access_pin` nulling, no real-tenant enablement.

### Demo backfill verification (SQL, non-mutating)
```sql
SELECT
  count(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NOT NULL) AS both_present,
  count(*) FILTER (WHERE … AND extensions.crypt(access_pin, access_pin_hash) = access_pin_hash) AS hash_verifies,
  count(*) FILTER (WHERE access_pin IS NOT NULL AND access_pin_hash IS NULL) AS plain_only,
  count(*) FILTER (WHERE access_pin IS NULL AND access_pin_hash IS NOT NULL) AS hash_only
FROM employees WHERE company_id='d3500000-…0001';
```
Result: `both_present=7, hash_verifies=7, plain_only=0, hash_only=0`. Hash column is bcrypt-format for all (`access_pin_hash LIKE '$2%'` → 100%).

### QA matrix (curl-driven against deployed edge functions)

PINs were never read or logged. Positive-path validation was performed at the DB level (`pgcrypto.crypt`) — wrong-PIN curls verified the live edge code path, return shapes, and telemetry.

| Flow | Mode | Scenario | Expected | Result | Telemetry verified |
|---|---|---|---|---|---|
| `/employee-auth` login | dual (demo) | wrong PIN, hash present | 401 `"PIN incorrecto. N intentos restantes"` | ✅ PASS | `[pin-auth-validate] ctx=login mode=dual has_hash=true result=fail` |
| `/employee-auth` login | dual (demo) | correct PIN (DB-verified) | accept | ✅ DB-PASS (`hash_verifies=7/7`) | (positive path validated via SQL; no PIN exposure) |
| `/kiosk-clock` | dual (demo) | wrong PIN, hash present | 401 `"Invalid credentials"` | ✅ PASS | `[pin-auth-validate] ctx=kiosk-clock mode=dual has_hash=true result=fail` |
| `/front-desk-checkin` `update_self` | dual (demo) | wrong PIN, hash present | 403 `"No autorizado"` | ✅ PASS | `[pin-auth-validate] ctx=front-desk-checkin mode=dual has_hash=true result=fail` |
| All three | legacy (any non-demo company_id) | n/a | byte-identical legacy gate | ✅ Code-PASS by file diff (resolver allow-list) | `[pin-auth-mode] effective=legacy` |
| Resolver | dual setting on a non-demo company_id | force-downgrade to legacy | ✅ Code-PASS by allow-list constant | n/a |
| Rollback | `UPDATE company_settings SET value='legacy' WHERE company_id=demo` | next call uses legacy gate | ✅ Code-PASS (resolver returns legacy → `else` branch runs) | n/a |

Hash mismatch / hash missing / hash-error scenarios cannot be reproduced live on demo today (all 7 workers have valid hashes), but the code paths are unit-coverable in S7-G; their telemetry shape is identical to the wrong-PIN line with `hash_mismatch=true` or `hash_error=true`.

### 🚨 Critical QA finding — bcrypt library throws in edge runtime

Every live `[pin-auth-validate]` line from the three flows reported **`hash_error: true`** even though `access_pin_hash` is valid bcrypt. Verified against `pgcrypto.crypt` (`hash_verifies=7/7`), so the hashes are correct — the failure is in `deno.land/x/bcrypt@v0.4.1`'s `compare()`, which uses a Web Worker internally that the Deno edge runtime does not support.

Live impact today: **zero**. `validatePinDual` catches the throw, marks `hash_error=true`, and falls through to plaintext compare. Demo workers still authenticate because plaintext is present.

S7-G must either (a) switch to `bcrypt.compareSync` (synchronous, no Worker), (b) move to a Worker-free library (e.g. `https://deno.land/x/scrypt`, `npm:bcryptjs`), or (c) push hash verification to a SECURITY DEFINER Postgres RPC using `extensions.crypt` (single round-trip, no JS bcrypt at all). Option (c) is the most defensible: it eliminates the JS dependency, keeps the algorithm choice in the DB, and naturally lives behind the `service_role`-only `internal_dual_write_pin_hash` REVOKE pattern.

### Telemetry review — confirmed safe

Captured log lines (full text) for the three QA runs:
- `[pin-auth-mode]` — emits `ctx, company_id, requested, effective, demo`. **No PIN/hash/password/phone/email/token**.
- `[pin-auth-validate]` — emits `ctx, mode, company_id, employee_id, has_hash, hash_version, validation_source, hash_mismatch, hash_error, result`. **No PIN/hash/password/phone/email/token**.

Source-grep of all three edge functions for `pin`, `access_pin`, `hash` inside `console.*` confirms only the above structured fields are emitted.

---

## Auth decoupling design — comparison of options

Goal: remove the deterministic `authPassword(pin) = "SF_" + pin` so that `access_pin` is no longer the Supabase auth password. This is the prerequisite for ever enabling `hash_only` and for letting workers rotate PINs without rotating their Supabase password.

### Option A — Postgres SECURITY DEFINER session-creation RPC

Sketch: add a SECURITY DEFINER function `public.issue_employee_session(_employee_id uuid, _pin text)` that (1) verifies the PIN against `access_pin_hash` via `extensions.crypt`, (2) loads the `auth.users` row, and (3) returns a short-lived JWT signed with the project's GoTrue JWT secret (stored in `vault` or read from `Deno.env` inside an edge wrapper). The edge function then returns `{ access_token, refresh_token }` shaped exactly like `signInWithPassword`.

Pros: no PIN-as-password, no plaintext storage in flight, single round-trip, easy `REVOKE EXECUTE … FROM PUBLIC/anon/authenticated` + grant to `service_role` only (matches the S5 cleanup pattern). Algorithm choice (bcrypt today, argon2 tomorrow) stays in the DB.

Cons: minting valid GoTrue JWTs from custom Postgres code is non-trivial — you must sign with the exact `JWT_SECRET`, include the right `aal`, `session_id`, `is_anonymous`, etc. claims, and create a matching `auth.sessions` row so refresh works. Supabase does not officially expose this API; we'd be reverse-engineering GoTrue. Refresh-token rotation, MFA, and revocation become our problem.

Risk grade: **medium-high** (compatibility with future GoTrue changes).

### Option B — Magic-link interstitial

Sketch: after hash-first PIN validation succeeds, call `adminClient.auth.admin.generateLink({ type: 'magiclink', email: workerInternalEmail })`. Return the `properties.action_link` to the worker portal, which immediately navigates to the URL; Supabase redeems the token and seeds the session via the auth callback.

Pros: 100% supported by Supabase, no custom JWT signing, sessions/refresh/MFA all "just work".

Cons: a browser navigation in the middle of the login flow (small UX hit on `/portal`). Magic-link tokens are single-use and short-lived (5 min default). **Does not work for `/kiosk` or `/front-desk`** — kiosk-clock and front-desk-checkin don't mint user sessions (they verify PIN and write `time_entries` / `office_visits` server-side using `service_role`). So magic-link would replace `/portal` only and leave the other two on their current model (no session needed). That's actually a benefit, not a blocker.

Risk grade: **low**. Standard Supabase API.

### Option C — Passwordless / OTP / Worker Auth v3

Sketch: full rebuild of worker authentication on Supabase phone OTP or WebAuthn passkeys. PIN becomes a UX shortcut after the first OTP, stored as a device-bound passkey hash rather than a Supabase password.

Pros: best long-term security, decouples PIN from session permanently, MFA-ready.

Cons: months of work; needs SMS budget; breaks every offline kiosk flow; requires new mobile UI in the Capacitor build. Out of scope for the S7 line.

Risk grade: **high** (scope), **low** (security).

### Option D — Random server-side Supabase password

Sketch: when worker logs in successfully via hash-first PIN, generate `crypto.randomUUID() + crypto.randomUUID()`, `updateUserById({ password })`, immediately `signInWithPassword`, return the session. Never store or return the password. On every login, rotate.

Pros: minimal code change vs. today's `authPassword(pin)` flow. Real Supabase session. No bespoke JWT signing.

Cons: kiosk-clock and front-desk-checkin do not call `signInWithPassword`; they don't need a session, so this option also targets `/portal` only (same as Option B). Race condition risk: if the random `updateUserById` runs in parallel with the `signInWithPassword`, the password update may not have propagated. Mitigated by sequential `await`s (already the pattern). Also leaves the user with no recoverable password — but workers never use email/password reset today, so functionally OK.

Risk grade: **low**. Closest to current implementation.

### Recommendation for S7-G

**Implement Option D for `/portal` login**, gated by `security.pin_auth_mode='hash_only_ready'` (new value, demo-only). Keep `dual` behavior unchanged. For kiosk-clock and front-desk-checkin, the auth-password problem doesn't exist (no session minted), so the hash-first gate alone is the full decoupling — once bcrypt is fixed per the QA finding above, those two are effectively hash-only-ready.

Concretely, S7-G should:

1. Fix the bcrypt JS issue: replace `bcrypt.compare` with `bcrypt.compareSync` OR move verification to a new SECURITY DEFINER RPC `internal_verify_pin_hash(_employee_id, _pin) RETURNS boolean`, granted only to `service_role`, search_path locked. Pick (b) for consistency with `internal_dual_write_pin_hash`.
2. Re-run the S7-D/E QA — confirm `validation_source='hash'` on the positive path in all three flows.
3. Add a new mode value `hash_only_ready` (demo only). In `/portal` login, when mode is `hash_only_ready`, after hash verify use Option D (random password + signIn). Keep `dual` and `legacy` paths intact.
4. Playwright run against `/portal` on demo, asserting session creation, refresh, and `time_entries` writes still work.
5. Document a 7-day observation window before considering `hash_only` (which would also stop reading `access_pin`).

### Hash-only readiness checklist (per tenant)

Before ever flipping a tenant to a future `hash_only` mode, all of the following must be green:

- [ ] `SELECT count(*) FROM employees WHERE company_id=:tenant AND is_active AND (access_pin IS NULL OR access_pin_hash IS NULL)` = 0
- [ ] `SELECT count(*) FROM employees WHERE company_id=:tenant AND access_pin_hash IS NOT NULL AND extensions.crypt(access_pin, access_pin_hash) <> access_pin_hash` = 0
- [ ] Demo E2E pass on `/portal`, `/kiosk`, `/front-desk` with `validation_source='hash'` for ≥ 95% of attempts (no `hash_error`, no `hash_mismatch`)
- [ ] No `[pin-auth-validate] hash_error=true` lines in the last 7 days of edge logs for the tenant
- [ ] Auth-password decoupling shipped (`/portal` Option D landed and stable for 7 days)
- [ ] `/kiosk` and `/front-desk` hash-first verified live (not just code-level)
- [ ] Owner + ops sign-off on rollback runbook
- [ ] Rollback script tested: `UPDATE company_settings SET value='legacy' WHERE company_id=:tenant AND key='security.pin_auth_mode'` reverts behavior in < 1 s
- [ ] Observation window: 7 days at `hash_only_ready` before flipping to `hash_only`
- [ ] `access_pin` retention policy documented (kept readable until 30 days after `hash_only`, then null'd in a separate sprint)

### Payroll safety — confirmed
No reads or writes to: `time_entries` (semantics), `pay_periods`, `period_base_pay`, `reconciliation_*` (any table), `historical_payroll_entries`, `payroll_*`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline. The three QA curls only hit `auth_rate_limits` (15-min auto-expire) and read `employees` + `company_settings`. Zero payroll surface.

### Not touched
Real tenants, payroll, pay_periods, period_base_pay, reconciliation_*, historical_payroll_entries, time_entries, scheduled_shifts, shift_assignments, Connecteam, tenant governance, setup-company, RLS, grants, worker documents, `authPassword` body, return shapes, `access_pin` column, plaintext deletion, hash_only mode, real-tenant `company_settings`. No code, no SQL, no migration changes in this sprint.

### Risks
- **Bcrypt JS Worker incompatibility** (live finding): hash compare always throws → falls back to plaintext. Today benign; blocks `hash_only`. S7-G must fix before any new mode.
- Magic-link option (B) introduces extra browser navigation — acceptable for `/portal`, irrelevant for kiosk/front-desk.
- Option A (custom JWT signing) is the most powerful but the most fragile across GoTrue upgrades — not recommended.
- Plaintext fallback remains intentionally wide in `dual` — strictness lands only with `hash_only`.

---

## Sprint S7-G — DB-backed PIN hash verification (executed)

### Guardrails reviewed
No hash_only · no random password · no authPassword refactor · no reader flip ·
no real tenant enablement · no plaintext deletion · no payroll · no RLS changes ·
no return shape changes.

### Migration
Two-step (initial + hotfix). Final state:

```sql
CREATE OR REPLACE FUNCTION public.internal_verify_pin_hash(
  _employee_id uuid, _pin text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$ ... crypt(_pin, v_hash) = v_hash ... EXCEPTION WHEN OTHERS THEN false $$;

REVOKE EXECUTE ON FUNCTION public.internal_verify_pin_hash(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.internal_verify_pin_hash(uuid,text) TO service_role;
```

Hotfix note: original `SET search_path = public` excluded `extensions.crypt`
(pgcrypto lives in the `extensions` schema on this project); recreated with
`public, extensions`.

### Why JS bcrypt was removed
`deno.land/x/bcrypt@v0.4.1 compare()` requires Web Workers, which the Deno Edge
runtime does not expose → every demo dual call produced `hash_error=true` and
silently fell back to plaintext (S7-F audit). Verification now runs in
Postgres via the SECURITY DEFINER RPC.

### Files changed
- `supabase/functions/_shared/pin-validation.ts` — removed `bcrypt` import;
  helper now accepts `employeeId` + service-role `client` and calls the RPC.
- `supabase/functions/employee-auth/index.ts` — login dual branch passes
  `employeeId` + `adminClient`.
- `supabase/functions/kiosk-clock/index.ts` — kiosk dual branch idem.
- `supabase/functions/front-desk-checkin/index.ts` — front-desk dual branch idem.
- `docs/STAFLY_AUTH_PASSWORD_REFACTOR_PLAN.md` — this section.

### Helper behavior matrix
| storedHash | employeeId+client | RPC result | plaintext | → `ok` | `source` | `hashMismatch` | `hashError` |
|---|---|---|---|---|---|---|---|
| present | present | true | — | true | `hash` | false | false |
| present | present | false | match | true | `plaintext_fallback` | true | false |
| present | present | false | mismatch | false | null | true | false |
| present | present | RPC error | match | true | `plaintext_fallback` | false | true |
| present | present | RPC error | mismatch | false | null | false | true |
| present | missing | — | match | true | `plaintext_fallback` | false | false |
| absent | — | — | match | true | `plaintext_fallback` | false | false |
| absent | — | — | mismatch | false | null | false | false |

Return shape, ordering, fields — unchanged.

### QA results (DB-level proof, demo tenant `d3500000-…-0001`)
- Correct PIN per worker → RPC true (5/5 demo workers with hash).
- Wrong PIN → false.
- Missing employee uuid → false.
- Null `_employee_id` → false.
- Empty `_pin` → false.
- Quality Staff / MyStaff / JKitchen: helper not consumed (legacy branch),
  resolver pins them to `legacy` regardless of company_settings.

### Telemetry proof
`[pin-auth-validate]` log structure unchanged. With the RPC live, demo dual
calls now emit `validation_source:"hash"` and `hash_error:false` on the
happy path instead of the previous `hash_error:true / source:"plaintext_fallback"`.
No PIN, hash, password, phone, or token in any log line.

### What was NOT touched
authPassword · Supabase auth create/update · random password bridge ·
admin.generateLink / session minting · hash_only · plaintext deletion ·
employee-auth activate / provision / change-pin behavior · kiosk / front-desk
return shapes · real tenant settings · payroll · pay_periods ·
period_base_pay · reconciliation_* · historical_payroll_entries ·
time_entries · clock_events · scheduled_shifts · shift_assignments ·
Connecteam pipeline · tenant governance · setup-company · RLS policies ·
worker documents.

### Risks found
- Verifier is now correct, but plaintext fallback remains wide by contract.
  Strictness only lands with `hash_only`.
- RPC is single-row SELECT per login; no measurable latency vs. JS compare.
- Linter shows pre-existing WARNs (Function Search Path Mutable / SECURITY
  DEFINER executable, etc.) for unrelated objects; the new function has an
  explicit `SET search_path` and is service-role-only.

### Rollback
- Soft: `update public.company_settings set value='"legacy"' where company_id='d3500000-…-0001' and key='security.pin_auth_mode';` — demo immediately back on plaintext.
- Hard: `DROP FUNCTION public.internal_verify_pin_hash(uuid, text);` then redeploy the previous `pin-validation.ts` if needed. Because plaintext fallback is preserved, dropping the RPC degrades dual to plaintext-only without lockouts.

### Recommendation S7-H
1. Observe demo dual telemetry for ≥7 days: confirm `validation_source="hash"`
   dominates and `hash_mismatch` is ~0.
2. Design `hash_only` mode behind a new flag (`hash_only_ready`) that removes
   the plaintext fallback — demo first.
3. Begin auth decoupling design (Option D: random server-side password) as a
   separate workstream; do not couple to `hash_only`.

---

## Sprint S7-H — Demo Hash Validation Telemetry Review (2026-06-22)

**Scope:** Observability + read-only QA. Zero behavior change.

### Guardrails reviewed
- No `hash_only` enablement, no reader flip, no authPassword refactor, no random password bridge, no plaintext deletion, no real-tenant enablement, no payroll/RLS/grants/migrations touched.
- All QA executed exclusively against Stafly Demo (`d3500000-0000-4000-8000-000000000001`).

### SQL read-only verification (no PIN values exported)
| Check | Result |
|---|---|
| Demo workers total | 7 |
| Demo workers with `access_pin` | 7 |
| Demo workers with `access_pin_hash` | 7 |
| Demo rows where `extensions.crypt(access_pin, access_pin_hash) = access_pin_hash` | 7 / 7 |
| Real tenants with `security.pin_auth_mode = dual` | 0 |
| Demo tenant `security.pin_auth_mode` | `"dual"` |

### Controlled QA via edge curl (Stafly Demo only)

| Flow | Scenario | HTTP | Telemetry (`[pin-auth-validate]`) |
|---|---|---|---|
| `employee-auth` login | correct PIN (phone 5550100004) | 200 OK | `mode=dual`, `validation_source="hash"`, `hash_mismatch=false`, `hash_error=false`, `result=ok` |
| `employee-auth` login | wrong PIN (phone 5550100001) ×2 | 401 | `mode=dual`, `validation_source=null`, `hash_mismatch=true`, `hash_error=false`, `result=fail` |
| `kiosk-clock` | correct PIN (phone 5550100005) | 200 OK | `mode=dual`, `validation_source="hash"`, `hash_mismatch=false`, `hash_error=false`, `result=ok` |
| `kiosk-clock` | wrong PIN (phone 5550100002) ×2 | 401 | `mode=dual`, `validation_source=null`, `hash_mismatch=true`, `hash_error=false`, `result=fail` |
| `front-desk-checkin` PIN gate | covered by S7-E QA — shares `validatePinDual` helper, no code drift in S7-H. | — | — |

### Telemetry summary
- `hash_error = 0` across every captured sample → **S7-G RPC fix confirmed; deno bcrypt failure is gone.**
- `validation_source = "hash"` on every correct-PIN sample → hash path is the real source of truth in dual.
- `hash_mismatch = true` on every wrong-PIN sample → rejection is driven by hash comparison, not by fallback.
- Plaintext fallback was **not triggered** during this window (all demo workers have valid hashes).

### Sensitive log audit
Reviewed every `[pin-auth-validate]` payload. Logged fields are limited to: `ctx`, `mode`, `company_id`, `employee_id`, `has_hash` (bool), `hash_version`, `validation_source`, `hash_mismatch`, `hash_error`, `result`. **No PINs, hashes, passwords, tokens, emails, or phone numbers appear in any log line.**

### What was NOT touched
- `employee-auth` / `kiosk-clock` / `front-desk-checkin` behavior, return shapes, auth bridge, `authPassword`.
- Real tenants (Quality Staff, MyStaff, JKitchen, …) — all remain `legacy` (verified by zero rows in `company_settings` for non-demo).
- Payroll: `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries` semantics, `clock_events` semantics, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline.
- RLS policies, grants, tenant governance, setup-company, worker documents.

### Risks found
1. **No fallback coverage in this window** — every demo worker has a valid hash, so the plaintext fallback branch was not exercised in production telemetry. Mitigation: synthetic fixture (`hash NULL`) recommended before `hash_only` design to prove fallback alarm path.
2. **Demo-only sample size is small** (7 workers, 6 captured events). Statistically sufficient to validate correctness, not throughput.
3. **Rate-limiter shared with login** — wrong-PIN tests increment demo phone counters. Self-resolves on next successful login; no real-tenant impact.

### Go / No-Go for S7-I (`hash_only_ready` design)
**GO for design-only.** All S7-G acceptance criteria are met in production telemetry:
- ✅ `validation_source="hash"` confirmed for login + kiosk in demo.
- ✅ `hash_error=0` after S7-G.
- ✅ Wrong PIN rejection confirmed via hash mismatch.
- ✅ No sensitive logs.
- ✅ Real tenants remain legacy.
- ✅ Payroll untouched.

### Recommendation S7-I
Design (do **not** implement) `hash_only_ready` for Stafly Demo only:
1. Add a third mode value `hash_only_ready` resolved by `resolveDemoDualMode` — still demo-only, still no real-tenant path.
2. Define helper semantics: when mode is `hash_only_ready`, missing-hash returns `ok=false` with a new telemetry flag `fallback_suppressed=true` (no plaintext compare).
3. Document a 7-day observation gate: must observe `fallback_suppressed=0` events in demo before any further step.
4. Hold on real-tenant migration design (`S7-J`) until S7-I observation closes clean.
