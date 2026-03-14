

## Time & Attendance System — Implementation Plan

### Overview

Build a professional Attendance module at `/app/attendance` that surfaces today's workforce status, alerts, and reporting — all computed from existing tables (`time_entries`, `clock_events`, `clock_alerts`, `shift_assignments`, `scheduled_shifts`). No new database tables needed; the existing schema already captures all required data.

---

### What Already Exists

| Concern | Current State |
|---|---|
| Clock events | `clock_events` table with `type`, `clock_method`, `photo_url`, `latitude/longitude`, `shift_id`, `kiosk_device_id` |
| Time entries | `time_entries` with `clock_in`, `clock_out`, `status`, GPS fields, `shift_id` |
| Alerts | `clock_alerts` with `type` (OUTSIDE_GEOFENCE, GPS_LOW_ACCURACY, etc.), `severity`, `resolved_at` |
| Shift assignments | `shift_assignments` + `scheduled_shifts` with `date`, `start_time`, `end_time`, `clock_method` |
| Attendance confirmations | `shift_attendance_confirmations` table |
| Kiosk clock | Edge function + `/kiosk` route fully functional |
| Mobile clock | `/portal/clock` with GPS validation, geofence, selfie |

**No changes to existing clock-in logic or payroll are needed.**

---

### Implementation Tasks

#### 1. New Page: `/app/attendance` (Attendance Dashboard)

Create `src/pages/admin/Attendance.tsx` — a comprehensive real-time attendance dashboard.

**Data sources** (all read-only queries via Supabase client):
- `scheduled_shifts` + `shift_assignments` for today's expected workers
- `time_entries` for actual clock-in/out
- `clock_events` for method/photo details
- `clock_alerts` for active alerts

**UI Sections:**

**a) KPI Cards (top row)**
- Scheduled today (count of assignments)
- Checked in (have `time_entries` with `clock_in`)
- Late (clock_in > shift start_time)
- No-show (no clock_in, shift already started/ended)
- Completed (have both clock_in + clock_out)

**b) Alerts Panel (collapsible sidebar or top banner)**
- Unresolved `clock_alerts` for today
- Types: Late arrival, No-show, Outside geofence
- Auto-generate "late" and "no-show" alerts client-side by comparing shift times vs time_entries
- Action: resolve/dismiss

**c) Attendance Table**
Columns: Worker (avatar + name) | Shift | Scheduled | Clock In | Clock Out | Status | Late (min) | Method | Photo

Status computed client-side:
- `scheduled` — assigned, no clock_in yet, shift hasn't started
- `checked-in` — has clock_in, no clock_out
- `late` — clock_in exists but > shift start_time
- `completed` — has clock_in + clock_out
- `no-show` — no clock_in, shift window passed

**d) Filters**
- Date picker (default: today)
- Status filter
- Search by worker name
- Shift filter

**e) Realtime** — subscribe to `time_entries` and `clock_alerts` changes for live updates.

#### 2. Attendance Reports Tab

Within the same page, add a "Reports" tab with:
- **Date range selector**
- **Late arrivals report**: employees sorted by total late minutes
- **Attendance score**: % of shifts with on-time clock-in per employee
- **Hours worked**: total hours per employee in range
- **No-show report**: shifts without any clock-in

**Export**: CSV via existing `ReportActionsBar` pattern, PDF via `jspdf`.

#### 3. Route & Navigation

- Add lazy import + route `attendance` in `App.tsx`
- Add nav item `{ id: "attendance", to: "/app/attendance", icon: CalendarCheck, label: "Asistencia", module: null, section: "Operaciones" }` to `nav-items.ts`

#### 4. Auto-detect Late & No-show (client-side logic)

In the Attendance page, compute attendance status by joining:
```
shift_assignments (today, status=confirmed) 
  → scheduled_shifts (date, start_time, end_time)
  → time_entries (employee_id, shift_id, clock_in, clock_out)
```

Logic:
- **Late**: `clock_in` exists AND `clock_in_time > start_time` → late_minutes = diff
- **No-show**: current time > `end_time` AND no `time_entries` row
- **Checked-in**: has `clock_in`, no `clock_out`
- **Completed**: has both

#### 5. Insert Clock Alerts for Late/No-show

Optionally insert `clock_alerts` rows when detecting late or no-show workers (with `type: "LATE_ARRIVAL"` or `type: "NO_SHOW"`) to persist these for the LiveMap and notification systems. This uses the existing `clock_alerts` table — no schema changes needed.

---

### Files to Create/Modify

| File | Action |
|---|---|
| `src/pages/admin/Attendance.tsx` | **Create** — main attendance dashboard + reports |
| `src/App.tsx` | **Edit** — add lazy import + route |
| `src/components/navigation/nav-items.ts` | **Edit** — add "Asistencia" nav item |

### No Database Changes Required

All data is already captured in existing tables. The attendance statuses are computed at query time from `shift_assignments`, `scheduled_shifts`, `time_entries`, and `clock_alerts`.

