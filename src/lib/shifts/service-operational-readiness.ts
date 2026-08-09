/**
 * getServiceOperationalReadiness — ÚNICA fuente canónica de "qué le falta a este
 * servicio", separando explícitamente dos preguntas distintas:
 *
 *   1) ¿Está listo para PUBLICAR?            → readyToPublish
 *   2) ¿Está listo para EXPORTAR a Connecteam? → readyToExportConnecteam
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro / solo lectura. Sin BD, sin escrituras, sin efectos.
 *   No toca payroll, time_entries, shift_assignments, CSV, RLS ni permisos.
 *
 * Reglas:
 *   - Publicación reutiliza `getServicePublishReadiness` (no duplicar reglas).
 *   - Export Connecteam refleja EXACTAMENTE los bloqueos de
 *     `validateShiftForExport` (título, fecha, horas, timezone, contexto de Job,
 *     capacidad y publicación) sin volver a implementarlos en la UI.
 *   - Cada blocker es específico: code + label + reason + field + action.
 *     Nunca "Falta información".
 */
import {
  getServicePublishReadiness,
  SERVICE_JOB_SITE_ANCHOR,
  SERVICE_LOCATION_COPY,
  type ServiceReadinessInput,
  type ServicePublishReadiness,
} from "./service-publish-readiness";

export const SERVICE_CLIENT_ANCHOR = "service-basic-info-section";

export type ReadinessScope = "publish" | "export" | "both";

export interface OperationalBlocker {
  /** Código estable para tests y telemetría. */
  code: string;
  /** Etiqueta corta y humana ("Lugar del servicio"). */
  label: string;
  /** Por qué bloquea, en lenguaje de negocio. */
  reason: string;
  /** Campo editable responsable. */
  field: string;
  /** Acción directa dentro del mismo editor. */
  action: { label: string; anchorId: string };
  scope: ReadinessScope;
}

export interface OperationalWarning {
  code: string;
  message: string;
  scope: ReadinessScope;
}

export interface ServiceOperationalReadinessInput extends ServiceReadinessInput {
  /** Estado real de publicación (edit mode). null en creación. */
  publicationStatus?: string | null;
  /** Plazas declaradas — Connecteam usa esto como "Number of users". */
  slots?: number;
  /**
   * La cantidad de personal está PENDIENTE (slots = NULL), no es 0.
   * Connecteam no exige `Number of users`: pendiente NO bloquea el export.
   */
  slotsPending?: boolean;

  /** Timezone efectiva del turno (o default de la empresa). */
  timezone?: string | null;
  /**
   * Valor resuelto para la columna "Job" de Connecteam (cliente, venue o
   * categoría). Vacío = Connecteam no podrá ubicar el turno.
   */
  connecteamJobLabel?: string | null;
  /** Dirección física resuelta para la columna "Address". */
  addressLabel?: string | null;
}

export interface ServiceOperationalReadiness {
  readyToPublish: boolean;
  readyToExportConnecteam: boolean;
  blockers: OperationalBlocker[];
  warnings: OperationalWarning[];
  nextActions: Array<{ code: string; label: string; anchorId: string }>;
  /** Subconjuntos ya filtrados para la UI. */
  publishBlockers: OperationalBlocker[];
  exportBlockers: OperationalBlocker[];
  /** Readiness de publicación completa (compat con superficies existentes). */
  publish: ServicePublishReadiness;
}

const txt = (v: string | null | undefined) => (v ?? "").trim();

export function getServiceOperationalReadiness(
  input: ServiceOperationalReadinessInput,
): ServiceOperationalReadiness {
  const publish = getServicePublishReadiness(input);

  const blockers: OperationalBlocker[] = [];
  const warnings: OperationalWarning[] = [];

  // ── Publicación: se traduce 1:1 desde el helper canónico ────────────────
  for (const b of publish.blockers) {
    blockers.push({
      code: `publish.${b.key}`,
      label: b.label,
      reason: b.message,
      field: b.key,
      action: b.cta
        ? { label: b.cta.label, anchorId: b.cta.anchorId }
        : { label: "Completar", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: b.key === "job_site" ? "both" : "publish",
    });
  }
  for (const w of publish.warnings) {
    warnings.push({ code: `publish.${w.key}`, message: w.message, scope: "publish" });
  }

  // ── Export Connecteam: espejo de validateShiftForExport ─────────────────
  //
  // `publication_status` es CONTEXTO, no blocker: un borrador completo tiene la
  // misma información que un publicado y exportarlo no lo publica. Solo los
  // estados terminales bloquean.
  const pub = txt(input.publicationStatus);
  const TERMINAL = ["cancelled", "canceled", "archived"];
  if (pub && TERMINAL.includes(pub.toLowerCase())) {
    blockers.push({
      code: "export.terminal_status",
      label: "Estado del servicio",
      reason: `El servicio está en estado "${pub}" — no debe importarse a Connecteam.`,
      field: "publication_status",
      action: { label: "Revisar servicio", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "export",
    });
  } else if (pub && pub !== "published") {
    warnings.push({
      code: "export.draft_context",
      message: "Stafly: borrador. Exportar a Connecteam no publica ni notifica a nadie.",
      scope: "export",
    });
  }

  if (!txt(input.title)) {
    blockers.push({
      code: "export.missing_title",
      label: "Título del servicio",
      reason: "Connecteam requiere un 'Shift title' para crear el turno.",
      field: "title",
      action: { label: "Completar título", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "export",
    });
  }
  // Evidencia real del importador: Connecteam descarta en silencio las filas
  // sin hora de fin o con duración cero. Es blocker de EXPORT, no de borrador.
  const start = txt(input.startTime).slice(0, 5);
  const end = txt(input.endTime).slice(0, 5);
  if (!end) {
    blockers.push({
      code: "export.missing_end",
      label: "Hora de fin",
      reason:
        "Connecteam necesita una hora final para crear este turno. En Stafly la hora final todavía está pendiente.",
      field: "end_time",
      action: {
        label: "Definir dato provisional para exportar",
        anchorId: SERVICE_CLIENT_ANCHOR,
      },
      scope: "export",
    });
  } else if (start && start === end) {

    blockers.push({
      code: "export.zero_duration",
      label: "Duración del turno",
      reason: `Inicio y fin son la misma hora (${start}); Connecteam descarta esas filas.`,
      field: "end_time",
      action: { label: "Corregir hora de fin", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "export",
    });
  }
  if (!txt(input.timezone)) {
    blockers.push({
      code: "export.missing_timezone",
      label: "Zona horaria",
      reason: "Sin zona horaria Connecteam no puede colocar el turno en el calendario.",
      field: "timezone",
      action: { label: "Revisar horario", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "export",
    });
  }
  if (!txt(input.connecteamJobLabel)) {
    blockers.push({
      code: "export.missing_job_context",
      label: "Cliente o venue",
      reason:
        "Connecteam necesita un Job: selecciona el cliente o un lugar guardado para poder mapearlo.",
      field: "client_id",
      action: { label: "Seleccionar cliente", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "export",
    });
  }
  const slots = Number(input.slots ?? 0);
  if (input.slotsPending) {
    // PENDIENTE ≠ 0. Connecteam no exige `Number of users`: la columna viaja
    // vacía y el turno se crea igual. No bloquea el export.
    warnings.push({
      code: "export.headcount_pending",
      message:
        "Cantidad de personal pendiente — Number of users viaja vacío. No se inventa 0 ni 1.",
      scope: "export",
    });
  } else if (slots <= 0 && input.assignedCount === 0) {
    blockers.push({
      code: "export.no_capacity",
      label: "Plazas",
      reason: "Capacidad declarada en 0 y sin personal asignado: no hay nada que importar.",
      field: "slots",
      action: { label: "Definir plazas", anchorId: SERVICE_CLIENT_ANCHOR },
      scope: "export",
    });
  }

  if (!txt(input.addressLabel)) {
    warnings.push({
      code: "export.address_missing",
      message:
        "Sin dirección física — Connecteam importará el turno sin geolocalización.",
      scope: "export",
    });
  }

  const publishBlockers = blockers.filter((b) => b.scope !== "export");
  const exportBlockers = blockers.filter((b) => b.scope !== "publish");

  const nextActions = blockers.map((b) => ({
    code: b.code,
    label: b.action.label,
    anchorId: b.action.anchorId,
  }));

  return {
    readyToPublish: publishBlockers.length === 0,
    readyToExportConnecteam: exportBlockers.length === 0,
    blockers,
    warnings,
    nextActions,
    publishBlockers,
    exportBlockers,
    publish,
  };
}

/** Copy canónico para las dos preguntas. */
export const READINESS_COPY = {
  publishReady: "Listo para publicar",
  publishBlocked: (n: number) =>
    `Faltan ${n} ${n === 1 ? "dato" : "datos"} para publicar`,
  exportReady: "Listo para exportar a Connecteam",
  exportBlocked: (n: number) =>
    `${n === 1 ? "Falta 1 dato" : `Faltan ${n} datos`} para exportar a Connecteam`,
  jobSiteLabel: SERVICE_LOCATION_COPY.jobSite,
  jobSiteAnchor: SERVICE_JOB_SITE_ANCHOR,
} as const;
