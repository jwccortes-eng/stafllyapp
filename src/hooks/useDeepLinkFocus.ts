import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Generic deep-link scroll + highlight helper.
 *
 * Reads a single id search-param, waits for `loading` to finish, then
 * scrolls the element `[data-<attribute>-id="<id>"]` into view. Also
 * exposes whether the id exists in the current loaded set so callers can
 * render a soft "not found" fallback.
 *
 * Strictly read-only: only touches DOM via `scrollIntoView`. Never mutates
 * data, never fires writes/RPCs.
 */
export function useDeepLinkFocus(opts: {
  param: string;                  // e.g. "time_entry", "shift", "employee"
  attribute: string;              // e.g. "entry" → data-entry-id
  loading: boolean;
  loadedIds: string[];
}) {
  const { param, attribute, loading, loadedIds } = opts;
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get(param);

  const idSet = useMemo(() => new Set(loadedIds), [loadedIds]);
  const present = !!focusId && idSet.has(focusId);

  const [scrolledFor, setScrolledFor] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId || loading || !present) return;
    if (scrolledFor === focusId) return;
    const timers: number[] = [];
    const attempt = () => {
      const el = document.querySelector(
        `[data-${attribute}-id="${CSS.escape(focusId)}"]`,
      );
      if (el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        setScrolledFor(focusId);
        return true;
      }
      return false;
    };
    [50, 250, 600, 1200].forEach((delay) => {
      timers.push(window.setTimeout(() => {
        if (scrolledFor === focusId) return;
        attempt();
      }, delay));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [focusId, present, loading, scrolledFor, attribute]);

  return { focusId, present };
}
