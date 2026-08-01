import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearShadowCompanyConfigCache,
  defaultShadowCompanyConfig,
  isPersistenceEnabledForCompany,
  primeShadowCompanyConfig,
} from "@/lib/operational-signals/company-config";
import { setKillSwitch, setLocalPersistencePaused } from "@/lib/operational-signals/flags";
import {
  getSinkHealth,
  recordObserved,
  recordPersistAttempt,
  resetSinkHealth,
} from "@/lib/operational-signals/health";

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

describe("F1.1 — per-company shadow persistence gate", () => {
  beforeEach(() => {
    clearShadowCompanyConfigCache();
    setKillSwitch(false);
    setLocalPersistencePaused(false);
    resetSinkHealth();
  });

  it("QA1/QA2: A persists, B does not", () => {
    primeShadowCompanyConfig({ ...defaultShadowCompanyConfig(COMPANY_A), persistenceEnabled: true });
    primeShadowCompanyConfig(defaultShadowCompanyConfig(COMPANY_B));
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(true);
    expect(isPersistenceEnabledForCompany(COMPANY_B)).toBe(false);
  });

  it("QA3: unknown company never persists (no tenant leakage by default)", () => {
    expect(isPersistenceEnabledForCompany("33333333-3333-4333-8333-333333333333")).toBe(false);
    expect(isPersistenceEnabledForCompany(null)).toBe(false);
  });

  it("QA5: kill switch stops new records immediately", () => {
    primeShadowCompanyConfig({ ...defaultShadowCompanyConfig(COMPANY_A), persistenceEnabled: true });
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(true);
    setKillSwitch(true);
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(false);
    setKillSwitch(false);
  });

  it("local pause disables persistence without touching company config", () => {
    primeShadowCompanyConfig({ ...defaultShadowCompanyConfig(COMPANY_A), persistenceEnabled: true });
    setLocalPersistencePaused(true);
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(false);
    setLocalPersistencePaused(false);
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(true);
  });

  it("sample_rate = 0 never persists, 1 always persists", () => {
    primeShadowCompanyConfig({
      ...defaultShadowCompanyConfig(COMPANY_A),
      persistenceEnabled: true,
      sampleRate: 0,
    });
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(false);
    primeShadowCompanyConfig({
      ...defaultShadowCompanyConfig(COMPANY_A),
      persistenceEnabled: true,
      sampleRate: 1,
    });
    expect(isPersistenceEnabledForCompany(COMPANY_A)).toBe(true);
  });
});

describe("F1.1 — sink telemetry", () => {
  beforeEach(() => resetSinkHealth());

  it("QA4: a persistence failure is recorded and never thrown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordObserved();
    expect(() =>
      recordPersistAttempt({ at: Date.now(), companyId: COMPANY_A, ok: false, latencyMs: 42, error: "boom" }),
    ).not.toThrow();
    const health = getSinkHealth();
    expect(health.observed).toBe(1);
    expect(health.persistedFailed).toBe(1);
    expect(health.errorRatePct).toBe(100);
    expect(health.lastError?.error).toBe("boom");
    warn.mockRestore();
  });

  it("computes latency stats", () => {
    [10, 20, 30, 40].forEach((latencyMs) =>
      recordPersistAttempt({ at: Date.now(), companyId: COMPANY_A, ok: true, latencyMs }),
    );
    const health = getSinkHealth();
    expect(health.persistedOk).toBe(4);
    expect(health.avgLatencyMs).toBe(25);
    expect(health.p95LatencyMs).toBe(40);
  });
});
