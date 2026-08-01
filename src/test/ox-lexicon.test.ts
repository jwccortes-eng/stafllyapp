import { describe, expect, it } from "vitest";
import { audienceForPath, lexicon } from "@/lib/ox/lexicon";

describe("OX-10 business language layer", () => {
  it("admin habla de servicios", () => {
    const lx = lexicon("admin");
    expect(lx.EntityPlural).toBe("Servicios");
    expect(lx.create).toBe("Nuevo servicio");
    expect(lx.detail).toBe("Detalle del servicio");
    expect(lx.cancel).toBe("Cancelar servicio");
    expect(lx.team).toBe("Equipo del servicio");
    expect(lx.today).toBe("Servicios de hoy");
    expect(lx.upcoming).toBe("Próximos servicios");
  });

  it("worker conserva turnos", () => {
    const lx = lexicon("worker");
    expect(lx.EntityPlural).toBe("Turnos");
    expect(lx.history).toBe("Historial de turnos");
    expect(JSON.stringify(lx)).not.toMatch(/servicio/i);
  });

  it("payroll conserva lenguaje laboral", () => {
    const lx = lexicon("payroll");
    expect(lx.Entity).toBe("Turno");
    expect(JSON.stringify(lx)).not.toMatch(/servicio/i);
  });

  it("pluraliza y cuenta", () => {
    const lx = lexicon("admin");
    expect(lx.count(1)).toBe("1 servicio");
    expect(lx.count(0)).toBe("0 servicios");
    expect(lx.count(4)).toBe("4 servicios");
    expect(lx.plural(1)).toBe("servicio");
  });

  it("deriva la audiencia desde la ruta", () => {
    expect(audienceForPath("/app/shifts")).toBe("admin");
    expect(audienceForPath("/app/today")).toBe("admin");
    expect(audienceForPath("/portal/my-shifts")).toBe("worker");
    expect(audienceForPath("/app/payroll-review-queue")).toBe("payroll");
    expect(audienceForPath("/app/timeclock")).toBe("payroll");
    expect(audienceForPath("/app/validation-center")).toBe("payroll");
  });

  it("nunca expone la palabra Shift", () => {
    for (const a of ["admin", "worker", "payroll"] as const) {
      expect(JSON.stringify(lexicon(a))).not.toMatch(/shift/i);
    }
  });
});
