/**
 * F1.1 — aggregated unresolved analytics.
 *
 * P: never emit one alert per shift. Unresolved is a CONFIGURATION signal,
 * aggregated by company / location / client, with a representative sample and
 * a prioritised list of future shifts.
 */
import type { ObservationRecord } from "../engine/types";

export interface UnresolvedGroup {
  key: string;
  label: string;
  count: number;
  sampleAggregateIds: string[];
}

export interface PriorityShift {
  aggregateId: string;
  subjectLabel: string;
  shiftDate: string | null;
  changeType: string;
  impactLevel: number;
  cause: string;
}

export interface UnresolvedAggregate {
  totalEvaluations: number;
  unresolvedCount: number;
  unresolvedPct: number;
  byCompany: UnresolvedGroup[];
  byLocation: UnresolvedGroup[];
  byClient: UnresolvedGroup[];
  topCauses: UnresolvedGroup[];
  /** Future shifts first: they are the ones still fixable. */
  priorityFutureShifts: PriorityShift[];
  representativeSample: PriorityShift[];
}

function bump(
  map: Map<string, UnresolvedGroup>,
  key: string,
  label: string,
  aggregateId: string,
): void {
  const entry = map.get(key) ?? { key, label, count: 0, sampleAggregateIds: [] };
  entry.count += 1;
  if (entry.sampleAggregateIds.length < 5) entry.sampleAggregateIds.push(aggregateId);
  map.set(key, entry);
}

const sorted = (map: Map<string, UnresolvedGroup>) =>
  [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

const str = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

export function aggregateUnresolved(
  records: ObservationRecord[],
  now = new Date().toISOString(),
): UnresolvedAggregate {
  const byCompany = new Map<string, UnresolvedGroup>();
  const byLocation = new Map<string, UnresolvedGroup>();
  const byClient = new Map<string, UnresolvedGroup>();
  const byCause = new Map<string, UnresolvedGroup>();
  const shifts: PriorityShift[] = [];

  let unresolvedCount = 0;
  const today = now.slice(0, 10);

  for (const r of records) {
    if (r.managerResolution.status !== "unresolved") continue;
    unresolvedCount += 1;
    const cause = r.managerResolution.unresolvedCause ?? "unknown";
    const locationId = str(r.context.locationId);
    const clientId = str(r.context.clientId);
    const shiftDate = str(r.context.shiftDate);

    bump(byCompany, r.companyId, str(r.context.companyLabel) ?? r.companyId, r.aggregateId);
    bump(byLocation, locationId ?? "sin_ubicacion", str(r.context.locationLabel) ?? locationId ?? "Sin ubicación", r.aggregateId);
    bump(byClient, clientId ?? "sin_cliente", str(r.context.clientLabel) ?? clientId ?? "Sin cliente", r.aggregateId);
    bump(byCause, cause, cause, r.aggregateId);

    shifts.push({
      aggregateId: r.aggregateId,
      subjectLabel: str(r.context.subjectLabel) ?? r.aggregateId,
      shiftDate,
      changeType: r.changeType,
      impactLevel: r.impactLevel,
      cause,
    });
  }

  const future = shifts
    .filter((s) => s.shiftDate !== null && s.shiftDate >= today)
    .sort(
      (a, b) =>
        b.impactLevel - a.impactLevel ||
        (a.shiftDate ?? "").localeCompare(b.shiftDate ?? ""),
    )
    .slice(0, 20);

  // Representative sample: one shift per distinct cause, capped.
  const seenCauses = new Set<string>();
  const representativeSample = shifts
    .filter((s) => {
      if (seenCauses.has(s.cause)) return false;
      seenCauses.add(s.cause);
      return true;
    })
    .slice(0, 10);

  return {
    totalEvaluations: records.length,
    unresolvedCount,
    unresolvedPct: records.length === 0 ? 0 : Math.round((unresolvedCount / records.length) * 1000) / 10,
    byCompany: sorted(byCompany),
    byLocation: sorted(byLocation),
    byClient: sorted(byClient),
    topCauses: sorted(byCause),
    priorityFutureShifts: future,
    representativeSample,
  };
}
