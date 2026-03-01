import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { CheckCircle2, XCircle, Users, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Assignment, Employee } from "./types";

interface Confirmation {
  id: string;
  assignment_id: string;
  employee_id: string;
  status: string;
  confirmed_by: string;
  confirmed_at: string;
}

interface ShiftAttendancePanelProps {
  shiftId: string;
  companyId: string;
  assignments: Assignment[];
  employees: Employee[];
  canManage: boolean;
}

export function ShiftAttendancePanel({
  shiftId, companyId, assignments, employees, canManage,
}: ShiftAttendancePanelProps) {
  const { user } = useAuth();
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const shiftAssignments = assignments.filter(a => a.shift_id === shiftId && a.status !== "rejected" && a.status !== "removed");

  const loadConfirmations = useCallback(async () => {
    const { data } = await supabase
      .from("shift_attendance_confirmations")
      .select("id, assignment_id, employee_id, status, confirmed_by, confirmed_at")
      .eq("shift_id", shiftId);
    setConfirmations((data ?? []) as Confirmation[]);
    setLoading(false);
  }, [shiftId]);

  useEffect(() => { loadConfirmations(); }, [loadConfirmations]);

  const getEmployee = (id: string) => employees.find(e => e.id === id);
  const getConfirmation = (assignmentId: string) => confirmations.find(c => c.assignment_id === assignmentId);

  const handleConfirm = async (assignment: Assignment, status: "present" | "absent") => {
    if (!user) return;
    setActing(assignment.id);
    try {
      const existing = getConfirmation(assignment.id);
      if (existing) {
        await supabase.from("shift_attendance_confirmations")
          .update({ status, confirmed_by: user.id, confirmed_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
      } else {
        await supabase.from("shift_attendance_confirmations").insert({
          company_id: companyId,
          shift_id: shiftId,
          assignment_id: assignment.id,
          employee_id: assignment.employee_id,
          status,
          confirmed_by: user.id,
        } as any);
      }
      await loadConfirmations();
      const emp = getEmployee(assignment.employee_id);
      toast.success(`${emp?.first_name ?? "Empleado"} marcado como ${status === "present" ? "presente" : "ausente"}`);
    } catch (err: any) {
      toast.error(err.message ?? "Error al confirmar asistencia");
    } finally {
      setActing(null);
    }
  };

  const handleConfirmAll = async () => {
    if (!user) return;
    setActing("all");
    try {
      const unconfirmed = shiftAssignments.filter(a => !getConfirmation(a.id));
      if (unconfirmed.length === 0) {
        toast.info("Todos los empleados ya están confirmados");
        setActing(null);
        return;
      }
      const inserts = unconfirmed.map(a => ({
        company_id: companyId,
        shift_id: shiftId,
        assignment_id: a.id,
        employee_id: a.employee_id,
        status: "present",
        confirmed_by: user.id,
      }));
      await supabase.from("shift_attendance_confirmations").insert(inserts as any);
      await loadConfirmations();
      toast.success(`${unconfirmed.length} empleado(s) confirmados como presentes`);
    } catch (err: any) {
      toast.error(err.message ?? "Error al confirmar asistencia");
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  if (shiftAssignments.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        No hay empleados asignados a este turno.
      </div>
    );
  }

  const confirmedCount = shiftAssignments.filter(a => getConfirmation(a.id)).length;
  const presentCount = shiftAssignments.filter(a => getConfirmation(a.id)?.status === "present").length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">
            {confirmedCount}/{shiftAssignments.length} confirmados
            {presentCount > 0 && <span className="text-earning ml-1">({presentCount} presentes)</span>}
          </span>
        </div>
        {canManage && confirmedCount < shiftAssignments.length && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1"
            onClick={handleConfirmAll}
            disabled={acting === "all"}
          >
            {acting === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Confirmar todos
          </Button>
        )}
      </div>

      {/* Employee list */}
      <div className="space-y-1">
        {shiftAssignments.map(a => {
          const emp = getEmployee(a.employee_id);
          const conf = getConfirmation(a.id);
          if (!emp) return null;
          return (
            <div key={a.id} className={cn(
              "flex items-center justify-between rounded-lg px-2.5 py-1.5 border transition-colors",
              conf?.status === "present" && "bg-earning/5 border-earning/20",
              conf?.status === "absent" && "bg-destructive/5 border-destructive/20",
              !conf && "border-border",
            )}>
              <div className="flex items-center gap-2 min-w-0">
                <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{emp.first_name} {emp.last_name}</p>
                  {conf && (
                    <p className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="h-2 w-2" />
                      {format(new Date(conf.confirmed_at), "HH:mm")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {conf ? (
                  <span className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    conf.status === "present" ? "bg-earning/10 text-earning" : "bg-destructive/10 text-destructive",
                  )}>
                    {conf.status === "present" ? "Presente" : "Ausente"}
                  </span>
                ) : null}
                {canManage && (
                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      onClick={() => handleConfirm(a, "present")}
                      disabled={acting === a.id}
                      className={cn(
                        "p-1 rounded-md transition-colors",
                        conf?.status === "present" ? "text-earning bg-earning/10" : "text-muted-foreground hover:text-earning hover:bg-earning/5",
                      )}
                      title="Marcar presente"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleConfirm(a, "absent")}
                      disabled={acting === a.id}
                      className={cn(
                        "p-1 rounded-md transition-colors",
                        conf?.status === "absent" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/5",
                      )}
                      title="Marcar ausente"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
