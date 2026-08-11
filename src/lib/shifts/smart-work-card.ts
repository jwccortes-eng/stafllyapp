/**
 * smart-work-card.ts
 *
 * Read-only ViewModel para la Smart Work Card v1 de Stafly.
 *
 * BOUNDARIES (HARD):
 *  - Frontend / presentational únicamente. No DB writes, no RPC, no fetch.
 *  - NO toca payroll, NO toca time_entries, NO toca schema, NO toca Connecteam.
 *  - NO recalcula pagos. `getPayEstimate()` produce SIEMPRE una estimación
 *    etiquetada como "Estimado" / "Aprox." — nunca un pago final.
 *  - NO usa scheduled hours como pago. Sólo como referencia operativa
 *    para mostrar duración estimada.
 *  - Reutiliza helpers existentes (card-display, location-status,
 *    attendance-evidence) sin modificarlos.
 *
 * Este archivo NO se importa todavía desde ninguna pantalla productiva.
 * Es el scaffold del ViewModel acordado en docs/SMART_WORK_CARD_DESIGN_V1.md
 * y docs/SMART_WORK_CARD_VIEWMODEL_V1.md.
 */

import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import {
  buildShiftCardTitle,
  formatShiftRef,
  stripLeadingShiftCode,
} from "./card-display";
import {
  getShiftLocationStatus,
  type ShiftLocationInput,
  type ShiftLocationStatus,
} from "./service-location";

// ── Audience ────────────────────────────────────────────────────────────

export type SmartCardAudience = "worker" | "admin";
export type SmartCardDensity = "compact" | "standard" | "full";

// ── Input shape ─────────────────────────────────────────────────────────
// Mínimo lo necesario para construir la card. Cualquier campo extra que
// venga del fetch se ignora a propósito (principio "mostrar sólo lo
// necesario para actuar").

export interface SmartWorkCardInput {
  shift: {
    id: string;
    title?: string | null;
    shift_code?: string | null;
    /** P0 · referencia operativa canónica. */
    shift_ref?: string | null;
    date: string;            // YYYY-MM-DD
    start_time: string;      // HH:MM[:SS]
    end_time: string;        // HH:MM[:SS]
    category?: string | null;
    role?: string | null;
    notes?: string | null;
    status?: string | null;
    publication_status?: string | null;
    // location bits — passed straight to getShiftLocationStatus
    location_id?: string | null;
    job_site_location_id?: string | null;
    job_site_address?: string | null;
    meeting_point?: string | null;
    meeting_point_location_id?: string | null;
    meeting_time?: string | null;
  };
  client?: { name?: string | null } | null;
  location?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  /** Slots vs personas confirmadas. Admin view. */
  coverage?: {
    required: number;
    confirmed: number;
    pending: number;
  };
  /** Asignación del worker actual (worker view). */
  myAssignment?: {
    status?: string | null;        // confirmed / pending / declined / removed
    has_clock_in?: boolean;
    has_clock_out?: boolean;
  } | null;
  /** Compensación referencial. NUNCA pago final. */
  compensation?: {
    pay_type?: "hourly" | "daily" | "flat" | null;
    hourly_rate?: number | null;
    daily_rate?: number | null;
    flat_amount?: number | null;
  } | null;
  /** Texto/foto de uniforme. Read-only; sin lookup de cliente/rol todavía. */
  uniform?: {
    instructions?: string | null;
    photo_url?: string | null;
    source?: "shift" | "client" | "role" | "company" | "manual" | null;
  } | null;
}

// ── Output blocks ───────────────────────────────────────────────────────

export interface WorkIdentity {
  title: string;            // título humano (cliente · categoría / título manual limpio)
  /** Línea secundaria `{Cliente} · {Categoría}`. `null` si coincidiría con el título. */
  subtitleLine: string | null;
  refLabel: string | null;  // "Ref #0250" — SECUNDARIO
  clientName: string | null;
  category: string | null;
}

export interface WorkCoverage {
  required: number;
  confirmed: number;
  pending: number;
  /** "1 / 3 confirmados". Vacío si no aplica. */
  label: string;
  /** Chip corto para densidades compactas. */
  shortLabel: string;       // "1/3"
  complete: boolean;
}

export interface WorkTiming {
  startLabel: string;       // "8:00 AM" — PROTAGONISTA
  endApproxLabel: string;   // "Termina aprox. 4:00 PM"
  meetingLabel: string | null; // "Encuentro 7:30 AM" si aplica
  durationHours: number;    // estimada, sólo referencia
  durationLabel: string;    // "8 h estimadas"
}

export interface WorkLocation {
  status: ShiftLocationStatus;
  primaryLine: string | null;    // ej. "JKitchen · Brooklyn"
  addressLine: string | null;
  meetingPoint: string | null;
  hasDirections: boolean;        // habilita botón "Cómo llegar"
  copyText: string | null;       // texto plano para "Copiar dirección"
  badge: "ok" | "needs_review" | "missing";
  hint: string;                  // copy en ES simple
}

export interface WorkUniform {
  instructions: string | null;
  photoUrl: string | null;
  source: NonNullable<SmartWorkCardInput["uniform"]>["source"] | null;
  hint: string; // "Qué llevar" copy resuelto
  hasInfo: boolean;
}

export interface PayEstimate {
  /** Etiqueta obligatoria — siempre estimada, nunca final. */
  label: "Estimado" | "Aprox." | "Pago final pendiente" | "Sin tarifa";
  amount: number | null;
  amountLabel: string | null;    // "$120 estimado"
  basis: "hourly" | "daily" | "flat" | "unknown";
  disclaimer: string;            // copy ES corto
  isFinal: false;                // marcador de tipo, siempre false
}

export type WorkStatusKey =
  | "draft"
  | "published_pending_accept"
  | "confirmed"
  | "in_progress"
  | "missing_clock_in"
  | "completed_pending_review"
  | "cancelled";

export interface WorkStatus {
  key: WorkStatusKey;
  label: string;                 // ES, simple
  tone: "neutral" | "ok" | "warn" | "danger";
  riskHints: string[];           // admin: "No marcó entrada", "Falta 1 worker", etc.
}

export type NextActionKind =
  // worker
  | "accept"
  | "reconfirm"
  | "clock_in"
  | "view_details"
  // admin
  | "operate"
  | "assign"
  | "audit"
  | "review_before_pay";

export interface NextAction {
  kind: NextActionKind;
  label: string;                 // ES
  emphasis: "primary" | "secondary";
  disabled?: boolean;
  reason?: string;               // por qué está disabled, si aplica
}

export interface SmartWorkCardViewModel {
  audience: SmartCardAudience;
  density: SmartCardDensity;
  identity: WorkIdentity;
  timing: WorkTiming;
  location: WorkLocation;
  uniform: WorkUniform;
  pay: PayEstimate;
  status: WorkStatus;
  /** Solo presente cuando hay datos de cobertura (admin con `coverage` en el input). */
  coverage: WorkCoverage | null;
  nextAction: NextAction;
  /** Qué bloques mostrar en esta densidad. La UI los respeta literalmente. */
  visibleBlocks: Array<
    "identity" | "timing" | "location" | "uniform" | "pay" | "status" | "action"
  >;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseHHMM(t: string): { h: number; m: number } {
  const [hh = "0", mm = "0"] = t.split(":");
  return { h: Number(hh) || 0, m: Number(mm) || 0 };
}

function formatTime12h(t: string | null | undefined): string {
  if (!t) return "—";
  const { h, m } = parseHHMM(t);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  const mm = m.toString().padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}

function diffHours(start: string, end: string): number {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  let mins = e.h * 60 + e.m - (s.h * 60 + s.m);
  if (mins < 0) mins += 24 * 60; // turno cruza medianoche
  return Math.round((mins / 60) * 10) / 10;
}

// ── Block builders ──────────────────────────────────────────────────────

export function getWorkIdentity(input: SmartWorkCardInput): WorkIdentity {
  const title = buildShiftCardTitle({
    title: input.shift.title,
    shift_code: input.shift.shift_code,
    clientName: input.client?.name,
    locationName: input.location?.name,
    category: input.shift.category ?? input.shift.role ?? null,
  });
  const cleanTitle = stripLeadingShiftCode(title) || "Trabajo";
  const clientName = input.client?.name ?? null;
  const category = input.shift.category ?? input.shift.role ?? null;
  const subtitleCandidate =
    clientName && category
      ? `${clientName} · ${category}`
      : clientName || category || null;
  // Evitar duplicado: si el subtítulo es exactamente igual al título, ocultar.
  const subtitleLine =
    subtitleCandidate && subtitleCandidate.trim().toLowerCase() !== cleanTitle.trim().toLowerCase()
      ? subtitleCandidate
      : null;
  return {
    title: cleanTitle,
    subtitleLine,
    refLabel: (() => {
      const id = getShiftDisplayIdentity(input.shift);
      return id.primaryRefKind === "none" ? null : id.primaryRef;
    })(),
    clientName,
    category,
  };
}

export function getWorkTiming(input: SmartWorkCardInput): WorkTiming {
  const startLabel = formatTime12h(input.shift.start_time);
  const endLabel = formatTime12h(input.shift.end_time);
  // Fusión meeting_time + meeting_point cuando ambos existen.
  const meetingTimePart = input.shift.meeting_time
    ? `Encuentro ${formatTime12h(input.shift.meeting_time)}`
    : null;
  const meetingPointPart = input.shift.meeting_point?.trim() || null;
  let meetingLabel: string | null = null;
  if (meetingTimePart && meetingPointPart) {
    meetingLabel = `${meetingTimePart} · ${meetingPointPart}`;
  } else if (meetingTimePart) {
    meetingLabel = meetingTimePart;
  } else if (meetingPointPart) {
    meetingLabel = `Encuentro: ${meetingPointPart}`;
  }
  const hrs = diffHours(input.shift.start_time, input.shift.end_time);
  return {
    startLabel,
    endApproxLabel: `Termina aprox. ${endLabel}`,
    meetingLabel,
    durationHours: hrs,
    durationLabel: `${hrs} h estimadas`,
  };
}

export function getWorkLocation(input: SmartWorkCardInput): WorkLocation {
  const locInput: ShiftLocationInput = {
    location_id: input.shift.location_id,
    job_site_location_id: input.shift.job_site_location_id,
    job_site_address: input.shift.job_site_address,
    meeting_point: input.shift.meeting_point,
    meeting_point_location_id: input.shift.meeting_point_location_id,
  };
  const cls = getShiftLocationStatus(locInput);

  const primaryParts = [input.location?.name, input.location?.city]
    .filter(Boolean)
    .join(" · ");
  const addressLine =
    input.location?.address ?? input.shift.job_site_address ?? null;
  const copyText = [input.location?.name, addressLine].filter(Boolean).join(" — ") || null;

  let badge: WorkLocation["badge"] = "missing";
  let hint = "Falta dirección. Pregunta antes de salir.";
  if (cls.status === "saved_job_site") {
    badge = "ok";
    hint = "Dirección confirmada.";
  } else if (cls.status === "manual_address" || cls.status === "meeting_only") {
    badge = "needs_review";
    hint =
      cls.status === "meeting_only"
        ? "Sólo hay punto de encuentro. Confirma con tu admin."
        : "Dirección manual. Verifica antes de salir.";
  }

  return {
    status: cls.status,
    primaryLine: primaryParts || null,
    addressLine,
    meetingPoint: input.shift.meeting_point ?? null,
    hasDirections: Boolean(addressLine),
    copyText,
    badge,
    hint,
  };
}

export function getWorkUniform(input: SmartWorkCardInput): WorkUniform {
  const u = input.uniform ?? null;
  const instructions = u?.instructions?.trim() || null;
  const photoUrl = u?.photo_url || null;
  const hasInfo = Boolean(instructions || photoUrl);
  return {
    instructions,
    photoUrl,
    source: u?.source ?? null,
    hint: hasInfo ? "Qué llevar" : "Sin instrucciones de uniforme",
    hasInfo,
  };
}

export function getPayEstimate(input: SmartWorkCardInput): PayEstimate {
  const c = input.compensation ?? null;
  const hours = diffHours(input.shift.start_time, input.shift.end_time);
  const disclaimer =
    "Estimado operativo. El pago final se calcula con fichajes reales o validaciones aprobadas.";

  if (!c || !c.pay_type) {
    return {
      label: "Sin tarifa",
      amount: null,
      amountLabel: null,
      basis: "unknown",
      disclaimer,
      isFinal: false,
    };
  }

  // Si el worker está marcado in y falta clock-out, no aventuramos número.
  if (input.myAssignment?.has_clock_in && !input.myAssignment.has_clock_out) {
    return {
      label: "Pago final pendiente",
      amount: null,
      amountLabel: "Falta hora de salida",
      basis: c.pay_type,
      disclaimer,
      isFinal: false,
    };
  }

  if (c.pay_type === "hourly" && typeof c.hourly_rate === "number") {
    const amt = Math.round(c.hourly_rate * hours * 100) / 100;
    return {
      label: "Estimado",
      amount: amt,
      // amountLabel sin sufijos: el componente renderiza "Estimado · $176.00"
      amountLabel: `$${amt.toFixed(2)}`,
      basis: "hourly",
      disclaimer,
      isFinal: false,
    };
  }
  if (c.pay_type === "daily" && typeof c.daily_rate === "number") {
    return {
      label: "Aprox.",
      amount: c.daily_rate,
      amountLabel: `$${c.daily_rate.toFixed(2)} / día`,
      basis: "daily",
      disclaimer,
      isFinal: false,
    };
  }
  if (c.pay_type === "flat" && typeof c.flat_amount === "number") {
    return {
      label: "Aprox.",
      amount: c.flat_amount,
      amountLabel: `$${c.flat_amount.toFixed(2)} / trabajo`,
      basis: "flat",
      disclaimer,
      isFinal: false,
    };
  }

  return {
    label: "Sin tarifa",
    amount: null,
    amountLabel: null,
    basis: c.pay_type ?? "unknown",
    disclaimer,
    isFinal: false,
  };
}

export function getWorkStatus(
  input: SmartWorkCardInput,
  audience: SmartCardAudience,
): WorkStatus {
  const s = (input.shift.status || "").toLowerCase();
  const pub = (input.shift.publication_status || "").toLowerCase();
  const risks: string[] = [];

  if (s === "cancelled") {
    return { key: "cancelled", label: "Cancelado", tone: "neutral", riskHints: [] };
  }

  if (audience === "admin" && input.coverage) {
    if (input.coverage.confirmed < input.coverage.required) {
      risks.push(`Falta ${input.coverage.required - input.coverage.confirmed} worker(s)`);
    }
  }

  if (audience === "worker" && input.myAssignment) {
    if (input.myAssignment.status === "pending") {
      return {
        key: "published_pending_accept",
        label: "Por aceptar",
        tone: "warn",
        riskHints: [],
      };
    }
    if (input.myAssignment.has_clock_in && !input.myAssignment.has_clock_out) {
      return {
        key: "in_progress",
        label: "En curso",
        tone: "ok",
        riskHints: [],
      };
    }
  }

  if (pub === "draft") {
    return { key: "draft", label: "Borrador", tone: "neutral", riskHints: risks };
  }

  if (s === "completed") {
    return {
      key: "completed_pending_review",
      label: "Revisar antes de pagar",
      tone: "warn",
      riskHints: risks,
    };
  }

  return {
    key: "confirmed",
    label: risks.length ? "Necesita atención" : "Confirmado",
    tone: risks.length ? "warn" : "ok",
    riskHints: risks,
  };
}

export function getNextAction(
  input: SmartWorkCardInput,
  audience: SmartCardAudience,
  status: WorkStatus,
): NextAction {
  if (audience === "worker") {
    const a = input.myAssignment;
    if (a?.status === "pending")
      return { kind: "accept", label: "Aceptar", emphasis: "primary" };
    if (a?.has_clock_in && !a.has_clock_out)
      return { kind: "view_details", label: "Ver detalles", emphasis: "secondary" };
    if (a && !a.has_clock_in)
      return { kind: "clock_in", label: "Marcar entrada", emphasis: "primary" };
    return { kind: "view_details", label: "Ver detalles", emphasis: "secondary" };
  }
  // admin
  if (status.key === "draft")
    return { kind: "assign", label: "Asignar workers", emphasis: "primary" };
  if (status.key === "completed_pending_review")
    return {
      kind: "review_before_pay",
      label: "Revisar antes de pagar",
      emphasis: "primary",
    };
  if (status.riskHints.length)
    return { kind: "operate", label: "Operar turno", emphasis: "primary" };
  return { kind: "audit", label: "Auditar turno", emphasis: "secondary" };
}

// ── Density → which blocks are visible ──────────────────────────────────

function blocksForDensity(
  density: SmartCardDensity,
  audience: SmartCardAudience,
): SmartWorkCardViewModel["visibleBlocks"] {
  if (density === "compact") {
    return ["identity", "timing", "status", "action"];
  }
  if (density === "standard") {
    return audience === "worker"
      ? ["identity", "timing", "location", "pay", "action"]
      : ["identity", "timing", "location", "status", "action"];
  }
  // full
  return audience === "worker"
    ? ["identity", "timing", "location", "uniform", "pay", "status", "action"]
    : ["identity", "timing", "location", "uniform", "status", "pay", "action"];
}

// ── Coverage ────────────────────────────────────────────────────────────

export function getWorkCoverage(input: SmartWorkCardInput): WorkCoverage | null {
  const c = input.coverage;
  if (!c) return null;
  const required = Math.max(0, c.required ?? 0);
  const confirmed = Math.max(0, c.confirmed ?? 0);
  const pending = Math.max(0, c.pending ?? 0);
  return {
    required,
    confirmed,
    pending,
    label: `${confirmed} / ${required} confirmados`,
    shortLabel: `${confirmed}/${required}`,
    complete: required > 0 && confirmed >= required,
  };
}

// ── Top-level builder ───────────────────────────────────────────────────

export function buildSmartWorkCardViewModel(
  input: SmartWorkCardInput,
  opts: { audience: SmartCardAudience; density?: SmartCardDensity },
): SmartWorkCardViewModel {
  const density = opts.density ?? "standard";
  const identity = getWorkIdentity(input);
  const timing = getWorkTiming(input);
  let location = getWorkLocation(input);
  const uniform = getWorkUniform(input);
  const pay = getPayEstimate(input);
  const status = getWorkStatus(input, opts.audience);
  const nextAction = getNextAction(input, opts.audience, status);
  // Coverage solo tiene sentido para admin.
  const coverage = opts.audience === "admin" ? getWorkCoverage(input) : null;

  // Si el bloque de tiempo ya fusionó el meeting_point, evitar duplicarlo
  // dentro del bloque de ubicación.
  if (
    location.meetingPoint &&
    timing.meetingLabel &&
    timing.meetingLabel.toLowerCase().includes(location.meetingPoint.toLowerCase())
  ) {
    location = { ...location, meetingPoint: null };
  }

  return {
    audience: opts.audience,
    density,
    identity,
    timing,
    location,
    uniform,
    pay,
    status,
    coverage,
    nextAction,
    visibleBlocks: blocksForDensity(density, opts.audience),
  };
}
