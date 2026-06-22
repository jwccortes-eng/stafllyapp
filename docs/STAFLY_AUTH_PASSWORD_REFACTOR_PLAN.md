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
