/**
 * OX-10 — Business Language Layer.
 *
 * El dominio técnico NO cambia: seguimos hablando de `scheduled_shifts`,
 * `shift_assignments`, `time_entries`, RPCs y enums exactamente igual.
 * Lo único que cambia aquí es el LENGUAJE VISIBLE.
 *
 * Principio:
 *   La empresa vende Servicios.
 *   Los trabajadores cumplen Turnos.
 *   Stafly coordina ambos.
 *
 * Reglas de audiencia:
 *   - admin   → lenguaje comercial: "Servicio". Nunca "Shift".
 *   - worker  → lenguaje laboral: "Turno". Nunca "Servicio".
 *   - payroll → lenguaje laboral: "Turno", "Horas", "Time Entry".
 *
 * Ninguna pantalla debe volver a escribir estas palabras a mano:
 * toda la UI consume esta capa, de modo que el vocabulario pueda
 * adaptarse en el futuro (por cliente, país o vertical) sin tocar
 * lógica de negocio.
 */

export type LexAudience = "admin" | "worker" | "payroll";

export interface LexiconTerms {
  /** Audiencia resuelta. Útil para tests y depuración. */
  audience: LexAudience;

  // — Sustantivo principal —
  /** "servicio" | "turno" */
  entity: string;
  /** "servicios" | "turnos" */
  entityPlural: string;
  /** "Servicio" | "Turno" */
  Entity: string;
  /** "Servicios" | "Turnos" */
  EntityPlural: string;
  /** "el servicio" | "el turno" */
  theEntity: string;
  /** "este servicio" | "este turno" */
  thisEntity: string;

  // — Acciones —
  /** "Nuevo servicio" | "Nuevo turno" */
  create: string;
  /** "Editar servicio" */
  edit: string;
  /** "Cancelar servicio" */
  cancel: string;
  /** "Duplicar servicio" */
  duplicate: string;
  /** "Publicar servicio" */
  publish: string;

  // — Superficies —
  /** "Detalle del servicio" */
  detail: string;
  /** "Equipo del servicio" */
  team: string;
  /** "Servicios de hoy" */
  today: string;
  /** "Próximos servicios" */
  upcoming: string;
  /** "Historial de servicios" | "Historial de turnos" */
  history: string;
  /** "Operación del servicio" */
  operations: string;
  /** "Referencia del servicio" */
  reference: string;

  // — Helpers —
  /** count(1) → "1 servicio"; count(3) → "3 servicios" */
  count: (n: number) => string;
  /** plural(1) → "servicio"; plural(0|3) → "servicios" */
  plural: (n: number) => string;
}

interface LexRoot {
  entity: string;
  entityPlural: string;
  /** Artículo: "el" / "la". Preparado para vocabularios futuros. */
  article: "el" | "la";
  demonstrative: "este" | "esta";
}

const ROOTS: Record<LexAudience, LexRoot> = {
  // La empresa vende Servicios.
  admin: { entity: "servicio", entityPlural: "servicios", article: "el", demonstrative: "este" },
  // Los trabajadores cumplen Turnos.
  worker: { entity: "turno", entityPlural: "turnos", article: "el", demonstrative: "este" },
  // Payroll conserva el lenguaje laboral: nunca "Servicio".
  payroll: { entity: "turno", entityPlural: "turnos", article: "el", demonstrative: "este" },
};

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function build(audience: LexAudience): LexiconTerms {
  const root = ROOTS[audience];
  const { entity, entityPlural, article, demonstrative } = root;
  const de = article === "el" ? "del" : "de la";

  return {
    audience,
    entity,
    entityPlural,
    Entity: cap(entity),
    EntityPlural: cap(entityPlural),
    theEntity: `${article} ${entity}`,
    thisEntity: `${demonstrative} ${entity}`,

    create: `Nuevo ${entity}`,
    edit: `Editar ${entity}`,
    cancel: `Cancelar ${entity}`,
    duplicate: `Duplicar ${entity}`,
    publish: `Publicar ${entity}`,

    detail: `Detalle ${de} ${entity}`,
    team: `Equipo ${de} ${entity}`,
    today: `${cap(entityPlural)} de hoy`,
    upcoming: `Próximos ${entityPlural}`,
    history: `Historial de ${entityPlural}`,
    operations: `Operación ${de} ${entity}`,
    reference: `Referencia ${de} ${entity}`,

    plural: (n: number) => (Math.abs(n) === 1 ? entity : entityPlural),
    count: (n: number) => `${n} ${Math.abs(n) === 1 ? entity : entityPlural}`,
  };
}

const CACHE: Record<LexAudience, LexiconTerms> = {
  admin: build("admin"),
  worker: build("worker"),
  payroll: build("payroll"),
};

/** Diccionario de lenguaje visible para una audiencia concreta. */
export function lexicon(audience: LexAudience): LexiconTerms {
  return CACHE[audience];
}

/** Atajos directos para módulos no-React (helpers de copy, exports, PDFs). */
export const ADMIN_LEX = CACHE.admin;
export const WORKER_LEX = CACHE.worker;
export const PAYROLL_LEX = CACHE.payroll;

/**
 * Deriva la audiencia desde la ruta. Función pura: la UI no decide vocabulario,
 * lo hace el contexto en el que está la persona.
 *
 * - Portal del trabajador (`/portal`, `/app/portal`, `/my-*`) → worker.
 * - Superficies de nómina y horas → payroll (lenguaje laboral).
 * - Resto de la app de administración → admin (lenguaje comercial).
 */
export function audienceForPath(pathname: string): LexAudience {
  const p = (pathname || "").toLowerCase();

  if (p.startsWith("/portal") || p.startsWith("/app/portal") || p.startsWith("/my-")) {
    return "worker";
  }

  const PAYROLL_SEGMENTS = [
    "payroll",
    "timeclock",
    "time-clock",
    "hours",
    "horas",
    "time-entries",
    "daily-close",
    "pay-period",
    "reconciliation",
    "validation-center",
  ];
  if (PAYROLL_SEGMENTS.some((s) => p.includes(s))) return "payroll";

  return "admin";
}
