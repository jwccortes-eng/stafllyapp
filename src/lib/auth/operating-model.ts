/**
 * STAFLY OPERATING MODEL™ — capa de EXPERIENCIA sobre el modelo canónico.
 *
 * NO es un sistema de permisos nuevo:
 *  - no crea tablas, no crea roles, no toca RLS, auth, payroll ni datos.
 *  - se apoya al 100% en `role-model.ts` (roles + scope) y en
 *    `permission-catalog.ts` (permisos) que ya son la autoridad.
 *
 * Traduce permisos → RESPONSABILIDADES:
 *
 *   Cliente → Servicio → Programación → Operación → Control de Horas
 *          → Preparación de Payroll → Aprobación Final → Pago
 *
 * Cada etapa tiene un responsable, recibe trabajo de alguien y entrega
 * trabajo a alguien. Ese es el lenguaje del negocio; los permisos quedan
 * detrás.
 */
import { CANONICAL_ROLES, SCOPE_LABELS, type CanonicalRole, type CanonicalRoleKey } from "./role-model";

/* ------------------------------------------------------------ etapas */

export type OperatingStageKey =
  | "clients"
  | "services"
  | "scheduling"
  | "operation"
  | "time_control"
  | "payroll_prep"
  | "approval"
  | "payment";

export interface OperatingStage {
  key: OperatingStageKey;
  label: string;
  /** Rol responsable de la etapa. */
  owner: CanonicalRoleKey;
}

/** Cadena operativa canónica. Idéntica en todas las empresas del ecosistema. */
export const OPERATING_CHAIN: readonly OperatingStage[] = [
  { key: "clients", label: "Cliente", owner: "company_owner" },
  { key: "services", label: "Servicio", owner: "shift_admin" },
  { key: "scheduling", label: "Programación", owner: "shift_admin" },
  { key: "operation", label: "Operación", owner: "service_supervisor" },
  { key: "time_control", label: "Control de horas", owner: "time_closeout_admin" },
  { key: "payroll_prep", label: "Preparación de payroll", owner: "payroll_admin" },
  { key: "approval", label: "Aprobación final", owner: "payroll_approver" },
  { key: "payment", label: "Pago", owner: "company_owner" },
] as const;

/* --------------------------------------------------- responsabilidades */

export interface Responsibility {
  role: CanonicalRoleKey;
  /** Frase de negocio: por qué existe este rol. */
  mission: string;
  /** Etapas de la cadena que controla. */
  stages: readonly OperatingStageKey[];
  /** Lista corta y concreta de lo que controla (lenguaje operativo). */
  controls: readonly string[];
  /** Qué entrega cuando termina su parte. */
  delivers: string;
  /** Roles de los que recibe trabajo. */
  receivesFrom: readonly CanonicalRoleKey[];
  /** Roles a los que entrega trabajo. */
  deliversTo: readonly CanonicalRoleKey[];
  /** Lo que explícitamente NO le corresponde. */
  notResponsible: readonly string[];
  /** Qué debe ver al iniciar sesión (dashboard por responsabilidad). */
  focus: readonly string[];
}

export const RESPONSIBILITIES: Readonly<Record<CanonicalRoleKey, Responsibility>> = {
  company_owner: {
    role: "company_owner",
    mission: "Dirigir la empresa. Puede intervenir en cualquier etapa de la cadena.",
    stages: ["clients", "services", "scheduling", "operation", "time_control", "payroll_prep", "approval", "payment"],
    controls: ["Configuración", "Usuarios", "Permisos y roles", "Clientes", "Servicios", "Payroll", "Reportes", "Aprobación final"],
    delivers: "Decisión final y autorización de pago.",
    receivesFrom: ["payroll_admin"],
    deliversTo: [],
    notResponsible: [],
    focus: ["Lotes pendientes de aprobación", "Indicadores críticos", "Aprobaciones", "Excepciones"],
  },
  shift_admin: {
    role: "shift_admin",
    mission: "Responder por toda la operación diaria: que cada servicio exista, esté publicado y esté cubierto.",
    stages: ["services", "scheduling"],
    controls: ["Creación de servicios", "Edición", "Publicación", "Duplicación", "Staffing", "Cobertura", "Reemplazos", "Incidencias operativas"],
    delivers: "Servicio completamente ejecutado.",
    receivesFrom: ["company_owner"],
    deliversTo: ["time_closeout_admin"],
    notResponsible: ["Payroll", "Aprobación de pagos"],
    focus: ["Servicios pendientes", "Publicaciones", "Cobertura", "Reemplazos", "Incidencias operativas"],
  },
  time_closeout_admin: {
    role: "time_closeout_admin",
    mission: "Garantizar que la operación quedó correctamente registrada antes de que llegue a nómina.",
    stages: ["time_control"],
    controls: ["Clock In", "Clock Out", "Asistencia", "Horas", "Breaks", "Inconsistencias", "Evidencias", "Closeout"],
    delivers: "Horas verificadas.",
    receivesFrom: ["shift_admin", "service_supervisor"],
    deliversTo: ["payroll_admin"],
    notResponsible: ["Crear o publicar servicios", "Aprobar pagos"],
    focus: ["Turnos pendientes de revisar", "Inconsistencias", "Clock abiertos", "Servicios listos para cierre"],
  },
  payroll_admin: {
    role: "payroll_admin",
    mission: "Preparar la nómina con las horas ya verificadas.",
    stages: ["payroll_prep"],
    controls: ["Payroll", "Novedades", "Lotes", "Validaciones"],
    delivers: "Payroll listo para aprobación.",
    receivesFrom: ["time_closeout_admin"],
    deliversTo: ["payroll_approver"],
    notResponsible: ["Aprobar el lote", "Ajustar la operación"],
    focus: ["Payroll pendiente", "Novedades", "Lotes", "Validaciones"],
  },
  payroll_approver: {
    role: "payroll_approver",
    mission: "Aprobación financiera del lote preparado.",
    stages: ["approval"],
    controls: ["Aprobar", "Rechazar", "Autorizar pago"],
    delivers: "Pago autorizado.",
    receivesFrom: ["payroll_admin"],
    deliversTo: ["company_owner"],
    notResponsible: ["Revisar de nuevo toda la operación", "Ajustar horas históricas"],
    focus: ["Lotes pendientes", "Excepciones", "Indicadores críticos"],
  },
  service_supervisor: {
    role: "service_supervisor",
    mission: "Responder en sitio por los servicios donde está asignado. Nunca por toda la compañía.",
    stages: ["operation"],
    controls: ["Su servicio asignado", "Asistencia del equipo", "Revisión de horas de su equipo", "Novedades en sitio"],
    delivers: "Servicio operado y asistencia reportada.",
    receivesFrom: ["shift_admin"],
    deliversTo: ["time_closeout_admin"],
    notResponsible: ["Payroll", "Configuración", "Permisos", "Servicios ajenos"],
    focus: ["Sus servicios de hoy", "Asistencia del equipo", "Novedades por reportar"],
  },
  worker: {
    role: "worker",
    mission: "Responder por su propio trabajo: presentarse, marcar y mantener su información al día.",
    stages: ["operation"],
    controls: ["Sus turnos", "Clock In / Clock Out", "Disponibilidad", "Documentos", "Perfil"],
    delivers: "Turno trabajado y marcado.",
    receivesFrom: ["shift_admin"],
    deliversTo: ["service_supervisor"],
    notResponsible: ["Cualquier información administrativa o de terceros"],
    focus: ["Sus turnos de hoy", "Su reloj", "Su disponibilidad", "Sus documentos"],
  },
};

/* ------------------------------------------------------------ helpers */

export function getResponsibility(role: CanonicalRoleKey | string | null | undefined): Responsibility | null {
  if (!role) return null;
  return RESPONSIBILITIES[role as CanonicalRoleKey] ?? null;
}

export function roleLabel(key: CanonicalRoleKey): string {
  return CANONICAL_ROLES.find((r) => r.key === key)?.label ?? key;
}

export function roleOf(key: CanonicalRoleKey): CanonicalRole | undefined {
  return CANONICAL_ROLES.find((r) => r.key === key);
}

export function scopeLabelOf(key: CanonicalRoleKey): string {
  const r = roleOf(key);
  return r ? SCOPE_LABELS[r.scope] : "";
}

/** Alias visibles que una empresa puede usar sin crear un rol nuevo. */
export function visibleAliases(key: CanonicalRoleKey): readonly string[] {
  return roleOf(key)?.aliases ?? [];
}

/** Persona mínima para pintar la cadena operativa con nombres reales. */
export interface OperatingPerson {
  userId: string;
  name: string;
  role: CanonicalRoleKey | null;
  /** El acceso no coincide con una plantilla canónica. */
  custom?: boolean;
}

/** Quiénes ocupan hoy un rol dentro de la empresa activa. */
export function peopleForRole(people: readonly OperatingPerson[], role: CanonicalRoleKey): OperatingPerson[] {
  return people.filter((p) => p.role === role);
}

export interface ChainLink {
  role: CanonicalRoleKey;
  label: string;
  people: OperatingPerson[];
}

/** Cadena de una persona: de quién recibe → su responsabilidad → a quién entrega. */
export function operatingChainFor(
  role: CanonicalRoleKey,
  people: readonly OperatingPerson[],
): { upstream: ChainLink[]; downstream: ChainLink[] } {
  const spec = RESPONSIBILITIES[role];
  const link = (k: CanonicalRoleKey): ChainLink => ({
    role: k,
    label: roleLabel(k),
    people: peopleForRole(people, k),
  });
  return {
    upstream: spec.receivesFrom.map(link),
    downstream: spec.deliversTo.map(link),
  };
}

/** Flujo de la empresa: una fila por etapa, con sus responsables actuales. */
export interface OperatingFlowRow {
  stage: OperatingStage;
  roleLabel: string;
  scopeLabel: string;
  people: OperatingPerson[];
}

export function companyOperatingFlow(people: readonly OperatingPerson[]): OperatingFlowRow[] {
  return OPERATING_CHAIN.map((stage) => ({
    stage,
    roleLabel: roleLabel(stage.owner),
    scopeLabel: scopeLabelOf(stage.owner),
    people: peopleForRole(people, stage.owner),
  }));
}

/** Etapas sin responsable asignado en la empresa activa. */
export function uncoveredStages(people: readonly OperatingPerson[]): OperatingFlowRow[] {
  return companyOperatingFlow(people).filter((row) => row.people.length === 0);
}
