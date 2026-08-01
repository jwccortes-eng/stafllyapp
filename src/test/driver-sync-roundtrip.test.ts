/**
 * QA multi-driver — round-trip de roles sobre un cliente simulado.
 * Verifica: 0/1/5 drivers, repetidos, removidos, idempotencia, doble submit,
 * driver_employee_id = primero, y que NUNCA se borran asignaciones.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { id: string; employee_id: string; assignment_role: string | null; status: string };

let rows: Row[];
let shiftPatches: any[];
let deletes = 0;

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    if (table === "shift_assignments") {
      const api: any = {
        _ids: [] as string[],
        select: () => api,
        eq: () => api,
        in: (col: string, vals: string[]) => {
          if (col === "id") {
            for (const r of rows) if (vals.includes(r.id)) r.assignment_role = api._patch.assignment_role;
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ data: rows.filter(r => vals.includes(r.status)), error: null });
        },
        update: (patch: any) => { api._patch = patch; return api; },
        delete: () => { deletes++; return api; },
      };
      return api;
    }
    const shiftApi: any = {
      update: (patch: any) => { shiftPatches.push(patch); return shiftApi; },
      eq: () => Promise.resolve({ error: null }),
    };
    return shiftApi;
  };
  return { supabase: { from } };
});

const { syncShiftDriverRoles } = await import("@/lib/shifts/driver-sync");

const mk = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i}`, employee_id: `e${i}`, assignment_role: "worker", status: "confirmed" }));

beforeEach(() => { rows = mk(6); shiftPatches = []; deletes = 0; });

const drivers = () => rows.filter(r => r.assignment_role === "driver").map(r => r.employee_id);

describe("multi-driver round-trip", () => {
  it("0 conductores no promueve nada y limpia el legado", async () => {
    await syncShiftDriverRoles("s1", []);
    expect(drivers()).toEqual([]);
    expect(shiftPatches.at(-1)).toEqual({ driver_employee_id: null });
  });

  it("1 conductor", async () => {
    await syncShiftDriverRoles("s1", ["e2"]);
    expect(drivers()).toEqual(["e2"]);
    expect(shiftPatches.at(-1)).toEqual({ driver_employee_id: "e2" });
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
    await syncShiftDriverRoles("s1", ["e5"]);
    expect(drivers()).toEqual([]);
    expect(shiftPatches.at(-1)).toEqual({ driver_employee_id: "e5" });
  });
});
