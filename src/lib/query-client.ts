import { QueryClient } from "@tanstack/react-query";

/**
 * STAFLY-CTX-001 — Operational Resume Fix (Fase 3, conservador).
 *
 * Solo se aplican defaults suaves:
 *  - `staleTime: 30_000` evita refetches instantáneos al recuperar foco
 *    cuando los datos aún son frescos. Cada tab/pantalla puede seguir
 *    definiendo su propio staleTime.
 *  - `refetchOnWindowFocus` se deja en el default (true) — NO se desactiva
 *    globalmente porque hay pantallas operativas que sí lo necesitan.
 *  - `retry: 1` reduce cascadas de reintentos durante hipos de red.
 *
 * NO se toca cache time, ni se limpian queries en focus.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnReconnect: "always",
    },
  },
});
