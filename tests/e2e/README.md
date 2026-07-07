# Root-Cause Ecosystem QA Harness

Read-only Playwright harness for Sprint 17. Validates deep-links from the
Root-Cause Explorer into Time Clock, Attendance, Shifts and Payroll Review
Queue **without mutating any data**.

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

## Limitations

- Requires an authenticated storage state to reach `/app/*`. Without it
  the tests still pass basic non-crash checks against the auth screen but
  do not exercise focus/banner logic.
- Uses `waitForLoadState("networkidle")` with a catch — very chatty
  realtime channels may keep the network non-idle; the harness times out
  gracefully and still asserts.
- Synthetic-id fallback branches are validated; full focus assertions
  require real ids via env vars.
