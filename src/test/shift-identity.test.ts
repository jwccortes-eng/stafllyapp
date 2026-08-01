import { describe, it, expect } from "vitest";
import {
  getShiftDisplayIdentity,
  hasVisibleShiftRef,
  shiftRefLabel,
} from "@/lib/shifts/shift-identity";
import { displayShiftRef } from "@/lib/shifts/shift-ref";

describe("shift identity — una sola referencia visible", () => {
  it("CASO 1 · shift_ref es la referencia principal", () => {
    const id = getShiftDisplayIdentity({ id: "uuid-1", shift_ref: "QK-001573", shift_number: 1573, shift_code: "340" });
    expect(id.primaryRef).toBe("QK-001573");
    expect(id.primaryRefKind).toBe("canonical");
    expect(id.hasCanonicalRef).toBe(true);
  });

  it("el código legado queda etiquetado y nunca como principal", () => {
    const id = getShiftDisplayIdentity({ shift_ref: "QK-001573", shift_code: "340" });
    expect(id.legacyRef).toBe("340");
    expect(id.legacyLabel).toBe("Referencia anterior: 340");
    expect(id.primaryRef).not.toContain("340");
  });

  it("no repite el legado cuando ya está contenido en la referencia", () => {
    const id = getShiftDisplayIdentity({ shift_ref: "QK-000339", shift_code: "339" });
    expect(id.legacyRef).toBeNull();
    expect(id.legacyLabel).toBeNull();
  });

  it("CASO 3 · cada empresa conserva su propio prefijo y secuencia", () => {
    expect(getShiftDisplayIdentity({ shift_ref: "MSS-000089", shift_code: "339" }).primaryRef).toBe("MSS-000089");
    expect(getShiftDisplayIdentity({ shift_ref: "QK-001573" }).primaryRef).toBe("QK-001573");
  });

  it("CASO 4 · la referencia no depende del contexto de empresa activo", () => {
    const shift = { shift_ref: "QK-001573", company_id: "c1" };
    expect(getShiftDisplayIdentity(shift, { companyName: "Quality Staff" }).primaryRef)
      .toBe(getShiftDisplayIdentity(shift, { companyName: "My Staff Solution" }).primaryRef);
  });

  it("CASO 5 · turno histórico sin shift_ref usa fallback etiquetado", () => {
    const id = getShiftDisplayIdentity({ shift_code: "339" });
    expect(id.primaryRef).toBe("#339");
    expect(id.primaryRefKind).toBe("legacy_fallback");
    expect(id.primaryRefNote).toBe("Referencia histórica");
    expect(id.hasCanonicalRef).toBe(false);
  });

  it("sin ninguna referencia no inventa números", () => {
    const id = getShiftDisplayIdentity({ id: "uuid-x" });
    expect(id.primaryRef).toBe("—");
    expect(id.primaryRefKind).toBe("none");
    expect(hasVisibleShiftRef({ id: "uuid-x" })).toBe(false);
  });

  it("el UUID interno nunca es la referencia visible", () => {
    const id = getShiftDisplayIdentity({ id: "88469adb-077b-4900-9e0f-acd47edba935", shift_ref: "QK-001573" });
    expect(id.primaryRef).toBe("QK-001573");
    expect(id.internalId).toBe("88469adb-077b-4900-9e0f-acd47edba935");
  });

  it("shift_number no se muestra: sólo alimenta shift_ref", () => {
    const id = getShiftDisplayIdentity({ shift_number: 1573, shift_ref: "QK-001573" });
    expect(id.primaryRef).toBe("QK-001573");
    expect(id.primaryRef).not.toBe("1573");
  });

  it("el atajo legacy displayShiftRef delega en el helper canónico", () => {
    const shift = { shift_ref: "QK-001573", shift_code: "340", shift_number: 1573 };
    expect(displayShiftRef(shift)).toBe(getShiftDisplayIdentity(shift).primaryRef);
    expect(shiftRefLabel(shift)).toBe("QK-001573");
    expect(displayShiftRef(null)).toBe("—");
  });

  it("tolera espacios y valores vacíos", () => {
    expect(getShiftDisplayIdentity({ shift_ref: "  QK-000007 " }).primaryRef).toBe("QK-000007");
    expect(getShiftDisplayIdentity({ shift_ref: "   ", shift_code: "  " }).primaryRefKind).toBe("none");
  });
});
