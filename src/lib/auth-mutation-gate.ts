/**
 * STAFLY-CTX-001 — Centralized Mutation Gate
 * ==========================================
 *
 * While `authState === "recovering"` (Supabase emitted an unexpected
 * SIGNED_OUT and we're probing whether it's a transient hiccup or a real
 * expiry), the UI must NOT send business writes. RLS remains the authority
 * on the server, but this client-side gate keeps UX clean:
 *
 *  - Prevents raw 401/403 toasts during a temporary refresh gap.
 *  - Preserves the form/route/Company Context so the user can retry after
 *    the session comes back.
 *  - Never auto-retries a mutation on its own (idempotency is unknown).
 *
 * Design:
 *  - Module-scope authState mirror, published by `AuthProvider` via
 *    `publishAuthState` (single writer).
 *  - `guardMutation(fn)` / `assertAuthReady()` for imperative callers.
 *  - `useMutationGate()` React hook exposes `{ canMutate, blockedReason,
 *    guard, authState }` for CTAs (disabled state, humane copy).
 *
 * NOT in scope: retrying, cancellation of already in-flight requests, or
 * refetch behaviour. This is strictly a pre-flight gate.
 */
import { useSyncExternalStore } from "react";
import type { AuthState } from "@/hooks/useAuth";

export const MUTATION_GATE_MESSAGE =
  "Reconectando sesión. Podrás continuar en unos segundos.";
export const MUTATION_GATE_SIGNED_OUT_MESSAGE =
  "Tu sesión expiró. Vuelve a iniciar sesión para continuar.";

export class MutationBlockedError extends Error {
  readonly code: "auth_recovering" | "auth_unauthenticated";
  constructor(code: "auth_recovering" | "auth_unauthenticated", message?: string) {
    super(
      message ??
        (code === "auth_recovering"
          ? MUTATION_GATE_MESSAGE
          : MUTATION_GATE_SIGNED_OUT_MESSAGE),
    );
    this.name = "MutationBlockedError";
    this.code = code;
  }
}

let currentAuthState: AuthState = "initializing";
const listeners = new Set<() => void>();

/** Called by AuthProvider whenever authState transitions. */
export function publishAuthState(next: AuthState): void {
  if (next === currentAuthState) return;
  currentAuthState = next;
  for (const l of listeners) l();
}

/** Test-only reset. */
export function __resetMutationGateForTests(): void {
  currentAuthState = "initializing";
  listeners.clear();
}

export function getAuthStateSnapshot(): AuthState {
  return currentAuthState;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True when a business mutation is currently allowed to leave the client. */
export function canMutateNow(): boolean {
  return currentAuthState === "authenticated";
}

/** Throws MutationBlockedError if not allowed to mutate right now. */
export function assertAuthReady(): void {
  if (currentAuthState === "authenticated") return;
  if (currentAuthState === "recovering") {
    throw new MutationBlockedError("auth_recovering");
  }
  // initializing / unauthenticated are both "no writes allowed".
  throw new MutationBlockedError("auth_unauthenticated");
}

/**
 * Wrap an async mutation. If blocked, throws MutationBlockedError BEFORE
 * calling `fn` — so no network request leaves the client.
 */
export async function guardMutation<T>(fn: () => Promise<T>): Promise<T> {
  assertAuthReady();
  return fn();
}

export interface MutationGate {
  authState: AuthState;
  canMutate: boolean;
  /** Human copy suitable for a toast or an inline hint; null when allowed. */
  blockedReason: string | null;
  /** Wrap an async mutation; throws MutationBlockedError if gated. */
  guard: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Imperative check for form-submit handlers. */
  assertReady: () => void;
}

/** React hook — re-renders when the gate opens/closes. */
export function useMutationGate(): MutationGate {
  const state = useSyncExternalStore(subscribe, getAuthStateSnapshot, getAuthStateSnapshot);
  return {
    authState: state,
    canMutate: state === "authenticated",
    blockedReason:
      state === "recovering"
        ? MUTATION_GATE_MESSAGE
        : state === "unauthenticated"
          ? MUTATION_GATE_SIGNED_OUT_MESSAGE
          : state === "initializing"
            ? MUTATION_GATE_MESSAGE
            : null,
    guard: guardMutation,
    assertReady: assertAuthReady,
  };
}
