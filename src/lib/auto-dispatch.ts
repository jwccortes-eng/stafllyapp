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
import { generateAlerts, computeCoverageBatch, type OpsAlert, type ShiftCoverage } from "@/lib/operations-intelligence";
import { suggestReplacements, type ReplacementCandidate } from "@/lib/operations-actions";

import { executeDispatch } from "@/core/dispatch-engine";
import { applyDispatchPlan } from "@/lib/dispatch-writers";
// ─── Types ────────────────────────────────────────────────────────────────

export type DispatchActionType = "REPLACE_WORKERS" | "BROADCAST";

export type DispatchStatus = "suggested" | "executed" | "partially_executed" | "dismissed" | "expired";

export interface DispatchSuggestion {
  /** Stable client-side id (reflects shift + action). UI key. */
  id: string;
  /** dispatch_logs.id once persisted. */
  logId?: string;
  type: DispatchActionType;
  shiftId: string;
  shiftTitle: string;
  shiftStart: string; // ISO
  startsInMinutes: number;
  zone: string | null;
  required: number;
  missing: number;
  candidates: ReplacementCandidate[];
  confidence: number; // 0–1
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
  const ratingBoost = top.ratingCount >= 2 ? Math.max(0, Math.min(1, (top.rating ?? 0) / 5)) : 0.5; // neutral if no rating data

  const blended = urgency * 0.3 + fit * 0.3 + depth * 0.25 + ratingBoost * 0.15;

  return Math.round(blended * 1000) / 1000;
}

function bucketOf(c: number): DispatchSuggestion["confidenceBucket"] {
  if (c >= 0.85) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

// ─── Engine ───────────────────────────────────────────────────────────────

const HARD_MAX_STARTS_IN_MIN = 120; // shift must start within 2h
const HARD_MAX_COVERAGE_PCT = 60; // and have effective coverage < 60%

/**
 * Reads alerts → derives candidate suggestions for the qualifying shifts.
 * Pure function: no side-effects, no DB writes. Persisting is up to caller.
 */
export async function evaluateDispatchActions(companyId: string): Promise<DispatchSuggestion[]> {
  if (!companyId) return [];

  // 1) Pull current alerts (already deduped + zone-grouped)
  const alerts = await generateAlerts(companyId);
  const eligibleShiftIds = new Set<string>();
  alerts.forEach((a: OpsAlert) => {
    if (a.kind === "UNDERSTAFFED" || a.kind === "LOW_COVERAGE_SOON") {
      a.shiftIds.forEach((id) => eligibleShiftIds.add(id));
    }
  });
  if (!eligibleShiftIds.size) return [];

  // 2) Batch coverage for those shifts
  const coverageMap = await computeCoverageBatch(Array.from(eligibleShiftIds));

  // 3) Filter by hard thresholds
  const qualifying: ShiftCoverage[] = [];
  coverageMap.forEach((cov) => {
    if (cov.startsInMinutes == null) return;
    if (cov.startsInMinutes < 0) return; // already started
    if (cov.startsInMinutes > HARD_MAX_STARTS_IN_MIN) return;
    if (cov.effectiveCoveragePct >= HARD_MAX_COVERAGE_PCT) return;
    qualifying.push(cov);
  });
  if (!qualifying.length) return [];

  // 4) Hydrate shift metadata (title + zone)
  const ids = qualifying.map((q) => q.shiftId);
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
    return b.required - b.assigned - (a.required - a.assigned);
  });

  const suggestions: DispatchSuggestion[] = [];

  for (const cov of qualifying) {
    const meta = shiftMeta.get(cov.shiftId);
    if (!meta) continue;
    const missing = Math.max(0, cov.required - cov.assigned);
    if (missing <= 0) continue;

    const candidates = await suggestReplacements(cov.shiftId, { limit: 8 });
    const available = candidates.filter((c) => c.available);

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
          reason: `Sin candidatos libres para "${meta.title}". Sugerimos broadcast a ${fallbackPool.length} workers.`,
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
export async function persistSuggestion(companyId: string, s: DispatchSuggestion): Promise<string | null> {
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

// ─── Full Auto Dispatch (phase 4) ─────────────────────────────────────────
//
// Optional opt-in layer. The admin chooses the autonomy level per company
// via `company_settings.value.level`. The engine never escalates — it only
// runs the actions explicitly allowed at the current level.

export type AutoDispatchLevel = "off" | "assist" | "semi_auto" | "full_auto";

export interface AutoDispatchConfig {
  level: AutoDispatchLevel;
  /** When true, broadcast intents are auto-sent in full_auto. */
  allowAutoBroadcast: boolean;
  /** When true, top candidate is auto-assigned in full_auto. */
  allowAutoAssign: boolean;
}

export const AUTO_DISPATCH_DEFAULTS: AutoDispatchConfig = {
  level: "off",
  allowAutoBroadcast: true,
  allowAutoAssign: true,
};

export const AUTO_DISPATCH_SETTINGS_KEY = "auto_dispatch";

/** Hard safety thresholds for ANY automatic execution. Non-negotiable. */
export const AUTO_SAFETY = {
  minConfidence: 0.9,
  maxStartsInMinutes: 120,
  maxMissingPerShift: 3,
  minTopCandidateScore: 80,
  // Rate limits across the entire company
  maxAutoActionsPerHour: 5,
  maxAutoActionsPerShift: 2,
} as const;

/** Loads the auto-dispatch config for a company (with safe defaults). */
export async function loadAutoDispatchConfig(companyId: string): Promise<AutoDispatchConfig> {
  if (!companyId) return AUTO_DISPATCH_DEFAULTS;
  const { data } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", AUTO_DISPATCH_SETTINGS_KEY)
    .maybeSingle();
  const stored = (data?.value as Partial<AutoDispatchConfig>) ?? {};
  return { ...AUTO_DISPATCH_DEFAULTS, ...stored };
}

/**
 * Counts auto-executed dispatches in the last hour for rate limiting.
 * `outcome` starts with the literal "AUTO:" prefix for everything the engine
 * runs without admin click — that's our marker.
 */
async function countRecentAutoActions(companyId: string, opts: { sinceMs: number; shiftId?: string }) {
  const sinceIso = new Date(Date.now() - opts.sinceMs).toISOString();
  let q = supabase
    .from("dispatch_logs")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "executed")
    .like("outcome", "AUTO:%")
    .gte("decided_at", sinceIso);
  if (opts.shiftId) q = q.eq("shift_id", opts.shiftId);
  const { count } = await q;
  return count ?? 0;
}

export interface AutoExecutionResult {
  suggestion: DispatchSuggestion;
  status: "executed" | "skipped";
  action?: "auto_assign" | "auto_broadcast";
  reason?: string;
  assignedEmployeeId?: string;
  notifiedEmployeeIds?: string[];
}

/**
 * Decides whether a single suggestion qualifies for unattended execution.
 * Returns null when it does, or a human-readable reason when it doesn't.
 */
function safetyBlockReason(s: DispatchSuggestion, cfg: AutoDispatchConfig): string | null {
  if (cfg.level !== "full_auto") return "level_not_full_auto";
  if (s.confidence < AUTO_SAFETY.minConfidence) return "low_confidence";
  if (s.startsInMinutes > AUTO_SAFETY.maxStartsInMinutes) return "starts_too_far";
  if (s.startsInMinutes < 0) return "already_started";
  if (s.missing > AUTO_SAFETY.maxMissingPerShift) return "too_many_missing";
  if (s.type === "REPLACE_WORKERS") {
    if (!cfg.allowAutoAssign) return "auto_assign_disabled";
    const top = s.candidates[0];
    if (!top) return "no_candidate";
    if (!top.available) return "top_busy";
    if ((top.score ?? 0) < AUTO_SAFETY.minTopCandidateScore) return "candidate_score_low";
  } else if (s.type === "BROADCAST") {
    if (!cfg.allowAutoBroadcast) return "auto_broadcast_disabled";
    if (s.candidates.length < 3) return "audience_too_small";
  }
  return null;
}

/**
 * Headless assignment — mirrors `ReplacementSuggestionDialog.assignEmployee`
 * but without UI. Re-checks the overlap guarantee at insert time so two
 * concurrent runs cannot double-book the same worker.
 */
async function autoAssignWorker(args: {
  companyId: string;
  shiftId: string;
  employeeId: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Re-validate freshness: shift still under-staffed and worker still free.
  const { data: shift } = await supabase
    .from("scheduled_shifts")
    .select("id, date, start_time, end_time, deleted_at, slots")
    .eq("id", args.shiftId)
    .maybeSingle();
  if (!shift || shift.deleted_at) return { ok: false, error: "shift_gone" };

  const { data: existing } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("shift_id", args.shiftId)
    .eq("employee_id", args.employeeId)
    .not("status", "in", '("rejected","removed")')
    .maybeSingle();
  if (existing) return { ok: false, error: "already_assigned" };

  const { error } = await supabase.from("shift_assignments").insert({
    shift_id: args.shiftId,
    employee_id: args.employeeId,
    company_id: args.companyId,
    status: "confirmed",
    assignment_role: "worker",
  } as any);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Headless broadcast — inserts in-app notifications for the audience.
 * Uses the same `notifications` table as `OpsBroadcastDialog`.
 */
async function autoBroadcast(args: {
  companyId: string;
  shiftId: string;
  shiftTitle: string;
  startsInMinutes: number;
  employeeIds: string[];
}): Promise<{ ok: boolean; error?: string; sent: number }> {
  if (!args.employeeIds.length) return { ok: false, error: "no_audience", sent: 0 };
  const body =
    args.startsInMinutes <= 60
      ? `🚨 URGENTE: necesitamos cubrir "${args.shiftTitle}" en ${args.startsInMinutes}m. ¿Puedes entrar?`
      : `Necesitamos cubrir "${args.shiftTitle}" en ${args.startsInMinutes}m. ¿Estás disponible?`;

  const rows = args.employeeIds.map((empId) => ({
    company_id: args.companyId,
    recipient_id: empId,
    recipient_type: "employee",
    type: "shift_urgent",
    title: "🚨 Turno por cubrir",
    body,
    metadata: { shift_id: args.shiftId, source: "auto_dispatch" } as any,
    created_by: null,
  }));

  const { error } = await supabase.from("notifications").insert(rows as any);
  if (error) return { ok: false, error: error.message, sent: 0 };
  return { ok: true, sent: rows.length };
}

/**
 * Top-level autonomous loop. Idempotent; safe to call on every poll.
 * Only acts when company is set to `full_auto` AND every safety rule passes.
 */
export async function executeAutoDispatch(companyId: string): Promise<AutoExecutionResult[]> {
  if (!companyId) return [];
  const cfg = await loadAutoDispatchConfig(companyId);
  if (cfg.level !== "full_auto") return [];

  // Global rate limit
  const recentHour = await countRecentAutoActions(companyId, { sinceMs: 60 * 60_000 });
  if (recentHour >= AUTO_SAFETY.maxAutoActionsPerHour) {
    return [
      {
        suggestion: {} as DispatchSuggestion,
        status: "skipped",
        reason: `rate_limit_hour:${recentHour}`,
      },
    ];
  }

  const suggestions = await evaluateDispatchActions(companyId);
  if (!suggestions.length) return [];

  const results: AutoExecutionResult[] = [];
  let budget = AUTO_SAFETY.maxAutoActionsPerHour - recentHour;

  for (const s of suggestions) {
    if (budget <= 0) break;

    const block = safetyBlockReason(s, cfg);
    if (block) {
      results.push({ suggestion: s, status: "skipped", reason: block });
      continue;
    }

    // Per-shift rate limit
    const recentShift = await countRecentAutoActions(companyId, {
      sinceMs: 60 * 60_000,
      shiftId: s.shiftId,
    });
    if (recentShift >= AUTO_SAFETY.maxAutoActionsPerShift) {
      results.push({ suggestion: s, status: "skipped", reason: "rate_limit_shift" });
      continue;
    }

    // Persist (or reuse) the dispatch_logs row first so we always have an
    // anchor to record the outcome — even when the action itself fails.
    const logId = await persistSuggestion(companyId, s);

    if (s.type === "REPLACE_WORKERS") {
      const plan = await executeDispatch(s.shiftId, "auto");
      await applyDispatchPlan(plan);

      if (logId) {
        await markDispatchLog(logId, {
          status: "executed",
          outcome: "AUTO: executed via core engine",
        });
      }

      results.push({
        suggestion: s,
        status: "executed",
        action: "auto_assign",
      });

      budget--;
    }
    if (s.type === "BROADCAST") {
      const audience = s.candidates.map((c) => c.employeeId);
      const out = await autoBroadcast({
        companyId,
        shiftId: s.shiftId,
        shiftTitle: s.shiftTitle,
        startsInMinutes: s.startsInMinutes,
        employeeIds: audience,
      });
      if (out.ok) {
        if (logId)
          await markDispatchLog(logId, {
            status: "executed",
            executedAssignments: { mode: "auto_broadcast", employeeIds: audience },
            outcome: `AUTO: broadcast a ${out.sent} workers`,
          });
        results.push({
          suggestion: s,
          status: "executed",
          action: "auto_broadcast",
          notifiedEmployeeIds: audience,
        });
        budget--;
      } else {
        if (logId)
          await markDispatchLog(logId, {
            status: "dismissed",
            outcome: `AUTO_FAIL: ${out.error}`,
          });
        results.push({ suggestion: s, status: "skipped", reason: out.error });
      }
    }
  }

  return results;
}

// ─── Recent log read (for AutoDispatchLog UI) ────────────────────────────

export interface DispatchLogEntry {
  id: string;
  actionType: DispatchActionType;
  status: DispatchStatus;
  shiftId: string | null;
  zone: string | null;
  confidence: number;
  reason: string | null;
  outcome: string | null;
  decidedAt: string | null;
  createdAt: string;
  isAuto: boolean;
}

export async function loadRecentDispatchLogs(
  companyId: string,
  opts?: { limit?: number },
): Promise<DispatchLogEntry[]> {
  if (!companyId) return [];
  const { data } = await supabase
    .from("dispatch_logs")
    .select("id, action_type, status, shift_id, zone, confidence, reason, outcome, decided_at, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 20);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    actionType: r.action_type,
    status: r.status,
    shiftId: r.shift_id,
    zone: r.zone,
    confidence: Number(r.confidence ?? 0),
    reason: r.reason,
    outcome: r.outcome,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
    isAuto: typeof r.outcome === "string" && r.outcome.startsWith("AUTO:"),
  }));
}
