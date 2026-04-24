/**
 * Robust employee matching for Connecteam Schedule imports.
 *
 * The Schedule Export ONLY brings the user's full name in the "Users" column.
 * No phone, no email, no Connecteam ID. To improve matching beyond exact-name
 * lookup, we:
 *   1. Normalize names (lowercase, trim, strip accents/diacritics, collapse
 *      whitespace, drop punctuation, drop common suffixes like Jr/II/III).
 *   2. Build lookup maps keyed by normalized name AND reversed name
 *      ("APELLIDO NOMBRE" ↔ "NOMBRE APELLIDO").
 *   3. Optionally enrich the maps with phone / email / employer_identification /
 *      connecteam_employee_id pulled from a separate Connecteam **Users**
 *      export (parseConnecteamFile). When that auxiliary file is provided we
 *      can resolve a name → phone → employee_id, giving a stronger match.
 *   4. Conservative fuzzy fallback: only when there is exactly one candidate
 *      within a small Levenshtein distance.
 *
 * Schema: this helper is read-only. It does NOT insert/update anything.
 */
import { normalizePhone } from "@/lib/phone";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface EmployeeRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number?: string | null;
  email?: string | null;
  employer_identification?: string | null;
  connecteam_employee_id?: string | null;
}

/** Auxiliary record from the Connecteam Users export (parseConnecteamFile). */
export interface AuxUserRecord {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  email?: string;
  employer_identification?: string;
  connecteam_employee_id?: string;
}

export type MatchMethod =
  | "external_id"
  | "phone"
  | "email"
  | "exact_name"
  | "reversed_name"
  | "fuzzy_name"
  | "aux_bridge"; // matched via aux Users file → phone/email/id → employee

export interface MatchResult {
  employeeId: string;
  method: MatchMethod;
  confidence: "high" | "medium" | "low";
}

export interface MatchTelemetry {
  external_id: number;
  phone: number;
  email: number;
  exact_name: number;
  reversed_name: number;
  fuzzy_name: number;
  aux_bridge: number;
  unmatched: number;
  ambiguous: number;
}

export interface AmbiguousMatch {
  rawName: string;
  candidates: Array<{ id: string; display: string; method: MatchMethod }>;
}

// ──────────────────────────────────────────────────────────────────────────
// Normalizers
// ──────────────────────────────────────────────────────────────────────────

const NAME_SUFFIX_RE = /\b(jr|sr|ii|iii|iv)\.?$/i;

/** Lowercase, trim, strip diacritics, collapse spaces, remove punctuation. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(NAME_SUFFIX_RE, "")
    .trim();
}

/** "Juan Perez" → "perez juan" (normalized). Returns "" if only one token. */
export function reverseNormalizedName(raw: string | null | undefined): string {
  const norm = normalizeName(raw);
  if (!norm) return "";
  const parts = norm.split(" ");
  if (parts.length < 2) return "";
  return [...parts.slice(1), parts[0]].join(" ");
}

export function normalizeEmail(raw: string | null | undefined): string {
  return raw?.trim().toLowerCase() ?? "";
}

export function normalizeExternalId(raw: string | null | undefined): string {
  return raw?.toString().trim() ?? "";
}

// ──────────────────────────────────────────────────────────────────────────
// Levenshtein (small, O(n*m)) — used only for tie-break on near-matches.
// ──────────────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = tmp;
      prev[j] = curr;
    }
  }
  return prev[b.length];
}

// ──────────────────────────────────────────────────────────────────────────
// Index builder
// ──────────────────────────────────────────────────────────────────────────

interface EmployeeIndex {
  byExternalId: Map<string, string>;       // employer_identification | connecteam_employee_id → empId
  byPhone: Map<string, string>;            // 10-digit phone → empId
  byEmail: Map<string, string>;            // normalized email → empId
  byName: Map<string, string[]>;           // normalized full name → empIds[]
  byReversed: Map<string, string[]>;       // reversed normalized name → empIds[]
  allNames: Array<{ id: string; norm: string; display: string }>; // for fuzzy
}

/** Auxiliary index: maps normalized name → identifiers from the Users export. */
export interface AuxIndex {
  byName: Map<string, AuxUserRecord>;
  byReversed: Map<string, AuxUserRecord>;
}

export function buildEmployeeIndex(employees: EmployeeRecord[]): EmployeeIndex {
  const idx: EmployeeIndex = {
    byExternalId: new Map(),
    byPhone: new Map(),
    byEmail: new Map(),
    byName: new Map(),
    byReversed: new Map(),
    allNames: [],
  };

  for (const e of employees) {
    const display = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
    const norm = normalizeName(display);
    const reversed = reverseNormalizedName(display);

    if (norm) {
      const arr = idx.byName.get(norm) ?? [];
      arr.push(e.id);
      idx.byName.set(norm, arr);
      idx.allNames.push({ id: e.id, norm, display });
    }
    if (reversed) {
      const arr = idx.byReversed.get(reversed) ?? [];
      arr.push(e.id);
      idx.byReversed.set(reversed, arr);
    }

    const empExt = normalizeExternalId(e.employer_identification);
    if (empExt) idx.byExternalId.set(empExt, e.id);
    const cteam = normalizeExternalId(e.connecteam_employee_id);
    if (cteam) idx.byExternalId.set(cteam, e.id);

    const phone = normalizePhone(e.phone_number);
    if (phone) {
      // store last 10 digits for US matching
      const tail = phone.length >= 10 ? phone.slice(-10) : phone;
      idx.byPhone.set(tail, e.id);
    }

    const email = normalizeEmail(e.email);
    if (email) idx.byEmail.set(email, e.id);
  }

  return idx;
}

export function buildAuxIndex(auxRecords: AuxUserRecord[]): AuxIndex {
  const idx: AuxIndex = { byName: new Map(), byReversed: new Map() };
  for (const r of auxRecords) {
    const display = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
    const norm = normalizeName(display);
    const reversed = reverseNormalizedName(display);
    if (norm && !idx.byName.has(norm)) idx.byName.set(norm, r);
    if (reversed && !idx.byReversed.has(reversed)) idx.byReversed.set(reversed, r);
  }
  return idx;
}

// ──────────────────────────────────────────────────────────────────────────
// Resolver
// ──────────────────────────────────────────────────────────────────────────

export interface ResolveOptions {
  /** Maximum Levenshtein distance for fuzzy fallback. Default 2. */
  fuzzyMaxDistance?: number;
}

export class EmployeeResolver {
  readonly empIndex: EmployeeIndex;
  readonly auxIndex: AuxIndex | null;
  readonly opts: Required<ResolveOptions>;

  telemetry: MatchTelemetry = {
    external_id: 0, phone: 0, email: 0,
    exact_name: 0, reversed_name: 0, fuzzy_name: 0,
    aux_bridge: 0, unmatched: 0, ambiguous: 0,
  };
  ambiguous: AmbiguousMatch[] = [];

  constructor(employees: EmployeeRecord[], auxRecords: AuxUserRecord[] | null = null, opts: ResolveOptions = {}) {
    this.empIndex = buildEmployeeIndex(employees);
    this.auxIndex = auxRecords && auxRecords.length > 0 ? buildAuxIndex(auxRecords) : null;
    this.opts = { fuzzyMaxDistance: opts.fuzzyMaxDistance ?? 2 };
  }

  /**
   * Resolve a raw name (as it appears in Connecteam's Schedule "Users" column)
   * to an employee id. Returns null if no confident match was found; ambiguous
   * cases are recorded in `this.ambiguous` for review.
   */
  resolveByName(rawName: string): MatchResult | null {
    const trimmed = rawName?.trim();
    if (!trimmed) return null;
    const norm = normalizeName(trimmed);
    const reversed = reverseNormalizedName(trimmed);

    // 1) Aux-bridge: if we have a Users export, see if it gives us phone/email/id
    //    that we can resolve back to a real employee.
    if (this.auxIndex) {
      const auxHit = this.auxIndex.byName.get(norm) ?? this.auxIndex.byReversed.get(reversed);
      if (auxHit) {
        const ext = normalizeExternalId(auxHit.connecteam_employee_id) || normalizeExternalId(auxHit.employer_identification);
        if (ext) {
          const empId = this.empIndex.byExternalId.get(ext);
          if (empId) { this.telemetry.aux_bridge++; return { employeeId: empId, method: "aux_bridge", confidence: "high" }; }
        }
        const phone = normalizePhone(auxHit.phone_number);
        if (phone) {
          const tail = phone.length >= 10 ? phone.slice(-10) : phone;
          const empId = this.empIndex.byPhone.get(tail);
          if (empId) { this.telemetry.aux_bridge++; return { employeeId: empId, method: "aux_bridge", confidence: "high" }; }
        }
        const email = normalizeEmail(auxHit.email);
        if (email) {
          const empId = this.empIndex.byEmail.get(email);
          if (empId) { this.telemetry.aux_bridge++; return { employeeId: empId, method: "aux_bridge", confidence: "high" }; }
        }
      }
    }

    // 2) Exact normalized name
    const exact = this.empIndex.byName.get(norm);
    if (exact && exact.length === 1) {
      this.telemetry.exact_name++;
      return { employeeId: exact[0], method: "exact_name", confidence: "high" };
    }
    if (exact && exact.length > 1) {
      this.recordAmbiguous(trimmed, exact, "exact_name");
      this.telemetry.ambiguous++;
      return null;
    }

    // 3) Reversed normalized name
    const rev = this.empIndex.byReversed.get(norm);
    if (rev && rev.length === 1) {
      this.telemetry.reversed_name++;
      return { employeeId: rev[0], method: "reversed_name", confidence: "high" };
    }
    if (rev && rev.length > 1) {
      this.recordAmbiguous(trimmed, rev, "reversed_name");
      this.telemetry.ambiguous++;
      return null;
    }

    // Try the other direction too: input may be reversed and DB has it normal.
    if (reversed) {
      const exact2 = this.empIndex.byName.get(reversed);
      if (exact2 && exact2.length === 1) {
        this.telemetry.reversed_name++;
        return { employeeId: exact2[0], method: "reversed_name", confidence: "high" };
      }
      if (exact2 && exact2.length > 1) {
        this.recordAmbiguous(trimmed, exact2, "reversed_name");
        this.telemetry.ambiguous++;
        return null;
      }
    }

    // 4) Conservative fuzzy: ONLY if exactly one candidate has distance ≤ threshold.
    const candidates: Array<{ id: string; dist: number; display: string }> = [];
    for (const e of this.empIndex.allNames) {
      const d = levenshtein(norm, e.norm);
      if (d <= this.opts.fuzzyMaxDistance) candidates.push({ id: e.id, dist: d, display: e.display });
    }
    if (candidates.length === 1) {
      this.telemetry.fuzzy_name++;
      return { employeeId: candidates[0].id, method: "fuzzy_name", confidence: candidates[0].dist === 0 ? "high" : "low" };
    }
    if (candidates.length > 1) {
      // Keep the closest tier only
      const minDist = Math.min(...candidates.map(c => c.dist));
      const closest = candidates.filter(c => c.dist === minDist);
      if (closest.length === 1) {
        this.telemetry.fuzzy_name++;
        return { employeeId: closest[0].id, method: "fuzzy_name", confidence: "low" };
      }
      this.recordAmbiguous(trimmed, closest.map(c => c.id), "fuzzy_name");
      this.telemetry.ambiguous++;
      return null;
    }

    this.telemetry.unmatched++;
    return null;
  }

  private recordAmbiguous(rawName: string, ids: string[], method: MatchMethod) {
    const candidates = ids.map(id => {
      const found = this.empIndex.allNames.find(e => e.id === id);
      return { id, display: found?.display ?? id, method };
    });
    this.ambiguous.push({ rawName, candidates });
  }
}
