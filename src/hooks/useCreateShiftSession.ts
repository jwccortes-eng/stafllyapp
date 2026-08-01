/**
 * P0.4 — CREATE SHIFT SESSION (compartido móvil + desktop)
 *
 * "No estamos implementando persistencia. Estamos protegiendo el trabajo del
 * usuario."
 *
 * Hook único sobre el motor de `create-shift-session.ts`. Cualquier superficie
 * que cree turnos (sheet móvil, diálogo desktop) obtiene el MISMO
 * comportamiento: sesión aislada por usuario + empresa, autoguardado local,
 * recuperación explícita y limpieza total.
 *
 * Reglas duras:
 *   · nunca escribe en base de datos (ni drafts, ni scheduled_shifts);
 *   · nunca rehidrata en silencio una sesión de otra empresa u otro usuario;
 *   · al crear correctamente o al descartar, no queda absolutamente nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearSessionWith,
  newSessionId,
  readSessionWith,
  writeSessionWith,
  type CreateShiftSurface,
  type RecoveredSession,
} from "@/lib/shifts/create-shift-session";

interface Args<T> {
  /** Sólo trabaja mientras la superficie de creación está abierta/montada. */
  enabled: boolean;
  userId: string | null | undefined;
  companyId: string | null | undefined;
  surface: CreateShiftSurface;
  /** Foto viva del formulario. */
  draft: T;
  /** ¿Hay trabajo real que merezca protegerse? Un formulario vacío no. */
  isMeaningful: (draft: T) => boolean;
  /** Saneado defensivo al leer del storage. `null` ⇒ registro inservible. */
  normalize: (draft: unknown) => T | null;
  debounceMs?: number;
}

export interface CreateShiftSessionApi<T> {
  /** Sesión sin finalizar encontrada al abrir. La UI decide: continuar o descartar. */
  recovered: RecoveredSession<T> | null;
  /** El usuario continuó (o ya vio el aviso): deja de ofrecerse. */
  acknowledgeRecovery: () => void;
  /** Guarda ya mismo (por ejemplo al cerrar el diálogo con "Guardar para después"). */
  saveNow: () => void;
  /** Borra sesión, copia durable y temporizadores. No deja basura. */
  endSession: () => void;
  sessionId: string;
}

export function useCreateShiftSession<T>(args: Args<T>): CreateShiftSessionApi<T> {
  const { enabled, userId, companyId, surface, draft, isMeaningful, normalize, debounceMs = 800 } = args;

  const sessionIdRef = useRef<string>(newSessionId());
  const readyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<T>(draft);
  const ownerRef = useRef<string | null>(null);
  const [recovered, setRecovered] = useState<RecoveredSession<T> | null>(null);

  draftRef.current = draft;

  const owner = enabled && userId && companyId ? `${userId}:${companyId}` : null;

  // Apertura o cambio de dueño (usuario/empresa): la sesión anterior no se
  // hereda jamás. Se busca la sesión propia de ESTE par usuario+empresa.
  useEffect(() => {
    if (!owner) {
      readyRef.current = false;
      ownerRef.current = null;
      setRecovered(null);
      return;
    }
    if (ownerRef.current === owner) return;
    ownerRef.current = owner;
    readyRef.current = false;
    const found = readSessionWith<T>({ userId, companyId, surface, normalize });
    if (found) {
      sessionIdRef.current = found.sessionId;
      setRecovered(found);
    } else {
      sessionIdRef.current = newSessionId();
      setRecovered(null);
    }
    readyRef.current = true;
    // `normalize` suele ser una función inline: se excluye a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, userId, companyId, surface]);

  const persist = useCallback(() => {
    if (!readyRef.current || !userId || !companyId) return;
    if (!isMeaningful(draftRef.current)) return;
    writeSessionWith({
      sessionId: sessionIdRef.current,
      userId,
      companyId,
      surface,
      draft: draftRef.current,
    });
  }, [userId, companyId, surface, isMeaningful]);

  // Autoguardado debounced. Sólo local.
  useEffect(() => {
    if (!enabled || !readyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, draft, persist, debounceMs]);

  // Cierre inesperado del navegador: última foto antes de irse.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => persist();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [enabled, persist]);

  const endSession = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    clearSessionWith({ userId, companyId, surface });
    readyRef.current = false;
    ownerRef.current = null;
    sessionIdRef.current = newSessionId();
    setRecovered(null);
  }, [userId, companyId, surface]);

  return {
    recovered,
    acknowledgeRecovery: () => setRecovered(null),
    saveNow: persist,
    endSession,
    sessionId: sessionIdRef.current,
  };
}
