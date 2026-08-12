/**
 * QA multi-driver — round-trip de roles sobre un cliente simulado.
 * Verifica: 0/1/5 drivers, repetidos, removidos, idempotencia, doble submit,
 * driver principal = primero, y que NUNCA se borran asignaciones.
 *
 * Contrato vigente (VWC Fase 3D): el cambio de rol pasa SIEMPRE por
 * `versionedAssignmentTransition`; `driver-sync` no hace updates directos y
 * el campo legado `scheduled_shifts.driver_employee_id` lo mantiene el RPC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = {
  id: string;
  employee_id: string;
  assignment_role: string | null;
  status: string;
  company_id: string;
  version: number;
};

let rows: Row[];
let deletes = 0;

const drivers = () => rows.filter(r => r.assignment_role === "driver").map(r => r.employee_id);

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    if (table === "shift_assignments") {
      const api: any = {
        select: () => api,
        eq: () => api,
        in: (_col: string, vals: string[]) =>
          Promise.resolve({ data: rows.filter(r => vals.includes(r.status)), error: null }),
        delete: () => {
          deletes++;
          return api;
        },
      };
      return api;
    }
    // scheduled_shifts — sólo lectura del campo legado.
    const shiftApi: any = {
      select: () => shiftApi,
      eq: () => shiftApi,
      maybeSingle: () =>
        Promise.resolve({ data: { driver_employee_id: drivers()[0] ?? null }, error: null }),
    };
    return shiftApi;
  };
  return { supabase: { from } };
});

vi.mock("@/lib/data/assignment-write", () => ({
  assignmentConflictCopy: () => ({ fact: "conflicto" }),
  versionedAssignmentTransition: async ({
    assignmentId,
    transition,
  }: {
    assignmentId: string;
    transition: string;
  }) => {
    const row = rows.find(r => r.id === assignmentId);
    if (!row) return { status: "error", message: "no existe" };
    row.assignment_role = transition === "set_role_driver" ? "driver" : "worker";
    row.version += 1;
    return { status: "applied" };
  },
}));

const { syncShiftDriverRoles } = await import("@/lib/shifts/driver-sync");

const mk = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    employee_id: `e${i}`,
    assignment_role: "worker",
    status: "confirmed",
    company_id: "c1",
    version: 1,
  }));

beforeEach(() => {
  rows = mk(6);
  deletes = 0;
});

describe("multi-driver round-trip", () => {
  it("0 conductores no promueve nada y deja el legado vacío", async () => {
    const r = await syncShiftDriverRoles("s1", []);
    expect(drivers()).toEqual([]);
    expect(r.primaryDriverId).toBeNull();
  });

  it("1 conductor", async () => {
    const r = await syncShiftDriverRoles("s1", ["e2"]);
    expect(drivers()).toEqual(["e2"]);
    expect(r.primaryDriverId).toBe("e2");
  });

  it("5 conductores, luego 3, luego 5 otra vez — sin duplicados", async () => {
    await syncShiftDriverRoles("s1", ["e0", "e1", "e2", "e3", "e4"]);
    expect(drivers()).toHaveLength(5);
    await syncShiftDriverRoles("s1", ["e0", "e1", "e2"]);
    expect(drivers()).toEqual(["e0", "e1", "e2"]);
    await syncShiftDriverRoles("s1", ["e0", "e1", "e2", "e3", "e4"]);
    expect(drivers()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(new Set(drivers()).size).toBe(5);
  });

  it("conductor repetido en la selección no duplica filas", async () => {
    await syncShiftDriverRoles("s1", ["e1", "e1", "e1"]);
    expect(drivers()).toEqual(["e1"]);
    expect(rows).toHaveLength(6);
  });

  it("doble submit / reintento es idempotente", async () => {
    const a = await syncShiftDriverRoles("s1", ["e0", "e1"]);
    const b = await syncShiftDriverRoles("s1", ["e0", "e1"]);
    expect(a.promoted).toHaveLength(2);
    expect(b.promoted).toHaveLength(0);
    expect(b.demoted).toHaveLength(0);
  });

  it("nunca borra asignaciones y no toca a los no-drivers", async () => {
    await syncShiftDriverRoles("s1", ["e0"]);
    expect(deletes).toBe(0);
    expect(rows).toHaveLength(6);
    expect(rows.filter(r => r.assignment_role === "worker")).toHaveLength(5);
  });

  it("ignora asignaciones rechazadas/removidas al sincronizar", async () => {
    rows[5].status = "removed";
    const r = await syncShiftDriverRoles("s1", ["e5"]);
    expect(drivers()).toEqual([]);
    expect(r.primaryDriverId).toBeNull();
  });
});
