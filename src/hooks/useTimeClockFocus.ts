import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Consumes deep-link params from Payroll Dry-Run Root-Cause Explorer:
 *   ?date=YYYY-MM-DD&time_entry=<id>&shift=<id>&filter=needs-review
 *
 * Strictly read-only:
 *  - never mutates data
 *  - never triggers writes / RPCs
 *  - only drives scroll + visual highlight
 *
 * If the referenced time_entry is not currently loaded (e.g. date is outside
 * today's window), it degrades silently and exposes `entryPresent === false`
 * so the caller can render a soft "fichaje fuera del rango cargado" hint.
 */
export function useTimeClockFocus(opts: {
  loading: boolean;
  loadedEntryIds: string[];
}) {
  const { loading, loadedEntryIds } = opts;
  const [searchParams] = useSearchParams();
  const focusEntryId = searchParams.get("time_entry");
  const focusDate = searchParams.get("date");
  const focusShiftId = searchParams.get("shift");

  const idSet = useMemo(() => new Set(loadedEntryIds), [loadedEntryIds]);
  const entryPresent = !!focusEntryId && idSet.has(focusEntryId);

  const [scrolledFor, setScrolledFor] = useState<string | null>(null);

  useEffect(() => {
    if (!focusEntryId) return;
    if (loading) return;
    if (!entryPresent) return;
    if (scrolledFor === focusEntryId) return;

    const timers: number[] = [];
    const attempt = () => {
      const el = document.querySelector(
        `[data-entry-id="${CSS.escape(focusEntryId)}"]`,
      );
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        setScrolledFor(focusEntryId);
        return true;
      }
      return false;
    };
    [50, 250, 600, 1200].forEach((delay) => {
      timers.push(window.setTimeout(() => {
        if (scrolledFor === focusEntryId) return;
        attempt();
      }, delay));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [focusEntryId, entryPresent, loading, scrolledFor]);

  return {
    focusEntryId,
    focusDate,
    focusShiftId,
    entryPresent,
    hasFocus: !!focusEntryId || !!focusDate,
  };
}
