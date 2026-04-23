import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * URL-persisted filter state. Each filter is stored as a search param so the
 * filtered view is shareable and survives reloads. Empty / falsy values are
 * removed from the URL to keep it clean.
 *
 * Usage:
 *   const { filters, setFilter, resetFilters, activeCount } =
 *     useUrlFilters({ status: "all", role: "all", q: "" });
 */
export function useUrlFilters<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const out: Record<string, string> = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const v = searchParams.get(key);
      if (v !== null && v !== "") out[key] = v;
    }
    return out as T;
  }, [searchParams, defaults]);

  const setFilter = useCallback(
    (patch: Partial<T>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === "" || v === defaults[k as keyof T]) {
              next.delete(k);
            } else {
              next.set(k, String(v));
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, defaults],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of Object.keys(defaults)) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, defaults]);

  const activeCount = useMemo(
    () =>
      Object.keys(defaults).filter((k) => {
        const v = searchParams.get(k);
        return v !== null && v !== "" && v !== defaults[k as keyof T];
      }).length,
    [searchParams, defaults],
  );

  return { filters, setFilter, resetFilters, activeCount };
}
