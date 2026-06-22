# Stafly Operational Cleanup Sprint — Plan

Read-only audit complete. Findings below, scoped to **frontend-only, safe** changes. No RLS, schema, payroll, time_entries, tenant, or historical-data mutations.

## Audit summary

**Worker Portal — no real loop today**, but two real risks:
- `EmployeeLayout` PhotoGate spins forever if the avatar query silently fails (no error/timeout escape).
- PhotoGate hard-blocks the entire `/portal/*` outlet — workers cannot reach Documents or Shifts until a photo is uploaded.
- Driver's License is already correctly gated (drivers only). No bug.
- Copy is Spanish-first today. The English copy in your brief is **net-new** — confirm before swapping.

**Admin nav — mostly fine, a few clear cleanups:**
- `Notifications` and `Administration` appear in both Company + Global sections (duplicates).
- "Today's Operations" + "Command Center" both sit at the top of Daily Operations — two dashboard-style entries.
- "Reports" is a 2-link orphan section that fits naturally inside Payroll & Finance.
- Reconciliation / Weekly Reconciliation are two entries that look like one feature.

**Shift creation — already in good shape:**
- Pay is correctly behind a collapsed accordion (not in step 1).
- Field order in primary card: Client → Date → Start/End → Meeting time → Slots.
- Draft autosave (S3) + unsaved-guard (S4) already implemented per memory.
- No structural changes needed; only minor CTA clarity.

## Proposed changes (safe, frontend-only)

### 1. Worker Portal safety + clarity
- **PhotoGate escape hatch** (`EmployeeLayout.tsx`): add a 6s timeout + visible error state on avatar query failure with "Reintentar" + "Continuar sin foto por ahora" → routes to `/portal/update-center`. Removes the silent-spinner trap.
- **PhotoGate soft-gate option**: allow worker to tap "Ver mis documentos" / "Ver mis turnos" from the gate so a missing photo never blocks reviewing assigned work or uploading docs. Photo upload remains the primary CTA.
- **Readiness copy review** (`next-best-action.ts`, `ProfileReadinessStrip.tsx`): the brief proposes English copy, but the portal is Spanish-first per project memory. **Question for you before I touch any string** — see below.

### 2. Admin navigation cleanup (`AdminSidebar.tsx`)
- Remove duplicate `Notifications` and `Administration` entries from Global section (already reachable elsewhere) **or** keep one canonical home — confirm preference.
- Collapse "Reports" section into "Payroll & Finance" (move the 2 links, delete the empty header).
- Rename "Today's Operations" → keep one; suggest demoting `/app/ops-center` under Shifts since `/app` is already the Command Center.
- No route deletions, no permission/role changes.

### 3. Shift creation polish (`ShiftFormShell.tsx`)
- Verify primary CTA label clarity ("Crear turno" / "Publicar turno" / "Guardar borrador") — already in place; just audit the disabled states.
- No structural changes (Pay stays accordion-collapsed; field order is already correct).

### 4. Documents/readiness
- Already correct: W-9 + Government ID required for all, Driver's License only for drivers. No code change needed. I will only verify the human-readable state labels are consistent.

## Explicitly NOT touching
- RLS, schema, edge functions, storage policies
- Payroll calculation, time_entries, pay_periods, period_base_pay
- Tenants, real employee records, real documents, real payments
- iOS/TestFlight/Capacitor build logic
- Auth flow, magic-link routes, `/activate`
- Compliance catalog rules (already correct)
- Pricing, billing, Stripe

## Risks / follow-ups
- **Copy language conflict**: brief is English, portal is Spanish-first (core memory rule). Need your call.
- **PhotoGate softening** may slightly change worker behavior (some workers will skip photo longer). Mitigate by keeping PhotoGate as default landing but allowing soft escape.
- **Sidebar dedup** — if any deep-link or doc references the duplicated Global entries, those still work because routes don't change.

---

## Two questions before I implement

1. **Portal copy language** — the brief's strings are English, but project memory pins worker portal as Spanish-first. Should I (a) keep Spanish and tighten the existing strings to match the brief's intent, (b) ship both languages via the existing i18n v2 system, or (c) override the rule and switch to English?
2. **Admin nav scope** — full restructure into your 5 groups (Command Center / Operations / People / Clients / System) is a bigger change touching ~33 links. Should I (a) do the **minimal cleanup** (dedup + collapse Reports), or (b) do the **full regrouping** in this sprint?

Once you answer those two, I'll implement in one pass and report files changed.
