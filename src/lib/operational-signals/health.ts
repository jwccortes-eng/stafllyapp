/**
 * F1.1 — Sink health telemetry. In-memory only: volume, errors and latency of
 * shadow persistence. Never surfaces to users, never affects notifications.
 */
export interface SinkHealthSample {
  at: number;
  companyId: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface SinkHealth {
  observed: number;
  persistedAttempts: number;
  persistedOk: number;
  persistedFailed: number;
  skippedNotEnabled: number;
  errorRatePct: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastError: { at: number; companyId: string; error: string } | null;
  recent: SinkHealthSample[];
}

const MAX_SAMPLES = 200;

let observed = 0;
let skipped = 0;
let samples: SinkHealthSample[] = [];
let lastError: SinkHealth["lastError"] = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* telemetry must never throw into the app */
    }
  });
}

export function subscribeSinkHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordObserved(): void {
  observed += 1;
}

export function recordSkipped(): void {
  skipped += 1;
}

export function recordPersistAttempt(sample: SinkHealthSample): void {
  samples = [sample, ...samples].slice(0, MAX_SAMPLES);
  if (!sample.ok) {
    lastError = { at: sample.at, companyId: sample.companyId, error: sample.error ?? "unknown" };
    // Errors are logged, never thrown: useNotifications is untouched.
    console.warn("[ose:sink] shadow persistence failed", {
      companyId: sample.companyId,
      error: sample.error,
      latencyMs: sample.latencyMs,
    });
  }
  emit();
}

export function getSinkHealth(): SinkHealth {
  const attempts = samples.length;
  const failed = samples.filter((s) => !s.ok).length;
  const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const avg = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;

  return {
    observed,
    persistedAttempts: attempts,
    persistedOk: attempts - failed,
    persistedFailed: failed,
    skippedNotEnabled: skipped,
    errorRatePct: attempts ? Math.round((failed / attempts) * 1000) / 10 : 0,
    avgLatencyMs: avg,
    p95LatencyMs: Math.round(p95),
    lastError,
    recent: samples.slice(0, 20),
  };
}

export function resetSinkHealth(): void {
  observed = 0;
  skipped = 0;
  samples = [];
  lastError = null;
  emit();
}
