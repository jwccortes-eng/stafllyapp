# OAI F1 — Observation Mode

Pre-implementation architecture. **No code, no migrations, no behavior change.**
Status: awaiting go/no-go approval.

Approved inputs: DEC-OAI-A, B, C, D, I, J. Deferred: E, F, G, H, full authority matrix.

---

## 0. One-paragraph thesis

F1 does not authorize anything. It watches four things that today are never
recorded together: what the system said, what the human did, what evidence
existed at that instant, and what happened afterwards. The deliverable of F1 is
**evidence about a hypothesis**, not a feature. If the observation shows the
problem is temporal, persistence-related, or UX-related, the correct outcome is
to fix those causes and **not** build OAI.

---

## 1. Observation Mode architecture

Five layers, strictly one-directional. No layer may call backwards.

```text
 L0  OBSERVATION TRIGGERS (host surfaces, read-only taps)
     assignment attempt · block/warning render · abandonment · navigation
                    |
                    v
 L1  CONTEXT SNAPSHOT (what was true at t)
     company · shift · role/service · client · location · actor · evidence set
                    |
                    v
 L2  PURE EVALUATOR (deterministic, no I/O, no AI)
     requirement resolution -> cascade -> simulated outcome + rationale
                    |
                    v
 L3  OUTCOME RECORD (observationOnly = true, redacted)
     system_outcome · human_action · contradiction · evidence grades · authority
                    |
                    v
 L4  SINK + AGGREGATION (append-only, staff-only, retention-bound)
     memory sink (dev) | durable sink (allowlisted company) -> metrics 1..25
```

Invariants:

- **L2 is pure.** Same input, same output. No network, no clock other than the
  injected `evaluatedAt`, no randomness, no model call.
- **L0 taps are passive.** They read state the host already computed and render.
  They never gate, delay, or wrap the assignment call. If the tap throws, the
  host flow is unaffected (fail-silent boundary).
- **OAI is not a dependency of assignment.** Removing the entire OAI directory
  must leave the assignment flow byte-for-byte functional.
- **Separation from CI.** OAI observes decisions; Change Intelligence observes
  changes. They share no runtime code and no tables. OAI emits nothing to CI in F1.

This mirrors the proven CI F1 topology (pure engine + adapters + sink +
staff-only panel), which is why the risk profile is known.

---

## 2. Observational event contract

One envelope. Domain-agnostic by construction (the evaluator must not know what
a "shift" is beyond opaque ids and classified requirement codes).

```text
AuthorizationObservationEvent
  eventId                 uuid (client-generated, idempotency key)
  correlationId           uuid   groups attempt -> navigation -> outcome
  occurredAt              iso
  evaluatedAt             iso    (injected, for determinism)
  observationOnly         true   (literal, structurally enforced)

  context
    companyId             uuid
    workerRef             opaque hash/id reference   (never a name)
    shiftId               uuid | null
    shiftStartAt          iso | null
    roleCode              string | null
    serviceCode           string | null
    clientId              uuid | null
    locationId            uuid | null
    actorRef              uuid (the coordinator)
    surface               "shift_detail" | "quick_create" | "roster" | "mobile"
    contextCompleteness   list of fields that were UNAVAILABLE (never inferred)

  requirements[]          resolved requirement set
    code                  catalog code
    origin                "legal" | "client" | "location" | "role_service"
                          | "company" | "operational_preference" | "unclassified"
    classification        "L0".."L5" | "unclassified"
    satisfied             true | false | "unknown"

  evidence[]
    requirementCode
    type                  document | attestation | verbal | system_flag | inferred
    grade                 "E0".."E5"
    source                who/what produced it
    validity              "valid" | "expired" | "not_yet_valid" | "unknown"
    validUntil            iso | null
    scope                 company | client | location | role | global | unknown
    verifierRef           uuid | null   (absent => NOT verified)
    contradictions[]      free-form codes, no prose

  systemEvaluation
    hostOutcome           what the CURRENT system displayed: blocked | warned | clear
    hostReasons[]         codes only
    simulatedOutcome      catalog value (see §5)
    winningRule           requirement code + origin
    subordinateRules[]
    cascadeConflicts[]
    unclassifiedRequirements[]
    missingConfiguration[]
    rationale[]           ordered, human-readable, deterministic strings

  humanAction
    action                proceeded | abandoned | navigated_away | not_observed
    assignmentCompleted   true | false | unknown
    latencyMsFromBlock    number | null
    extraNavigations      number
    contextLossDetected   true | false

  authority
    status                "explicit" | "unresolved"
    evidenceRef           only when an explicit authority record exists (DEC-OAI-C)

  eventualOutcome         (late-bound, appended by a follow-up observation)
    evidenceCompletedAt   iso | null
    relativeToShift       "before" | "after" | "pending_at_payroll" | "unknown"
    persisted             true | false | unknown
```

`contradiction_detected` is a derived boolean, never a claim of authorization
(§6). The literal string "override" does not appear in the contract.

---

## 3. Mapping to existing data

| Contract field | Existing source | Confidence |
|---|---|---|
| readiness / blocked state | `useEmployeeReadiness`, `profile_status`, `get_employee_shift_readiness()` mirror in `src/lib/shifts/readiness-grace.ts` | High |
| missing documents | `employee_documents.review_status='approved'` vs `getRequiredDocumentsForCompany()` | High |
| requirement catalog + levels | `src/lib/compliance/requirement-catalog.ts` (static, Phase 1) | Medium — static, not per-tenant |
| assignment attempt / completion | `shift_assignments` insert path (ShiftDetailDialog, QuickCreateWorkspace, mobile sheet) | High |
| shift/client/location context | `scheduled_shifts` + existing shift view models | High |
| actor | authenticated user id | High |
| grace policy influence | `readiness-grace.ts` (company allowlist + 60-day window) | High |
| document upload vs approval timing | `employee_documents` timestamps | Medium |
| client-specific requirements | **does not exist** | Absent |
| location-specific requirements | **does not exist** | Absent |
| L0–L5 classification of requirements | **does not exist** | Absent |
| authority / supervisor relation | **does not exist** | Absent |
| override object | **does not exist by design** | Absent |
| commitment object | **does not exist** | Absent |

Consequence: in F1 the cascade will frequently resolve to *company policy* or
*unclassified*. That is a finding, not a defect — the absence of client/location
requirement configuration is itself one of the primary things F1 must quantify.

### 3.1 Trustworthy fields

`shift_assignments` rows, `employee_documents.review_status` and timestamps,
`scheduled_shifts` times, company/client/location ids, actor id, catalog codes.

### 3.2 Non-trustworthy fields

- `profile_status` — conflates identity completeness with work eligibility.
- Presence of a document file — **never** implies verification (E-grade must be
  derived from `review_status` + verifier, not from file existence).
- Static requirement catalog — global, so it cannot express client/location rules.
- Any absence of data — absence means `unknown`, never `satisfied=false`.
- Legacy/imported rows — provenance unclear; must be flagged, not scored.

### 3.3 Prohibited inferences (hard list)

1. Inferring a legal/regulatory rule from any requirement not explicitly
   classified L0–L5 and currently in force.
2. Inferring `legally_prohibited` from a blocked UI state.
3. Inferring authority from role name, seniority, or the fact that the action
   succeeded.
4. Inferring that a contradiction was legitimate, or calling it an override.
5. Inferring evidence validity from file presence, filename, or upload date.
6. Inferring intent from abandonment (abandonment ≠ agreement with the block).
7. Inferring a client/location requirement from historical behavior.
8. Inferring worker identity attributes not already classified.
9. Any model-generated authorization judgment (DEC-OAI-B: none, anywhere).

---

## 4. Cascade in F1

Precedence, evaluated top-down, first satisfied-blocking rule wins:

1. approved legal/regulatory rule (L0–L5, explicit, in force)
2. client requirement
3. location requirement
4. role/service requirement
5. company policy
6. operational preference

Recorded per evaluation: winning rule, subordinate rules, conflicts,
unclassified requirements, missing configuration. Levels are never merged and a
lower level can never escalate itself into a hard stop.

---

## 5. Simulated outcomes

`authorized`, `authorized_with_conditions`, `decision_required`,
`not_authorized`, `legally_prohibited`, `insufficient_evidence`,
`expired_authorization`, `revoked`, `unknown`.

F1 constraints:

- `legally_prohibited` requires an explicit, approved, in-force L0–L5 rule.
  Given §3, this outcome is expected to be **near-zero** in F1. That is correct.
- Unclassified requirement → `decision_required` or `unknown`, never a hard stop.
- Missing evidence with unknown grade → `insufficient_evidence`, not `not_authorized`.
- No outcome ever reaches the host UI in F1.

---

## 6. Contradiction detection strategy

A contradiction is recorded when both are true:

1. `hostOutcome = blocked` (or simulated outcome ∈ {not_authorized,
   insufficient_evidence, decision_required}) at time `t`; and
2. an assignment for the same (worker, shift) exists at `t + Δ`, with
   Δ ≤ 6 hours and the same correlation window or the same actor.

Recorded strictly as: `system_outcome`, `human_action`,
`contradiction_detected`, `actor`, `timestamp`, `available_evidence`,
`authority_status`, `eventual_outcome`. Nothing else. No approval semantics, no
"authorized override", no scoring of the coordinator.

Ambiguity rule: if evidence changed between `t` and `t + Δ` (a document was
approved in between), it is **not** a contradiction — it is a resolved block,
and it feeds metric #11 and the latency metric instead.

---

## 7. Context-loss measurement

Context loss is measured, not assumed:

- Start a correlation window on a blocked/warned render.
- Count route changes away from the assignment surface before either an
  assignment or an explicit abandonment (metric #9).
- Mark `contextLossDetected = true` when the coordinator returns to the
  assignment surface and the previously selected shift/worker/date are no longer
  the ones in effect, or when the return happens with a fresh, empty selection.
- A return within the same correlation window with intact selection is a
  successful round-trip, not a loss.

This directly tests scenario O and reuses the same deep-link telemetry pattern
already validated in the Shift Ops sprints.

---

## 8. Non-persisted-change measurement

Scenario P (document approved but change not reflected):

- On an observed document review transition to `approved`, open a short
  verification window.
- Re-read the readiness projection for that worker at +5s / +60s (read-only).
- If the projection still reports the same requirement as missing, record
  `persisted = false` with the observed lag. If it flips, record the lag as
  propagation delay (metric #12 vs #13 separation).
- Never write, never retry, never repair. Discrepancy is data.

---

## 9. Privacy and retention

Never persisted: documents or images, phone, email, identification numbers,
payroll amounts, sensitive notes, free-text, full names, addresses, geolocation,
tokens, legal data not strictly required.

Persisted: opaque references, catalog codes, classifications, grades, booleans,
timestamps, counters, and deterministic rationale strings drawn from a fixed
vocabulary.

Enforcement: whitelist-only serialization plus a structural privacy gate that
rejects a record rather than sanitizing it (same posture proven in CI F1.2).

Retention: 30 days for detail, 90 days for aggregates, per-company purge and
per-company deletion. Access limited to an explicit platform-staff allowlist.
Anti-queue: the record must not contain `sent_at`, `retry_count`, or
`delivery_status`; `observationOnly` is a structural literal.

---

## 10. Test plan

- **Purity:** evaluator is deterministic; identical input + `evaluatedAt` yields
  byte-identical output.
- **Isolation (structural):** no import from scheduling/payroll/documents modules
  inside the evaluator; no import of any Supabase client inside the evaluator.
- **Zero-mutation (structural):** no `insert`/`update`/`delete`/`upsert`/`rpc`
  string in any OAI path except the append-only observation sink.
- **No-AI (structural):** no model, gateway, or completion call anywhere in OAI.
- **Scenario matrix A–P:** one deterministic fixture per scenario, asserting the
  simulated outcome, the winning cascade rule, the contradiction flag, and the
  evidence grades.
- **Privacy:** fixtures containing emails/phones/names/ids must be rejected by
  the gate, and the rejection asserted.
- **Fail-silent:** a throwing tap must not affect the host assignment result.
- **Removal test:** the assignment flow test suite must pass with OAI disabled.

---

## 11. Abort criteria

Abort F1 immediately and disable the flag if any of the following occurs:

1. Any write outside the observation sink is detected.
2. Any measurable latency or behavior change in the assignment flow.
3. Any PII reaches a record (even once).
4. A `legally_prohibited` outcome is produced without an explicit approved rule.
5. Any OAI output becomes visible to a coordinator or influences a decision.
6. Volume exceeds the per-company daily cap and cannot degrade to aggregates.
7. The observation is used to evaluate individual coordinators rather than the
   system. (Cultural abort — the fastest way to destroy the data's honesty.)

---

## 12. Files that would be created / modified (if approved)

Created:

- `src/lib/operational-authorization/engine/{types,requirements,cascade,evidence,evaluate,version}.ts` — pure.
- `src/lib/operational-authorization/observation/{record,redact,sink,memory-sink}.ts`
- `src/lib/operational-authorization/observation/metrics.ts` — metrics 1–25.
- `src/lib/operational-authorization/adapters/scheduling/{map-context,emit}.ts`
- `src/lib/operational-authorization/flags.ts` — OFF by default, per-company allowlist.
- `src/lib/operational-authorization/__tests__/*` — matrix A–P + structural tests.
- `src/pages/admin/dev/OperationalAuthorizationObservation.tsx` — staff-only panel.
- `src/components/operational-authorization/OaiAccessGuard.tsx`

Modified (tap insertion only, no logic change):

- assignment surfaces: `ShiftDetailDialog`, `QuickCreateWorkspace`, mobile
  assignment sheet — one passive `observe(...)` call each, inside try/catch.
- `src/App.tsx` — one dev route.

Not touched: payroll, shifts mutations, documents review logic, readiness
computation, Change Intelligence, any RLS on business tables.

---

## 13. Confirmations

- **Zero mutations:** OAI writes only to its own append-only observation store,
  and only when the company is explicitly allowlisted. No business table is
  written, updated, or deleted. Enforced structurally by test.
- **Zero decision AI:** no model call in any OAI code path. The evaluator is
  rules-only and explainable line-by-line. Enforced structurally by test.
- **observationOnly = true** on every record, as a literal, with no code path
  able to set it false.

---

## 14. Blocking vs deferrable

Blocking for F1: nothing further — A, B, C, D, I, J are sufficient.
Deferred without harm: E, F, G, H, the full authority matrix, the override
object, the commitment object, per-tenant requirement configuration.

Accepted consequence of deferral: authority will read `unresolved` in most
observations, and client/location cascade levels will be mostly empty. Both are
recorded as findings (metrics #18, #19, #20) rather than filled by inference.

---

## 15. Go / no-go recommendation

**GO — with a reduced first stage.**

Recommended shape: Stage 1 on the demo/sandbox company only, scheduling domain
only, 72 hours, staff-only panel, flag off by default and per-company gated —
identical to the posture that worked for CI F1.2 Stage 1.

Rationale: the cost of F1 is low and bounded (pure evaluator + passive taps +
isolated sink), the information gain is high, and the alternative — designing
OAI without measurement — is precisely the automation risk the Charter forbids.

Explicit go/no-go criterion for the *capability* (evaluated after the window,
not now): if apparent false blocks are under 2%, OAI is discarded **only if**
operational cost, recurrence, criticality, risk, and context loss are all also
low. If the dominant signal is timing, persistence, or UX, the recommendation
will be to fix those causes and not build OAI.

No code will be written until this document is approved.
