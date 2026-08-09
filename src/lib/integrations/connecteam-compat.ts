/**
 * Resolución de Job / Sub item para el puente Stafly → Connecteam.
 *
 * FASE 2 — la fuente canónica es ahora la CONFIGURACIÓN POR COMPAÑÍA
 * (`connecteam-mapping.ts`, `company_settings.key = 'connecteam_mapping'`).
 *
 * Orden de resolución:
 *   1. mapping     → destino declarado por la compañía (venue → cliente → título)
 *   2. hint        → `connecteam_job_name` explícito en turno/venue/cliente
 *   3. legacy      → BETA_COMPAT_RULES, SOLO mientras la compañía no tenga
 *                    ningún mapping declarado (compatibilidad con el beta de
 *                    Quality Staff: Eminence / Production). Emite aviso.
 *   4. fallback    → nombre crudo de venue/cliente/categoría. También legacy:
 *                    desaparece en cuanto la compañía declara su mapping,
 *                    porque Connecteam lo muestra como "Select".
 *   5. missing     → bloquea la exportación con motivo explícito.
 *
 * SCOPE (HARD BOUNDARY):
 *   Puro, frontend-only. NO writes, NO supabase, NO fetch, NO edge.
 *
 * INVENTARIO DE HARDCODES (auditoría Fase 2, ver reporte):
 *   BETA_COMPAT_RULES contiene 6 reglas hardcodeadas (4 Eminence, 2 Production).
 *   Ya NO son la única fuente: cualquier mapping declarado por la compañía las
 *   desactiva por completo. Se conservan solo como red de compatibilidad para
 *   tenants que aún no han configurado su tabla de traducción.
 */
import type { Shift, SelectOption } from "@/components/shifts/types";
import type { BuildContext, ExportWarning } from "./connecteam-export";
import {
  candidateSubjects,
  hasAnyMapping,
  lookupMapping,
  type ConnecteamMappingConfig,
} from "./connecteam-mapping";

// ── Public types ───────────────────────────────────────────────────────────

export type JobConfidence = "exact" | "inferred" | "fallback" | "missing";

/** Cómo se resolvió el destino. Explicable, nunca un booleano. */
export type DestinationSource =
  | "explicit_mapping"
  | "explicit_hint"
  | "legacy_rule"
  | "raw_fallback"
  | "unresolved";

export interface JobAndSubItem {
  job: string;
  subItem: string;
  confidence: JobConfidence;
  /** Origen canónico y explicable de la decisión de destino. */
  destinationSource: DestinationSource;
  /** Explicación legible de por qué se resolvió así. */
  reason: string;
  /** Scope del mapping explícito usado (`client` / `location` / `title`). */
  mappingScope?: "client" | "location" | "title";
  /** true cuando NO se usó mapping explícito para ESTE destino. */
  fallbackUsed: boolean;
  source: {
    job: "mapping" | "hint" | "location" | "client" | "category" | "none";
    subItem: "mapping" | "compat_rule" | "category" | "none";
    ruleId?: string;
    /** Clave de mapping usada (`client:<id>` / `location:<id>` / `title:<slug>`). */
    mappingKey?: string;
  };
  warnings: ExportWarning[];
}

export interface ResolveOptions {
  /**
   * When false (default true), the helper SKIPS BETA_COMPAT_RULES entirely
   * and falls straight through to hint → location → client → category.
   * Use this if Connecteam ever rejects rows because of a bad inferred bucket.
   */
  enableBetaCompatMapping?: boolean;
  /**
   * Modo estricto OPT-IN, por llamada. Semántica acotada: "para esta
   * resolución, solo acepta un destino declarado explícitamente".
   *
   * NO se deriva del estado de la compañía. Declarar el destino de Imperial
   * NUNCA debe apagar las reglas legacy/fallback válidas de Millennium o
   * Eminence: la resolución es POR DESTINO, no por flag global de compañía.
   */
  strict?: boolean;
}

const DEFAULT_RESOLVE_OPTIONS: Required<Pick<ResolveOptions, "enableBetaCompatMapping">> = {
  enableBetaCompatMapping: true,
};



// ── Helpers ────────────────────────────────────────────────────────────────

function nonEmpty(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Day-of-week for ISO yyyy-mm-dd, computed in UTC to avoid TZ drift in tests. */
function isWeekendISO(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dow = d.getUTCDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
  // Business definition (per shift weekend chips): Fri / Sat / Sun.
  return dow === 5 || dow === 6 || dow === 0;
}

// ── Rule shape ─────────────────────────────────────────────────────────────

interface RuleCondition {
  venueMatches?: RegExp;        // matched against client.name + location.name
  roleMatches?: RegExp;         // matched against category.name + employee_role
  textMatches?: RegExp;         // matched against title + notes + special_instructions
  payTypeIs?: "hourly" | "daily";
  isWeekendDate?: boolean;
}

interface RuleClause extends RuleCondition {
  anyOf?: RuleCondition[];      // OR group — at least one must match
}

interface CompatRule {
  id: string;
  when: RuleClause;
  job: string;
  subItem: string;
}

// ── TEMPORARY COMPATIBILITY MAPPING — Connecteam reporting buckets ─────────
// Order matters: first matching rule wins. Keep the most specific rules first.
// Do not edit without confirming the Connecteam catalog they map to.
export const BETA_COMPAT_RULES: readonly CompatRule[] = Object.freeze([
  // ── Eminence ─────────────────────────────────────────────────────────────
  {
    id: "eminence.headwaiter",
    when: {
      venueMatches: /eminence/i,
      roleMatches: /headwaiter|head[\s-]?waiter|captain|capit[áa]n/i,
    },
    job: "Eminence",
    subItem: "Headwaiters",
  },
  {
    id: "eminence.outside",
    when: {
      venueMatches: /eminence/i,
      textMatches: /outside|fuera|exterior/i,
    },
    job: "Eminence",
    subItem: "Outside Job",
  },
  {
    id: "eminence.regular_waiter",
    when: {
      venueMatches: /eminence/i,
      roleMatches: /waiter|mesero|server/i,
    },
    job: "Eminence",
    subItem: "Regular Waiters",
  },
  // Venue-only default for Eminence: when no role/text signal matched the
  // more specific rules above, the safest Connecteam bucket is "Regular
  // Waiters". Without this rule we fall through to the raw location.name
  // ("Eminence Ballroom") which Connecteam shows as "Select".
  {
    id: "eminence.default_regular_waiter",
    when: { venueMatches: /eminence/i },
    job: "Eminence",
    subItem: "Regular Waiters",
  },

  // ── Production ───────────────────────────────────────────────────────────
  {
    id: "production.weekend",
    when: {
      venueMatches: /production/i,
      anyOf: [
        { payTypeIs: "daily" },
        { isWeekendDate: true },
        { textMatches: /weekend|fin de semana|s[áa]bado|domingo/i },
      ],
    },
    job: "Production",
    subItem: "Weekend Job",
  },
  {
    id: "production.regular",
    when: { venueMatches: /production/i },
    job: "Production",
    subItem: "Regular Job",
  },
]);

// ── Condition matcher ──────────────────────────────────────────────────────

interface ShiftSignals {
  venueText: string;
  roleText: string;
  freeText: string;
  payType: "hourly" | "daily" | null;
  isWeekend: boolean;
}

function buildSignals(shift: Shift, ctx: BuildContext): ShiftSignals {
  const s = shift as Shift & {
    category_id?: string | null;
    special_instructions?: string | null;
    pay_type?: string | null;
  };
  const client = ctx.clients.find(c => c.id === s.client_id);
  const location = ctx.locations.find(l => l.id === s.location_id);
  const category = ctx.categories?.find(c => c.id === s.category_id);
  // employee_role is loosely typed on enriched Shifts; safe optional read.
  const employeeRole = (shift as Shift & { employee_role?: string | null }).employee_role ?? "";

  const venueText = [client?.name, location?.name].filter(Boolean).join("\n");
  const roleText = [category?.name, employeeRole].filter(Boolean).join("\n");
  const freeText = [shift.title, shift.notes, s.special_instructions].filter(Boolean).join("\n");
  const payTypeRaw = nonEmpty(s.pay_type);
  const payType: "hourly" | "daily" | null =
    payTypeRaw === "daily" ? "daily" : payTypeRaw === "hourly" ? "hourly" : null;

  return {
    venueText,
    roleText,
    freeText,
    payType,
    isWeekend: isWeekendISO(shift.date),
  };
}

function matchCondition(cond: RuleCondition, sig: ShiftSignals): boolean {
  if (cond.venueMatches && !cond.venueMatches.test(sig.venueText)) return false;
  if (cond.roleMatches && !cond.roleMatches.test(sig.roleText)) return false;
  if (cond.textMatches && !cond.textMatches.test(sig.freeText)) return false;
  if (cond.payTypeIs && sig.payType !== cond.payTypeIs) return false;
  if (cond.isWeekendDate === true && !sig.isWeekend) return false;
  return true;
}

function matchClause(clause: RuleClause, sig: ShiftSignals): boolean {
  // Base conditions on the clause itself must all match.
  const { anyOf, ...base } = clause;
  if (!matchCondition(base, sig)) return false;
  if (anyOf && anyOf.length > 0) {
    return anyOf.some(c => matchCondition(c, sig));
  }
  return true;
}

// ── Fallback resolver (mirrors connecteam-export resolveJob but local) ─────

interface FallbackResolution {
  job: string;
  subItem: string;
  source: JobAndSubItem["source"];
}

function resolveFallback(shift: Shift, ctx: BuildContext): FallbackResolution & {
  confidence: "exact" | "fallback" | "missing";
} {
  const s = shift as Shift & {
    connecteam_job_name?: string | null;
    category_id?: string | null;
  };
  const client = ctx.clients.find(c => c.id === s.client_id) as
    | (SelectOption & { connecteam_job_name?: string | null })
    | undefined;
  const location = ctx.locations.find(l => l.id === s.location_id) as
    | (SelectOption & { connecteam_job_name?: string | null })
    | undefined;
  const category = ctx.categories?.find(c => c.id === s.category_id);
  const catName = nonEmpty(category?.name);

  const hintList: Array<[string | null | undefined, JobAndSubItem["source"]["job"], boolean]> = [
    [s.connecteam_job_name, "hint", false],
    [location?.connecteam_job_name, "hint", false],
    [client?.connecteam_job_name, "hint", false],
    [location?.name, "location", true],
    [client?.name, "client", true],
    [catName, "category", true],
  ];

  for (const [val, jobSource, isFallback] of hintList) {
    const v = nonEmpty(val);
    if (!v) continue;
    const subItem = catName && catName !== v ? catName : "";
    return {
      job: v,
      subItem,
      source: {
        job: jobSource,
        subItem: subItem ? "category" : "none",
      },
      confidence: isFallback ? "fallback" : "exact",
    };
  }
  return {
    job: "",
    subItem: "",
    source: { job: "none", subItem: "none" },
    confidence: "missing",
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve Connecteam Job / Sub item with the beta compatibility layer.
 *
 *   1. exact     → explicit hint (`connecteam_job_name` on shift/loc/client)
 *   2. inferred  → BETA_COMPAT_RULES matched (ruleId attached)
 *   3. fallback  → location/client/category used directly (may show "Select")
 *   4. missing   → no signal at all (blocks export)
 *
 * Order between (1) and (2): explicit hints win over rules; rules win over
 * naked fallback. This way operators can override a bad rule by setting an
 * explicit Connecteam-job hint per shift/location/client.
 */
export function resolveConnecteamJobAndSubItem(
  shift: Shift,
  ctx: BuildContext,
  options: ResolveOptions = {},
): JobAndSubItem {
  const opts = { ...DEFAULT_RESOLVE_OPTIONS, ...options };
  const warnings: ExportWarning[] = [];
  const mapping: ConnecteamMappingConfig | null = ctx.mapping ?? null;
  const strict = options.strict ?? hasAnyMapping(mapping);

  // 0) Mapping declarado por la compañía — fuente canónica.
  const subjects = connecteamSubjectsForShift(shift, ctx);
  const found = lookupMapping(mapping, subjects);
  if (found) {
    return {
      job: found.entry.job,
      subItem: found.entry.subItem ?? "",
      confidence: "exact",
      source: {
        job: "mapping",
        subItem: found.entry.subItem ? "mapping" : "none",
        mappingKey: `${found.subject.kind}:${found.subject.id}`,
      },
      warnings,
    };
  }

  // 1) Hint explícito (`connecteam_job_name`).
  const fb = resolveFallback(shift, ctx);
  if (fb.confidence === "exact") {
    return { ...fb, confidence: "exact", warnings };
  }

  // 2) Reglas legacy — solo mientras la compañía no declaró su mapping.
  if (!strict && opts.enableBetaCompatMapping) {
    const sig = buildSignals(shift, ctx);
    for (const rule of BETA_COMPAT_RULES) {
      if (matchClause(rule.when, sig)) {
        warnings.push({
          code: "compat_rule_applied",
          severity: "info",
          message: `Regla beta aplicada: ${rule.id} → Job "${rule.job}" / Sub item "${rule.subItem}". Confirma que existe en Connecteam.`,
        });
        return {
          job: rule.job,
          subItem: rule.subItem,
          confidence: "inferred",
          source: { job: "hint", subItem: "compat_rule", ruleId: rule.id },
          warnings,
        };
      }
    }
  }

  // 3) Fallback crudo — legacy. En modo estricto NO se emite: Connecteam lo
  //    mostraría como "Select" y la fila quedaría fuera del reporting.
  if (!strict && fb.confidence === "fallback") {
    warnings.push({
      code: "job_fallback",
      severity: "warn",
      message: `Connecteam Job/Sub item puede necesitar match exacto en Connecteam (fuente: ${fb.source.job}).`,
    });
    return { ...fb, confidence: "fallback", warnings };
  }

  // 4) Sin destino → bloquea con motivo explícito y accionable.
  warnings.push({
    code: "missing_job_mapping",
    severity: "block",
    message: subjects.length
      ? "Falta configurar destino Connecteam (Job/Sub item) para este cliente o lugar."
      : "Sin Job posible — confirma el cliente o el lugar del servicio y configura su destino Connecteam.",
  });
  return {
    job: "",
    subItem: "",
    confidence: "missing",
    source: { job: "none", subItem: "none" },
    warnings,
  };
}

/** Sujetos de mapping (venue → cliente → título) de un servicio. */
export function connecteamSubjectsForShift(shift: Shift, ctx: BuildContext) {
  const client = ctx.clients.find(c => c.id === shift.client_id);
  const location = ctx.locations.find(l => l.id === shift.location_id);
  return candidateSubjects({
    locationId: shift.location_id ?? null,
    locationName: location?.name ?? null,
    clientId: shift.client_id ?? null,
    clientName: client?.name ?? null,
    title: shift.title ?? null,
  });
}

