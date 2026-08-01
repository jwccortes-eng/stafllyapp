import { describe, it, expect } from "vitest";
import { driverIdsFromAssignments } from "@/lib/shifts/driver-sync";

const rows = [
  { shift_id: "s1", employee_id: "a", assignment_role: "driver", status: "confirmed" },
  { shift_id: "s1", employee_id: "b", assignment_role: "worker", status: "pending" },
  { shift_id: "s1", employee_id: "c", assignment_role: "driver", status: "removed" },
  { shift_id: "s2", employee_id: "d", assignment_role: "driver", status: "confirmed" },
];

describe("driver-sync", () => {
  it("lee sólo drivers activos del turno", () => {
    expect(driverIdsFromAssignments(rows, "s1")).toEqual(["a"]);
  });

  it("incluye el driver legado del turno sin duplicarlo", () => {
    expect(driverIdsFromAssignments(rows, "s1", "z")).toEqual(["z", "a"]);
    expect(driverIdsFromAssignments(rows, "s1", "a")).toEqual(["a"]);
  });

  it("no mezcla drivers de otros turnos", () => {
    expect(driverIdsFromAssignments(rows, "s2")).toEqual(["d"]);
  });
});
