/**
 * OAI F1 Stage 1 — structural guarantees.
 *
 * These tests protect the invariants, not the implementation details:
 *  1. The engine is isolated from business domains and from I/O.
 *  2. There is no delivery / queue / decision vocabulary anywhere in OAI.
 *  3. Observation cannot run for a company that is not explicitly allowlisted.
 *  4. The adapter never fabricates authority, classification or PII.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { collectSchedulingFacts } from "@/lib/operational-authorization/adapters/scheduling/collect-facts";
import {
  observeAssignmentAttempt,
  resetOaiSink,
  getOaiSink,
} from "@/lib/operational-authorization/adapters/scheduling/emit";
import { observeAuthorization } from "@/lib/operational-authorization/engine/observe";
import { buildPersistenceProbe } from "@/lib/operational-authorization/observation/persistence-probe";
import {
  endJourney,
  evaluateReturn,
  recordStep,
  resetJourneys,
  startJourney,
} from "@/lib/operational-authorization/observation/journey";
import {
  setCompanyAllowlist,
  setObservationEnabled,
  setKillSwitch,
} from "@/lib/operational-authorization/flags";

const ROOT = "src/lib/operational-authorization";
const COMPANY = "d3500000-0000-4000-8000-000000000001";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const SOURCE_FILES = walk(ROOT).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

function baseInput(overrides: Partial<Parameters<typeof collectSchedulingFacts>[0]> = {}) {
  return {
    observationId: "11111111-1111-4111-8111-111111111111",
    correlationId: "22222222-2222-4222-8222-222222222222",
    observedAt: "2026-07-30T10:00:00.000Z",
    companyId: COMPANY,
    workerRef: "w-1",
    shiftRef: "s-1",
    actorRef: "a-1",
    surface: "shift_detail" as const,
    trigger: "block_shown" as const,
    systemReadinessState: "blocked" as const,
    systemBlockReasons: ["missing_documents"],
    requiredDocumentCodes: ["work_authorization"],
    observedDocuments: [],
    ...overrides,
  };
}

describe("OAI engine isolation (P16 equivalent)", () => {
  it("the engine imports no business domain and no I/O", () => {
    const engineFiles = SOURCE_FILES.filter((f) => f.includes("/engine/"));
    expect(engineFiles.length).toBeGreaterThan(0);

    const forbidden = [
      "@/integrations/supabase",
      "react",
      "@/hooks/",
      "@/components/",
      "@/lib/shifts",
      "@/lib/payroll",
      "@/lib/compliance",
    ];
    for (const file of engineFiles) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source, `${file} must not import ${token}`).not.toContain(`from "${token}`);
      }
    }
  });
});

describe("OAI has no delivery, queue or decision semantics", () => {
  it("never mentions forbidden vocabulary in code", () => {
    const forbidden = ["sent_at", "retry_count", "delivery_status", "push_token", "recipient_id"];
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source, `${file} must not contain ${token}`).not.toContain(token);
      }
    }
  });

  it("always stamps observationOnly = true", () => {
    const record = observeAuthorization(collectSchedulingFacts(baseInput()), {
      evaluatedAt: "2026-07-30T10:00:01.000Z",
    });
    expect(record.observationOnly).toBe(true);
  });
});

describe("OAI never fabricates data", () => {
  it("reports authority as unresolved because no authority model exists", () => {
    const facts = collectSchedulingFacts(baseInput());
    expect(facts.authority.status).toBe("unresolved");
  });

  it("keeps requirements unclassified until a human classifies them", () => {
    const facts = collectSchedulingFacts(baseInput());
    expect(facts.requirements[0].classification).toBe("unclassified");
  });

  it("treats profile_status only as an untrusted legacy signal", () => {
    const record = observeAuthorization(
      collectSchedulingFacts(baseInput({ legacyProfileStatus: "incomplete" })),
      { evaluatedAt: "2026-07-30T10:00:01.000Z" },
    );
    expect(record.legacyMixedSignalPresent).toBe(true);
    expect(JSON.stringify(record)).not.toContain("incomplete");
  });

  it("marks a missing document as missing, never as rejected", () => {
    const record = observeAuthorization(collectSchedulingFacts(baseInput()), {
      evaluatedAt: "2026-07-30T10:00:01.000Z",
    });
    expect(record.documentStateSummary.missing).toBe(1);
    expect(record.documentStateSummary.approved).toBe(0);
  });
});

describe("OAI emission gating", () => {
  beforeEach(() => {
    resetOaiSink();
    setKillSwitch(false);
  });

  afterEach(() => {
    setObservationEnabled(false);
    setCompanyAllowlist([]);
    setKillSwitch(false);
    resetOaiSink();
  });

  it("emits nothing when observation is off", () => {
    setObservationEnabled(false);
    setCompanyAllowlist([COMPANY]);
    expect(observeAssignmentAttempt(baseInput())).toBeNull();
  });

  it("emits nothing for a company outside the allowlist", () => {
    setObservationEnabled(true);
    setCompanyAllowlist(["another-company"]);
    expect(observeAssignmentAttempt(baseInput())).toBeNull();
  });

  it("emits nothing when the kill switch is engaged", () => {
    setObservationEnabled(true);
    setCompanyAllowlist([COMPANY]);
    setKillSwitch(true);
    expect(observeAssignmentAttempt(baseInput())).toBeNull();
  });

  it("observes an allowlisted company without throwing", () => {
    setObservationEnabled(true);
    setCompanyAllowlist([COMPANY]);
    const record = observeAssignmentAttempt(baseInput());
    expect(record?.observationOnly).toBe(true);
    expect(getOaiSink().read()).toHaveLength(1);
  });
});

describe("journey tracking", () => {
  beforeEach(() => resetJourneys());

  it("detects context loss when the selection changes after returning", () => {
    startJourney({
      correlationId: "c1",
      companyId: COMPANY,
      workerRef: "w-1",
      shiftRef: "s-1",
      surface: "shift_detail",
    });
    recordStep("c1", "block_shown");
    recordStep("c1", "left_to_documents");
    const lost = evaluateReturn("c1", { workerRef: null, shiftRef: "s-1" });
    const state = endJourney("c1");

    expect(lost).toBe(true);
    expect(state?.contextLossDetected).toBe(true);
    expect(state?.navigationCount).toBe(1);
  });

  it("does not flag context loss when the selection survives", () => {
    startJourney({
      correlationId: "c2",
      companyId: COMPANY,
      workerRef: "w-1",
      shiftRef: "s-1",
      surface: "shift_detail",
    });
    expect(evaluateReturn("c2", { workerRef: "w-1", shiftRef: "s-1" })).toBe(false);
    expect(endJourney("c2")?.contextLossDetected).toBe(false);
  });
});

describe("persistence probe (scenario P)", () => {
  it("reports a mismatch without attempting any repair", () => {
    const probe = buildPersistenceProbe({
      observationId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      companyId: COMPANY,
      workerRef: "w-1",
      requirementCode: "work_authorization",
      expectedState: "approved",
      immediateUiState: "approved",
      persistedState: "pending",
      reloadedState: "pending",
      sourceSurface: "documents",
      elapsedMs: 1200,
    });
    expect(probe.mismatchDetected).toBe(true);
    expect(probe.observationOnly).toBe(true);
  });

  it("does not report a mismatch when the state persisted", () => {
    const probe = buildPersistenceProbe({
      observationId: "11111111-1111-4111-8111-111111111111",
      correlationId: "22222222-2222-4222-8222-222222222222",
      companyId: COMPANY,
      workerRef: "w-1",
      requirementCode: "work_authorization",
      expectedState: "approved",
      immediateUiState: "approved",
      persistedState: "approved",
      reloadedState: "approved",
      sourceSurface: "documents",
      elapsedMs: 800,
    });
    expect(probe.mismatchDetected).toBe(false);
  });
});
