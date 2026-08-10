import { getAssignableWorkers } from "@/lib/shifts/assignable-workers";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, Phone, UserPlus, Zap } from "lucide-react";
import { WorkerCard } from "@/components/ocs";

interface ReplacementSuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string;
  shiftTitle: string;
  shiftDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  companyId: string;
  /** IDs of employees already assigned (to exclude) */
  excludeEmployeeIds: string[];
  onAssigned?: () => void;
}

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  employee_role: string | null;
  has_car: string | null;
  rep_score: number | null;
  total_shifts: number;
  no_show_count: number;
  score: number;
  tags: string[];
}

export function ReplacementSuggestionDialog({
  open, onOpenChange, shiftId, shiftTitle, shiftDate, shiftStartTime, shiftEndTime,
  companyId, excludeEmployeeIds, onAssigned,
}: ReplacementSuggestionDialogProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);

    // 1. Get all active employees for this company, excluding already assigned
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, avatar_url, employee_role, has_car, user_id, is_active, added_via, worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("is_active", true);

    if (!employees || employees.length === 0) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    // Misma población canónica que el resto de superficies de staffing.
    const available = getAssignableWorkers(employees as never[]).filter(
      (e: any) => !excludeEmployeeIds.includes(e.id),
    ) as typeof employees;

    // 2. Check for overlapping shifts on the same date
    const { data: busyAssignments } = await supabase
      .from("shift_assignments")
      .select("employee_id, scheduled_shifts!inner(date, start_time, end_time)")
      .in("employee_id", available.map(e => e.id))
      .eq("scheduled_shifts.date", shiftDate)
      .not("status", "in", '("rejected","removed")') as any;

    const busySet = new Set<string>();
    for (const ba of busyAssignments ?? []) {
      const s = ba.scheduled_shifts;
      // Check time overlap
      if (shiftStartTime < s.end_time && shiftEndTime > s.start_time) {
        busySet.add(ba.employee_id);
      }
    }

    // 3. Get reputation scores via worker_profiles
    const userIds = available.map(e => e.user_id).filter(Boolean);
    let repMap = new Map<string, { score: number; shifts: number; noShows: number }>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("worker_profiles")
        .select("user_id, id")
        .in("user_id", userIds);

      if (profiles && profiles.length > 0) {
        const wpIds = profiles.map(p => p.id);
        const { data: scores } = await supabase
          .from("rep_scores")
          .select("worker_profile_id, overall_score, total_completed_shifts, no_show_count")
          .in("worker_profile_id", wpIds);

        const wpToUser = new Map<string, string>(profiles.map(p => [p.id, p.user_id]));
        for (const s of scores ?? []) {
          const uid = wpToUser.get(s.worker_profile_id);
          if (uid) {
            repMap.set(uid, {
              score: Number(s.overall_score ?? 50),
              shifts: s.total_completed_shifts ?? 0,
              noShows: s.no_show_count ?? 0,
            });
          }
        }
      }
    }

    // 4. Get recent assignment count (last 30 days) for experience signal
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const { data: recentAssignments } = await supabase
      .from("shift_assignments")
      .select("employee_id")
      .in("employee_id", available.map(e => e.id))
      .gte("created_at", thirtyDaysAgo)
      .in("status", ["confirmed", "accepted"]);

    const recentCountMap = new Map<string, number>();
    for (const ra of recentAssignments ?? []) {
      recentCountMap.set(ra.employee_id, (recentCountMap.get(ra.employee_id) ?? 0) + 1);
    }

    // 5. Score and rank candidates
    const scored: Candidate[] = available.map(emp => {
      const isBusy = busySet.has(emp.id);
      const rep = emp.user_id ? repMap.get(emp.user_id) : undefined;
      const recentCount = recentCountMap.get(emp.id) ?? 0;

      // Scoring: lower = worse, higher = better
      let score = 0;
      const tags: string[] = [];

      // Availability is king
      if (isBusy) {
        score -= 1000;
        tags.push("ocupado");
      } else {
        tags.push("disponible");
        score += 100;
      }

      // Reputation score (0-100 mapped to 0-50 points)
      const repScore = rep?.score ?? 50;
      score += repScore * 0.5;
      if (repScore >= 70) tags.push("alta reputación");

      // Recent activity bonus (active workers are better)
      if (recentCount >= 3) { score += 20; tags.push("frecuente"); }
      else if (recentCount >= 1) score += 10;

      // No-show penalty
      if (rep?.noShows && rep.noShows > 0) {
        score -= rep.noShows * 15;
        if (rep.noShows >= 2) tags.push("no-shows");
      }

      // Has car bonus
      if (emp.has_car === "yes") { score += 5; tags.push("con vehículo"); }

      return {
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        phone_number: emp.phone_number ?? null,
        avatar_url: emp.avatar_url ?? null,
        employee_role: emp.employee_role ?? null,
        has_car: emp.has_car ?? null,
        rep_score: repScore,
        total_shifts: rep?.shifts ?? 0,
        no_show_count: rep?.noShows ?? 0,
        score,
        tags,
      };
    });

    // Sort by score descending, filter out busy ones to bottom
    scored.sort((a, b) => b.score - a.score);

    setCandidates(scored);
    setLoading(false);
  }, [companyId, excludeEmployeeIds, shiftId, shiftDate, shiftStartTime, shiftEndTime]);

  useEffect(() => {
    if (open) loadCandidates();
  }, [open, loadCandidates]);

  const assignEmployee = async (employeeId: string) => {
    setAssigning(employeeId);
    try {
      // Alta idempotente y con validación de elegibilidad: sin inserts directos.
      const { error } = await supabase.rpc("assign_worker_to_shift" as any, {
        p_shift_id: shiftId,
        p_employee_id: employeeId,
        p_assignment_role: "staff",
        p_reason: "replacement",
        p_source: "replacement_dialog",
      } as any);

      if (error) throw error;
      toast.success("✅ Empleado asignado como reemplazo");
      onAssigned?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al asignar", { description: err.message });
    } finally {
      setAssigning(null);
    }
  };

  const availableCandidates = candidates.filter(c => !c.tags.includes("ocupado"));
  const busyCandidates = candidates.filter(c => c.tags.includes("ocupado"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Sugerir reemplazo
          </DialogTitle>
          <DialogDescription className="text-xs">
            {shiftTitle} — {shiftDate} {shiftStartTime.slice(0, 5)}–{shiftEndTime.slice(0, 5)}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-5 pb-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No hay empleados disponibles para reemplazo
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Available section */}
              {availableCandidates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-earning" />
                    Disponibles ({availableCandidates.length})
                  </p>
                  {availableCandidates.map((c, i) => (
                    <CandidateRow key={c.id} candidate={c} rank={i + 1} onAssign={assignEmployee} assigning={assigning} />
                  ))}
                </div>
              )}

              {/* Busy section */}
              {busyCandidates.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Ocupados ({busyCandidates.length})
                  </p>
                  {busyCandidates.slice(0, 5).map((c, i) => (
                    <CandidateRow key={c.id} candidate={c} rank={null} onAssign={assignEmployee} assigning={assigning} disabled />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ candidate: c, rank, onAssign, assigning, disabled }: {
  candidate: Candidate;
  rank: number | null;
  onAssign: (id: string) => void;
  assigning: string | null;
  disabled?: boolean;
}) {
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  const extraTags = c.tags.filter(t => t !== "disponible" && t !== "ocupado");
  const facts: string[] = [];
  if (typeof c.rep_score === "number") facts.push(`Reputación ${Math.round(c.rep_score)}/100`);
  if (c.total_shifts > 0) facts.push(`${c.total_shifts} turnos`);

  return (
    <WorkerCard
      name={name}
      role={c.employee_role ?? undefined}
      avatarUrl={c.avatar_url}
      status={disabled ? "blocked" : "ready"}
      statusLabel={disabled ? "Ocupado" : rank === 1 ? "Mejor reemplazo" : "Disponible"}
      completedShifts={c.total_shifts > 0 ? c.total_shifts : undefined}
      skills={extraTags}
      blocker={disabled ? "Ya tiene un turno en este horario." : null}
      recommendation={facts.length > 0 ? facts.join(" · ") : undefined}
      variant="compact"
      action={
        disabled
          ? undefined
          : {
              label: "Asignar",
              icon: UserPlus,
              loading: assigning === c.id,
              onClick: () => onAssign(c.id),
              "aria-label": `Asignar a ${name} como reemplazo`,
            }
      }
      actions={
        c.phone_number
          ? [
              {
                label: "Contactar",
                icon: Phone,
                onClick: () =>
                  window.open(
                    `https://wa.me/${c.phone_number!.replace(/\D/g, "")}`,
                    "_blank",
                    "noopener,noreferrer",
                  ),
                "aria-label": `Contactar a ${name}`,
              },
            ]
          : undefined
      }
    />
  );
}
