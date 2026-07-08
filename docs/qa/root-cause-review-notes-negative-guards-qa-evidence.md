# Sprint 32A · QA Evidence Runbook · Payroll Review Notes Negative Guards

Status: **runbook only, not yet executed against QA/staging from this
sandbox.** The Lovable build sandbox has no QA preview URL, no QA
Supabase session, and no `@playwright/test` installed in
`node_modules`. Real execution must happen from an operator machine or
CI runner with the QA secrets below. This document is the single source
of truth for how to do that and how to record the result.

Scope covered by this runbook:

- `tests/e2e/root-cause-review-notes-permissions.spec.ts` (Sprint 31 —
  `payroll:view`-only user must not create/archive notes).
- `tests/e2e/root-cause-review-notes-cross-company.spec.ts` (Sprint 32 —
  cross-company user must not view/create/archive foreign notes).

Both specs are **opt-in** and **skip safely** without the required env
vars. Both refuse to run against production
(`staflyapps.com`, `staflyapp.lovable.app`). Both are **desktop-only**
today; mobile is deliberately skipped.

---

## 1 · Prepare QA users (one-time, done by a QA/admin operator)

Prerequisite: two QA/staging users in the same Lovable Cloud environment,
plus one user in a **different** company for the cross-company spec.

| Storage state env var                 | User profile                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `E2E_STORAGE_STATE_VIEW_ONLY`         | QA user in **Company A** with `payroll:view` only (no `payroll:edit`).            |
| `E2E_STORAGE_STATE_CROSS_COMPANY`     | QA user in **Company B** (any role). Must NOT belong to Company A.                |

`E2E_EMPLOYEE_ID` must be an `employees.id` in **Company A** for both
specs — for the view-only spec it's the employee the user can see but
not edit; for the cross-company spec it's the employee the Company B
user must NOT be able to see or mutate.

### Generate storage states

Run locally against the QA/staging preview URL — never production:

```bash
# 1. View-only user (Company A, payroll:view only)
bunx playwright codegen \
  --save-storage=./.playwright/auth-view-only.json \
  "$E2E_BASE_URL"
# ...log in as the view-only user, close the window when done.

# 2. Cross-company user (Company B)
bunx playwright codegen \
  --save-storage=./.playwright/auth-cross-company.json \
  "$E2E_BASE_URL"
# ...log in as the Company B user, close the window when done.
```

Keep both files out of git. Treat them as credentials.

---

## 2 · Env vars

Shared:

```bash
export E2E_BASE_URL="https://<qa-preview>.lovable.app"   # QA/staging only
export E2E_EMPLOYEE_ID="<company-A employees.id>"
export E2E_ROOT_CAUSE_URL=""                             # optional override
```

Sprint 31 (view-only):

```bash
export E2E_NOTE_PERMISSIONS_TEST_ENABLED=true
export E2E_STORAGE_STATE_VIEW_ONLY="$PWD/.playwright/auth-view-only.json"
```

Sprint 32 (cross-company):

```bash
export E2E_NOTE_CROSS_COMPANY_TEST_ENABLED=true
export E2E_STORAGE_STATE_CROSS_COMPANY="$PWD/.playwright/auth-cross-company.json"
```

Safety guards enforced by the specs themselves:

- Skip when the `*_TEST_ENABLED` flag is not `true`.
- Skip when the required storage state / employee id is missing.
- Skip when `E2E_BASE_URL` matches `staflyapps.com` or
  `staflyapp.lovable.app`.
- Skip on the `mobile` Playwright project.

---

## 3 · Commands

Install Playwright once (operator machine or CI):

```bash
bun add -D @playwright/test
bunx playwright install chromium
```

Run each spec against QA/staging, desktop-only:

```bash
# Sprint 31 — view-only RLS negative path
bunx playwright test root-cause-review-notes-permissions --project=desktop

# Sprint 32 — cross-company negative path
bunx playwright test root-cause-review-notes-cross-company --project=desktop
```

Or both at once:

```bash
bunx playwright test \
  root-cause-review-notes-permissions \
  root-cause-review-notes-cross-company \
  --project=desktop
```

---

## 4 · Expected outcomes

Both specs pass when:

- `violations[]` is empty (no mutating request reached
  `payroll_review_notes`, any payroll/time/shift-adjacent table, RPC,
  edge functions, or storage writes).
- `"Nota guardada"` toast never appears.
- `"Nota archivada"` toast never appears.
- Cross-company spec: no foreign note text is visible (`[E2E RootCause
  Note]`, `[E2E RLS-neg]` prefixes must have count 0).

Both specs fail with a legible message when:

- Any mutating request slips through — the failure line lists method +
  URL. No request bodies are captured, so the log stays PII-free.
- Any success toast appears — the failure line points to the toast
  matcher.
- Cross-company: any foreign note becomes visible — the failure line
  points to the prefix matcher.

Screenshots are written to
`test-results/root-cause/notes-view-only-desktop.png` and
`test-results/root-cause/notes-cross-company-desktop.png`.

Mobile:

```bash
bunx playwright test root-cause-review-notes-permissions root-cause-review-notes-cross-company --project=mobile
```

Both tests should report **skipped** with the reason
`mobile view-only test deferred` /
`mobile cross-company test deferred (Sprint 32 desktop-only)`.

Missing-env skip (run with no flags set) should show both tests as
**skipped** with the reason
`E2E_NOTE_PERMISSIONS_TEST_ENABLED != true` /
`E2E_NOTE_CROSS_COMPANY_TEST_ENABLED != true`.

---

## 5 · Recording the evidence

After each real QA/staging run, append a row to the table below. Keep
the entries short; attach screenshots + full HTML report to the
matching sprint ticket.

| Date (UTC) | Env / preview URL | Operator | Spec | Result | Notes |
| ---------- | ----------------- | -------- | ---- | ------ | ----- |
| _pending_  | _pending_         | _pending_ | permissions   | _pending_ | Sandbox has no QA session; must run from operator machine. |
| _pending_  | _pending_         | _pending_ | cross-company | _pending_ | Same. |

When a run fails, copy the failure line (method + URL only — no bodies)
and the screenshot path into the Notes column.

---

## 6 · What this runbook did NOT change

- No changes to `src/**`.
- No migrations, no RLS/trigger edits.
- No changes to payroll calculations, `time_entries`,
  `shift_assignments`, `scheduled_shifts`, `pay_periods`,
  `payroll_adjustments`, `movements`, `reconciliation_*`,
  `compensation_*`, `payroll_rate_snapshots`.
- No changes to edge functions, storage policies, auth, or tenant
  activation logic.
- No changes to CI required workflows. (These specs remain opt-in and
  are not on the required path.)
- No production traffic. Prod URL guard is enforced by both specs.

---

## 7 · Known limitations

- Sandbox execution is not possible: no QA preview, no storage states,
  and `@playwright/test` is not in this project's `node_modules`. Real
  evidence must be produced on an operator machine or CI runner.
- Desktop-only. Mobile coverage is deferred until layout stabilises.
- Both specs treat "UI hides the control" and "server-side RLS blocks
  the write" as equally acceptable outcomes. A future sprint may
  tighten this to require the UI to hide the controls entirely for
  non-`payroll:edit` users.
- The cross-company spec does not exercise multi-company row-level
  SELECT scenarios beyond what `RootCauseExplorer` naturally renders;
  a dedicated SELECT-only spec against `payroll_review_notes` from a
  cross-company session would add depth in a later sprint.
