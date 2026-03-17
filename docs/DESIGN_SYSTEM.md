# StaflyApps Design System

> Single source of truth for all UI decisions. No component may be built outside this system.

---

## 1. Design Tokens

All values live in `src/index.css` (CSS custom properties) and are mapped in `tailwind.config.ts`.

### Colors

| Token | Tailwind Class | Purpose |
|---|---|---|
| `--primary` | `text-primary`, `bg-primary` | Brand blue — CTAs, active states |
| `--primary-hover` | `bg-primary-hover` | Primary hover state |
| `--primary-dark` | `bg-primary-dark` | Deeper primary variant |
| `--primary-glow` | `bg-primary-glow` | Gradient endpoint |
| `--secondary` | `bg-secondary` | Neutral backgrounds |
| `--accent` | `bg-accent` | Hover/highlight backgrounds |
| `--accent-warm` | `bg-accent-warm` | Orange accent |
| `--destructive` | `text-destructive` | Errors, delete actions |
| `--success` | `text-success` | Confirmed, positive |
| `--warning` | `text-warning` | Pending, caution |
| `--info` | `text-info` | Informational |
| `--muted` | `bg-muted`, `text-muted-foreground` | Secondary text, disabled |

### Status Colors

| Token | CSS Class | Use |
|---|---|---|
| `--status-confirmed` | `.status-confirmed` | Confirmed shifts, active items |
| `--status-pending` | `.status-pending` | Awaiting approval |
| `--status-missing` | `.status-missing` | No-shows, errors |
| `--status-completed` | `.status-completed` | Done/finished |
| `--status-cancelled` | `.status-cancelled` | Cancelled/removed |

### Surfaces & Elevation

| Token | Class | Purpose |
|---|---|---|
| `--surface-1` | `.surface-1` | Card background |
| `--surface-2` | `.surface-2` | Page background |
| `--surface-3` | `.surface-3` | Nested sections |
| `--glass-*` | `.glass-card` | Frosted glass effect |

### Shadows

| Size | Class | Use |
|---|---|---|
| 2xs | `shadow-2xs` | Subtle depth |
| xs | `shadow-xs` | Inputs, small cards |
| sm | `shadow-sm` | Cards (default) |
| md | `shadow-md` | Elevated cards, hover |
| lg | `shadow-lg` | Modals, popovers |
| xl | `shadow-xl` | Hero sections |
| primary | `.shadow-primary-glow` | CTA buttons |

### Spacing Scale

Uses Tailwind's default `0.25rem` base (`--spacing: 0.25rem`):

| Label | Value | Tailwind |
|---|---|---|
| xs | 4px | `p-1`, `gap-1` |
| sm | 8px | `p-2`, `gap-2` |
| md | 16px | `p-4`, `gap-4` |
| lg | 24px | `p-6`, `gap-6` |
| xl | 32px | `p-8`, `gap-8` |

### Border Radius

| Token | Value | Use |
|---|---|---|
| `sm` | `calc(0.75rem - 4px)` | Small inputs |
| `md` | `calc(0.75rem - 2px)` | Buttons |
| `lg` | `0.75rem` | Cards (default) |
| `xl` | `1rem` | Larger panels |
| `2xl` | `1rem` | Hero cards, modals |
| `full` | `9999px` | Pills, avatars |

---

## 2. Typography

| Level | Font | Weight | Size | Use |
|---|---|---|---|---|
| H1 / `.page-title` | Sora | 700 | 24px (2xl) | Page titles |
| H2 | Sora | 700 | 20-24px | Section titles |
| H3 | Sora | 600 | 16-18px | Subsections |
| Body | Inter | 400 | 14px | Default text |
| Caption | Inter | 500 | 11-12px | Labels, badges |

**Rules:**
- All headings use `font-heading` (Sora)
- All body text uses `font-body` (Inter)
- Never use raw font-family declarations in components

---

## 3. Component Library

### Core (shadcn/ui based)

All live in `src/components/ui/`:

| Component | File | Variants |
|---|---|---|
| Button | `button.tsx` | default, destructive, outline, secondary, ghost, link, pill |
| Card | `card.tsx` | Standard surface with header/content/footer |
| Input | `input.tsx` | Standard with focus ring |
| Select | `select.tsx` | Dropdown with search |
| Dialog/Modal | `dialog.tsx` | Centered overlay |
| Sheet | `sheet.tsx` | Side panel (preferred for detail views) |
| Table | `table.tsx` | With sorting, filters, pagination |
| Badge | `badge.tsx` | default, secondary, destructive, outline |
| Tabs | `tabs.tsx` | Horizontal tab navigation |
| Tooltip | `tooltip.tsx` | Hover info |

### Semantic Components

| Component | File | Purpose |
|---|---|---|
| StatusBadge | `status-badge.tsx` | Consistent status pills |
| KpiCard | `kpi-card.tsx` | Dashboard metrics |
| PageHeader | `page-header.tsx` | Page title + subtitle + actions |
| PageSkeleton | `page-skeleton.tsx` | Loading states |
| EmptyState | `empty-state.tsx` | No-data views |
| ErrorBlock | `error-block.tsx` | Error feedback |
| EmployeeAvatar | `employee-avatar.tsx` | Initials avatar |
| ClientAvatar | `client-avatar.tsx` | Client initials |
| FormField | `form-field.tsx` | Label + input wrapper |
| SectionHeader | `section-header.tsx` | Section divider |
| DataTableToolbar | `data-table-toolbar.tsx` | Search + filters bar |
| ReportActionsBar | `report-actions-bar.tsx` | Export PDF/CSV |
| PeriodStatusBanner | `period-status-banner.tsx` | Period state |
| AdvancedFilters | `advanced-filters.tsx` | Multi-field filter panel |

### CSS Utility Classes (index.css)

| Class | Purpose |
|---|---|
| `.stat-card` | Dashboard metric cards |
| `.glass-card` | Frosted glass panels |
| `.data-table-wrapper` | Table container with border |
| `.status-confirmed/pending/missing/...` | Status badge variants |
| `.earning-badge` / `.deduction-badge` | Payroll badges |
| `.gradient-primary` | Brand gradient bg |
| `.gradient-text` | Gradient text effect |
| `.hover-lift` | Hover elevation animation |
| `.press-scale` | Active press feedback |
| `.sidebar-link` / `.sidebar-link-active` | Sidebar nav styling |

---

## 4. Layout System

### App Layout (`AdminLayout.tsx`)

```
┌──────────────────────────────────────┐
│ TopBar (sticky, glass)               │
├────────┬─────────────────────────────┤
│Sidebar │ Main Content (p-6)          │
│(collap)│                             │
│        │                             │
└────────┴─────────────────────────────┘
```

### Employee Layout (`EmployeeLayout.tsx`)

```
┌──────────────────────────────────────┐
│ TopBar (compact)                     │
├──────────────────────────────────────┤
│ Content (full width, mobile-first)   │
├──────────────────────────────────────┤
│ FloatingDock (bottom nav, mobile)    │
└──────────────────────────────────────┘
```

### Standard Page Structure

```tsx
<div className="space-y-6 animate-fade-in">
  <PageHeader title="..." subtitle="..." icon={Icon} />
  {/* KPI cards row */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <KpiCard ... />
  </div>
  {/* Main content */}
  <Card className="rounded-2xl">
    <CardContent>...</CardContent>
  </Card>
</div>
```

---

## 5. UX Principles

1. **Clarity > Complexity** — Every screen has one clear purpose
2. **Speed > Decoration** — Fast interactions, minimal chrome
3. **Action-first** — Primary action always visible
4. **Reduce cognitive load** — Progressive disclosure via Sheets
5. **Mobile-first for employees** — Large touch targets, minimal steps

---

## 6. Role-Based UI

| Role | Sees | Layout |
|---|---|---|
| Owner/Developer | Everything + platform config | AdminLayout |
| Admin | Full company management | AdminLayout |
| Manager | Scheduling, staff, reports (per permissions) | AdminLayout |
| Supervisor | Limited management (per permissions) | AdminLayout |
| Employee | Clock, shifts, earnings, profile | EmployeeLayout |

Gate access with `<ModuleGate>` and `useAuth().role`.

---

## 7. Multi-Company

- **CompanySwitcher** in sidebar (icon mode) + Command Palette (Cmd+K)
- Visual identity per company: `brand_color`, `logo_url`
- All data scoped by `company_id` (RLS enforced)
- Company switch protected by `CompanyActionGuard`

---

## 8. Global Features (Every Module)

- ✅ Search (via toolbar or command palette)
- ✅ Filters (`AdvancedFilters` component)
- ✅ Export PDF/CSV (`ReportActionsBar`)
- ✅ Audit log (`AuditPanel`)
- ✅ Notifications (`NotificationBell`)
- ✅ Status indicators (`StatusBadge`)
- ✅ Loading skeletons (`PageSkeleton`)
- ✅ Empty states (`EmptyState`)

---

## 9. Mobile Guidelines

- Minimum touch target: 44px
- Use `FloatingDock` for bottom navigation
- Collapse secondary data into expandable sections
- Use `Sheet` (bottom drawer) for detail views
- Focus on: Clock in/out, View shifts, Earnings

---

## 10. Performance Rules

- Use `React.lazy()` for route-level code splitting
- Skeleton loaders for all data-fetching views
- Avoid `select("*")` — always specify columns
- Limit queries to necessary rows (never unbounded)
- Use `useCallback` / `useMemo` for expensive computations

---

## 11. Integration Ready (Parceros)

- Worker identity via `worker_profiles` table
- Reputation system: `rep_scores`, `rep_events`, `rep_badges`
- Passport: `passport_profiles`, `passport_work_history`
- Sync via `parceros-sync` edge function
- No PII shared externally

---

## Rules

1. **Never hardcode colors** — always use semantic tokens
2. **Never create duplicate components** — extend existing ones
3. **Never bypass RLS** — all data access through policies
4. **Every page** must have PageHeader, loading state, empty state
5. **Every table** must have search, sort, pagination, export
6. **All fonts** via `font-heading` or `font-body` tokens
