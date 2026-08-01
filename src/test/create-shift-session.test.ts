import { describe, it, expect, beforeEach } from "vitest";
import {
  CREATE_SHIFT_SESSION_TTL_MS,
  clearSession,
  isMeaningfulDraft,
  newSessionId,
  parseSessionRecord,
  readSession,
  sessionKey,
  writeSession,
  type CreateShiftDraftSnapshot,
} from "@/lib/shifts/create-shift-session";

const BASELINE = { date: "2026-08-01", startTime: "09:00", endTime: "17:00", slots: 1 };

function draft(over: Partial<CreateShiftDraftSnapshot> = {}): CreateShiftDraftSnapshot {
  return {
    step: "operacion",
    clientId: "",
    serviceType: "",
    jobSiteAddress: "",
    jobSiteLocationId: null,
    date: BASELINE.date,
    startTime: BASELINE.startTime,
    endTime: BASELINE.endTime,
    slots: 1,
    team: [],
    driverIds: [],
    transportRequired: false,
    driversRequired: 0,
    meetingPoint: "",
    meetingPointLocationId: null,
    notes: "",
    ...over,
  };
}

describe("create-shift-session", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("genera identificadores de sesión únicos", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });

  it("aísla la clave por usuario y empresa", () => {
    expect(sessionKey("u1", "c1")).not.toBe(sessionKey("u1", "c2"));
    expect(sessionKey("u1", "c1")).not.toBe(sessionKey("u2", "c1"));
  });

  it("no considera documento un borrador idéntico al estado base", () => {
    expect(isMeaningfulDraft(draft(), BASELINE)).toBe(false);
    expect(isMeaningfulDraft(draft({ clientId: "cli" }), BASELINE)).toBe(true);
    expect(isMeaningfulDraft(draft({ team: ["e1"] }), BASELINE)).toBe(true);
    expect(isMeaningfulDraft(draft({ notes: "  " }), BASELINE)).toBe(false);
    expect(isMeaningfulDraft(draft({ slots: 3 }), BASELINE)).toBe(true);
  });

  it("guarda y restaura el mismo documento", () => {
    const sessionId = newSessionId();
    writeSession({ sessionId, userId: "u1", companyId: "c1", draft: draft({ clientId: "cli", notes: "traer chalecos" }) });
    const back = readSession("u1", "c1");
    expect(back?.sessionId).toBe(sessionId);
    expect(back?.draft.clientId).toBe("cli");
    expect(back?.draft.notes).toBe("traer chalecos");
  });

  it("nunca devuelve el borrador de otra empresa ni de otro usuario", () => {
    writeSession({ sessionId: newSessionId(), userId: "u1", companyId: "c1", draft: draft({ clientId: "cli-a" }) });
    expect(readSession("u1", "c2")).toBeNull();
    expect(readSession("u2", "c1")).toBeNull();
    expect(readSession("u1", "c1")?.draft.clientId).toBe("cli-a");
  });

  it("mantiene dos empresas en paralelo sin mezclarlas", () => {
    writeSession({ sessionId: "s1", userId: "u1", companyId: "c1", draft: draft({ notes: "A" }) });
    writeSession({ sessionId: "s2", userId: "u1", companyId: "c2", draft: draft({ notes: "B" }) });
    expect(readSession("u1", "c1")?.draft.notes).toBe("A");
    expect(readSession("u1", "c2")?.draft.notes).toBe("B");
  });

  it("limpia sólo la sesión indicada", () => {
    writeSession({ sessionId: "s1", userId: "u1", companyId: "c1", draft: draft({ notes: "A" }) });
    writeSession({ sessionId: "s2", userId: "u1", companyId: "c2", draft: draft({ notes: "B" }) });
    clearSession("u1", "c1");
    expect(readSession("u1", "c1")).toBeNull();
    expect(readSession("u1", "c2")?.draft.notes).toBe("B");
  });

  it("descarta borradores caducados", () => {
    const now = Date.now();
    const raw = JSON.stringify({
      version: 1,
      sessionId: "s1",
      userId: "u1",
      companyId: "c1",
      updatedAt: now - CREATE_SHIFT_SESSION_TTL_MS - 1000,
      draft: draft(),
    });
    expect(parseSessionRecord(raw, { userId: "u1", companyId: "c1" }, now)).toBeNull();
  });

  it("ignora versiones antiguas y basura", () => {
    expect(parseSessionRecord("no-json", { userId: "u1", companyId: "c1" })).toBeNull();
    expect(parseSessionRecord(null, { userId: "u1", companyId: "c1" })).toBeNull();
    expect(
      parseSessionRecord(JSON.stringify({ version: 0, sessionId: "s", userId: "u1", companyId: "c1", updatedAt: Date.now(), draft: draft() }), { userId: "u1", companyId: "c1" }),
    ).toBeNull();
  });

  it("no escribe nada sin usuario o sin empresa", () => {
    writeSession({ sessionId: "s1", userId: null, companyId: "c1", draft: draft({ notes: "X" }) });
    writeSession({ sessionId: "s1", userId: "u1", companyId: null, draft: draft({ notes: "X" }) });
    expect(window.sessionStorage.length).toBe(0);
  });
});
