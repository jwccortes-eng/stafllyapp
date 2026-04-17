import { useState, useCallback } from "react";
import { safeLocalStorage } from "@/lib/safe-storage";

const STORAGE_KEY = "stafly-nav-pins";
const MAX_PINS = 6;

export function useNavPreferences(defaultPins: string[]) {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const saved = safeLocalStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, MAX_PINS);
      }
    } catch {}
    return defaultPins.slice(0, MAX_PINS);
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter(p => p !== id);
      } else {
        if (prev.length >= MAX_PINS) return prev;
        next = [...prev, id];
      }
      safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reorderPins = useCallback((ids: string[]) => {
    const clamped = ids.slice(0, MAX_PINS);
    setPinnedIds(clamped);
    safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
  }, []);

  return { pinnedIds, togglePin, reorderPins, maxPins: MAX_PINS };
}
