# Mobile Action Queue Pattern

> Documentation for mobile-first actionable UI patterns in StaflyCore admin screens.
> UI-only patterns — no business logic, no data models, no queries.

---

## Mobile Action Queue (Base Pattern)

### Components

- **MobileQueueRow** — touch-friendly row with leading icon, primary/secondary text, top-meta badges, and optional right slot.
- **MobileQueueDrawer** — bottom sheet for item detail, metadata, and contextual CTAs.

### When to use

- Admin mobile screens that surface actionable items (alerts, validations, tasks).
- Queue/list views where each item needs quick inspection and fast action.
- Mobile-first replacement for data-dense tables that are unusable at 390px.

### Rules

- Rows must be tappable (`<button>` or role="button").
- Drawer must preserve existing CTAs (never invent new actions).
- Desktop must remain unchanged — mobile branch only.
- All existing deep links, URL params, and tenant scoping stay intact.

---

## Mobile Filter Pills Pattern

### When to use

- Use on admin mobile screens with 4+ filters/statuses.
- Use when wrapped tabs consume too much vertical space on 390px mobile width.
- Use only for mobile-first queue/list views.
- Do not replace desktop tabs unless explicitly scoped.

### Layout rules

- Mobile: single-row horizontal scroll.
- Container: `overflow-x-auto no-scrollbar`.
- Inner row: `w-max` / no wrapping.
- Chips should be touch-friendly and scannable one-handed.
- Preserve the list below the fold as much as possible.

### Active state

- Active chip should be visually filled / primary.
- Inactive chips should remain low-noise.
- The selected state must be obvious at a glance.

### Counts

- Show counts only when count > 0.
- Hide zero counts to reduce visual noise.
- Counts must not change the semantic filter key.

### Accessibility

- Preserve `role="tablist"` where applicable.
- Preserve `aria-selected`.
- Buttons/chips must remain keyboard and screen-reader usable.

### Deep links / state

- If the page supports URL filters like `?status=expired`, the mobile pills must use the same state path as desktop.
- Do not fork filter logic between mobile and desktop.
- Direct links must select the correct active chip on load.
- Prefer replacing search params instead of pushing noisy history entries.

### Data safety

- Pattern must be UI-only.
- No new queries.
- No mutations.
- No schema/RLS/storage/payroll/time_entries changes.
- Tenant scoping must remain unchanged.

### Extraction rule

- Do not extract `<MobileFilterPills />` after only one implementation.
- Extract only after a second real admin page needs the same behavior.
- Candidate future pages: DailyOps tabs or Workers risk panel.

---

## Real Implementations

| Sprint | Area | Components Used | Status |
|--------|------|----------------|--------|
| S4 | PayrollReviewQueue | MobileQueueRow, MobileQueueDrawer | Approved |
| S4.1A | DailyClose | MobileQueueRow, MobileQueueDrawer | Approved |
| S4.1B | DailyOps | MobileQueueRow, MobileQueueDrawer | Approved |
| S5 | Extraction to shared components | MobileQueueRow, MobileQueueDrawer | Approved |
| S5.1 | DocumentsCenter | MobileQueueRow, MobileQueueDrawer | Approved |
| S5.2 | DocumentsCenter filter pills | Mobile filter pills (inline) | Approved |
| S5.3 | Documentation | — | Documented |

---

## Guardrails

- Never invent new actions in drawers — only surface existing CTAs.
- Never change desktop layouts when adding mobile branches.
- Never fork state logic between mobile and desktop.
- Never touch payroll, time_entries, RLS, migrations, edge functions, schemas, or real data.
