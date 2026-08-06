/**
 * ECC — FASE 2. CATÁLOGO CANÓNICO DE CAPACIDADES.
 *
 * Fuente única de verdad FUTURA de "qué se puede hacer" en el ecosistema
 * (Stafly + Parceros). Modelo puro, sin I/O y sin efectos.
 *
 * Reglas duras:
 *  - Namespaced obligatorio: `shared.*`, `stafly.*`, `parceros.*`.
 *  - Una capacidad compartida se declara UNA sola vez en `shared.*`.
 *  - Este catálogo NO gobierna acceso: los gates reales siguen en
 *    `useSubscription` + `ModuleGate` + `company_modules`.
 *  - Nada aquí se edita en runtime: es data inmutable versionada por código.
 */

export const ECC_PRODUCTS = ["shared", "stafly", "parceros"] as const;
export type EccProduct = (typeof ECC_PRODUCTS)[number];

export type CapabilityType = "module" | "feature" | "integration" | "support";
export type CapabilityTier = "core" | "addon" | "experimental";

/**
 * Cómo se gobierna HOY la capacidad en producción (fuente legacy real).
 *  - `company_modules`: hay un gate real (`ModuleGate` + `useSubscription`).
 *  - `code_and_rls`: no hay gate comercial; la ruta existe para toda compañía
 *    y el aislamiento lo dan roles + RLS.
 *  - `portal_modules`: gobernada por `employee_portal_modules` (por persona).
 *  - `none`: todavía no existe superficie en producción.
 */
export type LegacyGovernance = "company_modules" | "code_and_rls" | "portal_modules" | "none";

export type CapabilityStatus = "active" | "planned";

export interface CapabilityDefinition {
  /** `<product>.<dominio>.<acción>` — inmutable una vez publicada. */
  key: string;
  product: EccProduct;
  name: string;
  description: string;
  type: CapabilityType;
  tier: CapabilityTier;
  /** Capacidades que deben estar habilitadas para que ésta tenga sentido. */
  dependencies: string[];
  /** Estado por defecto cuando ningún plan ni override se pronuncia. */
  defaultState: boolean;
  /** Configuración obligatoria antes de poder activarla de verdad. */
  requiredConfig: string[];
  /** Módulo legacy equivalente (`company_modules.module_key`), si existe. */
  legacyModuleKey: string | null;
  /** Cómo se gobierna hoy realmente. */
  legacyGovernance: LegacyGovernance;
  /** Evidencia: rutas, tablas, hooks y políticas que la implementan hoy. */
  legacySources: string[];
  /** Permiso mínimo requerido en producción (no lo concede el ECC). */
  requiredPermission: string;
  /** Límites canónicos asociados (`shared.limit.*`). */
  limitKeys: string[];
  /** Estado de la capacidad en el catálogo. */
  status: CapabilityStatus;
  /** Versión del catálogo en la que quedó con esta forma. */
  version: string;
  /** Explicación operativa: qué incluye y qué NO incluye. */
  explanation: string;
  audit: { addedIn: string; owner: string };
}

const OWNER = "ecc-core";
const V2 = "ecc.phase-2";
const V31 = "ecc.phase-3.1";

function cap(
  key: string,
  name: string,
  description: string,
  opts: Partial<Omit<CapabilityDefinition, "key" | "name" | "description" | "product">> = {},
): CapabilityDefinition {
  const product = key.split(".")[0] as EccProduct;
  const legacyModuleKey = opts.legacyModuleKey ?? null;
  return {
    key,
    product,
    name,
    description,
    type: opts.type ?? "module",
    tier: opts.tier ?? "core",
    dependencies: opts.dependencies ?? [],
    defaultState: opts.defaultState ?? false,
    requiredConfig: opts.requiredConfig ?? [],
    legacyModuleKey,
    legacyGovernance: opts.legacyGovernance ?? (legacyModuleKey ? "company_modules" : "none"),
    legacySources: opts.legacySources ?? (legacyModuleKey ? [`company_modules.${legacyModuleKey}`] : []),
    requiredPermission: opts.requiredPermission ?? "miembro de la compañía",
    limitKeys: opts.limitKeys ?? [],
    status: opts.status ?? "active",
    version: opts.version ?? opts.audit?.addedIn ?? V2,
    explanation: opts.explanation ?? description,
    audit: opts.audit ?? { addedIn: V2, owner: OWNER },
  };
}


/* ───────────────────────────── shared.* ───────────────────────────── */
/** Capacidades comunes a todos los productos del ecosistema. */
const SHARED: CapabilityDefinition[] = [
  cap("shared.identity.directory", "Directorio de personas", "Ver el directorio de personas de la compañía.", {
    defaultState: true,
    legacyModuleKey: "directory",
  }),
  cap("shared.identity.employees", "Gestión de personas", "Crear y administrar personas de la compañía.", {
    defaultState: true,
    legacyModuleKey: "employees",
  }),
  cap("shared.comms.announcements", "Anuncios", "Publicar anuncios internos.", {
    defaultState: true,
    legacyModuleKey: "announcements",
  }),
  cap("shared.comms.chat", "Chat operativo", "Mensajería interna y canales.", {
    tier: "addon",
    legacyModuleKey: "chat",
    dependencies: ["shared.identity.directory"],
  }),
  cap("shared.data.export", "Exportar datos", "Exportar información histórica y legal.", {
    type: "feature",
    defaultState: true,
  }),
  cap("shared.data.reports", "Reportes", "Reportes operativos y analíticos.", {
    tier: "addon",
    legacyModuleKey: "reports",
  }),
  cap("shared.integrations.api", "Acceso API", "Acceso programático a la plataforma.", {
    type: "integration",
    tier: "addon",
    legacyModuleKey: "api-access",
    requiredConfig: ["api_key"],
  }),

  /* ── Fase 3.1: capacidades críticas transversales ya existentes ── */
  cap(
    "shared.documents.storage",
    "Documentos",
    "Infraestructura documental transversal: carga, almacenamiento, metadata, vencimiento y vista previa.",
    {
      defaultState: true,
      dependencies: ["shared.identity.employees"],
      legacyGovernance: "code_and_rls",
      legacySources: [
        "ruta /app/documents (DocumentsCenter)",
        "ruta /app/document-intake (DocumentIntakeCenter)",
        "tablas employee_documents, employee_onboarding_documents, application_documents, document_intake_batches",
        "storage buckets de documentos + RLS por company_id",
      ],
      requiredPermission: "miembro de la compañía; escritura restringida por RLS a admin/manager",
      status: "active",
      version: V31,
      explanation:
        "Permite gestión documental transversal (Stafly y Parceros). NO incluye por sí sola la lógica de cumplimiento: eso es stafly.compliance.*.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "shared.documents.review",
    "Revisión documental",
    "Flujo de revisión: aprobación, rechazo, corrección solicitada y trazabilidad de la decisión.",
    {
      defaultState: true,
      dependencies: ["shared.documents.storage", "shared.audit.trail"],
      legacyGovernance: "code_and_rls",
      legacySources: [
        "document_review_events",
        "RPC versionadas de revisión (VWC Fase 3B)",
        "employee_documents.review_status",
      ],
      requiredPermission: "has_company_role(admin|manager|owner)",
      status: "active",
      version: V31,
      explanation:
        "Decide el estado de un documento. NO decide si una persona puede ser asignada: eso lo resuelve stafly.compliance.assignment_policy.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "shared.audit.trail",
    "Auditoría",
    "Registro transversal e inmutable de eventos operativos, documentales y comerciales.",
    {
      defaultState: true,
      dependencies: [],
      legacyGovernance: "code_and_rls",
      legacySources: [
        "activity_log",
        "document_review_events",
        "compensation_change_log",
        "company_lifecycle_events",
        "payroll_consolidation_audit",
        "invoice_activity_log",
        "assignment_compliance_audit",
        "auditoría de escrituras versionadas (VWC)",
      ],
      requiredPermission: "lectura restringida por RLS al tenant; escritura sólo por RPC/trigger",
      status: "active",
      version: V31,
      explanation:
        "Capacidad transversal: define el derecho a registrar y consultar historial. No mueve ni unifica tablas de historial.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "shared.comms.notifications",
    "Notificaciones",
    "Entrega de notificaciones operativas a personas y administradores.",
    {
      defaultState: true,
      dependencies: ["shared.identity.directory"],
      legacyGovernance: "code_and_rls",
      legacySources: ["notifications", "notification_preferences", "notification_templates"],
      requiredPermission: "destinatario del evento o administrador de la compañía",
      status: "active",
      version: V31,
      explanation:
        "Separada de shared.comms.announcements: los anuncios son contenido publicado; las notificaciones son entrega de eventos.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
];


/* ───────────────────────────── stafly.* ───────────────────────────── */
/** Capacidades de operación de staffing (Quality Staff / Stafly). */
const STAFLY: CapabilityDefinition[] = [
  cap("stafly.ops.shifts", "Servicios y turnos", "Crear y operar servicios/turnos.", {
    defaultState: true,
    legacyModuleKey: "shifts",
    dependencies: ["shared.identity.employees"],
  }),
  cap("stafly.ops.concepts", "Conceptos", "Catálogo de conceptos de pago y operación.", {
    defaultState: true,
    legacyModuleKey: "concepts",
  }),
  cap("stafly.ops.applications", "Aplicaciones", "Recepción de aplicaciones de candidatos.", {
    defaultState: true,
    legacyModuleKey: "applications",
  }),
  cap("stafly.ops.timeclock", "Reloj de asistencia", "Clock-in / clock-out y evidencia de asistencia.", {
    tier: "addon",
    legacyModuleKey: "timeclock",
    dependencies: ["stafly.ops.shifts"],
  }),
  cap("stafly.ops.locations", "Ubicaciones", "Ubicaciones de servicio y puntos de encuentro.", {
    tier: "addon",
    legacyModuleKey: "locations",
  }),
  cap("stafly.ops.clients", "Clientes", "Clientes operativos y solicitudes de servicio.", {
    tier: "addon",
    legacyModuleKey: "clients",
  }),
  cap("stafly.ops.automations", "Automatizaciones", "Reglas automáticas de operación.", {
    tier: "addon",
    legacyModuleKey: "automations",
  }),
  cap("stafly.ops.movements", "Movimientos", "Movimientos operativos y novedades.", {
    tier: "addon",
    legacyModuleKey: "movements",
  }),
  cap("stafly.ops.command_center", "Command Center", "Centro de mando operativo.", {
    tier: "addon",
    legacyModuleKey: "command-center",
  }),
  cap("stafly.payroll.periods", "Periodos de pago", "Apertura, cierre y consolidación de periodos.", {
    tier: "addon",
    legacyModuleKey: "periods",
    dependencies: ["stafly.ops.timeclock"],
  }),
  cap("stafly.payroll.run", "Nómina", "Cálculo y consolidación de nómina.", {
    tier: "addon",
    legacyModuleKey: "payroll",
    dependencies: ["stafly.payroll.periods"],
  }),
  cap("stafly.payroll.summary", "Resumen de nómina", "Resúmenes y cuadres de nómina.", {
    tier: "addon",
    legacyModuleKey: "summary",
    dependencies: ["stafly.payroll.run"],
  }),
  cap("stafly.payroll.reconciliation", "Reconciliación", "Reconciliación de horas y pagos.", {
    tier: "addon",
    legacyModuleKey: "reconciliation",
    dependencies: ["stafly.payroll.periods"],
  }),
  cap("stafly.payroll.import", "Importación", "Importación de datos operativos y de nómina.", {
    tier: "addon",
    legacyModuleKey: "import",
  }),
  cap("stafly.billing.tenant_invoicing", "Facturación a clientes", "Emisión de facturas al cliente final.", {
    tier: "addon",
    legacyModuleKey: "tenant_invoicing",
    dependencies: ["stafly.ops.clients"],
    requiredConfig: ["billing_contact", "currency"],
  }),
  cap("stafly.billing.monetization", "Monetización", "Herramientas de monetización de la operación.", {
    tier: "addon",
    legacyModuleKey: "monetization",
  }),

  /* ── Fase 3.1: cumplimiento y portal del trabajador ── */
  cap(
    "stafly.compliance.requirements",
    "Cumplimiento",
    "Requisitos por persona: documentos obligatorios, readiness, vencimientos y advertencias.",
    {
      defaultState: true,
      dependencies: ["shared.documents.storage", "shared.identity.employees", "shared.audit.trail"],
      legacyGovernance: "code_and_rls",
      legacySources: [
        "ruta /app/compliance-center (ComplianceCenter)",
        "src/lib/compliance/rules-engine.ts + useWorkerCompliance",
        "get_required_documents_for_company",
        "get_employee_shift_readiness / compute_employee_profile_status",
      ],
      requiredPermission: "has_company_role(admin|manager|supervisor) para ver la vista de compañía",
      status: "active",
      version: V31,
      explanation:
        "Habilita la lógica de cumplimiento de Stafly. El ECC sólo habilita la capacidad: el resultado operativo lo siguen decidiendo las funciones existentes.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "stafly.compliance.assignment_policy",
    "Política de asignación",
    "Bloqueos y advertencias de cumplimiento al asignar a una persona a un servicio.",
    {
      defaultState: true,
      dependencies: ["stafly.compliance.requirements", "stafly.ops.shifts"],
      legacyGovernance: "code_and_rls",
      legacySources: [
        "get_assignment_compliance_policy",
        "get_employee_assignment_status / get_employees_assignment_status",
        "has_active_assignment_override",
        "assignment_compliance_audit",
      ],
      requiredPermission: "quien puede gestionar turnos (canManageShifts + RLS)",
      status: "active",
      version: V31,
      explanation:
        "No duplica get_employee_assignment_status: el ECC no reinterpreta cumplimiento, sólo declara que la compañía tiene la capacidad.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "stafly.worker_portal.access",
    "Portal del trabajador",
    "Acceso del trabajador a su portal: inicio, perfil, turnos y aceptación/rechazo.",
    {
      defaultState: true,
      dependencies: ["shared.identity.employees", "shared.comms.notifications"],
      legacyGovernance: "portal_modules",
      legacySources: [
        "rutas /portal/* con PortalModuleGuard",
        "employee_portal_modules (my_shifts, my_clock, my_payments, my_profile, my_availability)",
        "usePortalModules / useEffectiveEmployee",
      ],
      requiredPermission: "persona autenticada vinculada al employee del tenant",
      status: "active",
      version: V31,
      explanation:
        "Acceso base del portal. Documentos, reloj y captain room son capacidades separadas para no volverlo monolítico.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "stafly.worker_portal.documents",
    "Documentos del trabajador",
    "El trabajador consulta y carga sus propios documentos desde el portal.",
    {
      defaultState: true,
      dependencies: ["stafly.worker_portal.access", "shared.documents.storage"],
      legacyGovernance: "portal_modules",
      legacySources: ["employee_portal_modules.my_documents / my_w9", "rutas /portal/documents y /portal/w9"],
      requiredPermission: "la persona sólo ve sus propios documentos (RLS por employee_id)",
      status: "active",
      version: V31,
      explanation:
        "Superficie del portal sobre shared.documents.storage. No concede revisión: aprobar o rechazar es shared.documents.review.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),
  cap(
    "stafly.worker_portal.captain_room",
    "Sala del capitán",
    "Vista de coordinación en sitio para la persona designada capitán del servicio.",
    {
      tier: "addon",
      defaultState: true,
      dependencies: ["stafly.worker_portal.access", "stafly.ops.shifts"],
      legacyGovernance: "code_and_rls",
      legacySources: ["ruta /portal/shift-captain (ShiftCaptainRoom)", "designación de capitán en scheduled_shifts"],
      requiredPermission: "persona asignada como capitán del turno",
      status: "active",
      version: V31,
      explanation: "Capacidad separada del portal base: no todas las compañías la operan.",
      audit: { addedIn: V31, owner: OWNER },
    },
  ),

];

/* ──────────────────────────── parceros.* ──────────────────────────── */
/** Capacidades del producto de talento/marketplace. Sin herencia automática. */
const PARCEROS: CapabilityDefinition[] = [
  cap("parceros.passport.profile", "Pasaporte laboral", "Perfil público verificable del trabajador.", {
    type: "feature",
    defaultState: true,
  }),
  cap("parceros.passport.publish", "Publicar pasaporte", "Publicación del pasaporte al ecosistema.", {
    type: "feature",
    tier: "addon",
    dependencies: ["parceros.passport.profile"],
  }),
  cap("parceros.marketplace.requests", "Solicitudes de talento", "Publicar y recibir solicitudes de talento.", {
    tier: "addon",
    dependencies: ["parceros.passport.profile"],
  }),
  cap("parceros.reputation.reviews", "Reputación y reseñas", "Reseñas y puntajes de reputación.", {
    type: "feature",
    tier: "addon",
  }),
  cap("parceros.marketplace.flash_jobs", "Flash jobs", "Ofertas inmediatas de trabajo.", {
    tier: "experimental",
    dependencies: ["parceros.marketplace.requests"],
  }),
];

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = Object.freeze([
  ...SHARED,
  ...STAFLY,
  ...PARCEROS,
]);

export const CAPABILITY_BY_KEY: ReadonlyMap<string, CapabilityDefinition> = new Map(
  CAPABILITY_CATALOG.map(c => [c.key, c]),
);

/** Índice inverso: `company_modules.module_key` → capability canónica. */
export const LEGACY_MODULE_TO_CAPABILITY: Readonly<Record<string, string>> = Object.freeze(
  CAPABILITY_CATALOG.reduce<Record<string, string>>((acc, c) => {
    if (c.legacyModuleKey) acc[c.legacyModuleKey] = c.key;
    return acc;
  }, {}),
);

export const getCapability = (key: string): CapabilityDefinition | null =>
  CAPABILITY_BY_KEY.get(key) ?? null;

export const capabilitiesForProduct = (product: EccProduct): CapabilityDefinition[] =>
  CAPABILITY_CATALOG.filter(c => c.product === product);

/** Cierre transitivo de dependencias de una capability. */
export function capabilityDependencyChain(key: string, seen = new Set<string>()): string[] {
  const def = getCapability(key);
  if (!def) return [];
  for (const dep of def.dependencies) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    capabilityDependencyChain(dep, seen);
  }
  return [...seen];
}

/** Validación estructural del catálogo (usada en tests y en el panel). */
export function validateCatalog(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of CAPABILITY_CATALOG) {
    if (seen.has(c.key)) problems.push(`Capability duplicada: ${c.key}`);
    seen.add(c.key);
    if (!ECC_PRODUCTS.includes(c.product)) problems.push(`Producto inválido en ${c.key}`);
    if (!c.key.startsWith(`${c.product}.`)) problems.push(`Namespace inconsistente en ${c.key}`);
    for (const dep of c.dependencies) {
      if (!CAPABILITY_BY_KEY.has(dep)) problems.push(`Dependencia inexistente ${dep} en ${c.key}`);
    }
  }
  const legacySeen = new Map<string, string>();
  for (const c of CAPABILITY_CATALOG) {
    if (!c.legacyModuleKey) continue;
    const prev = legacySeen.get(c.legacyModuleKey);
    if (prev) problems.push(`Módulo legacy ${c.legacyModuleKey} mapeado a ${prev} y ${c.key}`);
    legacySeen.set(c.legacyModuleKey, c.key);
  }
  // Dominios reservados: si algo es compartido, vive una sola vez en shared.*
  for (const c of CAPABILITY_CATALOG) {
    const domain = c.key.split(".")[1];
    if (c.product !== "shared" && SHARED_ONLY_DOMAINS.has(domain)) {
      problems.push(`Dominio compartido duplicado por producto: ${c.key} debe vivir en shared.${domain}.*`);
    }
  }
  // Una capacidad activa no puede depender de una capacidad sólo planificada.
  for (const c of CAPABILITY_CATALOG) {
    if (c.status !== "active") continue;
    for (const dep of c.dependencies) {
      if (CAPABILITY_BY_KEY.get(dep)?.status === "planned") {
        problems.push(`${c.key} está activa pero depende de ${dep}, que sigue planificada.`);
      }
    }
  }
  return problems;
}

/** Dominios que jamás se duplican por producto (documentos, auditoría, identidad). */
export const SHARED_ONLY_DOMAINS: ReadonlySet<string> = new Set(["documents", "audit", "identity"]);

/**
 * Capacidades críticas de Fase 3.1: deben estar representadas para que una
 * compañía pueda siquiera evaluarse como READY.
 */
export const CRITICAL_CAPABILITY_KEYS: readonly string[] = Object.freeze([
  "shared.documents.storage",
  "shared.documents.review",
  "shared.audit.trail",
  "shared.comms.notifications",
  "stafly.compliance.requirements",
  "stafly.compliance.assignment_policy",
  "stafly.worker_portal.access",
  "stafly.worker_portal.documents",
]);

