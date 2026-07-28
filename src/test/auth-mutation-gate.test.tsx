/**
 * STAFLY-CTX-001 — Mutation Gate tests.
 *
 * Verifies that business writes are blocked while `authState !== "authenticated"`
 * and that the gate does NOT auto-retry.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  publishAuthState,
  guardMutation,
  assertAuthReady,
  canMutateNow,
  useMutationGate,
  MutationBlockedError,
  MUTATION_GATE_MESSAGE,
  MUTATION_GATE_SIGNED_OUT_MESSAGE,
  __resetMutationGateForTests,
} from "@/lib/auth-mutation-gate";

beforeEach(() => {
  __resetMutationGateForTests();
});

describe("mutation gate — imperative API", () => {
  it("blocks mutations while recovering and does NOT invoke the request", async () => {
    publishAuthState("recovering");
    const network = vi.fn().mockResolvedValue("ok");

    await expect(guardMutation(network)).rejects.toBeInstanceOf(MutationBlockedError);
    expect(network).not.toHaveBeenCalled();
    expect(canMutateNow()).toBe(false);
  });

  it("blocks mutations while unauthenticated", async () => {
    publishAuthState("unauthenticated");
    const network = vi.fn().mockResolvedValue("ok");
    await expect(guardMutation(network)).rejects.toMatchObject({ code: "auth_unauthenticated" });
    expect(network).not.toHaveBeenCalled();
  });

  it("blocks mutations while initializing", () => {
    // initializing is the module default → treat as not-ready.
    expect(() => assertAuthReady()).toThrow(MutationBlockedError);
  });

  it("allows mutations when authenticated", async () => {
    publishAuthState("authenticated");
    const network = vi.fn().mockResolvedValue(42);
    await expect(guardMutation(network)).resolves.toBe(42);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-retry a blocked mutation when the gate reopens", async () => {
    publishAuthState("recovering");
    const network = vi.fn().mockResolvedValue("ok");
    await expect(guardMutation(network)).rejects.toBeInstanceOf(MutationBlockedError);

    publishAuthState("authenticated");
    // The blocked call is gone; nothing runs automatically.
    expect(network).not.toHaveBeenCalled();
  });

  it("carries the correct human message per state", () => {
    publishAuthState("recovering");
    try { assertAuthReady(); } catch (e) {
      expect((e as Error).message).toBe(MUTATION_GATE_MESSAGE);
    }
    publishAuthState("unauthenticated");
    try { assertAuthReady(); } catch (e) {
      expect((e as Error).message).toBe(MUTATION_GATE_SIGNED_OUT_MESSAGE);
    }
  });
});

describe("mutation gate — useMutationGate() hook", () => {
  it("re-renders across state transitions and toggles canMutate", () => {
    const { result } = renderHook(() => useMutationGate());
    expect(result.current.canMutate).toBe(false); // initializing

    act(() => publishAuthState("authenticated"));
    expect(result.current.canMutate).toBe(true);
    expect(result.current.blockedReason).toBeNull();

    act(() => publishAuthState("recovering"));
    expect(result.current.canMutate).toBe(false);
    expect(result.current.blockedReason).toBe(MUTATION_GATE_MESSAGE);

    act(() => publishAuthState("unauthenticated"));
    expect(result.current.canMutate).toBe(false);
    expect(result.current.blockedReason).toBe(MUTATION_GATE_SIGNED_OUT_MESSAGE);
  });

  it("guard from the hook blocks the fn before invocation", async () => {
    const { result } = renderHook(() => useMutationGate());
    act(() => publishAuthState("recovering"));
    const network = vi.fn();
    await expect(result.current.guard(network)).rejects.toBeInstanceOf(MutationBlockedError);
    expect(network).not.toHaveBeenCalled();
  });
});
