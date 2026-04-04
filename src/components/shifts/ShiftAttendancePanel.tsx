import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeIdentityRow } from "@/components/ui/employee-identity-row";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { CheckCircle2, XCircle, Users, Loader2, Clock, ShieldCheck, StickyNote } from "lucide-react";
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
  notes: string | null;
}

interface ShiftAttendancePanelProps {
  shiftId: string;
  companyId: string;
  assignments: Assignment[];
  employees: Employee[];
  canManage: boolean;
  shiftAdminId?: string | null;
}

export function ShiftAttendancePanel({
  shiftId, companyId, assignments, employees, canManage, shiftAdminId,
}: ShiftAttendancePanelProps) {
  const { user } = useAuth();
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [noteForAssignment, setNoteForAssignment] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const shiftAssignments = assignments.filter(a => a.shift_id === shiftId && a.status !== "rejected" && a.status !== "removed");
  const adminEmp = shiftAdminId ? employees.find(e => e.id === shiftAdminId) : null;

  const loadConfirmations = useCallback(async () => {
    const { data } = await supabase
      .from("shift_attendance_confirmations")
      .select("id, assignment_id, employee_id, status, confirmed_by, confirmed_at, notes")
      .eq("shift_id", shiftId);
    setConfirmations((data ?? []) as Confirmation[]);
    setLoading(false);
  }, [shiftId]);

  useEffect(() => { loadConfirmations(); }, [loadConfirmations]);

  const getEmployee = (id: string) => employees.find(e => e.id === id);
  const getConfirmation = (assignmentId: string) => confirmations.find(c => c.assignment_id === assignmentId);

  const handleConfirm = async (assignment: Assignment, status: "present" | "absent", note?: string) => {
    if (!user) return;
    setActing(assignment.id);
    try {
      const existing = getConfirmation(assignment.id);
      if (existing) {
        await supabase.from("shift_attendance_confirmations")
          .update({ status, confirmed_by: user.id, confirmed_at: new Date().toISOString(), notes: note || existing.notes } as any)
          .eq("id", existing.id);
      } else {
        await supabase.from("shift_attendance_confirmations").insert({
          company_id: companyId, shift_id: shiftId, assignment_id: assignment.id,
          employee_id: assignment.employee_id, status, confirmed_by: user.id,
          notes: note || null,
        } as any);
      }
      await loadConfirmations();
      const emp = getEmployee(assignment.employee_id);
      toast.success(`${emp?.first_name ?? "Empleado"} marcado como ${status === "present" ? "presente" : "ausente"}`);
    } catch (err: any) {
      toast.error(err.message ?? "Error al confirmar asistencia");
    } finally {
      setActing(null);
      setNoteForAssignment(null);
      setNoteText("");
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
        company_id: companyId, shift_id: shiftId, assignment_id: a.id,
        employee_id: a.employee_id, status: "present", confirmed_by: user.id,
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
      {/* Shift Admin banner */}
      <div className={cn(
        "rounded-xl border p-2.5 flex items-center gap-2.5",
        adminEmp ? "border-primary/20 bg-primary/[0.04]" : "border-warning/20 bg-warning/[0.04]"
      )}>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", adminEmp ? "bg-primary/10" : "bg-warning/10")}>
          <ShieldCheck className={cn("h-4 w-4", adminEmp ? "text-primary" : "text-warning")} />
        </div>
        {adminEmp ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <EmployeeAvatar firstName={adminEmp.first_name} lastName={adminEmp.last_name} avatarUrl={adminEmp.avatar_url} gender={adminEmp.gender} size="xs" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Admin del turno</p>
              <p className="text-xs font-semibold truncate">{adminEmp.first_name} {adminEmp.last_name}</p>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-warning uppercase tracking-wide">Sin admin asignado</p>
            <p className="text-[10px] text-muted-foreground">Asigna un admin para validar asistencia.</p>
          </div>
        )}
      </div>

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
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={handleConfirmAll} disabled={acting === "all"}>
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
          const isAdmin = a.employee_id === shiftAdminId;
          return (
            <div key={a.id}>
              <div className={cn(
                "flex items-center justify-between rounded-lg px-2.5 py-1.5 border transition-colors",
                conf?.status === "present" && "bg-earning/5 border-earning/20",
                conf?.status === "absent" && "bg-destructive/5 border-destructive/20",
                !conf && "border-border",
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <EmployeeIdentityRow
                    firstName={emp.first_name}
                    lastName={emp.last_name}
                    avatarUrl={emp.avatar_url}
                    gender={emp.gender}
                    size="sm"
                    secondary={conf ? (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2 w-2" />
                        {format(new Date(conf.confirmed_at), "HH:mm")}
                      </span>
                    ) : undefined}
                  />
                  {isAdmin && (
                    <span className="text-[7px] font-bold text-primary bg-primary/10 px-1 rounded shrink-0">ADMIN</span>
                  )}
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
                        className={cn("p-1 rounded-md transition-colors", conf?.status === "present" ? "text-earning bg-earning/10" : "text-muted-foreground hover:text-earning hover:bg-earning/5")}
                        title="Marcar presente"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleConfirm(a, "absent")}
                        disabled={acting === a.id}
                        className={cn("p-1 rounded-md transition-colors", conf?.status === "absent" ? "text-destructive bg-destructive/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/5")}
                        title="Marcar ausente"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { setNoteForAssignment(noteForAssignment === a.id ? null : a.id); setNoteText(conf?.notes || ""); }}
                        className={cn("p-1 rounded-md transition-colors", conf?.notes ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/5")}
                        title="Agregar nota"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {/* Confirmation note */}
              {conf?.notes && noteForAssignment !== a.id && (
                <p className="text-[10px] text-muted-foreground ml-10 mt-0.5 italic">📝 {conf.notes}</p>
              )}
              {/* Note input */}
              {noteForAssignment === a.id && canManage && (
                <div className="ml-10 mt-1 flex items-end gap-1">
                  <Textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Nota operacional..."
                    rows={1}
                    className="text-[10px] resize-none flex-1 min-h-[28px]"
                  />
                  <Button
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={() => handleConfirm(a, conf?.status as "present" | "absent" || "present", noteText.trim())}
                    disabled={acting === a.id}
                  >
                    Guardar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
