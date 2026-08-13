/**
 * P0 — EXPLICIT OPERATING ROLE ASSIGNMENT
 * El rol es una responsabilidad declarada. Los permisos no lo determinan.
 */
import { describe, it, expect } from "vitest";
import { resolvePrimaryRole, suggestRoleFromOverrides } from "@/lib/auth/primary-role";

const allFalse = Object.fromEntries(
  ["aprobar_clock", "cerrar_dia", "cerrar_turno", "editar_clock", "reabrir_dia"].map((k) => [k, false]),
);

describe("rol operativo explícito", () => {
  it("Duván: rol explícito Time & Closeout aunque todos los overrides estén en false", () => {
    const r = resolvePrimaryRole("admin", allFalse, "time_closeout_admin");
    expect(r.role?.key).toBe("time_closeout_admin");
    expect(r.explicit).toBe(true);
  });

  it("Duván: si su rol explícito es Worker, es Worker", () => {
    expect(resolvePrimaryRole("admin", allFalse, "worker").role?.key).toBe("worker");
  });

  it("María: Payroll Administrator se mantiene con overrides de cierre", () => {
    const r = resolvePrimaryRole(
      "admin",
      { aprobar_clock: true, cerrar_dia: true, cerrar_turno: true, editar_clock: true },
      "payroll_admin",
    );
    expect(r.role?.key).toBe("payroll_admin");
  });

  it("Sebastián: conserva Shift Administrator con un permiso adicional", () => {
    const r = resolvePrimaryRole(
      "admin",
      { crear_turno: true, editar_turno: true, asignar_turno: true, publicar_anuncio: true },
      "shift_admin",
    );
    expect(r.role?.key).toBe("shift_admin");
  });

  it("Company Owner nunca se degrada por overrides", () => {
    const r = resolvePrimaryRole("company_owner", allFalse, "worker");
    expect(r.role?.key).toBe("company_owner");
  });

  it("sin rol explícito, la membresía manda y no se infiere por similitud", () => {
    const r = resolvePrimaryRole("admin", { crear_turno: true, editar_turno: true, asignar_turno: true });
    expect(r.role).toBeNull();
    expect(r.explicit).toBe(false);
  });

  it("Jaccard queda solo como diagnóstico", () => {
    const s = suggestRoleFromOverrides({ crear_turno: true, editar_turno: true, asignar_turno: true });
    expect(s?.role.key).toBe("shift_admin");
    expect(s!.score).toBeGreaterThan(0.7);
    // La sugerencia no altera el rol explícito.
    expect(
      resolvePrimaryRole("admin", { crear_turno: true, editar_turno: true, asignar_turno: true }, "payroll_admin")
        .role?.key,
    ).toBe("payroll_admin");
  });

  it("overrides vacíos no producen sugerencia (evita el falso Worker)", () => {
    expect(suggestRoleFromOverrides(allFalse)).toBeNull();
  });
});
