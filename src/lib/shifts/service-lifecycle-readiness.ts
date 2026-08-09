/**
 * getServiceLifecycleReadiness — ÚNICA fuente canónica del ciclo de vida
 * operativo de un Servicio.
 *
 * PRINCIPIO: Stafly es un espejo de la realidad. Un Servicio puede existir con
 * información incompleta; cada acción exige SOLO los datos estrictamente
 * necesarios para ESA acción. PENDIENTE ≠ 0, APROXIMADO ≠ CONFIRMADO.
 *
 * Cinco compuertas independientes:
 *
 *   READY_TO_CREATE_DRAFT      → registrar el trabajo detectado
 *   READY_TO_STAFF             → empezar a asignar personal
 *   READY_TO_EXPORT_CONNECTEAM → crear el turno en Connecteam
 *   READY_TO_PUBLISH           → hacerlo visible/operativo en Stafly
 *   READY_TO_CLOSE             → cerrar la operación
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin BD, sin escrituras, sin efectos, sin React.
 *   No toca payroll, time_entries, horas, VWC, auth, RLS, tenants, ELDM,
 *   extracción de Smart Intake ni el contrato de assignments.
 *
 * No duplica reglas: publicación y export se delegan en
 * `getServiceOperationalReadiness` (que a su vez refleja
 * `validateShiftForExport`).
 */
import {
  getServiceOperationalReadiness,
  SERVICE_CLIENT_ANCHOR,
  type OperationalBlocker,
  type OperationalWarning,
  type ServiceOperationalReadiness,
  type ServiceOperationalReadinessInput,
} from "./service-operational-readiness";
import { SERVICE_JOB_SITE_ANCHOR, SERVICE_LOCATION_COPY } from "./service-publish-readiness";

export type LifecycleGate =
  | "create_draft"
  | "staff"
  | "export_connecteam"
  | "publish"
  | "close";

export interface GateResult {
  gate: LifecycleGate;
  ready: boolean;
  /** Etiqueta de la compuerta en lenguaje de negocio. */
  label: string;
  /** Frase que el coordinador puede leer sin traducción. */
  statusText: string;
  /** CTA contextual de ESA acción ("Completar para staffing"). */
  cta: { label: string; anchorId: string } | null;
  blockers: OperationalBlocker[];
  warnings: OperationalWarning[];
}

export interface ServiceLifecycleInput extends ServiceOperationalReadinessInput {
  /** Tenant autenticado — sin él no se registra nada. */
  companyId?: string | null;
  /** Referencia humana (QK-XXXXXX) o descripción suficiente del trabajo. */
  referenceLabel?: string | null;
  /** Origen trazable del registro (intake, manual, importación…). */
  originTrace?: string | null;
  /** La cantidad de personal está PENDIENTE (no es 0). */
  staffingPending?: boolean;
  /** La hora de inicio es aproximada (no confirmada). */
  approxStart?: boolean;
  /** La operación ya terminó (fecha/hora pasada) — habilita el cierre. */
  serviceFinished?: boolean;
  /** Cierre operativo ya registrado. */
  closeoutSubmitted?: boolean;
}

export interface ServiceLifecycleReadiness {
  readyToCreateDraft: boolean;
  readyToStaff: boolean;
  readyToExportConnecteam: boolean;
  readyToPublish: boolean;
  readyToClose: boolean;
  gates: Record<LifecycleGate, GateResult>;
  /** Orden natural del ciclo, útil para renderizar. */
  ordered: GateResult[];
  /** Readiness operativo subyacente (publicar / exportar). */
  operational: ServiceOperationalReadiness;
}

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const GATE_LABEL: Record<LifecycleGate, string> = {
  create_draft: "Registrar como borrador",
  staff: "Listo para staffing",
  export_connecteam: "Listo para crear turno en Connecteam",
  publish: "Listo para publicar",
  close: "Listo para cerrar",
};

const GATE_CTA: Record<LifecycleGate, string> = {
  create_draft: "Completar para registrar",
  staff: "Completar para staffing",
  export_connecteam: "Completar para Connecteam",
  publish: "Completar para publicar",
  close: "Completar para cerrar",
};

function gate(
  g: LifecycleGate,
  blockers: OperationalBlocker[],
  warnings: OperationalWarning[],
  readyText: string,
): GateResult {
  const ready = blockers.length === 0;
  const n = blockers.length;
  return {
    gate: g,
    ready,
    label: GATE_LABEL[g],
    statusText: ready
      ? readyText
      : `Falta${n === 1 ? "" : "n"} ${n} dato${n === 1 ? "" : "s"} para ${
          g === "staff"
            ? "empezar el staffing"
            : g === "export_connecteam"
              ? "crear el turno en Connecteam"
              : g === "publish"
                ? "publicar"
                : g === "close"
                  ? "cerrar"
                  : "registrar"
        }`,
    cta: ready
      ? null
      : { label: GATE_CTA[g], anchorId: blockers[0]?.action.anchorId ?? SERVICE_CLIENT_ANCHOR },
    blockers,
    warnings,
  };
}

export function getServiceLifecycleReadiness(
  input: ServiceLifecycleInput,
): ServiceLifecycleReadiness {
  const operational = getServiceOperationalReadiness(input);

  // ── 1. CREAR BORRADOR — mínimo real: tenant, fecha, referencia y origen ──
  const draftBlockers: OperationalBlocker[] = [];
  const draftWarnings: OperationalWarning[] = [];
  if (!txt(input.date)) {
    draftBlockers.push({
      code: "draft.missing_date",
      label: "Fecha del trabajo",
      reason: "Sin fecha no se puede ubicar el trabajo en el calendario.",
      field: "date",
      action: { label: "Poner fecha", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }
  if (!txt(input.referenceLabel) && !txt(input.title)) {
    draftBlockers.push({
      code: "draft.missing_reference",
      label: "Referencia del trabajo",
      reason: "Necesitamos al menos un nombre o descripción para reconocerlo después.",
      field: "title",
      action: { label: "Nombrar el trabajo", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }
  if (input.companyId !== undefined && !txt(input.companyId)) {
    draftBlockers.push({
      code: "draft.missing_company",
      label: "Empresa",
      reason: "No hay empresa activa para guardar este trabajo.",
      field: "company_id",
      action: { label: "Seleccionar empresa", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }
  if (input.originTrace !== undefined && !txt(input.originTrace)) {
    draftWarnings.push({
      code: "draft.origin_unknown",
      message: "Sin origen registrado — quedará como creación manual.",
      scope: "publish",
    });
  }

  // ── 2. STAFFING — qué hace falta para empezar a asignar personas ────────
  const staffBlockers: OperationalBlocker[] = [];
  const staffWarnings: OperationalWarning[] = [];
  if (!txt(input.date)) {
    staffBlockers.push({
      code: "staff.missing_date",
      label: "Fecha",
      reason: "Nadie puede comprometerse a un día que todavía no existe.",
      field: "date",
      action: { label: "Poner fecha", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }
  if (!txt(input.startTime)) {
    staffBlockers.push({
      code: "staff.missing_start",
      label: "Hora de inicio",
      reason: "Sin una hora de inicio no se puede ofrecer el turno al equipo.",
      field: "start_time",
      action: { label: "Definir horario", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  } else if (input.approxStart) {
    staffWarnings.push({
      code: "staff.approx_start",
      message: "La hora de inicio es aproximada — confírmala antes de cerrar el equipo.",
      scope: "publish",
    });
  }
  if (!operational.publish.hasJobSite) {
    staffBlockers.push({
      code: "staff.missing_job_site",
      label: SERVICE_LOCATION_COPY.jobSite,
      reason: "El equipo necesita saber dónde se trabaja para aceptar el turno.",
      field: "job_site",
      action: { label: SERVICE_LOCATION_COPY.jobSiteCta, anchorId: SERVICE_JOB_SITE_ANCHOR },
      scope: "both",
    });
  }
  const slots = Number(input.slots ?? 0);
  if (input.staffingPending || (slots <= 0 && (input.assignedCount ?? 0) === 0)) {
    staffBlockers.push({
      code: "staff.pending_headcount",
      label: "Cantidad de personal",
      reason: "Todavía no sabemos cuántas personas pide el cliente. Está bien dejarlo pendiente.",
      field: "slots",
      action: { label: "Definir cuántas personas", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }

  // ── 3/4. EXPORT y PUBLICACIÓN — delegados, sin reglas nuevas ────────────
  const exportGate = gate(
    "export_connecteam",
    operational.exportBlockers,
    operational.warnings.filter((w) => w.scope !== "publish"),
    "Listo para crear el turno en Connecteam",
  );
  const publishGate = gate(
    "publish",
    operational.publishBlockers,
    operational.warnings.filter((w) => w.scope !== "export"),
    "Listo para publicar",
  );

  // ── 5. CIERRE ───────────────────────────────────────────────────────────
  const closeBlockers: OperationalBlocker[] = [];
  const closeWarnings: OperationalWarning[] = [];
  if (input.serviceFinished === false) {
    closeBlockers.push({
      code: "close.not_finished",
      label: "Operación en curso",
      reason: "El servicio todavía no termina — se podrá cerrar cuando finalice.",
      field: "date",
      action: { label: "Ver operación", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }
  if ((input.assignedCount ?? 0) === 0) {
    closeBlockers.push({
      code: "close.no_team",
      label: "Equipo",
      reason: "No hay nadie registrado en este servicio, no hay nada que cerrar.",
      field: "assignments",
      action: { label: "Revisar equipo", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "both",
    });
  }
  if (input.closeoutSubmitted) {
    closeWarnings.push({
      code: "close.already_submitted",
      message: "El cierre de este servicio ya fue enviado.",
      scope: "publish",
    });
  }

  const gates: Record<LifecycleGate, GateResult> = {
    create_draft: gate(
      "create_draft",
      draftBlockers,
      draftWarnings,
      "Este trabajo ya se puede guardar como borrador",
    ),
    staff: gate(
      "staff",
      staffBlockers,
      staffWarnings,
      "Listo para empezar a asignar personal",
    ),
    export_connecteam: exportGate,
    publish: publishGate,
    close: gate("close", closeBlockers, closeWarnings, "Listo para cerrar"),
  };

  return {
    readyToCreateDraft: gates.create_draft.ready,
    readyToStaff: gates.staff.ready,
    readyToExportConnecteam: gates.export_connecteam.ready,
    readyToPublish: gates.publish.ready,
    readyToClose: gates.close.ready,
    gates,
    ordered: [
      gates.create_draft,
      gates.staff,
      gates.export_connecteam,
      gates.publish,
      gates.close,
    ],
    operational,
  };
}

/** Copy humano compartido por las superficies del ciclo de vida. */
export const LIFECYCLE_COPY = {
  draftSaved: "Este trabajo ya está guardado como borrador.",
  staffingPending: "Todavía falta definir el equipo.",
  inPreparation: "Este servicio todavía está en preparación.",
  pendingIsOk: "Esta información aún no existe y está bien dejarla pendiente.",
  exportWhenComplete: (n: number) =>
    `Puedes exportarlo a Connecteam cuando completes ${n === 1 ? "este dato" : `estos ${n} datos`}.`,
} as const;
