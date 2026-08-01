import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  type ShiftCloseout,
  type CloseoutRole,
  type EvidencePacket,
  getShiftCloseout,
  getShiftEvidencePacket,
} from "@/lib/shifts/closeout";
import { ValidationDeepLink } from "@/components/validation/ValidationDeepLink";
import { CloseoutSummaryCard } from "./CloseoutSummaryCard";
import { CaptainCloseoutForm } from "./CaptainCloseoutForm";
import { EvidencePacketCard } from "./EvidencePacketCard";
import { CorrectionsReviewPanel } from "../corrections/CorrectionsReviewPanel";

const PRIVILEGED_REVIEW_ROLES = new Set(["developer", "owner", "founder"]);

interface Props {
  shiftId: string;
  companyId: string;
  employeeId?: string | null;
  /** True when current user is a shift admin/captain or admin. */
  canSubmit: boolean;
  /** True when current user can review (admin/manager/owner/developer). */
  canReview: boolean;
  /** True when current user can do final operational approval (Keury). */
  canFinalApprove?: boolean;
  role?: CloseoutRole;
}

export function ShiftCloseoutSection({
  shiftId,
  companyId,
  employeeId,
  canSubmit,
  canReview,
  canFinalApprove = false,
  role,
}: Props) {
  const { user, allRoles } = useAuth();
  const [closeout, setCloseout] = useState<ShiftCloseout | null>(null);
  const [evidence, setEvidence] = useState<EvidencePacket | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getShiftCloseout(shiftId), getShiftEvidencePacket(shiftId)])
      .then(([c, ev]) => {
        if (cancelled) return;
        setCloseout(c);
        setEvidence(ev);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  const status = closeout?.status ?? null;
  const reviewed = status === "reviewed" || status === "rejected";
  const submitted = status === "submitted";

  // Role separation / self-review guard.
  // The captain who submitted the closeout must not review their own hours
  // unless they are a privileged platform role (developer/owner/founder).
  const isSelfSubmitter =
    !!user?.id && !!closeout?.submitted_by && closeout.submitted_by === user.id;
  const isPrivilegedReviewer = [...allRoles].some((r) =>
    PRIVILEGED_REVIEW_ROLES.has(r),
  );
  const selfReviewBlocked = isSelfSubmitter && !isPrivilegedReviewer;
  const selfReviewWarn = isSelfSubmitter && isPrivilegedReviewer;

  // Captain edit form is only shown before submission. After submission the
  // captain sees a read-only "Cierre enviado" panel + summary. Reviewer flow
  // handles any correction requests via the existing AdminCloseoutReview UI.
  const showForm = canSubmit && !reviewed && !submitted;
  const showReview = canReview && submitted && !selfReviewBlocked;
  const showFinal =
    canFinalApprove &&
    status === "reviewed" &&
    closeout?.review_status === "approved";

  return (
    <section aria-label="Cierre del turno">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Cierre del turno</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <EvidencePacketCard
            packet={evidence}
            incidents={closeout?.incident_count ?? 0}
          />

          {/* Captain "submitted" panel — read-only handoff signal. */}
          {submitted && canSubmit ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Cierre enviado
                </p>
              </div>
              <p className="text-[12.5px] text-emerald-900/80 dark:text-emerald-200/80 leading-snug">
                Tu responsabilidad como encargado quedó completa. El cierre
                pasará a revisión de horas.
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Si necesitas corregir algo, pide al revisor de horas que
                solicite la corrección desde su panel.
              </p>
            </div>
          ) : null}

          <CloseoutSummaryCard closeout={closeout} />

          {canReview && submitted && selfReviewBlocked ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Revisión de horas pendiente
                </p>
              </div>
              <p className="text-[12.5px] text-amber-900/80 dark:text-amber-200/80 leading-snug">
                La revisión de horas la debe completar otro administrador.
                No puedes revisar un cierre que tú mismo enviaste.
              </p>
            </div>
          ) : null}

          {showReview && selfReviewWarn ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <p className="text-[12.5px] text-amber-900 dark:text-amber-200 leading-snug">
                  Estás revisando un cierre que tú mismo enviaste. Procede solo
                  si no hay otro revisor disponible.
                </p>
              </div>
            </div>
          ) : null}

          {canReview ? (
            <CorrectionsReviewPanel shiftId={shiftId} />
          ) : null}

          {/* OX-4.4 — la decisión terminal del cierre vive en el Centro de
              Validación. Aquí queda el resumen y el acceso directo. */}
          {(showReview || showFinal) && closeout ? (
            <ValidationDeepLink
              shiftId={shiftId}
              summary={
                showFinal
                  ? "Aprobación final pendiente"
                  : "Cierre enviado, pendiente de revisión"
              }
              progress={`${closeout.incident_count ?? 0} incidencia(s) · ${closeout.no_show_count ?? 0} no-show(s)`}
              label={showFinal ? "Firmar en el Centro de Validación" : "Revisar en el Centro de Validación"}
            />
          ) : null}

          {showForm && user?.id ? (
            <CaptainCloseoutForm
              companyId={companyId}
              shiftId={shiftId}
              userId={user.id}
              employeeId={employeeId ?? null}
              role={role ?? (canReview ? "admin" : "captain")}
              current={closeout}
              evidence={evidence}
              onSaved={(next) => setCloseout(next)}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
