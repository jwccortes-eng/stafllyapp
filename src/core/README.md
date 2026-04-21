# Core Engine — Shared brain for STAFly + Parceros

Pure, product-agnostic logic. **No UI. No routing. No product assumptions.**

## Rules
1. **Read-only by default.** Side-effecting writers live in `src/lib/dispatch-writers.ts`.
2. **Generic vocabulary.** Core speaks `WorkAssignment` / `WorkOpportunity` / `WorkerReputation`.
   Product adapters translate to STAFly (`shift`, `assignment`) or Parceros (`job`, `opportunity`).
3. **Multi-tenant.** Every function takes `companyId` (or derives it from worker context).
4. **No new tables.** Reuses `scheduled_shifts`, `shift_assignments`, `employees`, `reviews`,
   `review_scores`, `clock_events`, `clock_alerts`.
5. **Never touches** `attendance-resolver`, payroll, `time_entries`.

## Layout
```
src/core/
├── types.ts                  # Generic vocabulary
├── workforce-score.ts        # computeWorkerScore, getWorkerReputation
├── operations-intelligence.ts# generateAlerts, computeCoverage (re-export)
├── dispatch-engine.ts        # getCandidatesForShift, suggestAssignments, executeDispatch (read-only)
├── public-profile.ts         # getWorkerPublicProfile (shared with Parceros)
└── adapters/
    ├── stafly.ts             # shift/assignment vocabulary
    └── parceros.ts           # job/opportunity vocabulary
```

## Migration strategy
`src/lib/workforce-score.ts`, `auto-dispatch.ts`, `operations-intelligence.ts` remain as
**re-export shims** so existing imports keep working. New code should import from `@/core/*`.
