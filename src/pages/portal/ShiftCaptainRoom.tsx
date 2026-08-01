/**
 * ShiftCaptainRoom — Mobile-first "Turno en vivo" room for the captain.
 *
 * Renders at /portal/shift-captain/:shiftId. Gated on:
 *   • canAccessAdminForCompany(shift.company_id)  OR
 *   • shift.shift_admin_id === effectiveEmployeeId
 *
 * Strictly composes existing modules (LiveShiftBoard, CaptainNextActionCard,
 * ShiftCloseoutSection). No payroll / time_entries / attendance / RLS /
 * schema writes here. Closeout uses the single existing form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CalendarDays, Clock, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiveShiftBoard } from "@/components/shifts/LiveShiftBoard";
import { CaptainNextActionCard } from "@/components/shifts/CaptainNextActionCard";
import { ShiftCloseoutSection } from "@/components/shifts/closeout/ShiftCloseoutSection";
import type { Assignment, Employee } from "@/components/shifts/types";
import { cn } from "@/lib/utils";
import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";

interface ShiftRow {
  id: string;
  company_id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  slots: number | null;
  shift_code: string | null;
  shift_ref: string | null;
  shift_admin_id: string | null;
  status: string;
}

type CloseoutStatusLite = "draft" | "submitted" | "reviewed" | "rejected" | null;

function statusChip(closeout: CloseoutStatusLite, reviewStatus: string | null) {
  if (closeout === "reviewed" && reviewStatus === "approved")
    return { label: "Horas aprobadas", tone: "success" as const };
  if (closeout === "submitted")
    return { label: "Revisión de horas pendiente", tone: "info" as const };
  if (closeout === "draft")
    return { label: "Cierre en borrador", tone: "warning" as const };
  return { label: "En operación", tone: "live" as const };
}

const TONE: Record<string, string> = {
  live: "bg-primary/10 text-primary border-primary/30",
  info: "bg-primary/10 text-primary border-primary/30",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-700 border-amber-500/30",
};

export default function ShiftCaptainRoom() {
  const { shiftId } = useParams<{ shiftId: string }>();
  const navigate = useNavigate();
  const { canAccessAdminForCompany } = useAuth();
  const { effectiveEmployeeId } = useEffectiveEmployee();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [closeoutStatus, setCloseoutStatus] = useState<CloseoutStatusLite>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);

  const closeoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!shiftId) return;
    (async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("scheduled_shifts")
        .select(
          "id, company_id, title, date, start_time, end_time, slots, shift_code, shift_ref, shift_admin_id, status",
        )
        .eq("id", shiftId)
        .maybeSingle();
      if (cancelled) return;
      if (!s) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      const canCompanyAdmin = canAccessAdminForCompany(s.company_id);
      const isShiftAdmin =
        !!effectiveEmployeeId && s.shift_admin_id === effectiveEmployeeId;
      const ok = canCompanyAdmin || isShiftAdmin;
      setAllowed(ok);
      setShift(s as ShiftRow);
      if (!ok) {
        setLoading(false);
        return;
      }

      const [asgRes, coRes] = await Promise.all([
        supabase
          .from("shift_assignments")
          .select("id, shift_id, employee_id, status, assignment_role, role_slot_id")
          .eq("shift_id", shiftId),
        supabase
          .from("shift_closeout_reports")
          .select("status, review_status")
          .eq("shift_id", shiftId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const asgs = (asgRes.data ?? []) as Assignment[];
      setAssignments(asgs);
      setCloseoutStatus((coRes.data?.status as CloseoutStatusLite) ?? null);
      setReviewStatus((coRes.data?.review_status as string | null) ?? null);

      const empIds = Array.from(
        new Set(
          [
            ...asgs.map((a) => a.employee_id),
            s.shift_admin_id ?? null,
          ].filter(Boolean) as string[],
        ),
      );
      if (empIds.length) {
        const { data: emps } = await supabase
          .from("employees")
          .select(
            "id, first_name, last_name, avatar_url, phone_number, has_car, can_drive",
          )
          .in("id", empIds);
        if (!cancelled) setEmployees((emps ?? []) as Employee[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shiftId, canAccessAdminForCompany, effectiveEmployeeId]);

  const chip = useMemo(
    () => statusChip(closeoutStatus, reviewStatus),
    [closeoutStatus, reviewStatus],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!shift || allowed === false) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          No tienes acceso a este turno como encargado.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/portal/clock")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver al reloj
        </Button>
      </div>
    );
  }

  const dateLabel = (() => {
    try {
      return format(parseISO(`${shift.date}T12:00:00`), "EEE d MMM", { locale: es });
    } catch {
      return shift.date;
    }
  })();
  const identity = getShiftDisplayIdentity(shift);

  return (
    <div className="min-h-screen bg-background pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-3 py-2.5 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 -ml-1"
            onClick={() => navigate(-1)}
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-primary">
                Modo encargado · {identity.primaryRef}
              </p>
            </div>
            <p className="text-[14px] font-bold text-foreground truncate leading-tight mt-0.5">
              {shift.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {dateLabel}
              </span>
              <span className="inline-flex items-center gap-1 opacity-80">
                <Clock className="h-3 w-3" />
                <span className="uppercase tracking-wide text-[9.5px] font-semibold opacity-70">Programado</span>
                <span className="tabular-nums">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>
              </span>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
              TONE[chip.tone] ?? "",
            )}
          >
            {chip.label}
          </Badge>
        </div>
      </header>

      <main className="px-3 pt-3 space-y-3">
        {/* Captain next action */}
        <CaptainNextActionCard
          shift={{
            id: shift.id,
            date: shift.date,
            start_time: shift.start_time,
            end_time: shift.end_time,
          }}
          onOpenCloseout={() =>
            closeoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        />

        {/* Estado real del turno — real attendance is the primary content.
            Scheduled time stays in the header as small context only. */}
        <section aria-label="Estado real del turno" className="space-y-2">
          <div className="flex items-center gap-2 px-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground">
              Estado real del turno
            </p>
            <span className="text-[10px] text-muted-foreground/70">
              · fichajes reales, no programados
            </span>
          </div>
          <LiveShiftBoard
            shiftId={shift.id}
            companyId={shift.company_id}
            shiftDate={shift.date}
            startTime={shift.start_time}
            endTime={shift.end_time}
            slots={shift.slots ?? 0}
            assignments={assignments}
            employees={employees}
            shiftAdminId={shift.shift_admin_id}
          />
        </section>

        {/* Closeout — single source of truth, no duplicate form */}
        <div ref={closeoutRef} className="scroll-mt-20">
          <ShiftCloseoutSection
            shiftId={shift.id}
            companyId={shift.company_id}
            employeeId={effectiveEmployeeId ?? null}
            canSubmit={true}
            canReview={canAccessAdminForCompany(shift.company_id)}
            role={
              canAccessAdminForCompany(shift.company_id) ? "admin" : "captain"
            }
          />
        </div>

        <p className="text-[10.5px] text-muted-foreground/80 leading-snug text-center px-4 pt-1">
          Tu responsabilidad como encargado termina al enviar el cierre. La
          revisión de horas y la aprobación final continúan después. No genera
          pagos.
        </p>
      </main>
    </div>
  );
}
