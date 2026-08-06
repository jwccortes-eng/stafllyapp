import { describe, expect, it } from "vitest";
import {
  ACCESS_MATRIX,
  CAPABILITIES,
  NEVER_BLOCKED,
  accessWarning,
  blockedReason,
  blockedSensitiveOperations,
  canDo,
  normalizeLifecycle,
  type AccessState,
  type CompanyLifecycle,
} from "@/lib/company/access-state";

const base = (over: Partial<CompanyLifecycle> = {}): CompanyLifecycle => ({
  approval_state: "approved",
  access_state: "active",
  commercial_state: "manual",
  is_active: true,
  version: 1,
  ...over,
});

describe("Fase 1 — approval / access / commercial", () => {
  it("QA1: signup público queda en revisión, sin tenant operativo", () => {
    const c = base({ approval_state: "needs_review", access_state: "restricted", is_active: false });
    expect(canDo(c, "create_shift")).toBe(false);
    expect(canDo(c, "create_employee")).toBe(false);
    expect(accessWarning(c)).toContain("pendiente de aprobación");
  });

  it("QA2: aprobación humana habilita operación completa", () => {
    const c = base();
    expect(canDo(c, "create_shift")).toBe(true);
    expect(canDo(c, "run_payroll")).toBe(true);
    expect(accessWarning(c)).toBeNull();
  });

  it("QA3: rechazo deja sin acceso operativo y expone el motivo", () => {
    const c = base({ approval_state: "rejected", access_state: "restricted", rejection_reason: "Datos falsos" });
    expect(canDo(c, "create_shift")).toBe(false);
    expect(blockedReason(c, "create_shift")).toContain("Datos falsos");
  });

  it("QA4: grace mantiene la operación con aviso visible", () => {
    const c = base({ access_state: "grace" });
    expect(canDo(c, "create_shift")).toBe(true);
    expect(canDo(c, "run_payroll")).toBe(true);
    expect(accessWarning(c)).toContain("gracia");
  });

  it("QA5: restricted bloquea operaciones nuevas pero conserva historia y exportación", () => {
    const c = base({ access_state: "restricted" });
    expect(canDo(c, "create_shift")).toBe(false);
    expect(canDo(c, "assign_worker")).toBe(false);
    expect(canDo(c, "read_payroll_history")).toBe(true);
    expect(canDo(c, "read_time_entries")).toBe(true);
    expect(canDo(c, "read_documents")).toBe(true);
    expect(canDo(c, "export_data")).toBe(true);
    expect(blockedSensitiveOperations(c).length).toBeGreaterThan(0);
  });

  it("QA6: suspended conserva pago, exportación, historial y soporte", () => {
    const c = base({ access_state: "suspended", is_active: true });
    expect(canDo(c, "update_payment_method")).toBe(true);
    expect(canDo(c, "contact_support")).toBe(true);
    expect(canDo(c, "read_invoices")).toBe(true);
    expect(canDo(c, "export_data")).toBe(true);
    expect(canDo(c, "clock_in")).toBe(false);
  });

  it("QA7: cancelled preserva datos y sólo consulta", () => {
    const c = base({ access_state: "cancelled", is_active: false });
    expect(canDo(c, "read_payroll_history")).toBe(true);
    expect(canDo(c, "create_shift")).toBe(false);
    expect(accessWarning(c)).toContain("cancelada");
  });

  it("ningún estado de acceso puede retirar las capacidades legales", () => {
    (Object.keys(ACCESS_MATRIX) as AccessState[]).forEach(state => {
      NEVER_BLOCKED.forEach(cap => {
        expect(ACCESS_MATRIX[state][cap]).toBe(true);
        expect(canDo(base({ access_state: state, approval_state: "rejected" }), cap)).toBe(true);
      });
    });
  });

  it("QA9: fail-closed ante estados desconocidos o ausentes", () => {
    const c = normalizeLifecycle({ approval_state: "???", access_state: null });
    expect(c.approval_state).toBe("draft");
    expect(c.access_state).toBe("restricted");
    expect(canDo(c, "create_shift")).toBe(false);
  });

  it("la matriz cubre todas las capacidades declaradas", () => {
    (Object.keys(ACCESS_MATRIX) as AccessState[]).forEach(state => {
      CAPABILITIES.forEach(cap => {
        expect(typeof ACCESS_MATRIX[state][cap]).toBe("boolean");
      });
    });
  });

  it("is_active ya no decide: una empresa activa en falso sigue leyendo sus datos", () => {
    const c = base({ access_state: "restricted", is_active: false });
    expect(canDo(c, "export_data")).toBe(true);
  });
});
