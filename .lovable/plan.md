## Phase 2 Foundation — Safe Mobile Team Actions

Goal: move MobileShiftTeamHub from read-only to limited, auditable mutations without touching payroll, attendance, or time_entries.

Schema confirmed from DB:
- `shift_assignments` has: status, response_status, responded_at, accepted_at, rejected_at, attendance_status (untouched), rejection_reason.
- `shift_requests` has: status, reviewed_by, reviewed_at, rejection_reason.
- `shift_audit_log` does NOT exist — needs to be created.
- `notifications` exists with recipient_id/recipient_type/type/title/body/metadata.

---

### Phase 2A — Migration: `shift_audit_log`

Single additive migration:

```sql
CREATE TABLE public.shift_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  assignment_id uuid,
  employee_id uuid,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  source text NOT NULL DEFAULT 'mobile_manage_team',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sal_company_shift ON shift_audit_log(company_id, shift_id);
CREATE INDEX idx_sal_assignment   ON shift_audit_log(assignment_id);
CREATE INDEX idx_sal_employee     ON shift_audit_log(employee_id);
CREATE INDEX idx_sal_created_at   ON shift_audit_log(created_at DESC);

ALTER TABLE shift_audit_log ENABLE ROW LEVEL SECURITY;
```

RLS: SELECT/INSERT only for `developer/owner/founder` global, or per-company `admin/manager/supervisor` via existing helpers (`has_role`, `is_company_admin`, `can_access_admin_for_company`). No worker access. No UPDATE/DELETE policies (immutable log).

---

### Phase 2B — RPC `set_shift_assignment_state`

`SECURITY DEFINER`, `search_path=public`. Signature:

```
set_shift_assignment_state(
  p_assignment_id uuid,
  p_next_status text,
  p_next_response_status text,
  p_reason text,
  p_source text DEFAULT 'mobile_manage_team'
) RETURNS shift_assignments
```

Logic:
1. Authorization: caller must satisfy `can_access_admin_for_company(company_id)` OR be developer/owner; else `RAISE EXCEPTION 'forbidden'`.
2. Load assignment + shift; snapshot `before_data` (status, response_status, responded_at, accepted_at, rejected_at).
3. Validate transition against allow-list:
   - pending → confirmed | rejected | removed
   - accepted → confirmed | removed
   - confirmed → removed
   - removed/rejected → no-op (raise unless dev override later)
4. Apply timestamps:
   - `confirmed`: set responded_at=now(), accepted_at=COALESCE(accepted_at, now())
   - `rejected`: set responded_at=now(), rejected_at=now()
   - `removed`: keep history; only update status
5. NEVER touch: time_entries, attendance_status, payroll_*, scheduled hours, deleted_at, hard delete.
6. Insert `shift_audit_log` row with action `assignment_state_change`.
7. Best-effort `notifications` insert (worker-facing) for confirm/remove only — wrapped in `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL`.

---

### Phase 2C — RPC `resolve_shift_request`

```
resolve_shift_request(
  p_request_id uuid,
  p_decision text,           -- 'approved' | 'rejected'
  p_reason text,
  p_source text DEFAULT 'mobile_manage_team'
) RETURNS shift_requests
```

Logic:
1. Same authorization gate.
2. Load request + shift; only act if current `status = 'pending'`.
3. If `approved`:
   - `UPDATE shift_requests SET status='approved', reviewed_by=auth.uid(), reviewed_at=now()`.
   - Upsert `shift_assignments` for (shift_id, employee_id):
     - INSERT with status='confirmed', response_status='accepted', accepted_at=now(), responded_at=now() if no row.
     - If row exists: call internal logic equivalent to `set_shift_assignment_state` to advance to confirmed (no duplicate row).
   - Insert audit row `claim_approved`.
   - Best-effort notification.
4. If `rejected`:
   - `UPDATE shift_requests SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), rejection_reason=p_reason`.
   - Insert audit row `claim_rejected`.
   - Best-effort notification.
5. No location/meeting_point exposure logic in RPC (UI gate already in place).

---

### Phase 2D — Mobile UI (MobileShiftTeamHub)

Client wrapper: `src/lib/shifts/team-actions.ts` — typed wrappers around `supabase.rpc(...)` with toast + error mapping.

Claims tab (`shift_requests`):
- Approve / Reject buttons → confirm dialog (AlertDialog) → call `resolve_shift_request` → invalidate hub queries.
- Existing Call action retained.

Assigned tab — only when `canManageShifts`:
- Per-row "Change status" menu (DropdownMenu) with Confirm / Reject / Remove (only valid transitions shown).
- AlertDialog confirms with worker name, action label, optional reason `<Textarea>`.
- On success: refetch assignments + requests, toast.

Disabled actions: add worker, bulk assign, edit shift details, attendance edit, payroll.

---

### Phase 2E — Safety Copy

In every confirm dialog footer:
> "This action updates the worker's assignment status and is logged. It does not affect payroll or worked time. Attendance and payroll review remain separate."

In dropdown header: small muted "Logged action".

---

### Files

New:
- `supabase/migrations/<ts>_shift_audit_log_and_team_rpcs.sql` (table + RLS + 2 RPCs)
- `src/lib/shifts/team-actions.ts`
- `src/components/shifts/mobile/MobileTeamActionDialog.tsx`

Edited:
- `src/components/shifts/mobile/MobileShiftTeamHub.tsx` — add action menus + dialogs in Claims & Assigned tabs, gated by `canManageShifts`.

Untouched: payroll, time_entries, attendance, desktop staffing flows, worker portal logic, shift_assignments hard-delete paths.

---

### QA Checklist

1. Migration applies; table + indexes + RLS visible.
2. Anon/worker role: cannot SELECT/INSERT audit log; cannot call RPCs (raises `forbidden`).
3. Admin: approve claim → request approved, assignment row created/updated to confirmed, audit row inserted, no time_entries change.
4. Admin: reject claim → request rejected, audit row, no assignment.
5. Admin: confirm/reject/remove assignment → status updates, audit logged, no row deleted, time_entries untouched.
6. Invalid transition (e.g. removed → confirmed) raises and UI shows toast.
7. Desktop shift detail still works (reads same tables).
8. Worker portal still loads shifts; only sees notifications for approved claims/removals.
9. `rg "scheduled.*hours"` — no payroll usage added.
10. Build + typecheck pass.

Ready to implement on approval.
