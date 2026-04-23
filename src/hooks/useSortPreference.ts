import { useCallback, useEffect, useState } from "react";
import type { SortDirection } from "@/components/ui/sort-indicator";

export interface SortState<TKey extends string = string> {
  key: TKey;
  direction: Exclude<SortDirection, null>;
}

/**
 * Persisted sort preference per module key. Stored in localStorage so the
 * user's last sort survives navigation and reloads.
 */
export function useSortPreference<TKey extends string = string>(
  storageKey: string,
  defaultSort: SortState<TKey>,
) {
  const [sort, setSort] = useState<SortState<TKey>>(() => {
    try {
      const raw = localStorage.getItem(`sort:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as SortState<TKey>;
        if (parsed.key && (parsed.direction === "asc" || parsed.direction === "desc")) {
          return parsed;
        }
      }
    } catch {
      // ignore parse errors
    }
    return defaultSort;
  });

  useEffect(() => {
    try {
      localStorage.setItem(`sort:${storageKey}`, JSON.stringify(sort));
    } catch {
      // ignore quota errors
    }
  }, [storageKey, sort]);

  /**
   * Click handler for a sortable column header.
   * - First click on a new column → asc
   * - Click on the active column → flip direction
   */
  const onSort = useCallback((key: TKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }, []);

  const directionFor = useCallback(
    (key: TKey): SortDirection => (sort.key === key ? sort.direction : null),
    [sort],
  );

  return { sort, setSort, onSort, directionFor };
}
