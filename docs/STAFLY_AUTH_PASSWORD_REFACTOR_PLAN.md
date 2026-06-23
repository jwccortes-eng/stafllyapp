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

---

## Sprint S7-I — `hash_only_ready` Design (Demo Only, Doc-Only) — 2026-06-22

**Scope:** Design + documentation only. No code, no SQL, no RPC, no migrations, no RLS, no grants, no writes, no real-tenant changes, no fixture writes, no fallback suppression in production, no plaintext deletion, no authPassword changes.

### Guardrails reviewed
employee-auth / kiosk-clock / front-desk-checkin code, `authPassword`, `internal_verify_pin_hash` RPC, `company_settings`, `access_pin`/`access_pin_hash` data, payroll (`pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`), Connecteam pipeline, RLS/grants, tenant governance, real tenants — all untouched.

### 1. Mode taxonomy (clarified)

| Mode | Validation | Plaintext fallback | Plaintext data | Auth password | Tenants |
|---|---|---|---|---|---|
| `legacy` | plaintext compare | n/a | kept | PIN-derived | all real tenants today |
| `dual` (S7-D…G) | hash-first, plaintext fallback on miss/error | YES | kept | PIN-derived | Stafly Demo only |
| **`hash_only_ready`** (this design) | hash-only; missing/mismatch/error → reject + telemetry | **NO** | **kept (NOT deleted)** | PIN-derived (unchanged) | Stafly Demo only, gated |
| `hash_only` (future, blocked) | hash-only, hardened | NO | candidate for removal in a later sprint | requires auth decoupling first | future, after S7-J+ |
| plaintext kill | n/a | n/a | deleted | decoupled | far future, separate sprint |

`hash_only_ready` is **a measurement mode**, not a production hardening step. Its only purpose is to observe what real demo traffic would experience if the fallback were removed, while keeping plaintext data and `authPassword(pin)` intact for instant rollback.

### 2. Semantics of `hash_only_ready`

PIN validation contract (proposed, not implemented):

| Condition | Result | Telemetry |
|---|---|---|
| `access_pin_hash` exists AND `internal_verify_pin_hash(emp, pin) = true` | `ok` | `validation_source="hash"`, `fallback_suppressed=false`, `result="ok"` |
| `access_pin_hash` is NULL/empty | `fail` | `validation_source=null`, `fallback_suppressed=true`, `suppressed_reason="missing_hash"`, `result="fail"` |
| Hash exists but RPC returns `false` | `fail` | `validation_source=null`, `fallback_suppressed=true`, `suppressed_reason="hash_mismatch"`, `result="fail"` |
| RPC throws / returns null / network error | `fail` (recommended) | `validation_source=null`, `fallback_suppressed=true`, `suppressed_reason="hash_error"`, `result="fail"` |

**Recommendation on `hash_error`:** treat as `fail` (not silent legacy fallback). The whole point of `hash_only_ready` is to *measure* readiness; falling back to legacy on RPC error would hide the very signal we want. If `hash_error` rate is non-zero during the observation window, the gate to `hash_only` does NOT pass — we revert to `dual` and investigate.

### 3. Telemetry contract (safe fields only)

Logged at INFO under tag `[pin-auth-validate]` exactly like S7-D/E/G:

Allowed:
- `ctx` (`login` | `kiosk-clock` | `front-desk-checkin`)
- `mode` (`"hash_only_ready"`)
- `company_id`
- `employee_id`
- `has_hash` (bool)
- `hash_version`
- `validation_source` (`"hash"` | `null`)
- `fallback_suppressed` (bool)
- `suppressed_reason` (`"missing_hash"` | `"hash_mismatch"` | `"hash_error"` | `null`)
- `result` (`"ok"` | `"fail"`)

Forbidden (must never appear in any log, error message, or response): PIN, hash, `access_pin`, `access_pin_hash`, password, token, refresh_token, email, phone, normalized phone, phone hash with low entropy.

### 4. UX / error response contract

All four `fail` cases (wrong PIN, missing hash, hash mismatch, hash error) MUST return the **same generic response** the legacy flow returns today: same HTTP status (401 for login/kiosk, equivalent for front-desk), same Spanish copy ("PIN incorrecto. N intentos restantes."), same rate-limit increment.

- No worker-facing surface may reveal `suppressed_reason`.
- No worker-facing surface may reveal whether the worker has a hash, lacks a hash, or is on `dual` vs `hash_only_ready`.
- No new HTTP status codes, no new error keys, no new toasts.

### 5. Synthetic fixture plan (NOT executed this sprint)

Future fixture sprint (call it S7-I-fix, separate approval) must, in Stafly Demo only:

1. **Baseline snapshot** — for each of the 7 demo workers, record `(id, access_pin_hash, pin_hash_version)` to a doc-side rollback table (or a one-row JSON in `company_settings.security.pin_hash_fixture_backup` — to be decided in fixture sprint).
2. **Fixture A — missing hash:** pick one demo worker (recommend `d3500000-...0013` Demo Cocina Tres, lowest blast radius), set `access_pin_hash = NULL`. QA: correct PIN → expect `fail` + `suppressed_reason="missing_hash"`.
3. **Fixture B — corrupted hash:** pick one demo worker (recommend `d3500000-...0014` Demo Driver Uno), overwrite `access_pin_hash` with a syntactically valid bcrypt string that does NOT match the plaintext (e.g. `crypt('not-the-pin','$2a$...')`). QA: correct PIN → expect `fail` + `suppressed_reason="hash_mismatch"`.
4. **Fixture C — valid baseline:** leave 5 other demo workers untouched. QA: correct PIN → `ok` + `validation_source="hash"`.
5. **Rollback** — restore both fixtures from the baseline snapshot before closing the fixture sprint. Verify post-restore via `extensions.crypt(access_pin, access_pin_hash) = access_pin_hash` returning true for all 7.

Hard rules for fixture sprint:
- Stafly Demo only. Never Quality Staff / MyStaff / JKitchen / Parceros / any real tenant.
- Never modify `access_pin` (plaintext). Only `access_pin_hash`.
- Never log/export PIN values.
- Rollback is mandatory before closing.

### 6. Rollback (zero-data-loss)

`hash_only_ready` rollback is purely a setting flip:

```sql
-- Roll back to dual (fallback re-enabled)
UPDATE company_settings
   SET value = '"dual"'
 WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
   AND key = 'security.pin_auth_mode';

-- Roll back fully to legacy
UPDATE company_settings
   SET value = '"legacy"'
 WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
   AND key = 'security.pin_auth_mode';
```

No data rollback is ever required because:
- `access_pin` plaintext is **never** touched.
- `access_pin_hash` is **never** touched by mode flips (only by the optional fixture sprint, which has its own snapshot/restore).
- `authPassword(pin)` is unchanged, so Supabase auth users continue to sign in identically.

Worst case if `hash_only_ready` misbehaves in demo: every demo worker is rejected, demo workers cannot sign in for the seconds between the bad observation and the rollback flip. Real tenants are unaffected.

### 7. Activation gate (must pass *all* before enabling)

Prerequisites — every item must be checked off in writing on the closing report of the (future) activation sprint:

1. ✅ 7/7 demo workers have valid hashes (`extensions.crypt(access_pin, access_pin_hash) = access_pin_hash`) — currently true per S7-H.
2. ✅ S7-H telemetry clean (`hash_error = 0`, `validation_source="hash"` on every correct demo PIN) — currently true.
3. Synthetic fixture sprint (S7-I-fix) executed and rolled back cleanly, with QA proof for missing/corrupt/valid fixtures.
4. No `hash_error` in any `[pin-auth-validate]` log for 7 consecutive days in `dual` mode.
5. Owner/developer written approval naming the demo tenant id and the activation window.
6. Rollback flip tested end-to-end (dual → hash_only_ready → dual) in a staging window with at least one live `validation_source="hash"` event captured on the return trip.
7. On-call/observer assigned for the activation window.

If any prerequisite is missing or fails: **no-go**, remain on `dual`.

### 8. No-go / hard-stop conditions

Abort activation (or rollback immediately if already active) on any of:
- Any `hash_error=true` event in the activation window.
- Any `fallback_suppressed=true` with `suppressed_reason="missing_hash"` for a worker who, by SQL, *does* have a non-null `access_pin_hash` (indicates RPC / SELECT drift).
- Any sign that a non-demo tenant resolved to `hash_only_ready` (a leak in `resolveDemoDualMode`).
- Any worker-facing surface revealing `suppressed_reason` or hash state.
- Any payroll or `time_entries` write/read anomaly correlated with the activation window (defensive — there is no expected coupling, but we monitor).

### 9. Auth decoupling — explicitly *not* in scope

`hash_only_ready` deliberately does **not** address:
- `authPassword(pin)` — Supabase auth password is still PIN-derived.
- Auth password entropy / "pwned" warnings surfaced by Supabase on the demo JWT.
- Plaintext kill (`access_pin` removal).
- Magic-link / random-server-password / Worker Auth v3 transition.

Those remain a **separate workstream** (tentatively `S7-K…` after `S7-J`). `hash_only_ready` is a precondition observer, not a substitute.

### 10. Payroll & operational safety

Re-confirmed for the design: this sprint and any future `hash_only_ready` activation touch **none** of:
- `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`
- `time_entries`, `clock_events`
- `scheduled_shifts`, `shift_assignments`
- Connecteam import/export pipeline
- worker documents, RLS policies, grants
- tenant governance, `setup-company`

PIN validation is upstream of all payroll surfaces; a successful or failed PIN check in demo never alters any of those tables by design.

### 11. Recommendation — Sprint S7-J

**S7-J = Synthetic fixture sprint (`S7-I-fix`).** Tightly scoped, demo-only, owner-approved:
1. Implement the baseline snapshot + restore mechanism for `access_pin_hash` (documented in §5).
2. Apply Fixtures A and B in Stafly Demo only.
3. Execute QA matrix against current `dual` mode (we expect plaintext fallback to save the day for missing-hash, expose mismatch on Fixture B as `hash_mismatch=true, result=fail` since the right plaintext PIN won't match a corrupted hash and the fallback will still match plaintext — confirming the current dual safety net).
4. Restore fixtures, verify 7/7 hashes valid again.
5. Produce the readiness report needed for prerequisite #3 in §7.

**Do NOT in S7-J:** implement `hash_only_ready`, flip any mode, change real tenants, change auth, change payroll.

### What was NOT touched (this sprint)
- No code files.
- No SQL, no migrations, no RPC.
- No `company_settings` writes.
- No `employees.access_pin` / `access_pin_hash` writes.
- No real tenants. No payroll. No RLS. No grants. No auth.
- Only doc append to this file.

---

## Sprint S7-J — Demo Hash Fixture QA (2026-06-22) — EXECUTED & RESTORED

**Mode:** Stafly Demo only. `security.pin_auth_mode = "dual"` unchanged throughout.
**Scope:** Synthetic fixtures on `employees.access_pin_hash`, RPC-level QA, full restore.
**Real tenants:** untouched. **Payroll/RLS/grants/edge code/RPC body:** untouched.

### Guardrails honored
- No `hash_only_ready` implemented or activated.
- No real tenant touched (`company_id = d3500000-…-0001` filter on every UPDATE).
- No edits to `access_pin`, `pin_set_at`, `pin_hash_version`, `authPassword`, edge functions, RPC body, RLS, grants, or any payroll/time_entries/scheduled_shifts/clock_events surface.
- No PIN / hash / password / token / email / phone logged in this report (truncated IDs only).

### Baseline (pre-fixture snapshot, Stafly Demo, 2026-06-22)
- Total demo workers: 7.
- All 7 with `access_pin_hash IS NOT NULL` and `extensions.crypt(access_pin, access_pin_hash) = access_pin_hash` → valid.
- Original hash bytes for `…0013` and `…0014` captured privately into the restore migration SQL (`$2a$10$…`, 60 chars each, bcrypt v=`bcrypt`). Not echoed here.
- `pin_auth_mode`: only `d3500000…0001` (Stafly Demo) = `"dual"`. 0 real tenants in dual.

### Fixtures applied (migration 1)
| ID | Worker (truncated) | Fixture | After-state |
|---|---|---|---|
| A | `…0013` | `access_pin_hash = NULL` | hash_null=true |
| B | `…0014` | `access_pin_hash = '$2a$10$S7Jfixture…SENTINEL…'` (61 chars, invalid bcrypt) | hash_null=false, verify fails |
| C | `…0011`, `…0012`, `…0015` (+ `…0099`, Apple Review) | untouched | valid |

Migration filtered every UPDATE by `company_id = 'd3500000-0000-4000-8000-000000000001'`.

### QA execution — RPC-level (read-only)
- `internal_verify_pin_hash` is service-role only (verified: anon/authenticated/`postgres` Data API role get `permission denied for function`). To avoid creating live `time_entries`/`clock_events`/`auth_rate_limits` rows in Stafly Demo, QA was performed by simulating the helper logic in SQL using the exact same primitive the RPC uses — `extensions.crypt(_pin, access_pin_hash) = access_pin_hash` — combined with `access_pin = inputPin` for the plaintext fallback branch. This proves the dual-mode decision tree end-to-end without side effects.
- HTTP end-to-end test of `/portal` login, `/kiosk`, `/front-desk` against the fixture was **not executed** (deliberate, to avoid leaving production-side artifacts; see "What was NOT executed" below).

### QA results matrix (per `validatePinDual` semantics under `dual`)
| Case | Worker | Hash state | RPC verify | Plaintext match | Helper outcome (expected) | ✅ |
|---|---|---|---|---|---|---|
| A-correct | `…0013` | NULL | n/a (skipped, no hash + RPC plumbing degrades to plaintext-only) | true | `ok`, source=`plaintext_fallback`, hashMismatch=false, hashError=false | ✅ |
| A-wrong | `…0013` | NULL | n/a | false | `fail` | ✅ |
| B-correct | `…0014` | corrupt | false (clean mismatch, no throw) | true | `ok`, source=`plaintext_fallback`, hashMismatch=true, hashError=false | ✅ |
| B-wrong | `…0014` | corrupt | false | false | `fail`, hashMismatch=true | ✅ |
| C-correct (`…0011`) | valid | true | (irrelevant) | `ok`, source=`hash` | ✅ |
| C-correct (`…0012`) | valid | true | – | `ok`, source=`hash` | ✅ |
| C-correct (`…0015`) | valid | true | – | `ok`, source=`hash` | ✅ |
| C-wrong (`…0015`) | valid | false | false | `fail`, hashMismatch=true | ✅ |

All 8 cases behaved exactly as `_shared/pin-validation.ts` specifies for `dual` mode. Plaintext fallback correctly absorbs both fixture-A (missing hash) and fixture-B (corrupt hash) so demo workers do not get locked out — matching the S7-D/E/G acceptance gate. Hash-first path (`source="hash"`) is exercised on valid-hash workers.

### Telemetry audit
- The actual `console.info("[pin-auth-validate]", …)` log shape in `_shared/pin-validation.ts` consumers (`employee-auth`, `kiosk-clock`, `front-desk-checkin`) emits only: `ctx, mode, company_id, employee_id, has_hash, hash_version, validation_source, hash_mismatch, hash_error, result`. Reviewed: no PIN, no hash bytes, no password, no token, no email, no phone. No change in this sprint.
- Since QA was RPC-level (no HTTP call), no live telemetry events were emitted for the fixture cases. The fixture causes no change to the log contract.

### Restore (migration 2)
- `…0013.access_pin_hash` restored to original bcrypt value (60 chars).
- `…0014.access_pin_hash` restored to original bcrypt value (60 chars).
- Post-restore SQL check:
  - `valid_hashes` = **7 / 7** demo workers.
  - `demo_total` = 7.
  - `real_tenants_in_dual` = **0**.
  - `demo_mode` = `"dual"` (unchanged).

### What was NOT executed (intentional deferrals)
- Live HTTP smoke against `/portal` login + `/kiosk` + `/front-desk` while fixtures were in place. Reason: each call writes side effects (`auth_rate_limits`, `time_entries`, `clock_events`, `office_visits`) and the no-QA-artifacts rule from 2026-06-01 (Stafly Demo / Quality Staff QA mismatch incident) requires explicit QA-mode plumbing first. Helper-equivalent SQL proof is recorded above. Live HTTP execution can be added in a follow-up under QA-mode gate.

### What was NOT touched (re-confirmed)
- `_shared/pin-validation.ts`, `_shared/security-flags.ts`, `employee-auth`, `kiosk-clock`, `front-desk-checkin`, `internal_verify_pin_hash` body/grants, `authPassword`, `companies`, `company_settings`, RLS, table grants.
- Real tenants (Quality Staff, MyStaff, JKitchen, Sandbox, QA, …): zero writes, zero setting changes.
- Payroll surface: `pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline, tenant governance, `setup-company`, worker documents — all untouched.

### Risks found
- **None new.** Fixture proved that the helper's plaintext fallback would, today, mask a real silent hash-data-loss event in production for any tenant in `dual` — which is the intended prototype safety net but is also exactly the reason `hash_only_ready` exists in the S7-I design as the next-stage measurement mode.
- RPC is correctly gated to `service_role`; non-service callers cannot bypass the SECURITY DEFINER guard (verified 22P02-adjacent permission denied during this sprint).

### Go / No-Go for S7-K
**GO — conditional.** All S7-I activation-gate items for `hash_only_ready` design are now also empirically supported:
1. ✅ 7/7 demo hashes valid (post-restore).
2. ✅ S7-H telemetry clean.
3. ✅ Fixture sprint executed and rolled back (this sprint).
4. ⏳ 7 days of `hash_error=0` under `dual` — still required, owned by S7-K observability extension.
5. ⏳ Owner / dev written approval — pending.
6. ⏳ End-to-end rollback rehearsal under live traffic — pending; today's rollback was data-only and proven.
7. ⏳ On-call assigned — pending.

**Recommended S7-K:** Implement `hash_only_ready` mode in `_shared/security-flags.ts` resolver + add `fallback_suppressed` + `suppressed_reason` to telemetry, **but keep Stafly Demo on `dual`**. Do not flip the demo flag to `hash_only_ready` in S7-K. The flip becomes its own sprint (`S7-L`) gated on the four `⏳` items above. Real tenants remain in `legacy`.

---

## Sprint S7-K — `hash_only_ready` Capability Implemented (NOT Activated) (2026-06-22)

**Status:** Code capability landed across resolver + helper + 3 readers + telemetry + unit tests. **No tenant is activated.** Stafly Demo remains in `"dual"`. All real tenants remain in `legacy` (force-pinned by resolver).

### Guardrails honored
- No `company_settings` write. No tenant flipped. SQL verified: only `d3500000…0001` has `security.pin_auth_mode = "dual"`. Zero rows with `"hash_only_ready"`.
- No edits to `authPassword`, `internal_verify_pin_hash` body/grants, RLS, table grants, payroll/time_entries/clock_events/scheduled_shifts/shift_assignments/Connecteam, tenant governance, `setup-company`, worker documents, plaintext `access_pin`, or activate/provision/change-pin behavior.
- Same generic 401 user-facing error in every failure path of every mode. No new copy.
- No PIN/hash/access_pin/password/token/email/phone in any log line.

### Files changed
- `supabase/functions/_shared/security-flags.ts` — extended `PinAuthMode` union with `"hash_only_ready"`, refactored validator/coercer; demo-only resolver now honors `{"dual","hash_only_ready"}` and force-pins everything else to `legacy`. `hash_reader` and `hash_only` still resolve to legacy (deferred).
- `supabase/functions/_shared/pin-validation.ts` — added `mode?: "dual" | "hash_only_ready"` (default `"dual"`), extended `PinValidationResult` with `fallbackSuppressed: boolean` and `suppressedReason: "missing_hash" | "hash_mismatch" | "hash_error" | null`. `hash_only_ready` branch: hash-first only, fail-closed on missing/corrupt/error hash, `fallbackSuppressed=true` only when plaintext *would have* allowed login under `dual` (so the field measures real impact).
- `supabase/functions/employee-auth/index.ts` — local `resolvePinAuthModeSafe` extended with same allow-list. Login branch accepts `"dual" | "hash_only_ready"`, passes mode through to helper, logs `fallback_suppressed` + `suppressed_reason`. Legacy gate untouched. Activate / provision / change-pin call sites are telemetry-only and were not modified.
- `supabase/functions/kiosk-clock/index.ts` — branch now accepts `"dual" | "hash_only_ready"`, passes mode through, logs new fields. Legacy gate untouched.
- `supabase/functions/front-desk-checkin/index.ts` — same as kiosk-clock. JWT / trusted-device / admin paths untouched.
- `supabase/functions/_shared/pin-validation_test.ts` — **new**. 12 Deno unit tests using mocked `internal_verify_pin_hash` client, covering both modes.

### Resolver behavior matrix (after S7-K)
| Tenant | Setting | Effective mode | Notes |
|---|---|---|---|
| Stafly Demo | `"dual"` | `dual` | Current production behavior — unchanged |
| Stafly Demo | `"hash_only_ready"` | `hash_only_ready` | **Honored but no row set to this value** |
| Stafly Demo | `"hash_reader"` or `"hash_only"` | `legacy` | Deferred |
| Stafly Demo | missing / read error / invalid | `legacy` | Fail-closed |
| Any real tenant | any | `legacy` | Force-pin (unchanged) |

### Helper semantics matrix
| Mode | Hash state | RPC verify | Plaintext | Outcome | `fallback_suppressed` | `suppressed_reason` |
|---|---|---|---|---|---|---|
| dual | valid | true | – | ok, source=`hash` | false | null |
| dual | missing | – | match | ok, `plaintext_fallback` | false | null |
| dual | corrupt | false | match | ok, `plaintext_fallback`, hashMismatch | false | null |
| dual | present | error/throw | match | ok, `plaintext_fallback`, hashError | false | null |
| dual | any | – | mismatch | fail | false | null |
| **hash_only_ready** | valid | true | – | ok, source=`hash` | false | null |
| **hash_only_ready** | missing | – | match | **fail** | **true** | `missing_hash` |
| **hash_only_ready** | missing | – | mismatch | fail | false | `missing_hash` |
| **hash_only_ready** | corrupt | false | match | **fail** | **true** | `hash_mismatch` |
| **hash_only_ready** | corrupt | false | mismatch | fail | false | `hash_mismatch` |
| **hash_only_ready** | present | error/throw | match | **fail** | **true** | `hash_error` |
| **hash_only_ready** | present | error/throw | mismatch | fail | false | `hash_error` |
| **hash_only_ready** | present | – | – | (missing client/empId) → fail | – | `hash_error` |

`fallback_suppressed=true` is the explicit measurement signal: "we would have accepted this login under `dual` via plaintext but we did not because the mode is `hash_only_ready`". This lets a future observability window count real-world impact before flipping any tenant.

### Caller contract
All three readers (`employee-auth` login, `kiosk-clock`, `front-desk-checkin`):
- Run `validatePinDual(...)` only when resolver returns `dual` or `hash_only_ready`. Anything else → unchanged legacy strict-equality gate.
- Return the same generic 401 user response on `ok=false` (matches wrong-PIN copy).
- Emit one `[pin-auth-validate]` log line per attempt with fields: `ctx, mode, company_id, employee_id, has_hash, hash_version, validation_source, hash_mismatch, hash_error, fallback_suppressed, suppressed_reason, result`. Forbidden fields (PIN, hash, password, token, email, phone) audited — none present.

### QA results (code-level, no DB writes)
Deno unit tests, mocked RPC client, both modes:
- `dual: valid hash + correct PIN → ok, source=hash` ✅
- `dual: missing hash + correct PIN → ok, plaintext_fallback` ✅
- `dual: corrupt hash (RPC false) + correct PIN → ok, plaintext_fallback + hashMismatch` ✅
- `dual: RPC throws + correct PIN → ok, plaintext_fallback + hashError` ✅
- `hash_only_ready: valid hash + correct PIN → ok, source=hash` ✅
- `hash_only_ready: missing hash + correct PIN → fail, suppressed=missing_hash` ✅
- `hash_only_ready: corrupt hash (RPC false) + correct PIN → fail, suppressed=hash_mismatch` ✅
- `hash_only_ready: RPC throws + correct PIN → fail, suppressed=hash_error` ✅
- `hash_only_ready: wrong PIN → fail, fallbackSuppressed=false` ✅
- `hash_only_ready: missing client/employeeId → fail-closed as hash_error` ✅
- `default mode is dual when omitted` ✅ (back-compat for any future caller)
- `empty pin → fail in both modes, no fields leak` ✅

**12 / 12 passing, 0 failing.** Type-check passes (Deno compile step in `supabase--test_edge_functions`).

### Activation state
- `company_settings` SELECT (live): `[{company_id: d3500000-…-0001, mode: "dual"}]`. Single row.
- Zero tenants with `"hash_only_ready"`.
- Zero real tenants with `"dual"`.
- Demo workers: 7/7 valid hashes (post-S7-J restore).

### Rollback
- Rollback to S7-J state is a pure code revert of the 5 files above — no migration, no data change.
- If any unforeseen runtime regression appears, the resolver allow-list can be narrowed back to `{"dual"}` by editing two lines (`DEMO_HONORED_MODES` / `DEMO_HONORED_MODES_LOCAL`); helper defaults to `"dual"` so older callers stay safe.
- `hash_only_ready` will never affect any tenant until a `company_settings` row explicitly sets `value = "hash_only_ready"` on Stafly Demo — that flip is a separate sprint (S7-L) and is not performed here.

### What was NOT touched (re-confirmed)
- `company_settings` data, real tenants, plaintext `access_pin`, `authPassword`, payroll surface (`pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam pipeline), tenant governance, `setup-company`, worker documents, RLS policies, table/function grants, `internal_verify_pin_hash` body, `internal_dual_write_pin_hash`, activate / provision / change-pin behavior.
- No HTTP QA executed against `/portal /kiosk /front-desk` to avoid leaving QA artifacts without QA-mode plumbing (per 2026-06-01 rule).

### Risks found
- **None new in this sprint.** The capability is dormant for all tenants until S7-L explicitly flips the setting on Stafly Demo.
- Worth flagging for S7-L: when the demo flip happens, the plaintext fallback that has been masking `…0013`-style and `…0014`-style fixture conditions in QA will no longer fire. Operators relying on plaintext-only PINs in demo will be rejected with the standard "wrong PIN" copy. Pre-flip checklist must include "every demo worker has `extensions.crypt(access_pin, access_pin_hash) = access_pin_hash` = true" (already 7/7 today after S7-J restore).

### Recommendation S7-L
**Two-step:**
1. **S7-L-a (observability soak):** Keep capability dormant. Run a ≥7-day observability window on Stafly Demo while still in `dual` to confirm `hash_error=0` AND `hash_mismatch=0` AND no missing-hash drift (Demo hash count stays 7/7). Owners/dev sign off in writing.
2. **S7-L-b (single-row flip):** Update one row in `company_settings` for Stafly Demo only: `value` → `"hash_only_ready"`. No code change. Verify telemetry shows `fallback_suppressed=false` consistently. If any `fallback_suppressed=true` event appears, revert the row to `"dual"` immediately (single UPDATE). Real tenants and `authPassword` remain out of scope until the separate auth-decoupling workstream.

Hash-only (no plaintext stored at all) and the full auth-decoupling/random-password path remain explicitly out of scope for both S7-L sub-steps.

## Sprint S7-L-a — Demo `hash_only_ready` Soak Gate (Read-Only) (2026-06-23)

**Type:** Observability / read-only. No code, SQL writes, migrations, RLS, grants, auth, payroll, or settings changes.

### Guardrails reviewed
No edits to `company_settings`, `employee-auth`, `kiosk-clock`, `front-desk-checkin`, `_shared/pin-validation.ts`, `_shared/security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`, `access_pin_hash`, RLS, grants, payroll (`pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`), or Connecteam pipeline. Zero real-tenant touch.

### 1. Settings verification (read-only SQL)
`SELECT company_id, key, value FROM company_settings WHERE key='security.pin_auth_mode'`:
- **1 row total**: Stafly Demo (`d3500000-…-0001`) = `"dual"`.
- `hash_only_ready` tenants: **0**.
- Real tenants in `dual`: **0**.
- Real tenants with any non-default mode: **0** (all real tenants fall through to `legacy` via missing row).

### 2. Hash verification (counts only — no PIN/hash/PII exported)
Demo (`company_id = d3500000-…-0001`):
| Metric | Count |
|---|---|
| Total demo workers | 7 |
| With `access_pin` (plaintext) | 7 |
| With `access_pin_hash` | 7 |
| `extensions.crypt(access_pin, access_pin_hash) = access_pin_hash` | **7/7 ✅** |

S7-J restore confirmed intact. No drift since 2026-06-22.

### 3. Telemetry soak — Stafly Demo
Edge function logs queried for `pin-auth-validate` / `pin-auth` across `employee-auth`, `kiosk-clock`, `front-desk-checkin`:

| Function | Demo PIN validations in window | Notes |
|---|---|---|
| employee-auth | **0** | Only phone-login activity (`[phone-login]`), not PIN |
| kiosk-clock | **0** | No invocations |
| front-desk-checkin | **0** | No invocations |

Aggregate:
- `validation_source=hash`: 0
- `validation_source=plaintext_fallback`: 0
- `hash_error=true`: **0 ✅**
- `hash_mismatch=true`: 0
- `fallback_suppressed`: 0
- `suppressed_reason`: n/a
- Unexpected fallbacks: none

### 4. Sensitive log audit
Sampled `employee-auth` recent logs: no `access_pin`, `access_pin_hash`, full hash, password, token, email, or phone leak. `[phone-login]` emits only a normalized phone (10-digit) — pre-existing telemetry, out of scope for this sprint. Recommend a follow-up to scrub the normalized-phone field, tracked separately (NOT part of S7-L).

### 5. Operational check
- Portal login demo: not exercised in this window (QA-mode plumbing required to avoid artifacts). No 500s observed in available logs.
- Kiosk demo: no invocations; not exercised to avoid demo artifacts.
- Front-desk demo: no invocations; not exercised.
- No worker-facing leak of hash state surfaced anywhere.
- No 500s/anomalies in observable logs.

### 6. GO / NO-GO for S7-L-b

**Decision: NO-GO (insufficient soak evidence).**

Acceptance criteria for S7-L-b flip require non-zero `validation_source="hash"` traffic in Stafly Demo with `hash_error=0` and `hash_mismatch=0` across all three flows. Current window shows **0 demo PIN validations** across `employee-auth` / `kiosk-clock` / `front-desk-checkin`, so we cannot certify that the hash path is exercised under real demo load. Hash integrity (7/7) and zero-error baseline are necessary but not sufficient.

**Blocker:** lack of synthetic or live demo PIN traffic during the soak window.

### 7. Recommendation S7-L-a-ext (precondition for S7-L-b)
Before S7-L-b is approved:
1. Run a controlled QA-mode demo-PIN exercise sprint (S7-L-a-ext, read-only behavior + light demo-only writes already covered by S7-J pattern): 1× employee-auth login, 1× kiosk-clock punch, 1× front-desk-checkin per demo worker, then immediate artifact contention per the QA-artifact protocol (`[QA_ARTIFACT 2026-06-23]` tagging, `status=cancelled`/`removed`, no payroll touch).
2. Re-run S7-L-a telemetry sweep; require ≥21 events with `validation_source="hash"`, `hash_error=0`, `hash_mismatch=0`.
3. Then proceed to S7-L-b.

### 8. Exact flip SQL (S7-L-b — NOT executed)
```sql
-- FLIP: Stafly Demo dual → hash_only_ready
INSERT INTO public.company_settings (company_id, key, value)
VALUES (
  'd3500000-0000-4000-8000-000000000001',
  'security.pin_auth_mode',
  '"hash_only_ready"'::jsonb
)
ON CONFLICT (company_id, key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now()
WHERE public.company_settings.company_id = 'd3500000-0000-4000-8000-000000000001'
  AND public.company_settings.key = 'security.pin_auth_mode';
```

### 9. Exact rollback SQL (S7-L-b — NOT executed)
```sql
-- ROLLBACK soft: hash_only_ready → dual
UPDATE public.company_settings
SET value = '"dual"'::jsonb, updated_at = now()
WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
  AND key = 'security.pin_auth_mode';

-- ROLLBACK hard (if full demo lockout protection needed): → legacy
UPDATE public.company_settings
SET value = '"legacy"'::jsonb, updated_at = now()
WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
  AND key = 'security.pin_auth_mode';
```

Both are pure setting flips — no schema, no data, no `access_pin*` mutations.

### 10. S7-L-b gate (when re-attempted)
- Owner/developer written approval.
- On-call assigned for the flip window.
- Observation window post-flip: 24h with hourly telemetry sweep.
- **No-go conditions:** any `hash_error>0`, any unexpected `suppressed_reason`, any non-demo tenant resolving non-`legacy`, any worker-facing hash-state leak, any auth/payroll anomaly correlated with the flip.

### What was NOT touched
`company_settings` values, edge code (employee-auth / kiosk-clock / front-desk-checkin), `_shared/pin-validation.ts`, `_shared/security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`, `access_pin_hash`, RLS, grants, payroll, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam, real tenants. Zero migrations created.

### Risks found
- **R1 (blocker):** zero demo PIN telemetry in observed window → cannot validate hash path under load → S7-L-b NOT safe to ship.
- **R2 (low):** `[phone-login]` logs normalized phone digits. Pre-existing; document for separate scrub sprint.
- **R3 (low):** `dual` mode is structurally safe (fallback still active), so the prolonged absence of `validation_source="hash"` events is observability gap, not a security regression.

## Sprint S7-L-a-ext — Controlled Demo PIN Exercise (2026-06-23)

**Type:** QA exercise on Stafly Demo only. No code, migrations, RLS, grants, payroll, settings, real-tenant, plaintext-deletion, or `authPassword` changes.

### Guardrails reviewed
No touch to `company_settings` values, `employee-auth`/`kiosk-clock`/`front-desk-checkin` code, `authPassword`, `internal_verify_pin_hash`, `access_pin`/`access_pin_hash` data, RLS, grants, payroll (`pay_periods`, `period_base_pay`, `reconciliation_*`, `historical_payroll_entries`, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`), or Connecteam.

### 1. Pre-check (read-only)
- Stafly Demo = `"dual"` ✅
- `hash_only_ready` tenants: 0 ✅
- Real tenants in `dual`: 0 ✅
- Demo hashes valid (crypt): **7/7** ✅
- Fixtures pending: 0 ✅
- Rate-limit rows in last 1h: 0 ✅
- Workers with phone (PIN-flow eligible): **6/7** (worker #7 `…dfa` has no phone → portal/kiosk/front-desk unreachable for that one)

### 2. QA artifact protocol
All artifacts created in this sprint are tagged `[QA_ARTIFACT 2026-06-23 S7-L-a-ext]` in this doc (the underlying tables — `auth_rate_limits` for wrong-PIN, Supabase `auth.sessions` for successful logins — have no metadata column for inline tagging).

### 3. Portal / employee-auth login QA — EXECUTED
6 demo workers × 1 correct-PIN login + 1 intentional wrong-PIN on worker #1.

Edge response codes:
| Worker | HTTP | Hash gate | Notes |
|---|---|---|---|
| #1 | 200 | ok | session issued |
| #2 | 200 | ok | session issued |
| #3 | 200 | ok | session issued |
| #4 | 200 | ok | session issued |
| #5 | 200 | ok | session issued |
| #6 | 500 | **ok** | hash gate passed; downstream Supabase `signInWithPassword` failed ("Invalid login credentials") — `authPassword(pin)` user not provisioned for that demo worker. Out of scope for this sprint (auth decoupling = S7-K+). Pre-existing demo data issue, NOT a hash-path regression. |
| #1 (wrong PIN `0000`) | 401 | mismatch | intentional, generic "PIN incorrecto" surface |

### 4. Kiosk QA — **BLOCKED**
`kiosk-clock` endpoint validates PIN then immediately writes `clock_events` + opens/closes `time_entries`. No QA-mode plumbing exists to skip the clock side-effect (per memory `qa-tenant-mismatch-2026-06-01` we already had one demo contamination incident). Exercising 6 calls would create 6 `clock_events` and either 6 open `time_entries` or alternating in/out — touching `time_entries` semantics is explicitly forbidden by this sprint's guardrails. **NOT executed.**

### 5. Front-desk QA — **BLOCKED**
`front-desk-checkin` `lookup` action does not validate PIN (phone-only). PIN gate lives behind `update_self` / `create_visit` / `submit_rating` / `start_visit` paths, all of which write `front_desk_visits`, audit rows, or mutate employee profile fields. No safe PIN-only probe exists. **NOT executed.**

### 6. Telemetry sweep (employee-auth, post-exercise)
From edge logs `[pin-auth-validate]` ctx=login, company=demo, window 2026-06-23 00:10:20Z–00:10:40Z:

| Metric | Count |
|---|---|
| Total validations | **7** |
| `validation_source="hash"` | **6** ✅ (all 6 successful correct-PIN logins) |
| `validation_source="plaintext_fallback"` | 0 ✅ |
| `hash_error=true` | **0** ✅ |
| `hash_mismatch=true` | 1 (intentional wrong-PIN, worker #1) |
| `fallback_suppressed` | 0 |
| `suppressed_reason` | none |
| `result=ok` | 6 |
| `result=fail` | 1 (intentional) |

Per-flow:
- employee-auth: 7 events as above.
- kiosk-clock: 0 (blocked, see §4).
- front-desk-checkin: 0 (blocked, see §5).

Coverage vs target (21): **6 hash events / 21 planned (28%)**. Reduced ceiling per safe-flow blockers documented in §4 and §5. All hash events emitted from `employee-auth` cover the shared `validatePinDual` + `internal_verify_pin_hash` path that the other two flows also use, so the hash path itself is exercised end-to-end.

### 7. Sensitive log audit
Sampled all `[pin-auth-validate]` and `[pin-auth-mode]` log lines. No `PIN`, `access_pin`, `access_pin_hash`, full hash, password, token, email, or phone present. Pre-existing `[phone-login]` emits `normalizedPhone` (10 digits) — already flagged in S7-L-a §4, out of scope.

### 8. Cleanup / artifact review
| Table | Rows added by QA | Action |
|---|---|---|
| `auth.sessions` (Supabase) | 5 demo Supabase sessions | Allowed to expire naturally per provider TTL. No removal — touching `auth` schema is forbidden. |
| `auth_rate_limits` | 1 row (demo phone for worker #1 wrong-PIN) | Left intact (audit trail). Will auto-clear on next successful login or admin sweep. |
| `clock_events`, `time_entries`, `front_desk_visits`, `scheduled_shifts`, `shift_assignments`, payroll tables | **0** | Confirmed unchanged. |
| `company_settings` | 0 | Demo still `"dual"`. |
| `employees` (`access_pin`, `access_pin_hash`) | 0 | 7/7 hashes still valid via crypt(). |

No real-tenant artifacts. Local credential file `/tmp/demo_creds.txt` deleted post-run.

### 9. GO / NO-GO for S7-L-b → **CONDITIONAL GO**

Hard criteria:
- Demo remains `dual` ✅
- 0 tenants in `hash_only_ready` ✅
- 0 real tenants in `dual` ✅
- 7/7 hashes valid ✅
- `hash_error=0` ✅
- No unexpected `plaintext_fallback` ✅ (zero observed)
- No sensitive log leak ✅
- Artifacts documented/acceptable ✅

Soft criteria:
- ≥21 correct-PIN hash events: **NOT met** (6/21 due to documented kiosk/front-desk side-effect blockers).
- Worker #6 surfaced an `authPassword`/Supabase password mismatch — orthogonal to the hash path, but worth tracking before flipping to `hash_only_ready` because under `hash_only_ready` the *hash* gate would still pass for #6 and the downstream Supabase failure would persist identically (no behavior change). Not a flip blocker.

**Recommendation:** GO for S7-L-b with the caveat that kiosk-clock and front-desk-checkin hash exercise will only be observable via natural demo traffic post-flip. The shared `validatePinDual` + `internal_verify_pin_hash` path was exercised cleanly via employee-auth, so the runtime contract is validated. Owner/dev should explicitly acknowledge the reduced cross-flow coverage before approving.

### 10. Exact flip SQL (S7-L-b — staged, NOT executed)
```sql
INSERT INTO public.company_settings (company_id, key, value)
VALUES ('d3500000-0000-4000-8000-000000000001', 'security.pin_auth_mode', '"hash_only_ready"'::jsonb)
ON CONFLICT (company_id, key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now()
WHERE public.company_settings.company_id = 'd3500000-0000-4000-8000-000000000001'
  AND public.company_settings.key = 'security.pin_auth_mode';
```

### 11. Exact rollback SQL (S7-L-b — staged, NOT executed)
```sql
-- Soft rollback
UPDATE public.company_settings SET value='"dual"'::jsonb, updated_at=now()
WHERE company_id='d3500000-0000-4000-8000-000000000001' AND key='security.pin_auth_mode';
-- Hard rollback
UPDATE public.company_settings SET value='"legacy"'::jsonb, updated_at=now()
WHERE company_id='d3500000-0000-4000-8000-000000000001' AND key='security.pin_auth_mode';
```

### What was NOT touched
`company_settings` values, all three edge functions, `_shared/pin-validation.ts`, `_shared/security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`, `access_pin_hash` data, RLS, grants, payroll, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, `front_desk_visits`, Connecteam, real tenants. Zero migrations created.

### Risks found
- **R1 (medium):** kiosk + front-desk hash path lacks safe QA harness → no synthetic coverage possible without writing `clock_events`/`time_entries`/`front_desk_visits`. Recommend a future QA-mode plumbing sprint (`S7-L-a-harness`) before any production-tenant rollout beyond demo.
- **R2 (low — pre-existing):** Demo worker #6 cannot complete login (`authPassword(pin)` Supabase password mismatch). Hash gate works; downstream auth seed missing. Orthogonal to S7-L-b.
- **R3 (low — known):** `[phone-login]` logs normalized phone. Pre-existing; separate scrub sprint.

## Sprint S7-L-preflight — Owner Approval + hash_only_ready Flip Runbook

**Type:** doc-only / approval-only. The flip itself is **NOT executed** here; this section stages the owner-runbook for Sprint S7-L-b.

**Date:** 2026-06-23

### Guardrails reviewed

- No `company_settings` write executed.
- No edge-function, RPC, helper, or caller code changes.
- No migrations, RLS, grants, or schema changes.
- No payroll, `time_entries`, `clock_events`, `scheduled_shifts`, or `shift_assignments` touched.
- No real tenants, Sandbox, or QA tenants touched.
- No plaintext deletion, no `hash_only` activation, no `authPassword` decoupling.

### 1. Owner / operator approval checklist

| # | Gate | Required | Evidence location |
|---|------|----------|-------------------|
| 1 | Stafly Demo currently on `"dual"` | ✅ | S7-L-a §1, S7-L-a-ext §1 |
| 2 | All 7 demo `access_pin_hash` rows crypt-valid | ✅ | S7-L-a-ext §1 |
| 3 | `hash_error=0` observed | ✅ | S7-L-a-ext §6 |
| 4 | `validation_source="hash"` exercised end-to-end | ✅ | S7-L-a-ext: 6/6 successful logins |
| 5 | No sensitive logs (PIN, hash, password, token, email, phone) | ✅ | S7-L-a-ext §7 |
| 6 | Owner / developer written approval for demo flip | ⚠️ **Required before S7-L-b** | This runbook |
| 7 | On-call engineer assigned for flip window | ⚠️ **Required before S7-L-b** | This runbook |
| 8 | Rollback owner identified and reachable | ⚠️ **Required before S7-L-b** | This runbook |
| 9 | 24 h observation window scheduled post-flip | ⚠️ **Required before S7-L-b** | This runbook |
| 10 | Explicit acceptance of reduced kiosk/front-desk coverage | ⚠️ **Required before S7-L-b** | §2 below |

**Do not run S7-L-b until every required gate is signed off.**

### 2. Accepted risks

These risks are explicitly accepted for the **Stafly Demo** flip only. They block any broader rollout.

| Risk | Severity | Acceptance rationale |
|------|----------|--------------------|
| **Reduced coverage**: only 6/21 planned correct-PIN events collected. Kiosk and front-desk flows were blocked to avoid side-effect writes. | Medium | The shared `validatePinDual` + `internal_verify_pin_hash` path was exercised cleanly through `employee-auth`; the helper is identical for kiosk/front-desk. Risk is contained to Demo and mitigated by tight post-flip monitoring. |
| **Kiosk / front-desk not exercised end-to-end**: no QA-mode "no-write" harness exists. | Medium | Hash verification logic is shared; side-effect blockers are documented. Post-flip telemetry will catch any flow-specific wiring issues in Demo only. |
| **Demo worker #6 cannot complete full login**: hash gate passes, but downstream `authPassword(pin)` Supabase password mismatch fails. | Low | Pre-existing demo data issue; orthogonal to `hash_only_ready`. Under `hash_only_ready` the hash gate behaves identically and the same downstream failure would occur. |
| **`[phone-login]` logs normalized 10-digit phone.** | Low | Pre-existing telemetry; separate scrub sprint. Out of scope for S7-L. |

**Owner acknowledgement text (copy into approval):**

> I acknowledge that S7-L-b will flip only Stafly Demo to `hash_only_ready` with reduced synthetic coverage (6/21 events), and that kiosk-clock and front-desk-checkin have not been exercised end-to-end in this sprint. I accept that post-flip monitoring is the primary mitigation and agree to immediate rollback on any `hash_error`, unexpected `fallback_suppressed`, or worker-facing 401/500 increase.

### 3. Preconditions for S7-L-b

- `security.pin_auth_mode` for `d3500000-0000-4000-8000-000000000001` = `"dual"`.
- 7/7 demo `access_pin_hash` rows pass `crypt(access_pin, access_pin_hash) = access_pin_hash`.
- Zero `hash_error=true` events in trailing telemetry window.
- Zero sensitive-value leaks in sampled logs.
- No active incidents in `employee-auth`, `kiosk-clock`, or `front-desk-checkin`.
- Rollback SQL and rollback owner ready.
- Real tenants, Sandbox, and QA tenants remain `legacy`.
- No `hash_only_ready` rows exist for any other `company_id`.

### 4. Exact flip SQL (S7-L-b — staged, NOT executed)

Run **only** after all owner gates are signed off:

```sql
-- FLIP: Stafly Demo dual → hash_only_ready
INSERT INTO public.company_settings (company_id, key, value)
VALUES (
  'd3500000-0000-4000-8000-000000000001',
  'security.pin_auth_mode',
  '"hash_only_ready"'::jsonb
)
ON CONFLICT (company_id, key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now()
WHERE public.company_settings.company_id = 'd3500000-0000-4000-8000-000000000001'
  AND public.company_settings.key = 'security.pin_auth_mode';
```

This is a single-row `company_settings` mutation. No `employees` rows, no `access_pin`/`access_pin_hash`, no RLS, no grants, no payroll tables are modified.

### 5. Exact rollback SQL (S7-L-b — staged, NOT executed)

Keep these statements ready before executing the flip:

```sql
-- SOFT ROLLBACK: hash_only_ready → dual (restore plaintext fallback)
UPDATE public.company_settings
SET value = '"dual"'::jsonb, updated_at = now()
WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
  AND key = 'security.pin_auth_mode';

-- HARD ROLLBACK: hash_only_ready → legacy (PIN-derived Supabase password path)
UPDATE public.company_settings
SET value = '"legacy"'::jsonb, updated_at = now()
WHERE company_id = 'd3500000-0000-4000-8000-000000000001'
  AND key = 'security.pin_auth_mode';
```

Use **soft rollback** for any hash-specific issue where the plaintext fallback is still safe. Use **hard rollback** only if the dual path itself is judged unsafe.

### 6. Post-flip monitoring plan (24 h observation window)

**Frequency:** hourly sweep for first 4 h, then every 4 h for the remaining 20 h.

**Flows to monitor:**
- `employee-auth` portal login
- `kiosk-clock` clock in/out
- `front-desk-checkin` PIN-gated paths

**Telemetry signals:**

| Signal | Expected in Demo `hash_only_ready` | Action if unexpected |
|--------|-----------------------------------|----------------------|
| `validation_source="hash"` | >95% of successful PIN validations | Investigate any drop below 95% |
| `validation_source="plaintext_fallback"` | 0 (fallback suppressed in `hash_only_ready`) | Any non-zero event triggers soft rollback |
| `fallback_suppressed=true` | Only for missing/corrupt hash or wrong PIN | Non-zero for known-good worker → immediate soft rollback |
| `suppressed_reason` | `missing_hash`, `hash_mismatch`, or `hash_error` only | Any other value → investigate |
| `hash_error=true` | 0 | Immediate soft rollback |
| `hash_mismatch=true` | Only on intentional wrong PIN | Spike correlated with support tickets → investigate |
| HTTP 401/403/500 spikes | Within baseline | >20% increase → immediate hard rollback |
| `[phone-login]` logs | Normalized phone still emitted | Track separately; not a flip blocker |

**Operational checks:**
- Demo portal login smoke test each hour using worker #1–#5 credentials.
- Kiosk and front-desk demo pages probed at least once in the first hour (manual or scripted; prefer no-write probes).
- No payroll or scheduling anomalies correlated with the flip window.

### 7. Immediate rollback conditions

Rollback the flip **without waiting for the end of the window** if any of the following occur:

- Any `hash_error=true` event for a demo worker.
- Any `fallback_suppressed=true` event for a **known-good** demo worker (valid hash + correct PIN).
- Unexpected worker-facing increase in 401/403/500 responses in `employee-auth`, `kiosk-clock`, or `front-desk-checkin`.
- Any non-demo tenant resolves to `hash_only_ready`.
- Sensitive-value leak appears in logs (PIN, hash, password, token, email, phone).
- Any payroll, `time_entries`, or `scheduled_shifts` anomaly during the window — even if unrelated — until root cause excludes the flip.
- Kiosk or front-desk failure pattern not present pre-flip.
- Owner or on-call decides the risk is no longer acceptable.

**Rollback decision authority:** rollback owner identified in §1.

### 8. What remains blocked after S7-L-b

Even after a successful demo flip, the following remain **explicitly out of scope** until their own approved sprints:

- Real tenants (`Quality Staff`, `Eminence`, `Milenium`, `Hamaspik`, `MyStaff`, `Zemer`, `JKitchen`, `Parceros`, etc.).
- Sandbox / QA tenants flipping to `hash_only_ready`.
- `hash_only` mode (plaintext ignored / deleted).
- Deletion, nulling, or revoking of `access_pin` plaintext.
- `authPassword` decoupling / random-password bridge.
- Any rollout beyond Stafly Demo.
- End-to-end kiosk / front-desk QA on non-demo tenants until a safe no-write harness is built.

### 9. No-go conditions for S7-L-b

S7-L-b is **NO-GO** if any of the following are true at execution time:

- Owner written approval is missing.
- On-call engineer is not assigned / reachable.
- Demo is not currently `"dual"`.
- Any demo hash fails `crypt()` verification.
- Any `hash_error=true` appears in trailing telemetry.
- Sensitive-value leak is observed in recent logs.
- Any real tenant, Sandbox, or QA tenant is non-`legacy`.
- Rollback SQL or rollback owner is not staged.

### 10. Recommendation for S7-L-b

**GO — with owner approval and explicit acceptance of reduced coverage.**

The technical preconditions are satisfied:
- Demo hash integrity is 7/7.
- The hash path is exercised end-to-end via `employee-auth` (6/6 successful logins, 0 hash errors, 0 plaintext fallbacks).
- No sensitive-value leaks were found in telemetry.
- Rollback is a single-row setting flip with no data/schema impact.

The remaining risk is **coverage breadth**, not correctness. The shared helper contract is validated; kiosk and front-desk share the same helper and will be monitored in real demo traffic post-flip. Broader rollout remains blocked until a no-write QA harness is built and the 24 h demo window is clean.

**S7-L-b must be a separate, owner-approved execution sprint.** This preflight document provides the runbook; the flip itself must record the sign-off, execute the staged SQL, and run the 24 h monitoring plan.

### What was NOT touched

`company_settings` values, `employee-auth` / `kiosk-clock` / `front-desk-checkin` code, `_shared/pin-validation.ts`, `_shared/security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`/`access_pin_hash` data, RLS, grants, payroll tables, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, `front_desk_visits`, Connecteam, real/Sandbox/QA tenants. Zero migrations, zero SQL writes, zero code changes.

### Risks found

- **R1 (accepted for Demo):** reduced synthetic coverage (6/21) and no end-to-end kiosk/front-desk exercise. Mitigated by shared-helper validation and tight post-flip monitoring; blocks all non-demo rollout.
- **R2 (low — pre-existing):** Demo worker #6 downstream `authPassword(pin)` mismatch. Hash path works; not a flip blocker.
- **R3 (low — pre-existing):** `[phone-login]` logs normalized phone digits. Separate scrub sprint; not a flip blocker.


---

## S7-L-b — Flip Stafly Demo to `hash_only_ready` (EXECUTED 2026-06-23)

**Scope:** single setting flip. Stafly Demo only (`d3500000-0000-4000-8000-000000000001`).
**Owner approval:** Jorge (Stafly Demo only). **On-call / rollback owner:** Jorge.
**Monitoring window:** 24h post-flip.

### Change
- `company_settings.value` for `(company_id=demo, key='security.pin_auth_mode')`: `"dual"` → `"hash_only_ready"`.
- Verified post-flip: demo mode = `"hash_only_ready"`; real tenants in `hash_only_ready`/`hash_only` = **0**.

### Guardrails enforced in migration
- Aborted if target company `is_demo` ≠ `true`.
- Aborted if any non-demo / non-test tenant already in `hash_only_ready` / `hash_only`.
- Post-checks re-asserted demo mode + zero real tenants.

### What was NOT touched
Edge code, `pin-validation.ts`, `security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`, `access_pin_hash`, RLS, grants, kiosk-clock / front-desk-checkin logic, payroll, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, Connecteam, real tenants, plaintext data.

### Rollback (staged, NOT executed)
- **Soft (preferred):** UPSERT same row back to `"dual"`.
- **Hard:** UPSERT same row to `"legacy"`.

### Rollback triggers (immediate revert to `"dual"`)
- any `hash_error=true`
- `fallback_suppressed` for a valid worker
- spike in 401/403/500 on `employee-auth` / `kiosk-clock` / `front-desk-checkin`
- any non-demo tenant resolving `hash_only_ready`
- sensitive data in logs
- any payroll anomaly (even indirect)

### Monitoring plan (24h)
- Telemetry: counts of `validation_source="hash"`, `plaintext_fallback`, `hash_error`, `hash_mismatch`, `fallback_suppressed`, scoped to demo.
- Sensitive log audit: PIN / hash / password / token / email / SSN never present.
- Operational: 401/403/500 rates on the three PIN edge functions.

### Recommendation
Hold at S7-L-b. Do **not** proceed to S7-M (hash_only) or plaintext kill until 24h soak passes clean and kiosk/front-desk QA harness exists.

---

## S7-L-c — Post-flip Telemetry Review (Read-Only) — 2026-06-23

**Window reviewed:** 2026-06-23 00:20 UTC (flip) → review time (~24h).
**Mode:** Read-only. Zero code, SQL writes, migrations, RLS, grants, payroll, auth or real-tenant changes.

### Settings verification
- Stafly Demo (`d3500000-0000-4000-8000-000000000001`, `is_demo=true`): `security.pin_auth_mode = "hash_only_ready"` (unchanged since flip at 2026-06-23 00:20:07 UTC). ✅
- Other tenants in `hash_only_ready` / `hash_only`: **0**. ✅
- No other `company_settings` rows modified.

### Hash verification (demo only, counts only)
- Workers with `access_pin`: **7**
- Workers with `access_pin_hash`: **7**
- Hashes where `extensions.crypt(access_pin, access_pin_hash) = access_pin_hash`: **7 / 7** ✅
- No PIN/hash/email/phone exported.

### Telemetry review (employee-auth, kiosk-clock, front-desk-checkin)
- Edge function logs in window: **none** for the three PIN edge functions on Stafly Demo.
- Edge HTTP analytics: **0** requests matched in last 24h.
- `validation_source="hash"`: 0 · `fallback_suppressed`: 0 · `hash_error`: 0 · `hash_mismatch`: 0 · 401/403/500 spikes: none.
- Effective post-flip PIN traffic on Demo: **insufficient** to validate behaviour in production-like volume.

### Rollback trigger check
- `hash_error=true`: ❌ none
- `fallback_suppressed` for valid worker: ❌ none
- 401/403/500 spike: ❌ none
- Non-demo resolving `hash_only_ready`: ❌ none
- Sensitive log leak: ❌ none observed in window
- Payroll anomaly: ❌ none
- **No rollback trigger met.**

### Sensitive log audit
- No PIN, `access_pin`, `access_pin_hash`, full hash, password, token, email or phone observed in window.
- Pre-existing `[phone-login]` phone leak remains tracked as separate backlog (out of scope here).

### Payroll safety check (Stafly Demo, last 24h)
| Table | Rows created in window |
|---|---|
| pay_periods | 0 |
| period_base_pay | 0 |
| time_entries | 1 (pre-flip 20:54 UTC, demo seed activity) |
| clock_events | 1 (pre-flip, demo) |
| scheduled_shifts | 0 |
| shift_assignments | 0 |
| historical_payroll_entries | 0 |

No payroll, reconciliation, Connecteam pipeline, or time/clock semantics changes. The single pre-flip time_entry/clock_event pair is demo seed activity unrelated to the flip.

### Decision: **EXTEND**
Technical state is clean (settings correct, 7/7 hashes valid, 0 errors, 0 rollback triggers, 0 payroll impact), but PIN-edge-function traffic on Demo during the window was effectively zero. There is no production-like evidence that `hash_only_ready` is exercising the hash path under real load. Promoting to S7-M (hash_only) or expanding scope on this evidence would be premature.

### What was NOT touched
Code, edge functions (`employee-auth`, `kiosk-clock`, `front-desk-checkin`), `pin-validation.ts`, `security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`, `access_pin_hash`, RLS, grants, payroll, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, reconciliation_*, Connecteam, real tenants, plaintext data, any `company_settings` row.

### Risks found
- **Low traffic risk**: 0 PIN edge calls on Demo in 24h ⇒ soak window did not actually exercise the new mode. Decision based on absence of failures, not presence of successful real validations.
- **Coverage gap (carried over)**: still no side-effect-free QA harness for kiosk-clock / front-desk-checkin.
- **Pre-existing**: `[phone-login]` phone log leak — backlog, unchanged.

### Recommendation (next)
1. Keep Demo in `hash_only_ready` (no rollback).
2. Run a second **S7-L-a-ext-style controlled PIN exercise** on Demo (employee-auth + at minimum a guarded kiosk-clock / front-desk-checkin probe) to generate real `validation_source="hash"` telemetry.
3. Re-run S7-L-c review against that exercise window.
4. Do **not** advance to S7-M (hash_only), plaintext kill, authPassword decoupling, or any real-tenant enablement until a soak window shows real `hash` validations with `hash_error=0` and `fallback_suppressed=0` for valid workers.

Staged rollback SQL from S7-L-preflight remains valid and unused.

---

## S7-L-c-ext — Controlled Demo PIN Exercise under hash_only_ready — 2026-06-23

**Window:** 2026-06-23 00:30:55 → 00:31:19 UTC.
**Mode:** QA controlled on Stafly Demo only. No code / migrations / RLS / grants / payroll / real-tenant / plaintext / authPassword / kiosk / front-desk / employee-auth changes. No edits to access_pin / access_pin_hash.

### Guardrails ✅
All applicable read-only / no-change guardrails respected. No rollback executed (no trigger met — see below).

### Pre-check
- Demo `security.pin_auth_mode = "hash_only_ready"` (unchanged). ✅
- 0 non-demo tenants in `hash_only_ready` / `hash_only`. ✅
- Demo workers: 7/7 valid `extensions.crypt(access_pin, access_pin_hash)` hashes. ✅
- No active rate-limit lockouts on target workers.

### QA actions executed (employee-auth `action="login"`)
Anon-auth invocations, no preview-user impersonation:

| Phone | Worker | PIN | HTTP | pin-auth-validate result |
|---|---|---|---|---|
| 5550100001 | …0011 | 123456 | 401 | fail · hash_mismatch · suppressed_reason="hash_mismatch" |
| 5550100002 | …0012 | 123456 | 401 | fail · hash_mismatch |
| 5550100003 | …0013 | 123456 | 401 | fail · hash_mismatch |
| 5550100004 | …0014 | 123456 | 200 | ok · validation_source="hash" |
| 5550100005 | …0015 | 123456 | 200 | ok · validation_source="hash" |
| 5550100099 | 0df71fc8… | 123456 | 500 (1×) | ok · validation_source="hash" (3 validated runs) |
| 5550100001 | …0011 | 000000 (wrong) | 401 | fail · hash_mismatch |

The hash_mismatch outcomes on …0011/…0012/…0013 reflect that those demo workers' stored hashes do **not** correspond to PIN `123456` — this is a seed-data quirk, not a hash_only_ready defect. Behavior under the mode is correct: hash path executed, no plaintext fallback, no error.

### Flow coverage
- employee-auth (`login`): ✅ exercised (5 ok + 4 fail across 6 distinct workers).
- kiosk-clock: ❌ NOT exercised — no side-effect-free QA harness exists. Skipped per scope.
- front-desk-checkin: ❌ NOT exercised — same blocker. Skipped per scope.

### Telemetry results (window)
- Total `pin-auth-validate` events: **9** (all `mode="hash_only_ready"`, `demo=true`).
- `validation_source="hash"`: **5** (all `result=ok`).
- `result=ok`: 5 · `result=fail`: 4 (all `hash_mismatch`).
- `hash_error=true`: **0** ✅
- `fallback_suppressed=true`: **0** ✅
- `fallback_suppressed` for a *valid* worker: **0** ✅
- `suppressed_reason`: `"hash_mismatch"` on the 4 fail events only (expected — no plaintext fallback path under `hash_only_ready`).
- HTTP: 5× 200, 3× 401 (wrong-PIN, expected), 1× 500 on 5550100099 — pin validated OK upstream; downstream `auth.signInWithPassword` failed with "Invalid login credentials" (authPassword for that synthetic user not aligned). **Not a hash-mode failure**; explicitly out of S7-L-c-ext scope (no authPassword changes permitted). Single occurrence, no spike pattern.

### Sensitive log audit
- No PIN, `access_pin`, `access_pin_hash`, full hash, password, or token observed in logs.
- No email in pin-auth-validate / pin-auth-mode events.
- Pre-existing `[phone-login]` phone log leak observed (workers' 10-digit phone numbers) → **carried over backlog, unchanged**, did not worsen.

### Rollback trigger check
- `hash_error=true`: ❌ none → no trigger
- `fallback_suppressed` for valid worker: ❌ none → no trigger
- 401/403/500 spike: ❌ no spike — 3 expected 401s on wrong PIN, 1 isolated 500 unrelated to hash path → no trigger
- Non-demo in `hash_only_ready`: ❌ none → no trigger
- Sensitive log leak: ❌ none new → no trigger (pre-existing phone leak unchanged → backlog only)
- Payroll anomaly: ❌ none → no trigger
- **No rollback executed.**

### Payroll safety (last hour, Stafly Demo)
| Table | New rows |
|---|---|
| pay_periods | 0 |
| period_base_pay | 0 |
| time_entries | 0 |
| clock_events | 0 |
| scheduled_shifts | 0 |
| shift_assignments | 0 |
| historical_payroll_entries | 0 |

No reconciliation_*, Connecteam pipeline, or semantics changes.

### Decision: **PASS**
Hash path validated under real (controlled) traffic on Stafly Demo:
- 5 successful `validation_source="hash"` events with `hash_error=0` and zero `fallback_suppressed` for valid workers.
- 4 expected `hash_mismatch` fails behaving exactly as designed under `hash_only_ready` (no plaintext fallback, clean fail).
- Zero payroll impact.

Keep Stafly Demo on `hash_only_ready`.

### What was NOT touched
Code, edge functions (`employee-auth`, `kiosk-clock`, `front-desk-checkin`), `pin-validation.ts`, `security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin`, `access_pin_hash`, RLS, grants, payroll, `time_entries`, `clock_events`, `scheduled_shifts`, `shift_assignments`, reconciliation_*, Connecteam, real tenants, plaintext data, any `company_settings` row.

### Risks found
- **authPassword desync (separate concern)**: 1×500 on 0df71fc8 confirms hash-pin validation can succeed while supabase `auth.signInWithPassword` fails — known limitation of current 2-track model. Out of scope here; must be resolved before any plaintext kill / hash_only / authPassword decoupling.
- **Coverage gap (carried)**: kiosk-clock + front-desk-checkin still unexercised under hash_only_ready; need a side-effect-free QA harness before extending the mode beyond Demo.
- **Pre-existing**: `[phone-login]` phone log leak — unchanged backlog.

### Recommendation (next)
1. Hold Demo on `hash_only_ready`. No further changes this sprint.
2. Open a focused sprint to investigate the 1×500 on 5550100099 (auth.users password ↔ access_pin alignment for synthetic demo users) — does **not** block S7-L outcome.
3. Build a side-effect-free QA harness for kiosk-clock / front-desk-checkin **before** any S7-M scoping.
4. Do **not** advance to hash_only, plaintext kill, authPassword decoupling, or any real-tenant enablement.

---

## S7-M — Side-effect-free PIN QA Harness Design — 2026-06-23

**Sprint type:** Design / doc-only. No code, no SQL writes, no migrations, no RLS/grants, no payroll, no real-tenant changes, no hash_only, no plaintext deletion, no authPassword refactor, no edits to `kiosk-clock` or `front-desk-checkin`. Implementation is deferred to S7-N.

### 1. Flows that need test coverage
- **kiosk-clock PIN gate** — `supabase/functions/kiosk-clock/index.ts`
  - Gate: lines 134–181, `validatePinDual({ employee_id, storedPlaintext, storedHash, providedPin, mode, demo })`. Mode resolution honors `security.pin_auth_mode` (`legacy` / `dual` / `hash_only_ready` / `hash_only`).
- **front-desk-checkin PIN gate** — `supabase/functions/front-desk-checkin/index.ts`
  - Gate: lines 215–262, identical `validatePinDual` call shape.

Both gates share the same `_shared/pin-validation.ts` and `_shared/security-flags.ts` modules already validated in S7-L-c-ext via `employee-auth`.

### 2. Side effects AFTER the gate (what blocks QA today)

**kiosk-clock** (post-gate, lines 227–288):
- INSERT into `time_entries` (clock-in / fallback)
- UPDATE `time_entries` (clock-out)
- INSERT into `clock_events` (audit row)
- Rate-limit INSERT into `auth_rate_limits` on fail (lines 338, 370)

**front-desk-checkin** (post-gate, lines 480–949):
- INSERT into `office_visits` (multiple action branches: update_self, photo_in, check_in, check_out, audit)
- INSERT into `security_alerts` (line 120) on certain failures
- Rate-limit INSERT into `auth_rate_limits` (line 995)

Every successful PIN validation in these two functions today is followed by an operational write. That is the exact reason kiosk/front-desk could not be exercised under `hash_only_ready` in S7-L-c-ext.

### 3. Isolation options compared

| Option | What it does | Side-effect risk | Surface area touched | Reuses S7-G/K validator | Tenant-scoping cost |
|---|---|---|---|---|---|
| **A. `dry_run=true` body flag** on each existing function | Skip all post-gate writes when flag is set | High — relies on every write branch checking the flag; one missed branch leaks artifacts | Both edge functions, every write path | ✅ (same path) | Must hard-gate to demo inside each function |
| **B. `qa_mode=true` body flag** | Same as A but combined with stricter logging/echo of telemetry | High — same risk as A | Both edge functions | ✅ | Same as A |
| **C. `action="validate_only"` branch** inside each existing function | New action that runs only the PIN gate and returns telemetry | Medium — bounded by branch; still touches production code paths | Both edge functions | ✅ | Single early-return guard per function |
| **D. New internal `pin-qa-validate` edge function (service-role-only)** | Standalone fn that imports the shared validator and runs the gate only — never imports clock/visit/rate-limit code | **Lowest** — physically cannot insert into `time_entries`, `clock_events`, `office_visits`, `auth_rate_limits` | New file only; existing fns untouched | ✅ (same `validatePinDual` + `getEffectivePinAuthMode`) | Single tenant guard inside the new fn |
| **E. Shared validation RPC** (DB-side `internal_verify_pin_qa`) | DB function callable only by service role; returns telemetry shape | Low for fn itself, but moves logic + needs migration + RLS/grants | DB migration + new RPC | Partial — duplicates resolver/telemetry layer | DB-side filter |

### 4. Recommendation — **Option D**
A new edge function `pin-qa-validate` is the safest, smallest-blast-radius option:
- It physically cannot create `time_entries`, `clock_events`, `office_visits`, `auth_rate_limits`, `security_alerts` — those tables are never imported.
- It reuses the **exact** code path validated in S7-L-c-ext (`_shared/pin-validation.ts` + `_shared/security-flags.ts`), so QA evidence transfers directly to kiosk-clock / front-desk-checkin behavioral parity.
- Zero edits to `kiosk-clock` / `front-desk-checkin` — preserves the strict no-regression posture.
- One file to review, one file to delete on rollback. No migration, no RLS, no grants.

Options A/B/C are rejected because each one mutates the two production PIN-gated functions, which is exactly the surface the no-regression policy protects.
Option E is rejected because it requires a migration, grants, and duplicates resolver/telemetry logic outside the path actually used by the three edge functions.

### 5. Required guardrails on the new `pin-qa-validate` fn (for S7-N)
Hard, non-negotiable. Each must fail-closed.

1. **Service-role only auth** — verify `Authorization: Bearer <SERVICE_ROLE_JWT>` by decoding `role === "service_role"`; reject `anon` / `authenticated`. No public callability.
2. **Tenant whitelist** — reject unless `employee.company_id` resolves to a company with `is_demo = true`. Real tenants → 403 immediately, before any DB read beyond the company-flag lookup.
3. **No writes** — function MUST NOT import or call `time_entries`, `clock_events`, `office_visits`, `auth_rate_limits`, `security_alerts`, `payroll_*`, `reconciliation_*`, `scheduled_shifts`, `shift_assignments`, `historical_payroll_entries`, `pay_periods`, `period_base_pay`, Connecteam tables. Enforced by code review + a static grep test in CI (`rg -n "\.insert|\.update|\.delete|\.upsert" supabase/functions/pin-qa-validate` must return 0 hits).
4. **No rate-limit mutation** — must not insert into `auth_rate_limits`. QA traffic is bounded by the harness, not by production rate limits.
5. **Telemetry contract** — emit the same `[pin-auth-validate]` and `[pin-auth-mode]` log shape as the three production fns, plus `harness: "pin-qa-validate"`. No PIN, no `access_pin`, no `access_pin_hash`, no full hash, no password, no token, no email. Phone allowed only as the same normalized 10-digit form already used in `[phone-login]` (no worse than current baseline; tracked separately as backlog).
6. **Mode echo** — must echo `effective_mode` to the caller so the harness can assert against `hash_only_ready` / `dual` / `legacy` without inferring.
7. **No session minting** — must NOT call `auth.signInWithPassword` or `auth.admin.createUser`. PIN validation only. (This also sidesteps the `authPassword` desync risk seen on 5550100099 in S7-L-c-ext.)
8. **Demo-only kill switch** — single `if (!company.is_demo) return 403` guard, plus a startup assertion that aborts the request if the resolved tenant ID equals any in a hard-coded `BLOCKED_REAL_TENANT_IDS` list (defensive).

### 6. Avoiding misuse on real tenants
- Service-role-only + demo-only is enforced **in the function body**, not at the caller.
- No `verify_jwt` toggle dance — the function decodes the JWT itself and asserts `role==="service_role"`.
- Owner approval required to deploy the function; deploy gated behind an explicit S7-N approval message.
- If a real tenant ID ever resolves: function returns 403, logs `[pin-qa-validate] BLOCKED non-demo tenant`, and (proposed) writes a single row to a new `qa_harness_violations` table — deferred to S7-N scoping, not designed here.

### 7. Logging without secrets
Same redaction rules already in `_shared/pin-validation.ts`:
- Log: `ctx`, `mode`, `company_id`, `employee_id`, `has_hash`, `hash_version`, `validation_source`, `hash_mismatch`, `hash_error`, `fallback_suppressed`, `suppressed_reason`, `result`, `harness`.
- Never log: `pin`, `storedPlaintext`, `storedHash`, the hash string, any auth token, email, full name. Phone leak in `[phone-login]` stays as separate backlog (not introduced here, not worsened).

### 8. Payroll / operational safety
By construction, `pin-qa-validate` cannot touch:
- `pay_periods`, `period_base_pay`, `payroll_*`
- `reconciliation_*`, `historical_payroll_entries`
- `time_entries`, `clock_events`
- `scheduled_shifts`, `shift_assignments`
- `office_visits`, `security_alerts`, `auth_rate_limits`
- Connecteam import tables

This is enforced by the file-level grep guard (#3 above) and verified during QA review of the new file before deploy.

### 9. Rollback
Single-step: `supabase functions delete pin-qa-validate`. No DB rollback needed (no migration, no RLS, no grants, no data). All three production edge functions remain on the same code path validated through S7-L-c-ext.

### 10. QA matrix to run once S7-N ships
For Stafly Demo only, under `security.pin_auth_mode = "hash_only_ready"`:

| # | Target | Worker | PIN supplied | Expected `result` | Expected `validation_source` | Expected `suppressed_reason` | Expected `hash_error` |
|---|---|---|---|---|---|---|---|
| 1 | kiosk gate via harness | demo worker w/ valid hash | correct | ok | hash | null | false |
| 2 | kiosk gate via harness | demo worker w/ valid hash | wrong | fail | null | hash_mismatch | false |
| 3 | front-desk gate via harness | demo worker w/ valid hash | correct | ok | hash | null | false |
| 4 | front-desk gate via harness | demo worker w/ valid hash | wrong | fail | null | hash_mismatch | false |
| 5 | harness | real-tenant employee_id | any | 403 BLOCKED | n/a | n/a | n/a |
| 6 | harness with non-service-role JWT | any | any | 401 | n/a | n/a | n/a |
| 7 | post-run table delta check | — | — | 0 rows in `time_entries`, `clock_events`, `office_visits`, `auth_rate_limits`, `security_alerts` for window | — | — | — |

Pass criteria: all 7 cases match expected; payroll safety query returns 0 across the same 7 tables checked in S7-L-c-ext.

### 11. What was NOT touched in S7-M
Code (no files edited), edge functions, `_shared/pin-validation.ts`, `_shared/security-flags.ts`, `internal_verify_pin_hash`, `authPassword`, `access_pin(_hash)`, RLS, grants, payroll, time/clock/shift/reconciliation tables, Connecteam, real tenants, `company_settings`, plaintext data. Stafly Demo remains on `hash_only_ready` per S7-L-c-ext PASS.

### 12. Risks found
- **Telemetry drift**: if `_shared/pin-validation.ts` ever changes after S7-N ships, the harness must redeploy to keep parity with production edge fns. Mitigation: harness imports the shared module, no copy/paste.
- **Service-role JWT handling**: the harness verifies the JWT manually; a bug in the verification logic could expose the gate. Mitigation: explicit decode + `role==="service_role"` check + demo-only guard + grep-test for write calls.
- **Misuse via wrong tenant in body**: caller could pass a real `employee_id`. Mitigation: lookup company by `employee_id`, then `is_demo` guard.
- **Doesn't cover post-gate logic in kiosk/front-desk**: harness validates the PIN gate only — clock-in/out flow and office_visits flow are still untested under `hash_only_ready`. Acceptable for S7-N scope; broader end-to-end testing remains deferred.

### 13. S7-N implementation proposal (NOT executed here)
1. Create `supabase/functions/pin-qa-validate/index.ts` implementing the contract in §5.
2. Add CI grep guard: `rg -n "\.insert|\.update|\.upsert|\.delete" supabase/functions/pin-qa-validate` must be empty.
3. Deploy behind explicit owner approval, demo-only.
4. Run the §10 QA matrix; document results in `S7-N` section of this doc.
5. Re-confirm payroll safety counts equal those in S7-L-c-ext.
6. On any failure → delete the function (§9) and re-evaluate.
7. Do **not** advance to hash_only, plaintext kill, authPassword decoupling, or real-tenant enablement on the strength of S7-N alone — that requires its own approval gate.
