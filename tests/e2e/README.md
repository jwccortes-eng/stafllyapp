# Root-Cause Ecosystem QA Harness

Read-only Playwright harness for Sprint 17. Validates deep-links from the
Root-Cause Explorer into Time Clock, Attendance, Shifts and Payroll Review
Queue **without mutating any data**.

> **Contexto completo del flujo, params por módulo, checklists de QA
> mobile/desktop, checklist de seguridad y guion de demo:**
> [`docs/root-cause-review-demo-pack.md`](../../docs/root-cause-review-demo-pack.md).

## What it does

- Navigates each deep-link (with and without params).
- Screenshots every route on desktop (1440×900) and mobile (390×844).
- Asserts the SPA didn't crash (body has real content).
- Asserts no horizontal overflow on mobile.
- Captures console errors, `pageerror`, and non-benign `requestfailed`.
- Exercises fallback branches (amber banner) when synthetic ids are used.

## What it never does

- No clicks on approve/close/export/save/submit/delete/recalc/sync/send/
  finalize/publish/approve controls. A `page.exposeBinding` guard fails
  the test if any code path attempts a forbidden action.
- No writes, no RPCs, no migrations. It's pure navigation + screenshot.

## Prerequisites

1. Install Playwright (once):

   ```bash
   bun add -D @playwright/test
   bunx playwright install chromium
   ```

2. Provide a Playwright storage state with an authenticated admin session
   for the target company (recommended — the app is behind auth):

   ```bash
   # Example: log in manually once, save the state.
   bunx playwright codegen --save-storage=.playwright/auth.json http://localhost:8080
   ```

## Environment variables

All optional. Without them the harness uses a synthetic all-zero UUID so
it exercises the amber-fallback branches without depending on prod data.

| Var                 | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `E2E_BASE_URL`      | Preview URL (default `http://localhost:8080`)       |
| `E2E_STORAGE_STATE` | Path to Playwright storage state JSON               |
| `E2E_COMPANY_ID`    | Informational — the currently selected company     |
| `E2E_PAY_PERIOD_ID` | Real `pay_periods.id` in that company               |
| `E2E_EMPLOYEE_ID`   | Real `employees.id` in that company                 |
| `E2E_TIME_ENTRY_ID` | Real `time_entries.id` in that company              |
| `E2E_SHIFT_ID`      | Real `scheduled_shifts.id` in that company          |
| `E2E_TARGET_DATE`   | `YYYY-MM-DD` for `date=` params (default today)     |
| `E2E_NOTE_TEST_ENABLED` | **Sprint 28.** Set to `true` to enable the notes-persistence spec. Off by default. |
| `E2E_ROOT_CAUSE_URL`    | **Sprint 28.** Optional override for the URL that opens `RootCauseExplorer`. Defaults to `/app/payroll-native-dry-run?explore=<E2E_EMPLOYEE_ID>`. |

## Sprint 28 → Sprint 30 · Review notes create + archive spec (opt-in)

`tests/e2e/root-cause-review-notes.spec.ts` verifies the full lifecycle of a
`payroll_review_notes` row through the `RootCauseExplorer`: create → list →
archive (soft-delete) → hidden from active list. Sprint 30 adds the archive
cleanup step so QA no longer accumulates active E2E notes.

- **Opt-in only.** Skips unless `E2E_NOTE_TEST_ENABLED=true`.
- **Never runs against production.** Refuses `E2E_BASE_URL` matching
  `staflyapps.com` or `staflyapp.lovable.app`.
- **Requires** a valid `E2E_STORAGE_STATE` for a QA user with `payroll`
  module `view` + `edit` permission, plus `E2E_EMPLOYEE_ID`.
- **Writes exactly one row** to `public.payroll_review_notes` per run,
  with a synthetic `[E2E RootCause Note] <ISO timestamp>` prefix and no
  PII. The same row is soft-deleted (archived) before the test ends.
- **Network guard** blocks all mutations on `time_entries`,
  `scheduled_shifts`, `shift_assignments`, `pay_periods`, `payroll_*`
  (except `payroll_review_notes`), `payroll_adjustments`, `movements`,
  `reconciliation_*`, `compensation_*`, `payroll_rate_snapshots`, plus
  any `rpc/`, `functions/v1/`, or storage-write endpoint. On the notes
  endpoint only `POST` (create) and `PATCH`/`PUT` (archive) are allowed;
  physical `DELETE` throws.
- **Desktop-only** for now; mobile is deferred.
- **Cleanup:** the archive step leaves the note with `archived_at`
  populated so it disappears from the active list. Physical delete is
  never performed.

Example run:

```bash
E2E_NOTE_TEST_ENABLED=true \
E2E_BASE_URL=https://<qa-preview>.lovable.app \
E2E_STORAGE_STATE=./.playwright/auth.json \
E2E_EMPLOYEE_ID=<qa-employee-uuid> \
bunx playwright test root-cause-review-notes --project=desktop
```

## Sprint 31 · Review notes RLS negative-path spec (opt-in)

`tests/e2e/root-cause-review-notes-permissions.spec.ts` validates the
RLS boundary for `payroll_review_notes`: a QA user with **only**
`payroll:view` (no `payroll:edit`) must not be able to create or archive
notes from the `RootCauseExplorer`. Complements the happy-path spec
(Sprint 28 / 30) which runs with a `payroll:edit` user.

- **Opt-in only.** Skips unless `E2E_NOTE_PERMISSIONS_TEST_ENABLED=true`.
- **Never runs against production.** Same URL guard as the happy path.
- **Requires a distinct storage state** (`E2E_STORAGE_STATE_VIEW_ONLY`)
  so the happy-path auth is never overwritten.
- **Desktop-only** for now.
- **What the spec asserts:**
  - The RootCauseExplorer drawer renders.
  - If the save UI surfaces at all, either the button is disabled, or
    clicking it does not fire a request that reaches
    `payroll_review_notes`, or an error toast appears — the
    `"Nota guardada"` toast must never show.
  - If any existing note exposes an "Archivar" button, invoking it must
    not produce the `"Nota archivada"` toast.
  - The network guard records every mutating request the view-only
    session emits toward `payroll_review_notes`, any sensitive
    payroll/time/shift table, RPC endpoints, edge functions, or storage
    writes. Any recorded violation fails the test loudly.
- **No physical DELETE, no service_role, no PII.** The spec never asks
  the app for elevated privileges — it just observes whether the UI +
  RLS combination correctly denies writes.

Env vars:

| Var                                    | Purpose                                                    |
| -------------------------------------- | ---------------------------------------------------------- |
| `E2E_NOTE_PERMISSIONS_TEST_ENABLED`    | `true` to opt in.                                          |
| `E2E_STORAGE_STATE_VIEW_ONLY`          | Playwright storage state for a `payroll:view`-only user.   |
| `E2E_BASE_URL`                         | QA/staging preview URL (never production).                 |
| `E2E_EMPLOYEE_ID`                      | Real `employees.id` in that QA company.                    |
| `E2E_ROOT_CAUSE_URL` (optional)        | Override URL that opens `RootCauseExplorer`.               |

Example run:

```bash
E2E_NOTE_PERMISSIONS_TEST_ENABLED=true \
E2E_BASE_URL=https://<qa-preview>.lovable.app \
E2E_STORAGE_STATE_VIEW_ONLY=./.playwright/auth-view-only.json \
E2E_EMPLOYEE_ID=<qa-employee-uuid> \
bunx playwright test root-cause-review-notes-permissions --project=desktop
```





## Running

```bash
# Baseline (synthetic ids — exercises fallback branches only)
bunx playwright test

# With real ids (exercises focus branches)
E2E_STORAGE_STATE=./.playwright/auth.json \
E2E_PAY_PERIOD_ID=... \
E2E_EMPLOYEE_ID=... \
E2E_TIME_ENTRY_ID=... \
E2E_SHIFT_ID=... \
bunx playwright test

# Only desktop
bunx playwright test --project=desktop

# Only mobile
bunx playwright test --project=mobile
```

Reports:

- HTML report: `playwright-report/index.html`
- Screenshots: `test-results/root-cause/<route>-<project>.png`

## Routes covered

| Route                                                                        | Purpose                              |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| `/app/timeclock?date=…&filter=needs-review&time_entry=…&shift=…`            | Time Clock focus + historical date   |
| `/app/timeclock`                                                             | Baseline (no params)                 |
| `/app/attendance?date=…&employee=…&time_entry=…`                             | Attendance focus                     |
| `/app/attendance`                                                            | Baseline                             |
| `/app/shifts?date=…&shift=…`                                                 | ShiftDetailDialog focus              |
| `/app/shifts`                                                                | Baseline                             |
| `/app/payroll-review-queue?period=…&employee=…&reason=overlap`               | Review Queue period+worker+reason    |
| `/app/payroll-review-queue`                                                  | Baseline                             |

## Ignored noise

- Console: React Router future warning, Vite HMR, Mapbox, source-map.
- Network: analytics / pixels (`google-analytics`, `segment`, `sentry`,
  `hotjar`, `posthog`, `mixpanel`) and Mapbox.

Tune the arrays in `tests/e2e/root-cause-deeplinks.spec.ts`
(`CONSOLE_IGNORE`, `NETWORK_IGNORE`) if your project needs different noise
filters.

## CI (Sprint 18)

Workflow: `.github/workflows/root-cause-e2e.yml`. Runs on `workflow_dispatch`,
nightly cron, and PRs that touch the harness. It installs Bun deps, installs
Playwright Chromium, then runs `bunx playwright test --project=desktop --project=mobile`.

Required GitHub Actions secrets (QA/staging only — never production):

| Secret                    | Purpose                                              |
| ------------------------- | ---------------------------------------------------- |
| `E2E_BASE_URL`            | QA/staging preview URL                               |
| `E2E_STORAGE_STATE_B64`   | Base64 of Playwright storage state JSON (QA admin)   |
| `E2E_COMPANY_ID`          | QA company id (informational)                        |
| `E2E_PAY_PERIOD_ID`       | QA `pay_periods.id`                                  |
| `E2E_EMPLOYEE_ID`         | QA `employees.id`                                    |
| `E2E_TIME_ENTRY_ID`       | QA `time_entries.id`                                 |
| `E2E_SHIFT_ID`            | QA `scheduled_shifts.id`                             |
| `E2E_TARGET_DATE`         | `YYYY-MM-DD`                                         |

Generate the storage state locally against QA, then base64-encode it:

```bash
bunx playwright codegen --save-storage=.playwright/auth.json "$E2E_BASE_URL"
base64 -w0 .playwright/auth.json | pbcopy  # paste into E2E_STORAGE_STATE_B64
```

If any ID secret is missing the harness uses the synthetic UUID
`00000000-0000-0000-0000-000000000000` and only validates the amber-fallback
branches. The workflow refuses to run against `staflyapps.com` /
`staflyapp.lovable.app` (production).

Artifacts uploaded on every run:

- `playwright-report` — full HTML report (`playwright-report/index.html`)
- `root-cause-screenshots` — `test-results/root-cause/**` PNGs

## Limitations

- Requires an authenticated storage state to reach `/app/*`. Without it
  the tests still pass basic non-crash checks against the auth screen but
  do not exercise focus/banner logic.
- Uses `waitForLoadState("networkidle")` with a catch — very chatty
  realtime channels may keep the network non-idle; the harness times out
  gracefully and still asserts.
- Synthetic-id fallback branches are validated; full focus assertions
  require real ids via env vars.
- The sandbox where this project is developed has no auth session and no
  QA preview URL, so the CI workflow cannot be executed from the agent —
  it must run on GitHub Actions with the secrets above configured.
