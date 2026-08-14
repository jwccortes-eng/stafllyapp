/**
 * ShiftAttendancePanel — premium Attendance tab inside Shift Detail.
 *
 * Validation layer for human review BEFORE payroll review.
 *  - Reads `shift_assignments` (validation source of truth)
 *  - Reads `time_entries` (RAW evidence, never written here)
 *  - Writes ONLY `shift_assignments.attendance_status / _validated_by / _validated_at`
 *  - Never touches payroll, never modifies time_entries
 *
 * Permissions: only users for whom `canManageShifts` returns true can
 * mutate. Others see a read-only view (also enforced at RLS).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Check,
  Clock,
  AlertTriangle,
  X,
  Loader2,
  ShieldCheck,
  Users,
  RotateCcw,
  CheckCircle2,
  CircleDashed,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import ClockEventEvidence from "@/components/timeclock/ClockEventEvidence";
import type { Assignment, Employee } from "./types";
import { canManageShifts, TIME_DOMAIN_WRITE_PERMISSIONS } from "@/lib/shifts/shift-permissions";
import { usePermissions } from "@/hooks/usePermissions";
import {
  staffedAssignments,
  type AttendanceValidationStatus,
} from "@/lib/shifts/assignment-coverage";

type ValStatus = AttendanceValidationStatus;

interface AsgnExtra {
  id: string;
  employee_id: string;
  attendance_status: ValStatus | null;
  attendance_validated_at: string | null;
}

interface ClockEvidence {
  clock_in: string | null;
  clock_out: string | null;
  count: number;
}

type Evidence = "no_clock" | "clocked_in" | "clocked_out" | "incomplete";

const EVIDENCE_META: Record<
  Evidence,
  { label: string; cls: string }
> = {
  no_clock: { label: "No clock", cls: "bg-muted text-muted-foreground border-border" },
  clocked_in: { label: "Clocked in", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20" },
  clocked_out: { label: "Clocked out", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  incomplete: { label: "Incomplete clock", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
};

const STATUS_META: Record<ValStatus, { label: string; pill: string; ring: string }> = {
  pending: {
    label: "Pending",
    pill: "bg-muted text-muted-foreground border-border",
    ring: "",
  },
  present: {
    label: "Present",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    ring: "ring-1 ring-emerald-500/20",
  },
  late: {
    label: "Late",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    ring: "ring-1 ring-amber-500/20",
  },
  absent: {
    label: "Absent",
    pill: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
    ring: "ring-1 ring-rose-500/20",
  },
  excused: {
    label: "Excused",
    pill: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
    ring: "ring-1 ring-sky-500/20",
  },
};

interface ShiftAttendancePanelProps {
  shiftId: string;
  companyId: string;
  assignments: Assignment[];
  employees: Employee[];
  canManage: boolean; // legacy — superseded by canValidate (per-company role check)
  shiftAdminId?: string | null;
}

function evidenceFor(c: ClockEvidence | undefined): Evidence {
  if (!c || c.count === 0) return "no_clock";
  if (c.clock_in && c.clock_out) return "clocked_out";
  if (c.clock_in && !c.clock_out) return "incomplete";
  return "clocked_in";
}

function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "HH:mm"); } catch { return "—"; }
}

export function ShiftAttendancePanel({
  shiftId, companyId, assignments, employees, shiftAdminId,
}: ShiftAttendancePanelProps) {
  const { user, allRoles, canAccessAdminForCompany } = useAuth();
  const { selectedCompanyId } = useCompany();
  const { canAny } = usePermissions();

  // P0 Domain boundary — validar/corregir HORAS exige permisos del dominio de
  // horas. Administrar servicios (service.*/staffing.*) ya no basta.
  const canValidate =
    canManageShifts({
      allRoles,
      canAccessAdminForCompany,
      companyId: selectedCompanyId ?? companyId,
    }) && canAny(TIME_DOMAIN_WRITE_PERMISSIONS, selectedCompanyId ?? companyId);


  const [extras, setExtras] = useState<AsgnExtra[]>([]);
  const [clockByEmp, setClockByEmp] = useState<Record<string, ClockEvidence>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [confirmAbsentOpen, setConfirmAbsentOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState<{ employeeId: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const shiftAssignments = useMemo<Assignment[]>(
    () => staffedAssignments(assignments as any, shiftId) as unknown as Assignment[],
    [assignments, shiftId],
  );

  const adminEmp = shiftAdminId ? employees.find(e => e.id === shiftAdminId) : null;

  // Load attendance + raw clock evidence
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [aRes, teRes] = await Promise.all([
        supabase
          .from("shift_assignments")
          .select("id, employee_id, attendance_status, attendance_validated_at")
          .eq("shift_id", shiftId),
        supabase
          .from("time_entries")
          .select("employee_id, clock_in, clock_out")
          .eq("shift_id", shiftId)
          .neq("status", "rejected"),
      ]);
      if (cancelled) return;
      setExtras((aRes.data ?? []) as AsgnExtra[]);
      const map: Record<string, ClockEvidence> = {};
      for (const te of (teRes.data ?? []) as any[]) {
        const prev = map[te.employee_id];
        if (!prev) {
          map[te.employee_id] = { clock_in: te.clock_in, clock_out: te.clock_out, count: 1 };
        } else {
          // Keep earliest clock_in and latest clock_out
          const earliestIn = (prev.clock_in && te.clock_in)
            ? (prev.clock_in < te.clock_in ? prev.clock_in : te.clock_in)
            : (prev.clock_in ?? te.clock_in);
          const latestOut = (prev.clock_out && te.clock_out)
            ? (prev.clock_out > te.clock_out ? prev.clock_out : te.clock_out)
            : (prev.clock_out ?? te.clock_out);
          map[te.employee_id] = { clock_in: earliestIn, clock_out: latestOut, count: prev.count + 1 };
        }
      }
      setClockByEmp(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [shiftId, reloadKey]);

  const getEmployee = (id: string) => employees.find(e => e.id === id);
  const getExtra = (asgnId: string) => extras.find(x => x.id === asgnId);

  const setStatus = useCallback(async (
    assignmentIds: string[],
    next: ValStatus,
  ) => {
    if (!canValidate || assignmentIds.length === 0) return false;
    const { error } = await supabase
      .from("shift_assignments")
      .update({
        attendance_status: next,
        attendance_validated_by: user?.id ?? null,
        attendance_validated_at: new Date().toISOString(),
      } as any)
      .in("id", assignmentIds);
    if (error) {
      toast.error(`Couldn't update attendance: ${error.message}`);
      return false;
    }
    setReloadKey(k => k + 1);
    return true;
  }, [canValidate, user?.id]);

  const handleSingle = async (assignmentId: string, next: ValStatus, name: string) => {
    setBusyId(assignmentId);
    const ok = await setStatus([assignmentId], next);
    setBusyId(null);
    if (ok) toast.success(`${name} marked ${next}`);
  };

  /* ─────────── Bulk actions ─────────── */

  const bulkPresentClocked = async () => {
    const ids = shiftAssignments
      .filter(a => {
        const ev = evidenceFor(clockByEmp[a.employee_id]);
        return ev === "clocked_in" || ev === "clocked_out" || ev === "incomplete";
      })
      .map(a => a.id);
    if (ids.length === 0) {
      toast.info("No clocked workers to mark");
      return;
    }
    setBulkBusy("present");
    const ok = await setStatus(ids, "present");
    setBulkBusy(null);
    if (ok) toast.success(`${ids.length} marked present`);
  };

  const bulkAbsentRemainingPending = async () => {
    const ids = shiftAssignments
      .filter(a => (getExtra(a.id)?.attendance_status ?? "pending") === "pending")
      .map(a => a.id);
    if (ids.length === 0) {
      toast.info("No pending workers to mark");
      return;
    }
    setBulkBusy("absent");
    const ok = await setStatus(ids, "absent");
    setBulkBusy(null);
    if (ok) toast.success(`${ids.length} marked absent`);
  };

  const bulkResetPending = async () => {
    const ids = shiftAssignments
      .filter(a => (getExtra(a.id)?.attendance_status ?? "pending") !== "pending")
      .map(a => a.id);
    if (ids.length === 0) {
      toast.info("Nothing to reset");
      return;
    }
    setBulkBusy("reset");
    const ok = await setStatus(ids, "pending");
    setBulkBusy(null);
    if (ok) toast.success(`${ids.length} reset to pending`);
  };

  /* ─────────── Header counts ─────────── */

  const counts = useMemo(() => {
    let validated = 0, pending = 0, present = 0, late = 0, absent = 0, excused = 0;
    for (const a of shiftAssignments) {
      const s = (getExtra(a.id)?.attendance_status ?? "pending") as ValStatus;
      if (s === "pending") pending++; else validated++;
      if (s === "present") present++;
      else if (s === "late") late++;
      else if (s === "absent") absent++;
      else if (s === "excused") excused++;
    }
    return { total: shiftAssignments.length, validated, pending, present, late, absent, excused };
  }, [shiftAssignments, extras]);

  const ready = counts.total > 0 && counts.pending === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (shiftAssignments.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No workers assigned to this shift yet.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 md:pb-2">
      {/* ───── Header summary ───── */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              <ShieldCheck className="h-3 w-3" /> Attendance validation
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {counts.total} assigned · {counts.validated} validated · {counts.pending} pending
            </p>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              ready
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
            )}
            title="Informational only — does not change payroll calculations."
          >
            {ready ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
            {ready ? "Ready for payroll review" : "Not ready · pending validation"}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              ready ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${counts.total ? (counts.validated / counts.total) * 100 : 0}%` }}
          />
        </div>

        {/* Mini distribution */}
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {counts.present > 0 && <Pill tone="emerald" label={`${counts.present} present`} />}
          {counts.late > 0 && <Pill tone="amber" label={`${counts.late} late`} />}
          {counts.absent > 0 && <Pill tone="rose" label={`${counts.absent} absent`} />}
          {counts.excused > 0 && <Pill tone="sky" label={`${counts.excused} excused`} />}
          {counts.pending > 0 && <Pill tone="muted" label={`${counts.pending} pending`} />}
        </div>

        {/* Shift admin chip */}
        {adminEmp ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border/40 pt-2">
            <ShieldCheck className="h-3 w-3 text-primary" />
            <span>Shift Admin:</span>
            <EmployeeAvatar firstName={adminEmp.first_name} lastName={adminEmp.last_name} avatarUrl={adminEmp.avatar_url} gender={adminEmp.gender} size="xs" />
            <span className="font-medium text-foreground">{adminEmp.first_name} {adminEmp.last_name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 border-t border-border/40 pt-2">
            <AlertTriangle className="h-3 w-3" /> No shift admin assigned
          </div>
        )}
      </div>

      {/* ───── Bulk actions ───── */}
      {canValidate && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs"
            onClick={bulkPresentClocked}
            disabled={bulkBusy !== null}
          >
            {bulkBusy === "present" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Mark clocked as Present
          </Button>
          <Button
            size="sm" variant="outline" className="h-9 rounded-xl gap-1.5 text-xs"
            onClick={() => setConfirmAbsentOpen(true)}
            disabled={bulkBusy !== null}
          >
            {bulkBusy === "absent" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Mark pending as Absent
          </Button>
          <Button
            size="sm" variant="ghost" className="h-9 rounded-xl gap-1.5 text-xs text-muted-foreground"
            onClick={bulkResetPending}
            disabled={bulkBusy !== null}
          >
            {bulkBusy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reset all
          </Button>
        </div>
      )}

      {/* ───── Blocking banner ───── */}
      {counts.pending > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-200">
              Payroll review is blocked until all workers are validated
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              {counts.pending} of {counts.total} still pending validation.
            </p>
          </div>
        </div>
      )}

      {/* ───── Worker cards (grouped) ───── */}
      {(() => {
        const pendingList = shiftAssignments.filter(
          a => (getExtra(a.id)?.attendance_status ?? "pending") === "pending",
        );
        const validatedList = shiftAssignments.filter(
          a => (getExtra(a.id)?.attendance_status ?? "pending") !== "pending",
        );

        const renderCard = (a: typeof shiftAssignments[number]) => {
          const emp = getEmployee(a.employee_id);
          if (!emp) return null;
          const ext = getExtra(a.id);
          const status: ValStatus = (ext?.attendance_status ?? "pending") as ValStatus;
          const clock = clockByEmp[a.employee_id];
          const ev = evidenceFor(clock);
          const isAdmin = a.employee_id === shiftAdminId;

          // Smart warnings
          const warnings: string[] = [];
          if (status === "present" && ev === "no_clock") warnings.push("Marked Present but no clock evidence");
          if (status === "absent" && (ev === "clocked_in" || ev === "clocked_out" || ev === "incomplete"))
            warnings.push("Marked Absent but worker has a clock entry");
          if (status === "pending" && ev === "no_clock") warnings.push("No clock entry — needs validation");
          if (ev === "incomplete") warnings.push("Clock-in exists but no clock-out");

          const sm = STATUS_META[status];
          const em = EVIDENCE_META[ev];
          const isBusy = busyId === a.id;
          const role = (a as any).role || (a as any).slot_role_label || null;

          return (
            <div
              key={a.id}
              className={cn(
                "rounded-2xl border bg-card p-3 sm:p-4 transition-all",
                "border-border/60",
                sm.ring,
              )}
            >
              {/* Top row: identity + status */}
              <div className="flex items-start gap-3">
                <EmployeeAvatar
                  firstName={emp.first_name} lastName={emp.last_name}
                  avatarUrl={emp.avatar_url} gender={emp.gender} size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold truncate">
                      {emp.first_name} {emp.last_name}
                    </span>
                    {isAdmin && (
                      <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 rounded">ADMIN</span>
                    )}
                    {role && (
                      <span className="text-[10px] text-muted-foreground/70">· {role}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", sm.pill)}>
                      {sm.label}
                    </span>
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", em.cls)}>
                      <Clock className="h-2.5 w-2.5" /> {em.label}
                    </span>
                    {ext?.attendance_validated_at && status !== "pending" && (
                      <span className="text-[10px] text-muted-foreground/60">
                        validated {format(new Date(ext.attendance_validated_at), "HH:mm")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Clock evidence row */}
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-muted/30 border border-border/40 px-2.5 py-1.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Clock in</p>
                  <p className="font-mono tabular-nums">{fmtClock(clock?.clock_in ?? null)}</p>
                </div>
                <div className="rounded-lg bg-muted/30 border border-border/40 px-2.5 py-1.5">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Clock out</p>
                  <p className="font-mono tabular-nums">{fmtClock(clock?.clock_out ?? null)}</p>
                </div>
              </div>

              {/* Warnings */}
              {warnings.map((w, i) => (
                <div key={i} className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-2.5 py-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">{w}</p>
                </div>
              ))}

              {/* Evidence drawer trigger (read-only) */}
              <button
                type="button"
                onClick={() =>
                  setEvidenceOpen({
                    employeeId: a.employee_id,
                    name: `${emp.first_name} ${emp.last_name}`,
                  })
                }
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
              >
                <MapPin className="h-3 w-3" /> View clock evidence
              </button>


              {/* Action buttons */}
              {canValidate && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  <ActionBtn
                    active={status === "present"} loading={isBusy} icon={Check} label="Present" tone="emerald"
                    onClick={() => handleSingle(a.id, "present", `${emp.first_name} ${emp.last_name}`)}
                  />
                  <ActionBtn
                    active={status === "late"} loading={isBusy} icon={AlertTriangle} label="Late" tone="amber"
                    onClick={() => handleSingle(a.id, "late", `${emp.first_name} ${emp.last_name}`)}
                  />
                  <ActionBtn
                    active={status === "absent"} loading={isBusy} icon={X} label="Absent" tone="rose"
                    onClick={() => handleSingle(a.id, "absent", `${emp.first_name} ${emp.last_name}`)}
                  />
                  <ActionBtn
                    active={status === "pending"} loading={isBusy} icon={RotateCcw} label="Reset" tone="muted"
                    onClick={() => handleSingle(a.id, "pending", `${emp.first_name} ${emp.last_name}`)}
                  />
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-4">
            {pendingList.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Needs validation
                  </h3>
                  <span className="text-[10px] font-medium text-muted-foreground">{pendingList.length}</span>
                </div>
                <div className="space-y-2">{pendingList.map(renderCard)}</div>
              </div>
            )}
            {validatedList.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Validated
                  </h3>
                  <span className="text-[10px] font-medium text-muted-foreground">{validatedList.length}</span>
                </div>
                <div className="space-y-2">{validatedList.map(renderCard)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {!canValidate && (
        <p className="text-[11px] text-muted-foreground text-center">
          Read-only view. Only shift managers, admins, founders, owners or developers can validate attendance.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground/60 text-center">
        Validation is independent from clock entries and does not change payroll calculations.
      </p>

      <AlertDialog open={confirmAbsentOpen} onOpenChange={setConfirmAbsentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all pending workers as Absent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark every worker still pending validation as Absent. You can reset individual workers afterwards. This does not modify clock entries or payroll.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { setConfirmAbsentOpen(false); await bulkAbsentRemainingPending(); }}
              className="bg-rose-600 hover:bg-rose-600/90 text-white"
            >
              Mark as Absent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={evidenceOpen !== null}
        onOpenChange={(open) => !open && setEvidenceOpen(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Clock evidence</SheetTitle>
            <SheetDescription>
              {evidenceOpen?.name ?? "Worker"} · read-only audit view
            </SheetDescription>
          </SheetHeader>
          {evidenceOpen && (
            <ClockEventEvidence
              shiftId={shiftId}
              employeeId={evidenceOpen.employeeId}
              companyId={companyId}
              employeeName={evidenceOpen.name}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ─────────── small helpers ─────────── */

function Pill({ tone, label }: { tone: "emerald" | "amber" | "rose" | "sky" | "muted"; label: string }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium", map[tone])}>
      {label}
    </span>
  );
}

function ActionBtn({
  active, loading, icon: Icon, label, tone, onClick,
}: {
  active: boolean;
  loading: boolean;
  icon: typeof Check;
  label: string;
  tone: "emerald" | "amber" | "rose" | "muted";
  onClick: () => void;
}) {
  const activeCls: Record<string, string> = {
    emerald: "bg-emerald-600 hover:bg-emerald-600/90 text-white border-emerald-600",
    amber: "bg-amber-500 hover:bg-amber-500/90 text-white border-amber-500",
    rose: "bg-rose-600 hover:bg-rose-600/90 text-white border-rose-600",
    muted: "bg-muted text-foreground border-border",
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "h-9 rounded-xl gap-1 text-[11px] font-medium",
        active && activeCls[tone],
      )}
      aria-pressed={active}
    >
      {loading && active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
