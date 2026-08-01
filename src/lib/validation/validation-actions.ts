/**
 * OX-4.4 — Ejecutor de decisiones del Centro de Validación.
 *
 * Único punto donde el centro escribe. Reutiliza las funciones ya existentes
 * (`approveHours`, `returnHoursForCorrection`, `reviewShiftCloseout`,
 * `finalApproveCloseout`). No duplica reglas, no calcula payroll, no toca
 * `scheduled_shifts` ni `pay_periods`.
 */
import {
  approveHours,
  returnHoursForCorrection,
} from "@/lib/timeclock/hours-approval";
import {
  finalApproveCloseout,
  reviewShiftCloseout,
} from "@/lib/shifts/closeout";
import type {
  ValidationActionKind,
  ValidationItem,
} from "./validation-center-model";

export interface ValidationActionContext {
  companyId: string;
  userId: string;
}

export interface ValidationActionResult {
  /** Frase corta de éxito para el feedback OX-1. */
  fact: string;
  consequence: string;
}

/** ¿Esta acción escribe en base de datos? */
export function isTerminalAction(kind: ValidationActionKind): boolean {
  return (
    kind === "approve" ||
    kind === "reject" ||
    kind === "request_correction" ||
    kind === "mark_resolved"
  );
}

export async function executeValidationAction(
  item: ValidationItem,
  kind: ValidationActionKind,
  ctx: ValidationActionContext,
  reason?: string,
): Promise<ValidationActionResult> {
  if (!isTerminalAction(kind)) {
    throw new Error("Esta acción no ejecuta cambios.");
  }

  if (item.source === "time_entries") {
    if (kind === "approve") {
      await approveHours([item.recordId], {
        companyId: ctx.companyId,
        userId: ctx.userId,
        shiftId: item.relatedShiftId,
      });
      return {
        fact: "Las horas reales quedaron aprobadas.",
        consequence: "Payroll leerá estas horas en el siguiente corte.",
      };
    }
    // reject / request_correction devuelven el fichaje al worker.
    await returnHoursForCorrection(
      [item.recordId],
      (reason ?? "").trim(),
      {
        companyId: ctx.companyId,
        userId: ctx.userId,
        shiftId: item.relatedShiftId,
      },
    );
    return {
      fact: "El fichaje fue devuelto para corrección.",
      consequence: "Queda fuera de payroll hasta que se corrija y se apruebe.",
    };
  }

  // shift_closeout_reports
  if (kind === "reject" || kind === "request_correction") {
    await reviewShiftCloseout({
      closeout_id: item.recordId,
      status: "rejected",
      review_status: "rejected",
      review_notes: (reason ?? "").trim() || null,
    });
    return {
      fact: "El cierre fue devuelto al capitán.",
      consequence: "El turno no avanza hasta recibir un cierre corregido.",
    };
  }

  if (kind === "mark_resolved") {
    await reviewShiftCloseout({
      closeout_id: item.recordId,
      status: "reviewed",
      review_status: "approved",
      review_notes: (reason ?? "").trim() || null,
    });
    return {
      fact: "La revisión del cierre quedó registrada.",
      consequence: "Queda pendiente sólo la aprobación final operativa.",
    };
  }

  // approve: primera firma revisa, segunda firma es la aprobación final.
  if (item.validationType === "shift_closeout" && item.status === "under_review") {
    await finalApproveCloseout({
      closeout_id: item.recordId,
      final_approval_status: "approved",
      final_approval_notes: (reason ?? "").trim() || null,
    });
    return {
      fact: "Aprobación final firmada.",
      consequence: "El turno queda operacionalmente listo. No modifica payroll.",
    };
  }

  await reviewShiftCloseout({
    closeout_id: item.recordId,
    status: "reviewed",
    review_status: "approved",
    review_notes: (reason ?? "").trim() || null,
  });
  return {
    fact: "El cierre fue aprobado.",
    consequence: "La evidencia queda validada y auditada.",
  };
}
