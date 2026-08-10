/**
 * Presentadores canónicos de entidades → props de EntityCard.
 *
 * Módulo PURO. Traduce la verdad de cada dominio (worker, cliente, venue,
 * partner) al mismo lenguaje visual. Si una pantalla necesita mostrar una
 * entidad, deriva su vista desde aquí en vez de inventar badges o colores.
 *
 * No consulta datos, no muta nada, no cambia lógica de negocio.
 */

import {
  formatEntityRef,
  type EntityBadgeSpec,
  type EntityStatusTone,
} from "./entity-identity";

export interface EntityView {
  name: string;
  reference: string;
  primaryDetail?: string;
  status: EntityStatusTone;
  statusLabel: string;
  badges: EntityBadgeSpec[];
}

/* ─────────────────────────────── workers ─────────────────────────────────── */

export interface WorkerEntityInput {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  employer_identification?: string | null;
  phone_number?: string | null;
  is_active?: boolean | null;
  user_id?: string | null;
  avatar_url?: string | null;
  employee_role?: string | null;
}

export interface WorkerEntitySignals {
  /** Bloqueado para operar (no asignable, riesgo duro). */
  blocked?: boolean;
  blockedReason?: string;
  /** Necesita atención (documentos, foto, perfil incompleto). */
  attention?: boolean;
  /** Asignado hoy / al turno en foco. */
  assignedToday?: boolean;
  isDriver?: boolean;
  identityRisk?: boolean;
  photoRequired?: boolean;
  documentsPending?: boolean;
  duplicate?: boolean;
}

export function buildWorkerEntityView(
  worker: WorkerEntityInput,
  signals: WorkerEntitySignals = {},
  displayName?: string,
): EntityView {
  const name =
    displayName ??
    `${worker.first_name ?? ""} ${worker.last_name ?? ""}`.trim() ||
    "Sin nombre";

  const inactive = worker.is_active === false;

  const status: EntityStatusTone = inactive
    ? "historical"
    : signals.blocked || signals.identityRisk
      ? "blocked"
      : signals.attention || signals.photoRequired || signals.documentsPending
        ? "attention"
        : signals.assignedToday
          ? "assigned"
          : "operational";

  const badges: EntityBadgeSpec[] = [];
  if (signals.identityRisk) badges.push({ key: "identity", label: "Riesgo identidad", tone: "critical" });
  if (signals.blocked) badges.push({ key: "blocked", label: "Bloqueado", tone: "critical", hint: signals.blockedReason });
  if (signals.duplicate) badges.push({ key: "dup", label: "Posible duplicado", tone: "critical" });
  if (signals.photoRequired) badges.push({ key: "photo", label: "Foto requerida", tone: "warning" });
  if (signals.documentsPending) badges.push({ key: "docs", label: "Documento pendiente", tone: "warning" });
  if (worker.user_id) badges.push({ key: "portal", label: "Portal activo", tone: "info" });
  if (signals.isDriver) badges.push({ key: "driver", label: "Driver", tone: "info" });
  if (inactive) badges.push({ key: "hist", label: "Histórico", tone: "info" });

  return {
    name,
    reference: formatEntityRef("worker", {
      number: worker.employer_identification,
      id: worker.id,
    }),
    primaryDetail: worker.phone_number ?? undefined,
    status,
    statusLabel: inactive ? "Histórico" : undefined as unknown as string,
    badges,
  };
}

/* ─────────────────────────────── clientes ────────────────────────────────── */

export interface ClientEntityInput {
  clientId: string;
  humanReference?: string | null;
  canonicalName: string;
  isActive: boolean;
  lifecycle: "active" | "inactive" | "archived";
  primaryContactName?: string | null;
  hasPrimaryContact: boolean;
  venueCount: number;
  connecteamConfigured: boolean;
  duplicateWarnings?: number;
}

export function buildClientEntityView(client: ClientEntityInput): EntityView {
  const status: EntityStatusTone =
    client.lifecycle === "archived" || !client.isActive
      ? "historical"
      : !client.hasPrimaryContact || !client.connecteamConfigured
        ? "attention"
        : "operational";

  const badges: EntityBadgeSpec[] = [];
  if ((client.duplicateWarnings ?? 0) > 0) {
    badges.push({ key: "dup", label: "Posible duplicado", tone: "critical" });
  }
  if (!client.hasPrimaryContact) {
    badges.push({ key: "contact", label: "Sin contacto principal", tone: "warning" });
  }
  if (!client.connecteamConfigured) {
    badges.push({ key: "ct", label: "Falta mapping", tone: "warning" });
  }
  if (client.venueCount > 0) {
    badges.push({ key: "venues", label: `${client.venueCount} lugar(es)`, tone: "info" });
  }
  if (client.lifecycle === "archived") {
    badges.push({ key: "arch", label: "Archivado", tone: "info" });
  } else if (!client.isActive) {
    badges.push({ key: "inact", label: "Histórico", tone: "info" });
  }

  return {
    name: client.canonicalName,
    reference: formatEntityRef("client", {
      code: client.humanReference,
      id: client.clientId,
    }),
    primaryDetail: client.primaryContactName ?? undefined,
    status,
    statusLabel: status === "historical" ? "Histórico" : undefined as unknown as string,
    badges,
  };
}

/* ──────────────────────────────── venues ─────────────────────────────────── */

export interface VenueEntityInput {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  isActive?: boolean;
  clientName?: string | null;
}

export function buildVenueEntityView(venue: VenueEntityInput): EntityView {
  const status: EntityStatusTone = venue.isActive === false ? "historical" : "operational";
  const badges: EntityBadgeSpec[] = [];
  if (!venue.address) badges.push({ key: "addr", label: "Sin dirección", tone: "warning" });
  if (venue.clientName) badges.push({ key: "client", label: venue.clientName, tone: "info" });
  if (venue.isActive === false) badges.push({ key: "hist", label: "Histórico", tone: "info" });

  return {
    name: venue.name,
    reference: formatEntityRef("venue", { code: venue.code, id: venue.id }),
    primaryDetail: venue.address ?? undefined,
    status,
    statusLabel: status === "historical" ? "Histórico" : "Operativo",
    badges,
  };
}

/* ─────────────────────────────── partners ────────────────────────────────── */

export interface PartnerEntityInput {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
  detail?: string | null;
}

export function buildPartnerEntityView(partner: PartnerEntityInput): EntityView {
  const status: EntityStatusTone = partner.isActive === false ? "historical" : "operational";
  return {
    name: partner.name,
    reference: formatEntityRef("partner", { code: partner.code, id: partner.id }),
    primaryDetail: partner.detail ?? undefined,
    status,
    statusLabel: status === "historical" ? "Histórico" : "Operativo",
    badges: partner.isActive === false ? [{ key: "hist", label: "Histórico", tone: "info" }] : [],
  };
}
