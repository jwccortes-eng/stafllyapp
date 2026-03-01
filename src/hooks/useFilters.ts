import { useState, useEffect, useCallback } from "react";

/**
 * Debounced value hook for search inputs.
 * Returns the debounced value after the specified delay.
 */
export function useDebouncedValue<T>(value: T, delay: number = 350): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Persisted filters hook — saves last-used filters per key in localStorage.
 */
export function usePersistedFilters<T extends Record<string, any>>(
  storageKey: string,
  defaultFilters: T,
) {
  const [filters, setFilters] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`filters:${storageKey}`);
      if (stored) return { ...defaultFilters, ...JSON.parse(stored) };
    } catch {
      // ignore
    }
    return defaultFilters;
  });

  const updateFilters = useCallback(
    (patch: Partial<T>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(`filters:${storageKey}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    try {
      localStorage.removeItem(`filters:${storageKey}`);
    } catch {
      // ignore
    }
  }, [storageKey, defaultFilters]);

  return { filters, updateFilters, clearFilters };
}
