/**
 * MEMORIA DE HORA PROVISIONAL (ELDM ligero, ámbito local del operador)
 * ====================================================================
 *
 * Recuerda qué hora provisional se usó en exportaciones anteriores para poder
 * SUGERIRLA. Nunca se aplica automáticamente: siempre requiere confirmación.
 *
 * SCOPE: UI-only. localStorage por empresa. No toca BD, payroll ni servicios.
 */
import type { ProvisionalEndDecision } from "./connecteam-provisional";

const KEY_PREFIX = "stafly:connecteam:provisional-history:";
const MAX_ENTRIES = 40;

interface Entry {
  mode: ProvisionalEndDecision["mode"];
  value: string;
  at: string;
}

export interface ProvisionalSuggestion {
  mode: ProvisionalEndDecision["mode"];
  /** "22:00" o "6" (horas). */
  value: string;
  /** Cuántas de las últimas exportaciones usaron este valor. */
  count: number;
  total: number;
}

function storageKey(companyId: string | null) {
  return `${KEY_PREFIX}${companyId ?? "none"}`;
}

function read(companyId: string | null): Entry[] {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

export function rememberProvisionalUse(
  companyId: string | null,
  decision: ProvisionalEndDecision,
): void {
  const value =
    decision.mode === "end_time"
      ? String(decision.endTime ?? "").slice(0, 5)
      : String(decision.durationHours ?? "");
  if (!value) return;
  const next: Entry[] = [
    { mode: decision.mode, value, at: new Date().toISOString() },
    ...read(companyId),
  ].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible: la sugerencia simplemente no aparece */
  }
}

/** Sugerencia sólo cuando hay un patrón claro (>= 3 usos y mayoría). */
export function getProvisionalSuggestion(
  companyId: string | null,
): ProvisionalSuggestion | null {
  const entries = read(companyId);
  if (entries.length < 3) return null;
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = `${e.mode}|${e.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let bestKey = "";
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestKey = k;
      bestCount = c;
    }
  }
  if (bestCount < 3 || bestCount * 2 <= entries.length) return null;
  const [mode, value] = bestKey.split("|");
  return {
    mode: mode as ProvisionalEndDecision["mode"],
    value,
    count: bestCount,
    total: entries.length,
  };
}

export function suggestionSentence(s: ProvisionalSuggestion): string {
  const what =
    s.mode === "end_time" ? `${s.value} como hora provisional` : `${s.value}h de duración provisional`;
  return `Las últimas ${s.count} exportaciones utilizaron ${what}.`;
}
