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

/**
 * Superficie del wizard. Móvil y desktop capturan campos distintos, así que
 * cada una guarda su propia foto — pero AMBAS usan este mismo motor.
 */
export type CreateShiftSurface = "mobile" | "desktop";

/** Clave aislada por usuario + empresa (+ superficie). Nunca global. */
export function sessionKey(
  userId: string,
  companyId: string,
  surface: CreateShiftSurface = "mobile",
): string {
  const base = `${KEY_PREFIX}:v${CREATE_SHIFT_SESSION_VERSION}:${userId}:${companyId}`;
  // La clave móvil se mantiene intacta: las sesiones ya abiertas no se pierden.
  return surface === "mobile" ? base : `${base}:${surface}`;
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

export function isExpired(record: { updatedAt: number }, now = Date.now()): boolean {
  return now - record.updatedAt > CREATE_SHIFT_SESSION_TTL_MS;
}

/** Mismo sobre, cualquier foto: móvil y desktop comparten envoltura. */
export interface CreateShiftSessionRecordOf<T> {
  version: number;
  sessionId: string;
  userId: string;
  companyId: string;
  updatedAt: number;
  draft: T;
}

/**
 * Motor genérico de validación. Una sesión de otro usuario, otra empresa, otra
 * versión o vencida se considera inexistente: nunca se mezcla, nunca se hereda.
 */
export function parseRecordWith<T>(
  raw: string | null,
  expect: { userId: string; companyId: string },
  normalize: (draft: unknown) => T | null,
  now = Date.now(),
): CreateShiftSessionRecordOf<T> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Partial<CreateShiftSessionRecordOf<T>>;
  if (rec.version !== CREATE_SHIFT_SESSION_VERSION) return null;
  if (typeof rec.sessionId !== "string" || !rec.sessionId) return null;
  if (rec.userId !== expect.userId || rec.companyId !== expect.companyId) return null;
  if (typeof rec.updatedAt !== "number") return null;
  if (isExpired({ updatedAt: rec.updatedAt }, now)) return null;
  const draft = normalize(rec.draft);
  if (draft === null) return null;
  return {
    version: rec.version,
    sessionId: rec.sessionId,
    userId: rec.userId,
    companyId: rec.companyId,
    updatedAt: rec.updatedAt,
    draft,
  };
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
 * Acceso a storage — motor único para móvil y desktop
 *
 * Dos capas, un mismo contrato:
 *   · `sessionStorage`: la sesión viva de ESTA pestaña (aislamiento natural);
 *   · `localStorage`: copia durable SÓLO para recuperar tras cerrar el
 *     navegador. Nunca se rehidrata en silencio: alimenta el aviso
 *     "Recuperamos una creación de turno sin finalizar".
 * En ninguna capa existe una entidad de negocio: el turno no existe hasta
 * que el operador pulsa "Crear turno".
 * ──────────────────────────────────────────────────────────────── */

function store(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function durableStore(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const DURABLE_PREFIX = "stafly:create-shift-session-durable";

function durableKey(userId: string, companyId: string, surface: CreateShiftSurface): string {
  return sessionKey(userId, companyId, surface).replace(KEY_PREFIX, DURABLE_PREFIX);
}

export interface SessionIO<T> {
  userId: string | null | undefined;
  companyId: string | null | undefined;
  surface?: CreateShiftSurface;
  normalize: (draft: unknown) => T | null;
}

/** ¿De dónde vino la sesión recuperada? La UI lo usa para elegir el copy. */
export type RecoverySource = "tab" | "durable";

export interface RecoveredSession<T> extends CreateShiftSessionRecordOf<T> {
  source: RecoverySource;
}

/** Lee la sesión de esta pestaña; si no hay, ofrece la copia durable. */
export function readSessionWith<T>(io: SessionIO<T>): RecoveredSession<T> | null {
  const { userId, companyId, normalize } = io;
  const surface = io.surface ?? "mobile";
  if (!userId || !companyId) return null;
  const expect = { userId, companyId };
  try {
    const live = store()?.getItem(sessionKey(userId, companyId, surface)) ?? null;
    const parsedLive = parseRecordWith(live, expect, normalize);
    if (parsedLive) return { ...parsedLive, source: "tab" };
  } catch {
    /* storage bloqueado: caemos a la copia durable */
  }
  try {
    const durable = durableStore()?.getItem(durableKey(userId, companyId, surface)) ?? null;
    const parsedDurable = parseRecordWith(durable, expect, normalize);
    if (parsedDurable) return { ...parsedDurable, source: "durable" };
  } catch {
    /* nada recuperable */
  }
  // TTL vencido o basura: limpieza automática, sin dejar restos.
  clearSessionWith({ userId, companyId, surface });
  return null;
}

export function writeSessionWith<T>(params: {
  sessionId: string;
  userId: string | null | undefined;
  companyId: string | null | undefined;
  surface?: CreateShiftSurface;
  draft: T;
}): void {
  const { sessionId, userId, companyId, draft } = params;
  const surface = params.surface ?? "mobile";
  if (!userId || !companyId) return;
  const record: CreateShiftSessionRecordOf<T> = {
    version: CREATE_SHIFT_SESSION_VERSION,
    sessionId,
    userId,
    companyId,
    updatedAt: Date.now(),
    draft,
  };
  const payload = JSON.stringify(record);
  try {
    store()?.setItem(sessionKey(userId, companyId, surface), payload);
  } catch {
    /* cuota llena o storage bloqueado: la sesión sigue viva en memoria */
  }
  try {
    durableStore()?.setItem(durableKey(userId, companyId, surface), payload);
  } catch {
    /* sin copia durable: la pestaña actual sigue protegida */
  }
}

/** Borra TODO rastro: pestaña y copia durable. Nunca deja basura. */
export function clearSessionWith(params: {
  userId: string | null | undefined;
  companyId: string | null | undefined;
  surface?: CreateShiftSurface;
}): void {
  const { userId, companyId } = params;
  const surface = params.surface ?? "mobile";
  if (!userId || !companyId) return;
  try {
    store()?.removeItem(sessionKey(userId, companyId, surface));
  } catch {
    /* nada que limpiar */
  }
  try {
    durableStore()?.removeItem(durableKey(userId, companyId, surface));
  } catch {
    /* nada que limpiar */
  }
}

/* ────────────────────────────────────────────────────────────────
 * API móvil (compatibilidad): mismos motores, foto tipada del wizard.
 * ──────────────────────────────────────────────────────────────── */

const normalizeMobileDraft = (draft: unknown): CreateShiftDraftSnapshot | null => {
  const wrapped = parseSessionRecord(
    JSON.stringify({
      version: CREATE_SHIFT_SESSION_VERSION,
      sessionId: "probe",
      userId: "u",
      companyId: "c",
      updatedAt: Date.now(),
      draft,
    }),
    { userId: "u", companyId: "c" },
  );
  return wrapped ? wrapped.draft : null;
};

export function readSession(
  userId: string | null | undefined,
  companyId: string | null | undefined,
): CreateShiftSessionRecord | null {
  return readSessionWith<CreateShiftDraftSnapshot>({
    userId,
    companyId,
    surface: "mobile",
    normalize: normalizeMobileDraft,
  });
}

export function writeSession(params: {
  sessionId: string;
  userId: string | null | undefined;
  companyId: string | null | undefined;
  draft: CreateShiftDraftSnapshot;
}): void {
  writeSessionWith({ ...params, surface: "mobile" });
}

export function clearSession(
  userId: string | null | undefined,
  companyId: string | null | undefined,
): void {
  clearSessionWith({ userId, companyId, surface: "mobile" });
}
