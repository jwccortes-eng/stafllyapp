/**
 * OX-4.2 — Modelo puro del Team Hub.
 *
 * Responde una sola pregunta: ¿qué necesita este equipo para que la operación
 * continúe sin incertidumbre?
 *
 * Puro y sin dependencias de React/Supabase: sólo deriva secciones, resumen,
 * acción principal por persona y riesgos. Ninguna regla de negocio nueva —
 * reutiliza los estados que ya produce el backend.
 */

export type TeamSection = "ready" | "pending" | "attention" | "replacement" | "removed";

export interface TeamHubAssignmentLike {
  id: string;
  employee_id: string;
  status: string;
  response_status?: string | null;
  attendance_status?: string | null;
  assignment_role?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  responded_at?: string | null;
  import_batch_id?: string | null;
}

export const TEAM_SECTION_META: Record<
  TeamSection,
  { label: string; helper: string; order: number }
> = {
  ready: {
    label: "Listos",
    helper: "Confirmados o ya en sitio. No requieren acción.",
    order: 0,
  },
  pending: {
    label: "Pendientes",
    helper: "Aún no confirman. Contáctalos antes del turno.",
    order: 1,
  },
  attention: {
    label: "Atención",
    helper: "Riesgo activo: sin teléfono, tarde o ausente.",
    order: 2,
  },
  replacement: {
    label: "Reemplazos",
    helper: "Rechazaron o no se presentaron. Cubre el cupo.",
    order: 3,
  },
  removed: {
    label: "Removidos",
    helper: "Fuera del turno. Sólo referencia.",
    order: 4,
  },
};

export const TEAM_SECTION_ORDER: TeamSection[] = ["ready", "pending", "attention", "replacement", "removed"];

/** Clasifica una asignación en la sección operativa que le corresponde. */
export function teamSectionOf(
  a: TeamHubAssignmentLike,
  opts: { hasPhone?: boolean } = {},
): TeamSection {
  if (a.status === "removed") return "removed";
  if (a.attendance_status === "absent") return "replacement";
  if (a.response_status === "rejected" || a.status === "rejected") return "replacement";
  if (a.attendance_status === "late") return "attention";
  if (opts.hasPhone === false) return "attention";
  if (a.attendance_status === "present" || a.attendance_status === "checked_in") return "ready";
  if (a.status === "confirmed") return "ready";
  if (a.status === "accepted" && !a.import_batch_id) return "ready";
  return "pending";
}

export type WorkerActionKind = "confirm" | "contact" | "replace" | "manage" | "none";

/** Una sola acción principal por persona; el resto va a acciones secundarias. */
export function primaryWorkerAction(
  a: TeamHubAssignmentLike,
  opts: { hasPhone?: boolean; canManage?: boolean } = {},
): { kind: WorkerActionKind; label: string } {
  const canManage = opts.canManage !== false;
  const section = teamSectionOf(a, opts);
  if (section === "removed") return { kind: "none", label: "" };
  if (section === "replacement") {
    return canManage ? { kind: "replace", label: "Buscar reemplazo" } : { kind: "contact", label: "Contactar" };
  }
  if (opts.hasPhone === false) {
    return canManage ? { kind: "manage", label: "Agregar teléfono" } : { kind: "none", label: "" };
  }
  if (section === "pending") {
    return canManage ? { kind: "confirm", label: "Confirmar" } : { kind: "contact", label: "Contactar" };
  }
  return { kind: "contact", label: "Contactar" };
}

export interface TeamSummary {
  slots: number;
  assigned: number;
  missing: number;
  confirmed: number;
  pending: number;
  present: number;
  late: number;
  noShow: number;
  rejected: number;
  removed: number;
  withoutPhone: number;
  coverageRatio: number;
  /** El equipo está completo y sin pendientes ni riesgos. */
  isOperable: boolean;
}

export function summarizeTeam(
  assignments: TeamHubAssignmentLike[],
  slots: number,
  hasPhone: (employeeId: string) => boolean = () => true,
): TeamSummary {
  let confirmed = 0, pending = 0, present = 0, late = 0, noShow = 0, rejected = 0, removed = 0, withoutPhone = 0, assigned = 0;

  for (const a of assignments) {
    const phone = hasPhone(a.employee_id);
    const section = teamSectionOf(a, { hasPhone: phone });
    if (section === "removed") { removed += 1; continue; }
    if (a.attendance_status === "absent") noShow += 1;
    if (a.attendance_status === "late") late += 1;
    if (a.attendance_status === "present" || a.attendance_status === "checked_in") present += 1;
    if (a.response_status === "rejected" || a.status === "rejected") { rejected += 1; continue; }
    assigned += 1;
    if (!phone) withoutPhone += 1;
    if (a.status === "confirmed" || (a.status === "accepted" && !a.import_batch_id)) confirmed += 1;
    else pending += 1;
  }

  const missing = Math.max(0, slots - assigned);
  const coverageRatio = slots > 0 ? Math.min(1, assigned / slots) : assigned > 0 ? 1 : 0;

  return {
    slots, assigned, missing, confirmed, pending, present, late, noShow,
    rejected, removed, withoutPhone, coverageRatio,
    isOperable: missing === 0 && pending === 0 && noShow === 0 && withoutPhone === 0,
  };
}

export type TeamRiskKey =
  | "open_spots"
  | "unconfirmed"
  | "no_show"
  | "missing_phone"
  | "rejected"
  | "claims_pending"
  | "no_location";

export interface TeamRisk {
  key: TeamRiskKey;
  /** Qué hacer, en una frase accionable. */
  recommendation: string;
  /** Por qué el sistema lo señala. */
  because: string;
  /** Qué pasa si no se actúa. */
  impact: string;
  severity: "critical" | "warning" | "informational";
  actionLabel?: string;
}

/** Riesgos derivados de datos ya cargados. No consulta nada. */
export function detectTeamRisks(input: {
  summary: TeamSummary;
  claimsPending?: number;
  hasLocation?: boolean;
  hasMeetingPoint?: boolean;
}): TeamRisk[] {
  const { summary, claimsPending = 0, hasLocation = true, hasMeetingPoint = false } = input;
  const risks: TeamRisk[] = [];

  if (summary.noShow > 0) {
    risks.push({
      key: "no_show",
      recommendation: `Cubre ${summary.noShow} ${summary.noShow === 1 ? "ausencia" : "ausencias"} ahora`,
      because: `${summary.noShow} ${summary.noShow === 1 ? "persona fue marcada" : "personas fueron marcadas"} como ausente.`,
      impact: "El turno opera por debajo del equipo acordado con el cliente.",
      severity: "critical",
      actionLabel: "Buscar reemplazo",
    });
  }

  if (summary.missing > 0) {
    risks.push({
      key: "open_spots",
      recommendation: `Completa ${summary.missing} ${summary.missing === 1 ? "cupo" : "cupos"} del equipo`,
      because: `Hay ${summary.assigned} de ${summary.slots} posiciones cubiertas.`,
      impact: "El turno arranca incompleto y el cliente lo nota.",
      severity: summary.assigned === 0 ? "critical" : "warning",
      actionLabel: "Ver recomendados",
    });
  }

  if (summary.pending > 0) {
    risks.push({
      key: "unconfirmed",
      recommendation: `Confirma a ${summary.pending} ${summary.pending === 1 ? "persona" : "personas"}`,
      because: `${summary.pending} ${summary.pending === 1 ? "asignación sigue" : "asignaciones siguen"} sin respuesta.`,
      impact: "Sin confirmación no hay certeza de que se presenten.",
      severity: "warning",
      actionLabel: "Ver pendientes",
    });
  }

  if (summary.withoutPhone > 0) {
    risks.push({
      key: "missing_phone",
      recommendation: `Agrega teléfono a ${summary.withoutPhone} ${summary.withoutPhone === 1 ? "persona" : "personas"}`,
      because: "Sin teléfono no se puede llamar, enviar SMS ni WhatsApp.",
      impact: "Si algo cambia, no hay forma de avisarles a tiempo.",
      severity: "warning",
      actionLabel: "Ver equipo",
    });
  }

  if (summary.rejected > 0) {
    risks.push({
      key: "rejected",
      recommendation: `Reemplaza ${summary.rejected} ${summary.rejected === 1 ? "rechazo" : "rechazos"}`,
      because: `${summary.rejected} ${summary.rejected === 1 ? "persona rechazó" : "personas rechazaron"} el turno.`,
      impact: "Esos cupos siguen abiertos aunque figuren en la lista.",
      severity: "warning",
      actionLabel: "Ver recomendados",
    });
  }

  if (claimsPending > 0) {
    risks.push({
      key: "claims_pending",
      recommendation: `Decide ${claimsPending} ${claimsPending === 1 ? "solicitud" : "solicitudes"}`,
      because: "Hay trabajadores esperando respuesta para este turno.",
      impact: "Pueden tomar otro turno mientras esperan.",
      severity: "informational",
      actionLabel: "Ver solicitudes",
    });
  }

  if (!hasLocation) {
    risks.push({
      key: "no_location",
      recommendation: hasMeetingPoint ? "Agrega el lugar de trabajo" : "Agrega ubicación o punto de encuentro",
      because: hasMeetingPoint
        ? "Hay punto de encuentro, pero falta dónde se realiza el trabajo."
        : "El turno no tiene ubicación ni punto de encuentro.",
      impact: "El equipo puede no saber a dónde ir.",
      severity: "warning",
    });
  }

  const rank = { critical: 0, warning: 1, informational: 2 } as const;
  return risks.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Acción principal del equipo: completar o simplemente operar. */
export function teamPrimaryIntent(summary: TeamSummary): {
  label: string;
  meaning: string;
  kind: "complete" | "confirm" | "operate";
} {
  if (summary.missing > 0) {
    return {
      kind: "complete",
      label: "Completar equipo",
      meaning: `Faltan ${summary.missing} de ${summary.slots} posiciones.`,
    };
  }
  if (summary.pending > 0) {
    return {
      kind: "confirm",
      label: "Confirmar equipo",
      meaning: `${summary.pending} sin confirmar de ${summary.assigned} asignados.`,
    };
  }
  return {
    kind: "operate",
    label: "Operar turno",
    meaning: "Equipo completo y confirmado.",
  };
}
