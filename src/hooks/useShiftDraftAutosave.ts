/**
 * useShiftDraftAutosave — S3
 *
 * Local-only autosave for shift create/edit forms. NO DB writes.
 * NO notifications. NO scheduled_shifts/shift_assignments mutations.
 * Purely a localStorage safety net so a refresh / accidental close /
 * HMR / route change does not nuke 5+ minutes of operator work.
 *
 * Key shape: stafly:shift-draft:v1:{companyId}:{userId}:{mode}:{shiftId|"new"}
 *
 * Multi-admin conflict handling is deferred to S5.
 * Cross-route unsaved-changes guard is deferred to S4.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { safeLocalStorage } from "@/lib/safe-storage";

export type DraftStatus = "idle" | "saving" | "saved";

interface Args<T> {
  enabled: boolean;
  companyId: string | null | undefined;
  userId: string | null | undefined;
  mode: "create" | "edit";
  shiftId?: string | null;
  /** Snapshot of the in-progress form state. Stringified for change detection. */
  data: T;
  /** Skip autosave when the form is at its pristine "empty" defaults. */
  isEmpty?: (data: T) => boolean;
  /** Debounce window in ms. Default 1500ms. */
  debounceMs?: number;
}

interface Stored<T> {
  version: 1;
  savedAt: number;
  data: T;
}

const KEY_PREFIX = "stafly:shift-draft:v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function buildKey(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  mode: "create" | "edit",
  shiftId: string | null | undefined,
): string | null {
  if (!companyId || !userId) return null;
  return `${KEY_PREFIX}:${companyId}:${userId}:${mode}:${shiftId || "new"}`;
}

export function useShiftDraftAutosave<T>(args: Args<T>) {
  const { enabled, companyId, userId, mode, shiftId, data, isEmpty, debounceMs = 1500 } = args;

  const key = buildKey(companyId, userId, mode, shiftId);

  const [status, setStatus] = useState<DraftStatus>("idle");
  const [draftAvailable, setDraftAvailable] = useState<Stored<T> | null>(null);

  // Avoid writing the first time we render after open (we just hydrated state from props/shift).
  const skipNextWriteRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const previousKeyRef = useRef<string | null>(null);

  // On enable (dialog opens) or key change, look for an existing draft.
  useEffect(() => {
    if (!enabled || !key) {
      setDraftAvailable(null);
      skipNextWriteRef.current = true;
      lastSerializedRef.current = null;
      previousKeyRef.current = key;
      return;
    }
    if (previousKeyRef.current !== key) {
      previousKeyRef.current = key;
      skipNextWriteRef.current = true;
      lastSerializedRef.current = null;
    }
    const raw = safeLocalStorage.getItem(key);
    if (!raw) {
      setDraftAvailable(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Stored<T>;
      if (!parsed || parsed.version !== 1 || !parsed.savedAt) {
        safeLocalStorage.removeItem(key);
        setDraftAvailable(null);
        return;
      }
      if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
        safeLocalStorage.removeItem(key);
        setDraftAvailable(null);
        return;
      }
      setDraftAvailable(parsed);
    } catch {
      safeLocalStorage.removeItem(key);
      setDraftAvailable(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Debounced autosave whenever `data` changes while enabled.
  useEffect(() => {
    if (!enabled || !key) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      try {
        lastSerializedRef.current = JSON.stringify(data);
      } catch {
        lastSerializedRef.current = null;
      }
      return;
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(data);
    } catch {
      return;
    }
    if (serialized === lastSerializedRef.current) return;

    // If the form is at its pristine empty state, do NOT pollute storage.
    if (isEmpty && isEmpty(data)) {
      lastSerializedRef.current = serialized;
      return;
    }

    setStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const payload: Stored<T> = { version: 1, savedAt: Date.now(), data };
      try {
        safeLocalStorage.setItem(key, JSON.stringify(payload));
        lastSerializedRef.current = serialized;
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, data]);

  const clear = useCallback(() => {
    if (!key) return;
    safeLocalStorage.removeItem(key);
    setDraftAvailable(null);
    setStatus("idle");
    lastSerializedRef.current = null;
    skipNextWriteRef.current = true;
  }, [key]);

  const dismissBanner = useCallback(() => {
    setDraftAvailable(null);
  }, []);

  return {
    status,
    draftAvailable, // { savedAt, data } or null — caller decides when to restore
    clear,
    dismissBanner,
  };
}
