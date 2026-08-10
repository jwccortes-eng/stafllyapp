/**
 * P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 2
 * Motor PURO de plan de consolidación (DRY RUN).
 *
 * Responde: "si estos registros son la misma persona, ¿cómo se podrían
 * consolidar de forma segura y qué impacto tendría?".
 *
 * Este módulo NO ejecuta nada: no fusiona, no reasigna, no mueve horas,
 * documentos, payroll ni cuentas de acceso. Solo describe un plan y marca
 * cada dominio como SAFE / REVIEW_REQUIRED / BLOCKED.
 */

import type { IdentityGroup, IdentityRecord } from "@/lib/identity/person-truth";

/* ------------------------------------------------------------------ */
/* Evidencia por registro (la provee el read model, no se calcula aquí) */
/* ------------------------------------------------------------------ */

export interface RecordEvidence {
  employeeId: string;
  assignments: number;
  lastAssignmentAt?: string | null;
  timeEntries: number;
  approvedTimeEntries: number;
  payrollReferences: number;
  documents: number;
  legalDocuments: number;
  hasAvailability: boolean;
  reviews: number;
  authUserId?: string | null;
  externalId?: string | null;
  governmentIdentifier?: string | null;
  companyId?: string | null;
}

export const EMPTY_EVIDENCE = (employeeId: string): RecordEvidence => ({
  employeeId,
  assignments: 0,
  timeEntries: 0,
  approvedTimeEntries: 0,
  payrollReferences: 0,
  documents: 0,
  legalDocuments: 0,
  hasAvailability: false,
  reviews: 0,
});

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export type DomainStatus = "SAFE" | "REVIEW_REQUIRED" | "BLOCKED";

export type MergeDomainKey =
  | "identity"
  | "aliases"
  | "portal_auth"
  | "assignments"
  | "time_entries"
  | "payroll"
  | "documents"
  | "availability"
  | "reputation"
  | "external_ids"
  | "cross_tenant"
  | "audit";

export interface MergeDomainPlan {
  key: MergeDomainKey;
  label: string;
  status: DomainStatus;
  /** Qué haría la consolidación en este dominio (conceptual). */
  action: string;
  /** Por qué ese estado. */
  reason: string;
}

export interface MergePlan {
  groupKey: string;
  /** Registro destino propuesto (no confirmado). */
  targetId: string | null;
  legacyIds: string[];
  overall: DomainStatus;
  domains: MergeDomainPlan[];
  blockers: string[];
  /** Frase corta para el operador. */
  headline: string;
  /** Todo plan es una simulación. Siempre true en Phase 2. */
  dryRun: true;
}

const LABELS: Record<MergeDomainKey, string> = {
  identity: "Identidad principal",
  aliases: "Nombres y alias históricos",
  portal_auth: "Acceso al portal",
  assignments: "Historia de servicios",
  time_entries: "Horas registradas",
  payroll: "Nómina",
  documents: "Documentos",
  availability: "Disponibilidad",
  reputation: "Reputación y evaluaciones",
  external_ids: "Identificadores externos",
  cross_tenant: "Relación entre empresas",
  audit: "Auditoría",
};

const WORST: Record<DomainStatus, number> = {
  SAFE: 0,
  REVIEW_REQUIRED: 1,
  BLOCKED: 2,
};

function worst(a: DomainStatus, b: DomainStatus): DomainStatus {
  return WORST[a] >= WORST[b] ? a : b;
}

/**
 * Genera el plan de consolidación en seco para un grupo de identidad.
 *
 * @param group grupo detectado en Phase 1
 * @param evidence evidencia por registro (read-only)
 * @param targetIdOverride destino elegido por el admin (si ya eligió uno)
 */
export function buildMergePlan(
  group: IdentityGroup,
  evidence: Record<string, RecordEvidence>,
  targetIdOverride?: string | null,
): MergePlan {
  const targetId = targetIdOverride ?? group.primary?.candidateId ?? null;
  const records = group.records;
  const legacyIds = records.map((r) => r.id).filter((id) => id !== targetId);
  const ev = (id: string) => evidence[id] ?? EMPTY_EVIDENCE(id);
  const all = records.map((r) => ev(r.id));
  const target = targetId ? records.find((r) => r.id === targetId) ?? null : null;

  const domains: MergeDomainPlan[] = [];
  const blockers: string[] = [];

  /* -------- identidad -------- */
  domains.push({
    key: "identity",
    label: LABELS.identity,
    status: targetId ? (group.verdict === "AMBIGUOUS" ? "REVIEW_REQUIRED" : "SAFE") : "BLOCKED",
    action: targetId
      ? `Conservar ${describe(target)} como identidad principal y marcar el resto como registros históricos vinculados.`
      : "Sin registro destino recomendado: el administrador debe elegir cuál conserva la identidad.",
    reason: targetId
      ? group.verdict === "AMBIGUOUS"
        ? "El veredicto es ambiguo: hay señales fuertes que también podrían corresponder a dos personas distintas."
        : `Recomendado por: ${group.primary?.reason ?? "señales operativas"}.`
      : "No hay evidencia suficiente para proponer un destino.",
  });

  /* -------- alias -------- */
  domains.push({
    key: "aliases",
    label: LABELS.aliases,
    status: "SAFE",
    action:
      "Preservar los nombres históricos como alias del registro principal, sin sobrescribir el nombre actual.",
    reason: "Los alias son aditivos: no borran ni cambian datos existentes.",
  });

  /* -------- portal / auth -------- */
  const authUsers = Array.from(
    new Set(all.map((e) => e.authUserId).filter(Boolean) as string[]),
  );
  if (authUsers.length > 1) {
    domains.push({
      key: "portal_auth",
      label: LABELS.portal_auth,
      status: "BLOCKED",
      action: "No tocar. Existen dos cuentas de acceso distintas.",
      reason:
        "Dos cuentas de acceso activas: consolidar sin decisión explícita dejaría a una persona sin portal o uniría a dos personas reales.",
    });
    blockers.push("Dos cuentas de acceso distintas en el grupo.");
  } else if (authUsers.length === 1) {
    const holder = all.find((e) => e.authUserId);
    const holderIsTarget = holder?.employeeId === targetId;
    domains.push({
      key: "portal_auth",
      label: LABELS.portal_auth,
      status: holderIsTarget ? "SAFE" : "REVIEW_REQUIRED",
      action: holderIsTarget
        ? "El acceso ya vive en el registro destino: no hay cambios de cuenta."
        : "El acceso vive en un registro distinto al destino: requiere decisión explícita antes de cualquier cambio.",
      reason: holderIsTarget
        ? "Una sola cuenta y coincide con el destino propuesto."
        : "Mover un acceso afecta el login de una persona real.",
    });
    if (!holderIsTarget)
      blockers.push("El portal está en un registro distinto al destino propuesto.");
  } else {
    domains.push({
      key: "portal_auth",
      label: LABELS.portal_auth,
      status: "SAFE",
      action: "Ningún registro tiene acceso: no hay cuentas que reconciliar.",
      reason: "Sin cuentas de acceso involucradas.",
    });
  }

  /* -------- asignaciones -------- */
  const legacyAssignments = legacyIds.reduce((n, id) => n + ev(id).assignments, 0);
  domains.push({
    key: "assignments",
    label: LABELS.assignments,
    status: legacyAssignments > 0 ? "REVIEW_REQUIRED" : "SAFE",
    action:
      legacyAssignments > 0
        ? `Relacionar (no mover) ${legacyAssignments} servicios históricos de los registros legacy con la identidad principal.`
        : "No hay historia de servicios en los registros legacy.",
    reason:
      legacyAssignments > 0
        ? "Los servicios históricos se vinculan por referencia; reescribir employee_id rompería reportes y nómina cerrada."
        : "Sin impacto.",
  });

  /* -------- horas -------- */
  const approved = all.reduce((n, e) => n + e.approvedTimeEntries, 0);
  const anyHours = all.reduce((n, e) => n + e.timeEntries, 0);
  if (approved > 0) {
    domains.push({
      key: "time_entries",
      label: LABELS.time_entries,
      status: "BLOCKED",
      action: "No mover ninguna hora. Quedan asociadas a su registro original.",
      reason: `${approved} horas aprobadas: son evidencia de pago y no se reasignan en ninguna fase automática.`,
    });
    blockers.push(`${approved} horas aprobadas en el grupo.`);
  } else {
    domains.push({
      key: "time_entries",
      label: LABELS.time_entries,
      status: anyHours > 0 ? "REVIEW_REQUIRED" : "SAFE",
      action:
        anyHours > 0
          ? "Revisar manualmente las horas pendientes antes de cualquier consolidación."
          : "No hay horas registradas.",
      reason: anyHours > 0 ? `${anyHours} horas sin aprobar.` : "Sin impacto.",
    });
  }

  /* -------- payroll -------- */
  const payroll = all.reduce((n, e) => n + e.payrollReferences, 0);
  if (payroll > 0) {
    domains.push({
      key: "payroll",
      label: LABELS.payroll,
      status: "BLOCKED",
      action: "No tocar. La nómina procesada permanece intacta en cada registro.",
      reason: `${payroll} referencias de nómina procesada. Reasignarlas alteraría periodos cerrados.`,
    });
    blockers.push(`${payroll} referencias de nómina procesada.`);
  } else {
    domains.push({
      key: "payroll",
      label: LABELS.payroll,
      status: "SAFE",
      action: "Sin nómina procesada asociada al grupo.",
      reason: "Sin impacto financiero.",
    });
  }

  /* -------- documentos -------- */
  const docs = all.reduce((n, e) => n + e.documents, 0);
  const legal = all.reduce((n, e) => n + e.legalDocuments, 0);
  domains.push({
    key: "documents",
    label: LABELS.documents,
    status: legal > 0 ? "BLOCKED" : docs > 0 ? "REVIEW_REQUIRED" : "SAFE",
    action:
      docs > 0
        ? "Preservar los documentos en su registro original y mostrarlos como historia vinculada."
        : "No hay documentos que preservar.",
    reason:
      legal > 0
        ? `${legal} documentos legales o fiscales: no se reparentan nunca de forma automática.`
        : docs > 0
          ? `${docs} documentos requieren confirmación de a quién pertenecen.`
          : "Sin impacto.",
  });
  if (legal > 0) blockers.push(`${legal} documentos legales asociados.`);

  /* -------- disponibilidad -------- */
  const withAvailability = all.filter((e) => e.hasAvailability).length;
  domains.push({
    key: "availability",
    label: LABELS.availability,
    status: withAvailability > 1 ? "REVIEW_REQUIRED" : "SAFE",
    action:
      withAvailability > 1
        ? "Elegir qué configuración de disponibilidad queda vigente: hay más de una."
        : "Conservar la disponibilidad del registro destino.",
    reason:
      withAvailability > 1
        ? "Dos configuraciones distintas producirían un calendario contradictorio."
        : "Sin conflicto.",
  });

  /* -------- reputación -------- */
  const reviews = all.reduce((n, e) => n + e.reviews, 0);
  domains.push({
    key: "reputation",
    label: LABELS.reputation,
    status: reviews > 0 ? "REVIEW_REQUIRED" : "SAFE",
    action:
      reviews > 0
        ? `Relacionar ${reviews} evaluaciones con la persona, conservando la empresa que las emitió.`
        : "No hay evaluaciones asociadas.",
    reason:
      reviews > 0
        ? "La reputación es de la persona, pero cada evaluación pertenece a la empresa que la emitió."
        : "Sin impacto.",
  });

  /* -------- identificadores externos -------- */
  const externalIds = Array.from(
    new Set(all.map((e) => e.externalId).filter(Boolean) as string[]),
  );
  const govIds = Array.from(
    new Set(all.map((e) => e.governmentIdentifier).filter(Boolean) as string[]),
  );
  const idConflict = externalIds.length > 1 || govIds.length > 1;
  domains.push({
    key: "external_ids",
    label: LABELS.external_ids,
    status: idConflict ? "BLOCKED" : "SAFE",
    action: idConflict
      ? "No unificar identificadores. Conservar ambos y escalar la contradicción."
      : "Conservar el identificador externo existente en el registro destino.",
    reason: idConflict
      ? govIds.length > 1
        ? "Identificadores fiscales distintos: probablemente son dos personas."
        : "Dos identificadores externos distintos apuntan a personas distintas en el sistema de origen."
      : "Sin conflicto de identificadores.",
  });
  if (idConflict) blockers.push("Conflicto de identificadores externos o fiscales.");

  /* -------- cross tenant -------- */
  const tenants = Array.from(
    new Set(records.map((r) => r.company_id).filter(Boolean) as string[]),
  );
  domains.push({
    key: "cross_tenant",
    label: LABELS.cross_tenant,
    status: tenants.length > 1 ? "BLOCKED" : "SAFE",
    action:
      tenants.length > 1
        ? "No consolidar entre empresas. La continuidad de persona se reconoce en Passport, no fusionando registros."
        : "Todos los registros pertenecen a la misma empresa.",
    reason:
      tenants.length > 1
        ? "El historial de cada empresa es privado: unirlo filtraría datos entre organizaciones."
        : "Sin cruce de empresas.",
  });
  if (tenants.length > 1) blockers.push("El grupo cruza más de una empresa.");

  /* -------- auditoría -------- */
  domains.push({
    key: "audit",
    label: LABELS.audit,
    status: "SAFE",
    action:
      "Registrar quién revisó, qué señales existían y qué se decidió, sin borrar ningún registro legacy.",
    reason: "La auditoría es aditiva y reversible.",
  });

  const overall = domains.reduce<DomainStatus>((acc, d) => worst(acc, d.status), "SAFE");

  const headline =
    overall === "BLOCKED"
      ? "Consolidación bloqueada: hay evidencia financiera, legal o de identidad que no se puede mover."
      : overall === "REVIEW_REQUIRED"
        ? "Consolidación posible con decisiones humanas explícitas en los dominios marcados."
        : "Consolidación de bajo impacto: solo identidad, alias y auditoría.";

  return {
    groupKey: group.groupKey ?? group.key,
    targetId,
    legacyIds,
    overall,
    domains,
    blockers,
    headline,
    dryRun: true,
  };
}

function describe(r: IdentityRecord | null): string {
  if (!r) return "el registro destino";
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "sin nombre";
  return `${name} (${r.id.slice(0, 8)})`;
}

export const DOMAIN_STATUS_LABELS: Record<DomainStatus, string> = {
  SAFE: "Seguro",
  REVIEW_REQUIRED: "Requiere decisión",
  BLOCKED: "Bloqueado",
};

/* ------------------------------------------------------------------ */
/* Contradicciones del candidato principal                             */
/* ------------------------------------------------------------------ */

/**
 * Señales EN CONTRA del candidato propuesto. Sirven para que el admin
 * confirme con criterio en lugar de aceptar la sugerencia a ciegas.
 */
export function listPrimaryContradictions(
  group: IdentityGroup,
  evidence: Record<string, RecordEvidence>,
  targetId: string | null,
): string[] {
  if (!targetId) return ["No hay candidato propuesto."];
  const out: string[] = [];
  const ev = (id: string) => evidence[id] ?? EMPTY_EVIDENCE(id);
  const target = ev(targetId);
  const others = group.records.filter((r) => r.id !== targetId).map((r) => ev(r.id));

  if (others.some((o) => o.assignments > target.assignments))
    out.push("Otro registro tiene más historia de servicios que el candidato.");
  if (!target.authUserId && others.some((o) => o.authUserId))
    out.push("El portal activo está en otro registro.");
  if (target.documents === 0 && others.some((o) => o.documents > 0))
    out.push("Los documentos están en otro registro.");
  if (!target.externalId && others.some((o) => o.externalId))
    out.push("El identificador externo está en otro registro.");
  if (others.some((o) => o.approvedTimeEntries > target.approvedTimeEntries))
    out.push("Las horas aprobadas están mayormente en otro registro.");

  return out;
}
