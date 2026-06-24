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

## MobileFilterPills Adoption Guardrail

> Use `<MobileFilterPills>` only when the screen already has mobile tabs/filters that match the approved pattern. Do not force it into unrelated layouts.

### When to use

- The screen has **4+ status filters** that currently render as `TabsList` on mobile and consume too much vertical or horizontal space.
- The desktop layout already uses `Tabs` (`value` / `onValueChange`) or an equivalent controlled state.
- Count badges are optional but, when present, follow the "show only if > 0" rule.
- The consumer can drive state via `value` + `onChange` without adding new queries, mutations, or route logic.

### When NOT to use

- **Fewer than 3 filters** — a native `TabsList` or simple buttons are enough.
- **Desktop-only screens** — the component is explicitly `md:hidden`; it will not render on desktop.
- **Filters that need icons inside each chip** — the current API supports text + count only.
- **Complex filter UIs with nested groups, search, or multi-select** — use a dedicated filter sheet or panel instead.
- **Scenarios that require URL bar sync** — while possible, prefer inline state unless the page already uses `?status=` params; the component does not handle routing internally.
- **Non-tab-like navigation** — do not repurpose pills as a secondary nav bar or breadcrumbs.

### Expected props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `items` | `ReadonlyArray<{ key: TKey; label: string; count?: number }>` | Yes | Filter definitions. `count` is optional and hidden when `0`. |
| `value` | `TKey` | Yes | Active filter key — controlled by the consumer. |
| `onChange` | `(next: TKey) => void` | Yes | Callback when a pill is tapped. |
| `ariaLabel` | `string` | Yes | Accessible label for the `role="tablist"` container. |
| `className` | `string` | No | Optional override on the outer scroll container. |

### Guarantees preserved

- **Mobile-only** — hidden on `md` and up via `md:hidden`. Desktop keeps its own `TabsList` unchanged.
- **Accessibility** — `role="tablist"`, per-chip `role="tab"`, and `aria-selected` are always present.
- **Optional badge** — counts render only when `> 0`, visually capped at `99+`.
- **Horizontal scroll** — `overflow-x-auto no-scrollbar` with inner `w-max`; no wrapping.
- **Consumer-controlled state** — the component is purely presentational; it does not own filter logic, URL params, or side effects.

### Migration rule

- If a screen already has inline pills duplicated from another consumer, migrate it to `<MobileFilterPills>`.
- If a screen has a **different** mobile filter UX (e.g., a filter button that opens a bottom sheet), do **not** migrate — document the divergence instead.
- Never refactor desktop tabs into pills; the component is invisible on desktop by design.

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
| S5.4 | Applications filter pills | MobileFilterPills (inline, before extraction) | Approved |
| S5.5 | DiscrepancyReport filter pills | MobileFilterPills (inline, before extraction) | Approved |
| S6 | MobileFilterPills extraction | MobileFilterPills (shared component) | Approved |
| S6.1 | Adoption guardrail docs | — | Documented |

---

## Guardrails

- Never invent new actions in drawers — only surface existing CTAs.
- Never change desktop layouts when adding mobile branches.
- Never fork state logic between mobile and desktop.
- Never touch payroll, time_entries, RLS, migrations, edge functions, schemas, or real data.
