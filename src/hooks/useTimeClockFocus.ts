import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Consumes deep-link params for two entry points:
 *
 *  1) Payroll Dry-Run Root-Cause Explorer:
 *       ?date=YYYY-MM-DD&time_entry=<id>&shift=<id>&filter=needs-review
 *
 *  2) Shift Ops "Cerrar clock-out" / "Revisar horas" CTA (Sprint 34+36):
 *       ?employeeId=<id>&shiftId=<id>
 *
 * Strictly read-only:
 *  - never mutates data
 *  - never triggers writes / RPCs
 *  - only drives scroll + visual highlight and an OPTIONAL setSearchParams
 *    replace() that fills in the `date` param from the shift row so the
 *    correct day window is loaded. This is a URL-only side effect, no DB
 *    or app-state mutation.
 *
 * When a `shiftId` is passed without a matching loaded time_entry (worker
 * present but never clocked, or historical shift outside today's window),
 * it degrades silently and exposes `missingEntry === true` so the caller
 * can render a soft "sin fichaje registrado — validar con evidencia" hint.
 */
export function useTimeClockFocus(opts: {
  loading: boolean;
  loadedEntryIds: string[];
  /**
   * Optional. If provided, the hook can resolve a focus entry id from
   * `?employeeId=&shiftId=` by matching (employee_id, shift_id) pairs.
   */
  entries?: Array<{ id: string; employee_id: string; shift_id: string | null }>;
}) {
  const { loading, loadedEntryIds, entries } = opts;
  const [searchParams, setSearchParams] = useSearchParams();

  const rawEntryParam = searchParams.get("time_entry");
  const focusDate = searchParams.get("date");
  const shiftParam = searchParams.get("shift");
  const employeeIdParam = searchParams.get("employeeId");
  const shiftIdParam = searchParams.get("shiftId");

  // Merge shift aliases: Explorer uses `shift`, Shift Ops uses `shiftId`.
  const focusShiftId = shiftIdParam || shiftParam || null;
  const focusEmployeeId = employeeIdParam || null;
  const originFromShiftOps = !!(employeeIdParam || shiftIdParam);

  // Resolve the target entry to scroll/highlight:
  // 1) explicit ?time_entry param wins;
  // 2) otherwise match by (employee_id, shift_id) in loaded entries.
  const resolvedFromPair = useMemo(() => {
    if (rawEntryParam) return null;
    if (!focusEmployeeId || !focusShiftId || !entries?.length) return null;
    const hit = entries.find(
      (e) => e.employee_id === focusEmployeeId && e.shift_id === focusShiftId,
    );
    return hit?.id ?? null;
  }, [rawEntryParam, focusEmployeeId, focusShiftId, entries]);

  const focusEntryId = rawEntryParam ?? resolvedFromPair;

  const idSet = useMemo(() => new Set(loadedEntryIds), [loadedEntryIds]);
  const entryPresent = !!focusEntryId && idSet.has(focusEntryId);

  // "Missing entry" only meaningful when we came from Shift Ops with a full
  // (employee, shift) pair and the entry list has finished loading but no
  // match exists.
  const missingEntry =
    originFromShiftOps &&
    !!focusEmployeeId &&
    !!focusShiftId &&
    !loading &&
    !rawEntryParam &&
    !resolvedFromPair;

  const hasFocus =
    !!focusEntryId || !!focusDate || !!focusEmployeeId || !!focusShiftId;

  // ─── Read-only shift-date lookup ─────────────────────────────
  // When Shift Ops sent us a `shiftId` but no `date`, fetch the shift's
  // canonical date and fill the `date` URL param so the day window loads
  // the correct historical day. Purely a URL replace(); no DB writes.
  const [shiftDateFetched, setShiftDateFetched] = useState<string | null>(null);
  useEffect(() => {
    if (!shiftIdParam) return;
    if (focusDate) return; // already scoped by URL
    if (shiftDateFetched === shiftIdParam) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("scheduled_shifts")
        .select("date")
        .eq("id", shiftIdParam)
        .maybeSingle();
      if (cancelled) return;
      setShiftDateFetched(shiftIdParam);
      const d = (data as { date?: string } | null)?.date;
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const next = new URLSearchParams(searchParams);
        if (!next.get("date")) {
          next.set("date", d);
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shiftIdParam, focusDate, shiftDateFetched, searchParams, setSearchParams]);

  // ─── scroll + highlight ─────────────────────────────────────
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
    focusEmployeeId,
    entryPresent,
    hasFocus,
    originFromShiftOps,
    missingEntry,
  };
}
