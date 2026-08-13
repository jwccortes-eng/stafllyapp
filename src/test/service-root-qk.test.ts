import { describe, it, expect, beforeEach } from "vitest";
import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { matchesShiftQuery } from "@/lib/shifts/shift-ref";
import {
  rememberShiftRefs,
  lookupShiftRef,
  missingRootIds,
  __resetServiceRefRegistry,
} from "@/lib/shifts/service-ref-registry";

const ROOT = { id: "root-1", shift_ref: "QK-001655" };
const SETUP = { id: "child-1", shift_ref: "QK-001656", parent_shift_id: "root-1", segment_label: "Setup" };
const BREAKDOWN = { id: "child-2", shift_ref: "QK-001657", parent_shift_id: "root-1", segment_label: "Breakdown" };

describe("P0 · QK del servicio raíz en toda la UI", () => {
  beforeEach(() => __resetServiceRefRegistry());

  it("QA1 · raíz + 2 horarios muestran el mismo QK visible", () => {
    rememberShiftRefs([ROOT, SETUP, BREAKDOWN]);
    for (const s of [ROOT, SETUP, BREAKDOWN]) {
      expect(getShiftDisplayIdentity(s).primaryRef).toBe("QK-001655");
    }
  });

  it("QA2 · el horario seleccionado conserva su etiqueta de segmento", () => {
    rememberShiftRefs([ROOT]);
    const id = getShiftDisplayIdentity(SETUP);
    expect(id.isServiceSegment).toBe(true);
    expect(id.segmentLabel).toBe("Setup");
    expect(id.primaryRefKind).toBe("service_root");
    // el shift_ref técnico del hijo nunca es el identificador principal
    expect(id.segmentRef).toBe("QK-001656");
    expect(id.primaryRef).not.toBe("QK-001656");
  });

  it("QA3 · buscar el QK raíz devuelve todos los horarios del servicio", () => {
    rememberShiftRefs([ROOT]);
    expect(matchesShiftQuery(ROOT, "QK-001655")).toBe(true);
    expect(matchesShiftQuery(SETUP, "QK-001655")).toBe(true);
    expect(matchesShiftQuery(BREAKDOWN, "qk-001655")).toBe(true);
    // el ref técnico del hijo sigue siendo buscable para soporte
    expect(matchesShiftQuery(SETUP, "QK-001656")).toBe(true);
  });

  it("QA4 · históricos sin padre siguen mostrando su propio QK", () => {
    expect(getShiftDisplayIdentity({ id: "old", shift_ref: "QK-000339" }).primaryRef).toBe("QK-000339");
    expect(getShiftDisplayIdentity({ id: "old2", shift_code: "339" }).primaryRef).toBe("#339");
  });

  it("no inventa QK cuando la raíz aún no se ha cargado", () => {
    const id = getShiftDisplayIdentity(SETUP);
    expect(id.primaryRef).toBe("QK-001656");
    expect(id.primaryRefKind).toBe("canonical");
    expect(id.serviceRef).toBeNull();
  });

  it("el override explícito de serviceRef manda sobre el registro", () => {
    rememberShiftRefs([ROOT]);
    expect(getShiftDisplayIdentity(SETUP, { serviceRef: "QK-000001" }).primaryRef).toBe("QK-000001");
  });

  it("el registro sólo pide las raíces que faltan", () => {
    rememberShiftRefs([ROOT]);
    expect(lookupShiftRef("root-1")).toBe("QK-001655");
    expect(missingRootIds(["root-1", "root-2", null, ""])).toEqual(["root-2"]);
  });
});
