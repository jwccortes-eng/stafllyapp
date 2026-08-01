/**
 * P0 — CREATE SHIFT SESSION PERSISTENCE
 *
 * Convierte la creación de turno en una SESIÓN DE TRABAJO, no en un formulario
 * desechable. Mientras el operador no pulse "Crear turno":
 *
 *  · NO existe ninguna entidad de negocio (no hay draft en base de datos,
 *    no hay `scheduled_shifts` temporales, no se toca payroll ni RLS);
 *  · el estado vive SÓLO en el navegador, en `sessionStorage`;
 *  · `sessionStorage` da aislamiento natural por pestaña: dos sesiones
 *    simultáneas (dos pestañas) jamás comparten borrador;
 *  · la clave incluye usuario y empresa, así que un cambio de tenant nunca
 *    puede rehidratar datos de otra compañía.
 *
 * Este módulo es puro salvo por el acceso explícito a `sessionStorage`, y
 * tolera entornos sin storage (SSR, modo privado bloqueado).
 */

export const CREATE_SHIFT_SESSION_VERSION = 1;

/** Un borrador viejo deja de ser "la sesión actual": 12 horas. */
export const CREATE_SHIFT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const KEY_PREFIX = "stafly:create-shift-session";

/** Foto exacta del wizard. Sólo datos del operador, nada resuelto del servidor. */
export interface CreateShiftDraftSnapshot {
  step: string;
  clientId: string;
  serviceType: string;
  jobSiteAddress: string;
  jobSiteLocationId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  slots: number;
  team: string[];
  driverIds: string[];
  transportRequired: boolean;
  driversRequired: number;
  meetingPoint: string;
  meetingPointLocationId: string | null;
  notes: string;
}

export interface CreateShiftSessionRecord {
  version: number;
  /** Identificador temporal de la sesión de trabajo (no es una entidad de negocio). */
  sessionId: string;
  userId: string;
  companyId: string;
  updatedAt: number;
  draft: CreateShiftDraftSnapshot;
}

export function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* entorno sin crypto: se cae al fallback */
  }
  return `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Clave aislada por usuario + empresa. Nunca global. */
export function sessionKey(userId: string, companyId: string): string {
  return `${KEY_PREFIX}:v${CREATE_SHIFT_SESSION_VERSION}:${userId}:${companyId}`;
}

/**
 * ¿Hay trabajo real del operador? Un borrador vacío no merece restaurarse ni
 * pedir confirmación para descartarse.
 */
export function isMeaningfulDraft(
  draft: CreateShiftDraftSnapshot,
  baseline: Pick<CreateShiftDraftSnapshot, "date" | "startTime" | "endTime" | "slots">,
): boolean {
  return (
    !!draft.clientId ||
    !!draft.serviceType.trim() ||
    !!draft.jobSiteAddress.trim() ||
    !!draft.jobSiteLocationId ||
    draft.team.length > 0 ||
    draft.driverIds.length > 0 ||
    !!draft.meetingPoint.trim() ||
    !!draft.meetingPointLocationId ||
    !!draft.notes.trim() ||
    draft.date !== baseline.date ||
    draft.startTime !== baseline.startTime ||
    draft.endTime !== baseline.endTime ||
    draft.slots !== baseline.slots
  );
}

export function isExpired(record: CreateShiftSessionRecord, now = Date.now()): boolean {
  return now - record.updatedAt > CREATE_SHIFT_SESSION_TTL_MS;
}

/**
 * Valida forma y pertenencia. Un registro de otro usuario, otra empresa u otra
 * versión se considera inexistente (nunca se mezcla).
 */
export function parseSessionRecord(
  raw: string | null,
  expect: { userId: string; companyId: string },
  now = Date.now(),
): CreateShiftSessionRecord | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Partial<CreateShiftSessionRecord>;
  if (rec.version !== CREATE_SHIFT_SESSION_VERSION) return null;
  if (typeof rec.sessionId !== "string" || !rec.sessionId) return null;
  if (rec.userId !== expect.userId || rec.companyId !== expect.companyId) return null;
  if (typeof rec.updatedAt !== "number") return null;
  if (!rec.draft || typeof rec.draft !== "object") return null;
  const full = rec as CreateShiftSessionRecord;
  if (isExpired(full, now)) return null;

  const d = full.draft as Partial<CreateShiftDraftSnapshot>;
  full.draft = {
    step: typeof d.step === "string" ? d.step : "operacion",
    clientId: typeof d.clientId === "string" ? d.clientId : "",
    serviceType: typeof d.serviceType === "string" ? d.serviceType : "",
    jobSiteAddress: typeof d.jobSiteAddress === "string" ? d.jobSiteAddress : "",
    jobSiteLocationId: typeof d.jobSiteLocationId === "string" ? d.jobSiteLocationId : null,
    date: typeof d.date === "string" ? d.date : "",
    startTime: typeof d.startTime === "string" ? d.startTime : "",
    endTime: typeof d.endTime === "string" ? d.endTime : "",
    slots: typeof d.slots === "number" && Number.isFinite(d.slots) ? d.slots : 1,
    team: Array.isArray(d.team) ? d.team.filter((x): x is string => typeof x === "string") : [],
    driverIds: Array.isArray(d.driverIds) ? d.driverIds.filter((x): x is string => typeof x === "string") : [],
    transportRequired: d.transportRequired === true,
    driversRequired: typeof d.driversRequired === "number" && Number.isFinite(d.driversRequired) ? d.driversRequired : 0,
    meetingPoint: typeof d.meetingPoint === "string" ? d.meetingPoint : "",
    meetingPointLocationId: typeof d.meetingPointLocationId === "string" ? d.meetingPointLocationId : null,
    notes: typeof d.notes === "string" ? d.notes : "",
  };
  return full;
}

/* ────────────────────────────────────────────────────────────────
 * Acceso a storage (tolerante a entornos sin `sessionStorage`)
 * ──────────────────────────────────────────────────────────────── */

function store(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readSession(
  userId: string | null | undefined,
  companyId: string | null | undefined,
): CreateShiftSessionRecord | null {
  if (!userId || !companyId) return null;
  const s = store();
  if (!s) return null;
  try {
    return parseSessionRecord(s.getItem(sessionKey(userId, companyId)), { userId, companyId });
  } catch {
    return null;
  }
}

export function writeSession(params: {
  sessionId: string;
  userId: string | null | undefined;
  companyId: string | null | undefined;
  draft: CreateShiftDraftSnapshot;
}): void {
  const { sessionId, userId, companyId, draft } = params;
  if (!userId || !companyId) return;
  const s = store();
  if (!s) return;
  const record: CreateShiftSessionRecord = {
    version: CREATE_SHIFT_SESSION_VERSION,
    sessionId,
    userId,
    companyId,
    updatedAt: Date.now(),
    draft,
  };
  try {
    s.setItem(sessionKey(userId, companyId), JSON.stringify(record));
  } catch {
    /* cuota llena o storage bloqueado: la sesión sigue viva en memoria */
  }
}

export function clearSession(
  userId: string | null | undefined,
  companyId: string | null | undefined,
): void {
  if (!userId || !companyId) return;
  const s = store();
  if (!s) return;
  try {
    s.removeItem(sessionKey(userId, companyId));
  } catch {
    /* nada que limpiar */
  }
}
