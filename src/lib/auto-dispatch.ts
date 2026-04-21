/**
 * auto-dispatch.ts
 *
 * Smart Dispatch engine — phase 3.
 *
 * The engine NEVER mutates assignments, payroll or attendance on its own.
 * It only:
 *   1) reads the alerts already produced by `operations-intelligence.ts`,
 *   2) generates candidate replacements via `suggestReplacements`,
 *   3) computes a confidence score per suggestion,
 *   4) persists every suggestion in `dispatch_logs` so we can build a
 *      learning loop later (no ML yet — pure logging).
 *
 * The UI then renders these suggestions and asks the admin for an explicit
 * 1-click execute/dismiss. Execution itself is delegated to the existing
 * flows (ReplacementSuggestionDialog, OpsBroadcastDialog) and recorded back
 * into the same dispatch_log row via `markDispatchLog`.
 *
 * ──── Conservative thresholds (decision: phase 3) ─────────────────────────
 *   - Only consider shifts starting in ≤ 120 minutes (HARD).
 *   - Only consider shifts with effective coverage < 60% (HARD).
 *   - REPLACE_WORKERS requires at least 1 available candidate.
 *   - BROADCAST is only suggested if no available candidate but there is
 *     workforce we can ping (>= 3 active employees in company).
 *
 * Multi-tenant: every public function takes `companyId`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  generateAlerts,
  computeCoverageBatch,
  type OpsAlert,
  type ShiftCoverage,
} from "@/lib/operations-intelligence";
import {
  suggestReplacements,
  type ReplacementCandidate,
} from "@/lib/operations-actions";

// ─── Types ────────────────────────────────────────────────────────────────

export type DispatchActionType = "REPLACE_WORKERS" | "BROADCAST";

export type DispatchStatus =
  | "suggested"
  | "executed"
  | "partially_executed"
  | "dismissed"
  | "expired";

export interface DispatchSuggestion {
  /** Stable client-side id (reflects shift + action). UI key. */
  id: string;
  /** dispatch_logs.id once persisted. */
  logId?: string;
  type: DispatchActionType;
  shiftId: string;
  shiftTitle: string;
  shiftStart: string;        // ISO
  startsInMinutes: number;
  zone: string | null;
  required: number;
  missing: number;
  candidates: ReplacementCandidate[];
  confidence: number;        // 0–1
  reason: string;
  /**
   * UI hint — derived from confidence buckets:
   *   high   ≥ 0.85
   *   medium ≥ 0.60
   *   low    < 0.60
   */
  confidenceBucket: "high" | "medium" | "low";
}

// ─── Confidence model ─────────────────────────────────────────────────────

/**
 * Confidence is a weighted blend of:
 *   - urgency        (0–1)  shorter time-to-start ⇒ higher
 *   - candidate fit  (0–1)  best candidate score ÷ 100
 *   - candidate depth(0–1)  how many viable candidates relative to missing
 *   - rating boost   (0–1)  best candidate rating ÷ 5
 *
 * Weights tuned for the conservative profile we agreed on (high precision).
 */
function computeConfidence(args: {
  startsInMinutes: number;
  missing: number;
  available: ReplacementCandidate[];
}): number {
  const { startsInMinutes, missing, available } = args;
  const top = available[0];
  if (!top) return 0;

  // Urgency: 120min → 0.0, 0min → 1.0 (capped)
  const urgency = Math.max(0, Math.min(1, 1 - startsInMinutes / 120));

  // Candidate fit: best score (0–100) → 0–1
  const fit = Math.max(0, Math.min(1, (top.score ?? 50) / 100));

  // Depth: have at least `missing` available candidates? → 1.0
  const depth = Math.max(0, Math.min(1, available.length / Math.max(1, missing)));

  // Rating boost: 0–5 → 0–1, but only when we have ≥ 2 ratings to trust
  const ratingBoost = top.ratingCount >= 2
    ? Math.max(0, Math.min(1, (top.rating ?? 0) / 5))
    : 0.5; // neutral if no rating data

  const blended =
    urgency * 0.30 +
    fit     * 0.30 +
    depth   * 0.25 +
    ratingBoost * 0.15;

  return Math.round(blended * 1000) / 1000;
}

function bucketOf(c: number): DispatchSuggestion["confidenceBucket"] {
  if (c >= 0.85) return "high";
  if (c >= 0.60) return "medium";
  return "low";
}

// ─── Engine ───────────────────────────────────────────────────────────────

const HARD_MAX_STARTS_IN_MIN = 120; // shift must start within 2h
const HARD_MAX_COVERAGE_PCT = 60;   // and have effective coverage < 60%

/**
 * Reads alerts → derives candidate suggestions for the qualifying shifts.
 * Pure function: no side-effects, no DB writes. Persisting is up to caller.
 */
export async function evaluateDispatchActions(
  companyId: string,
): Promise<DispatchSuggestion[]> {
  if (!companyId) return [];

  // 1) Pull current alerts (already deduped + zone-grouped)
  const alerts = await generateAlerts(companyId);
  const eligibleShiftIds = new Set<string>();
  alerts.forEach((a: OpsAlert) => {
    if (a.kind === "UNDERSTAFFED" || a.kind === "LOW_COVERAGE_SOON") {
      a.shiftIds.forEach(id => eligibleShiftIds.add(id));
    }
  });
  if (!eligibleShiftIds.size) return [];

  // 2) Batch coverage for those shifts
  const coverageMap = await computeCoverageBatch(Array.from(eligibleShiftIds));

  // 3) Filter by hard thresholds
  const qualifying: ShiftCoverage[] = [];
  coverageMap.forEach(cov => {
    if (cov.startsInMinutes == null) return;
    if (cov.startsInMinutes < 0) return;             // already started
    if (cov.startsInMinutes > HARD_MAX_STARTS_IN_MIN) return;
    if (cov.effectiveCoveragePct >= HARD_MAX_COVERAGE_PCT) return;
    qualifying.push(cov);
  });
  if (!qualifying.length) return [];

  // 4) Hydrate shift metadata (title + zone)
  const ids = qualifying.map(q => q.shiftId);
  const { data: shiftRows } = await supabase
    .from("scheduled_shifts")
    .select("id, title, date, start_time, location_id, client_id, locations(name), clients(name)")
    .in("id", ids);
  const shiftMeta = new Map<string, { title: string; start: string; zone: string | null }>();
  (shiftRows ?? []).forEach((s: any) => {
    const zone = s.locations?.name ?? s.clients?.name ?? null;
    shiftMeta.set(s.id, {
      title: s.title ?? "Turno",
      start: `${s.date}T${s.start_time}`,
      zone,
    });
  });

  // 5) For each qualifying shift, fetch candidates + score the suggestion.
  //    Prioritized order: shortest startsIn first, biggest miss first.
  qualifying.sort((a, b) => {
    const tA = a.startsInMinutes ?? Infinity;
    const tB = b.startsInMinutes ?? Infinity;
    if (tA !== tB) return tA - tB;
    return (b.required - b.assigned) - (a.required - a.assigned);
  });

  const suggestions: DispatchSuggestion[] = [];

  for (const cov of qualifying) {
    const meta = shiftMeta.get(cov.shiftId);
    if (!meta) continue;
    const missing = Math.max(0, cov.required - cov.assigned);
    if (missing <= 0) continue;

    const candidates = await suggestReplacements(cov.shiftId, { limit: 8 });
    const available = candidates.filter(c => c.available);

    if (available.length > 0) {
      const confidence = computeConfidence({
        startsInMinutes: cov.startsInMinutes!,
        missing,
        available,
      });
      suggestions.push({
        id: `replace:${cov.shiftId}`,
        type: "REPLACE_WORKERS",
        shiftId: cov.shiftId,
        shiftTitle: meta.title,
        shiftStart: meta.start,
        startsInMinutes: cov.startsInMinutes!,
        zone: meta.zone,
        required: cov.required,
        missing,
        candidates: available.slice(0, missing + 2),
        confidence,
        confidenceBucket: bucketOf(confidence),
        reason:
          `Faltan ${missing} en "${meta.title}"` +
          (meta.zone ? ` (${meta.zone})` : "") +
          ` y hay ${available.length} candidato${available.length === 1 ? "" : "s"} disponible${available.length === 1 ? "" : "s"}.`,
      });
    } else {
      // No directly available candidate → propose a broadcast intent.
      // Only emit if there is enough workforce to broadcast to (≥3 actives).
      const fallbackPool = candidates.slice(0, 6);
      if (fallbackPool.length >= 3) {
        // Confidence for broadcast is intentionally lower (medium ceiling).
        const urgency = Math.max(0, Math.min(1, 1 - cov.startsInMinutes! / 120));
        const confidence = Math.round((0.45 + urgency * 0.25) * 1000) / 1000;
        suggestions.push({
          id: `broadcast:${cov.shiftId}`,
          type: "BROADCAST",
          shiftId: cov.shiftId,
          shiftTitle: meta.title,
          shiftStart: meta.start,
          startsInMinutes: cov.startsInMinutes!,
          zone: meta.zone,
          required: cov.required,
          missing,
          candidates: fallbackPool,
          confidence,
          confidenceBucket: bucketOf(confidence),
          reason:
            `Sin candidatos libres para "${meta.title}". Sugerimos broadcast a ${fallbackPool.length} workers.`,
        });
      }
    }
  }

  return suggestions;
}

// ─── Persistence (learning loop) ──────────────────────────────────────────

/**
 * Insert a dispatch_logs row for a fresh suggestion. Returns the new row id
 * so the UI can later mark it executed/dismissed via `markDispatchLog`.
 *
 * Idempotency: callers can pass a stable `clientKey` so we don't insert
 * duplicates on every poll. We rely on a recent-window lookup (last 30min,
 * same shift + action_type, status='suggested') as a soft dedupe.
 */
export async function persistSuggestion(
  companyId: string,
  s: DispatchSuggestion,
): Promise<string | null> {
  // Soft dedupe — avoid spamming the table on every poll
  const sinceIso = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: existing } = await supabase
    .from("dispatch_logs")
    .select("id")
    .eq("company_id", companyId)
    .eq("shift_id", s.shiftId)
    .eq("action_type", s.type)
    .eq("status", "suggested")
    .gte("created_at", sinceIso)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("dispatch_logs")
    .insert({
      company_id: companyId,
      action_type: s.type,
      shift_id: s.shiftId,
      zone: s.zone,
      candidates_json: s.candidates as unknown as any,
      confidence: s.confidence,
      reason: s.reason,
      status: "suggested",
    } as any)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[auto-dispatch] persistSuggestion failed", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Update a suggestion's outcome after the admin acts. Used by both Execute
 * and Dismiss flows. `executedAssignments` is optional and only recorded
 * when the admin actually ran an assignment / broadcast.
 */
export async function markDispatchLog(
  logId: string,
  patch: {
    status: Extract<DispatchStatus, "executed" | "partially_executed" | "dismissed" | "expired">;
    decidedBy?: string | null;
    executedAssignments?: unknown;
    outcome?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("dispatch_logs")
    .update({
      status: patch.status,
      decided_at: new Date().toISOString(),
      decided_by: patch.decidedBy ?? null,
      executed_assignments: (patch.executedAssignments ?? null) as any,
      outcome: patch.outcome ?? null,
    } as any)
    .eq("id", logId);

  if (error) console.warn("[auto-dispatch] markDispatchLog failed", error);
}
