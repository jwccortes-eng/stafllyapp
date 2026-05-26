/**
 * PortalCaptainEntryCard
 * ─────────────────────────────────────────────────────────────────────
 * Mobile bridge from worker portal → admin/captain shift operations.
 *
 * Renders an inline "Modo encargado" card only when the logged-in
 * worker is ALSO authorized to manage the shift. Authorization is
 * any of:
 *   • shift.shift_admin_id === effectiveEmployeeId
 *   • canAccessAdminForCompany(companyId) === true
 *
 * Read-only. No payroll / time_entries / RLS / schema impact.
 * CTA navigates to the existing /app/shift-ops?id=… surface — this
 * does NOT create a second closeout flow.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ChevronRight } from "lucide-react";

interface Props {
  shiftId: string;
  companyId: string | null;
  employeeId: string | null;
  /** Whether the worker is currently clocked in to this shift. */
  isClockedIn: boolean;
  /** Whether the worker has a completed entry for this shift today. */
  workerCompleted: boolean;
}

type CloseoutStatus = "none" | "draft" | "submitted" | "reviewed";

export function PortalCaptainEntryCard({
  shiftId,
  companyId,
  employeeId,
  isClockedIn,
  workerCompleted,
}: Props) {
  const navigate = useNavigate();
  const { canAccessAdminForCompany } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [closeoutStatus, setCloseoutStatus] = useState<CloseoutStatus>("none");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!shiftId || !companyId) { setLoading(false); return; }
      const isCompanyAdmin = canAccessAdminForCompany(companyId);

      const { data: shiftRow } = await supabase
        .from("scheduled_shifts")
        .select("shift_admin_id")
        .eq("id", shiftId)
        .maybeSingle();

      const isShiftAdmin =
        !!employeeId && shiftRow?.shift_admin_id === employeeId;

      const can = isCompanyAdmin || isShiftAdmin;
      if (cancelled) return;
      setAllowed(can);

      if (can) {
        const { data: co } = await supabase
          .from("shift_closeout_reports")
          .select("status")
          .eq("shift_id", shiftId)
          .maybeSingle();
        if (!cancelled) {
          setCloseoutStatus(((co?.status as CloseoutStatus) ?? "none"));
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [shiftId, companyId, employeeId, canAccessAdminForCompany]);

  if (loading || !allowed) return null;

  // ── State-aware copy ────────────────────────────────────────────────
  let title = "También eres encargado de este turno";
  let body = "Supervisa entradas, salidas y novedades del equipo.";

  if (closeoutStatus === "submitted" || closeoutStatus === "reviewed") {
    body =
      closeoutStatus === "reviewed"
        ? "Tu cierre ya fue revisado por María."
        : "Tu cierre fue enviado. María revisará las horas.";
  } else if (workerCompleted) {
    body =
      "Tu registro quedó guardado. Como encargado, ahora revisa y envía el cierre del turno.";
  } else if (isClockedIn) {
    body = "Estás en turno. Supervisa entradas, salidas y novedades del equipo.";
  }

  return (
    <section className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.04] overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-primary">
          Modo encargado
        </span>
      </div>
      <div className="px-4 pb-4">
        <p className="text-[13.5px] font-semibold text-foreground leading-tight">
          {title}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground/85 leading-snug">
          {body}
        </p>
        <Button
          size="sm"
          className="mt-3 w-full h-10 text-[13px] font-semibold"
          onClick={() => navigate(`/portal/shift-captain/${shiftId}`)}
        >
          Abrir modo encargado
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </section>
  );
}
