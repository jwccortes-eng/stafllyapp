/**
 * P0.4 — CANDIDATO CANÓNICO DE RECIBO
 * ===================================
 *
 * Regla de seguridad dura:
 *
 *   una persona canónica + una relación de empresa + un periodo de nómina
 *   + un resultado pagable aprobado canónico
 *   = COMO MÁXIMO UN candidato de publicación de recibo.
 *
 * Esta capa NO borra filas, NO fusiona identidades, NO mueve movimientos y NO
 * toca datos de nómina. Solo decide, en memoria, qué fila trabajador-periodo
 * puede convertirse en recibo publicable.
 *
 * Orden de autoridad:
 *   1. registro pagable aprobado externo del trabajador-periodo
 *      (`approved_total_override`), o en su defecto la fila de nómina base
 *   2. relación de empresa válida (misma `company_id`)
 *   3. resolución de identidad canónica (`comparePersonRecords`)
 *   4. estado del recibo / bloqueos
 *   5. acceso a la cuenta
 *
 * Lo que NUNCA es elegibilidad de recibo: "cualquier fila trabajador-periodo
 * con actividad monetaria".
 */

import type { BulkPreviewRow } from "@/lib/payroll/bulk-publish";
import {
  comparePersonRecords,
  type PersonRecord,
} from "@/lib/identity/canonical-person";

export type CandidacyRole =
  /** Único candidato publicable de esa persona en ese periodo. */
  | "canonical_candidate"
  /** Fila auxiliar de la misma persona: se preserva, nunca publica. */
  | "auxiliary_duplicate"
  /** Fila sin registro de nómina aprobada (solo movimientos). */
  | "auxiliary_no_approved_payroll"
  /** Identidad no resuelta: se excluye de la publicación hasta evidencia humana. */
  | "identity_review";

export interface Candidacy {
  employeeId: string;
  role: CandidacyRole;
  /** Clave del grupo persona+empresa+periodo. Base de la aserción de unicidad. */
  groupKey: string;
  groupSize: number;
  /** Fila canónica del grupo, si se pudo determinar con seguridad. */
  canonicalEmployeeId: string | null;
  reason: string;
}

export type CandidacyMap = Record<string, Candidacy>;

/**
 * ¿Esta fila representa nómina del periodo y no solo un movimiento suelto?
 * `approved_total_override` (cierre externo aprobado) es la autoridad máxima;
 * si el periodo no tiene cierre externo, vale la fila de nómina base.
 */
export function hasApprovedPayableRecord(row: BulkPreviewRow): boolean {
  return (
    row.approved_total_override !== null ||
    Number(row.base) !== 0 ||
    Number(row.deductions) !== 0
  );
}

function personOf(
  row: BulkPreviewRow,
  people: Record<string, PersonRecord | undefined>,
): PersonRecord {
  return (
    people[row.employee_id] ?? {
      id: row.employee_id,
      company_id: row.company_id ?? null,
      first_name: row.worker_name ?? null,
      last_name: null,
      employer_identification: row.employer_identification,
    }
  );
}

/**
 * Agrupa las filas del periodo por persona canónica (misma empresa) usando la
 * evidencia del resolver canónico. Nunca agrupa entre empresas.
 */
function groupByPerson(
  rows: BulkPreviewRow[],
  people: Record<string, PersonRecord | undefined>,
): { members: BulkPreviewRow[]; confirmed: boolean }[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const r of rows) parent.set(r.employee_id, r.employee_id);

  /** Pares con evidencia débil (mismo nombre) → grupo, pero NO confirmado. */
  const weakPairs = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = personOf(rows[i], people);
      const b = personOf(rows[j], people);
      const companyA = a.company_id ?? rows[i].company_id ?? null;
      const companyB = b.company_id ?? rows[j].company_id ?? null;
      if (!companyA || !companyB || companyA !== companyB) continue;
      const cmp = comparePersonRecords(a, b);
      if (
        cmp.confidence === "CONFIRMED_SAME_PERSON" ||
        cmp.confidence === "POSSIBLE_SAME_PERSON"
      ) {
        union(rows[i].employee_id, rows[j].employee_id);
        if (cmp.confidence !== "CONFIRMED_SAME_PERSON")
          weakPairs.add(find(rows[i].employee_id));
      }
    }
  }

  const buckets = new Map<string, BulkPreviewRow[]>();
  for (const r of rows) {
    const root = find(r.employee_id);
    const list = buckets.get(root) ?? [];
    list.push(r);
    buckets.set(root, list);
  }

  return [...buckets.entries()].map(([root, members]) => ({
    members,
    confirmed: !weakPairs.has(root),
  }));
}

/**
 * Resolución PURA de candidatura de recibo para un periodo.
 * No escribe, no consulta, no muta las filas recibidas.
 */
export function resolveReceiptCandidacy(
  rows: BulkPreviewRow[],
  people: Record<string, PersonRecord | undefined> = {},
): CandidacyMap {
  const out: CandidacyMap = {};
  for (const group of groupByPerson(rows, people)) {
    const { members, confirmed } = group;
    const groupKey = [...members.map((m) => m.employee_id)].sort().join("|");
    const size = members.length;

    if (size === 1) {
      const row = members[0];
      const payable = hasApprovedPayableRecord(row);
      out[row.employee_id] = {
        employeeId: row.employee_id,
        role: payable ? "canonical_candidate" : "auxiliary_no_approved_payroll",
        groupKey,
        groupSize: 1,
        canonicalEmployeeId: payable ? row.employee_id : null,
        reason: payable
          ? "Registro de nómina aprobada del periodo."
          : "Solo tiene movimientos del periodo, sin nómina aprobada: no genera recibo propio.",
      };
      continue;
    }

    const published = members.filter((m) => m.readiness === "published");
    const withOverride = members.filter((m) => m.approved_total_override !== null);
    const authorities =
      withOverride.length > 0 ? withOverride : members.filter(hasApprovedPayableRecord);

    // Un recibo ya publicado es autoridad probada: no se toca jamás.
    const provenAuthority =
      published.length === 1
        ? published[0]
        : authorities.length === 1
          ? authorities[0]
          : null;

    for (const row of members) {
      if (row.readiness === "published") {
        out[row.employee_id] = {
          employeeId: row.employee_id,
          role: "canonical_candidate",
          groupKey,
          groupSize: size,
          canonicalEmployeeId: row.employee_id,
          reason: "Recibo ya publicado: se preserva sin cambios.",
        };
        continue;
      }

      if (!provenAuthority) {
        out[row.employee_id] = {
          employeeId: row.employee_id,
          role: "identity_review",
          groupKey,
          groupSize: size,
          canonicalEmployeeId: null,
          reason:
            authorities.length === 0
              ? "Varias fichas de la misma persona y ninguna con nómina aprobada del periodo."
              : "Varias fichas de la misma persona con nómina aprobada: requiere evidencia humana.",
        };
        continue;
      }

      if (row.employee_id !== provenAuthority.employee_id) {
        out[row.employee_id] = {
          employeeId: row.employee_id,
          role: "auxiliary_duplicate",
          groupKey,
          groupSize: size,
          canonicalEmployeeId: provenAuthority.employee_id,
          reason:
            "Fila auxiliar de la misma persona: su importe ya está incluido en el total aprobado del registro canónico.",
        };
        continue;
      }

      out[row.employee_id] = {
        employeeId: row.employee_id,
        role: confirmed ? "canonical_candidate" : "identity_review",
        groupKey,
        groupSize: size,
        canonicalEmployeeId: row.employee_id,
        reason: confirmed
          ? "Registro canónico con la nómina aprobada del periodo."
          : "La identidad de esta persona aún no está confirmada: se excluye de la publicación masiva.",
      };
    }
  }
  return out;
}

export interface CandidateConflict {
  groupKey: string;
  employeeIds: string[];
}

/**
 * Aserción previa a publicar: nunca más de un candidato por
 * persona canónica + empresa + periodo.
 */
export function assertUniqueReceiptCandidates(
  selected: { employeeId: string; candidacy?: Candidacy | null }[],
): CandidateConflict[] {
  const byGroup = new Map<string, string[]>();
  for (const s of selected) {
    const key = s.candidacy?.groupKey ?? s.employeeId;
    byGroup.set(key, [...(byGroup.get(key) ?? []), s.employeeId]);
  }
  return [...byGroup.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([groupKey, employeeIds]) => ({ groupKey, employeeIds }));
}
