## StaflyCore Employee Profile Cleanup + Field Standardization v1 — Phased Sprint Plan

The scope as written is ~7 parts across `/app/employees/:id` (1,271 LoC), `EmployeeProfileTabs` (756 LoC), `EmployeeAccessTab` (276 LoC), `WorkerDataQualityReview`, plus new shared utilities and onboarding wiring. Shipping all of it in one drop would violate the strict no-regression policy (auth/portal/payroll/SSN). I'm proposing 4 reviewable phases. Each phase ends with QA and your go-ahead before the next starts.

---

### Phase A — Shared utilities + field primitives (no UI behavior change)

Goal: land the reusable building blocks so every later phase consumes the same standard.

1. **`src/lib/phone-format.ts`** (new, extends existing `src/lib/phone.ts`)
   - `formatPhoneUS(value)` → `(347) 765-5057` (gracefully handles E.164, 10-digit, 11-digit-leading-1, dirty input)
   - `normalizePhoneE164(value, defaultCountry = "US")` → `+13477655057`
   - `validatePhoneUS(value)` → boolean
   - `parsePhoneFlexible(value)` → `{ digits, e164, display, valid }`
   - Re-exports existing `normalizePhone` / `getPhoneLookupVariants` untouched — does not break any current callers.
2. **`src/lib/gender.ts`** (new)
   - `GENDER_OPTIONS` with stable values `female | male | non_binary | prefer_not_to_say | other` and Spanish labels.
   - `normalizeGender(raw)` maps legacy values (`F`, `M`, `Femenino`, `Masculino`, `Female`, `Male`, etc.) to canonical.
   - `formatGenderLabel(raw)` returns Spanish label, or `Importado: <value>` for unknown legacy, `Sin definir` for null.
3. **`src/components/ui/smart-phone-input.tsx`** (new)
   - Controlled input + onBlur normalization + live formatting on typing.
   - Stores raw `value` upward unchanged on every keystroke; emits normalized digits on blur.
   - **Does not change DB storage.**
4. **`src/components/ui/gender-select.tsx`** (new)
   - shadcn Select wrapping `GENDER_OPTIONS`, with "Sin definir" placeholder.

No UI consumers wired in Phase A — just utilities and tests for the formatter/validator.

---

### Phase B — Employee profile redesign (visible work)

Goal: split `/app/employees/:id` into the 6 tabs the brief requests, hide empty clutter, leave business logic untouched.

1. Restructure `UnifiedPersonProfile.tsx` tabs:
   - `Resumen` (existing hero + snapshot + NextActionCard, compact)
   - `Perfil` (clean form using SmartPhoneInput + GenderSelect, address, emergency contact)
   - `Cumplimiento` (delegate to existing `WorkerDocumentsCompliance`)
   - `Acceso` (new compact view — see Phase C)
   - `Operación` (availability, driver/car, license, skills, tags)
   - `Historial importado` (Connecteam/legacy/empty fields, collapsed by default behind "Ver datos importados")
2. `EmployeeProfileTabs.tsx`: refactored into per-tab sections so each new tab can pull what it needs without touching pay/compensation/advances logic.
3. **Hide-not-delete rule**: empty `manager`, `groups`, `tags`, `rating`, `recommended`, `license_*`, raw front-desk history → moved to "Historial importado" only if empty/no-action; preserved verbatim if they hold data or need action.
4. Mobile 390px: verify no horizontal overflow; tabs convert to a horizontally scrollable strip (already a pattern in the app).

No edits to: payroll math, time_entries reads, scheduled_shifts, RLS, `verification_ssn_ein` access path (still via `admin_get_employees_with_fiscal` RPC where used).

---

### Phase C — Access panel + Readiness panel cleanup

Goal: defang the "wall of toggles" + compact the readiness warnings.

1. `EmployeeAccessTab.tsx`:
   - Default view shows status pills (Portal / Invite / PIN) + module summary `X/Y activos` + 3 primary action buttons (Reenviar invitación, Resetear PIN, Gestionar módulos).
   - Full module toggle list collapsed behind `Ver módulos del portal`.
   - PIN handlers untouched — same `setEmployeePin` / `resetEmployeePin` RPC calls. No raw PIN ever shown beyond existing one-time reveal.
2. Readiness panel inside `Resumen`:
   - Top 3 missing required items + "Ver todos los pendientes" expander.
   - Split compliance-critical from optional enrichment.
   - Copy: *"Completa estos datos para mantener al trabajador listo para turnos y pagos."*

---

### Phase D — Phone/Gender rollout + future-flow TODO doc

1. Wire `SmartPhoneInput` into:
   - Employee profile phone field
   - Emergency contact phone (if rendered)
   - Onboarding phone fields **only if** they already consume the same shared input pattern (no portal permission changes, no SMS pipeline edits).
2. Wire `GenderSelect` into employee profile; render `Sin definir` / `Importado: <value>` for legacy values.
3. Add `docs/WORKER_UPDATE_FLOW_TODO.md` with the staged worker-update plan (reminders, grace period, semi-blocking portal screen, restricted access after deadline, admin queue). **No implementation.**
4. Save a memory entry summarizing the new standard.

---

### What this plan deliberately does NOT do

- No DB migrations.
- No RLS or security grant changes.
- No payroll, time_entries, scheduled_shifts, shift_assignments, notification logic touched.
- No SSN/EIN exposure changes; continues to flow through the Phase 1.5 RPC.
- No data backfill / no rewriting of historical phone or gender values.
- No portal blocking logic implemented (only documented).

---

### QA after each phase

Desktop 1280 + mobile 390 sweep of `/app/employees`, `/app/employees/:id`, profile edit, access tab, docs/compliance tab, save flow. Verify no `permission denied for table employees`, no direct `verification_ssn_ein` reads, no console errors.

---

### Ask

Confirm I should start with **Phase A (utilities only, zero visible change)** and then proceed sequentially. If you want a different phase order — for example "ship Phase B first because the cluttered UI is the most visible pain" — tell me and I'll re-sequence. If you want everything in one drop anyway, say so and I'll do it but flag the regression risk.