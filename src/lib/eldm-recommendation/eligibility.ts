/**
 * ELDM Fase 1C — filtros duros de elegibilidad.
 *
 * Sólo reglas operativas canónicas. Un patrón de ELDM ("suele rechazar los
 * domingos") NUNCA se convierte en un filtro duro.
 */
import type {
  EligibilityBlocker,
  WorkerCandidateInput,
  WorkerRecommendationQuery,
} from "./types";

function norm(v: string): string {
  return v.trim().toLowerCase();
}

/** Devuelve los bloqueos operativos del candidato. Vacío = elegible. */
export function evaluateEligibility(
  candidate: WorkerCandidateInput,
  query: WorkerRecommendationQuery,
): EligibilityBlocker[] {
  const blockers: EligibilityBlocker[] = [];

  if (!candidate.belongsToCompany)
    blockers.push({ code: "not_in_company", text: "No pertenece a esta compañía." });

  if (!candidate.active)
    blockers.push({ code: "inactive", text: "El trabajador está inactivo." });

  if (candidate.accessBlocked)
    blockers.push({ code: "access_blocked", text: "Su acceso está bloqueado." });

  if (candidate.scheduleConflict)
    blockers.push({ code: "schedule_conflict", text: "Ya tiene un servicio superpuesto." });

  if (candidate.availability === "unavailable")
    blockers.push({ code: "confirmed_unavailable", text: "Confirmó que no está disponible." });

  switch (candidate.compliance) {
    case "missing":
      blockers.push({ code: "compliance_missing", text: "Falta documentación requerida." });
      break;
    case "expired":
      blockers.push({ code: "compliance_expired", text: "Documentación requerida vencida." });
      break;
    case "blocked":
      blockers.push({ code: "compliance_blocked", text: "Bloqueado por política de cumplimiento." });
      break;
  }

  if (query.requiredRole) {
    const role = norm(candidate.role ?? "");
    if (!role || !role.includes(norm(query.requiredRole)))
      blockers.push({ code: "role_not_met", text: `No cumple el rol requerido: ${query.requiredRole}.` });
  }

  const required = (query.requiredSkills ?? []).map(norm).filter(Boolean);
  if (required.length > 0) {
    const owned = new Set((candidate.skills ?? []).map(norm));
    const missing = required.filter((s) => !owned.has(s));
    if (missing.length > 0)
      blockers.push({
        code: "skill_not_met",
        text: `No tiene registrada la habilidad requerida: ${missing.join(", ")}.`,
      });
  }

  return blockers;
}
