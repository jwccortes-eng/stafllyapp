/**
 * P0.1 — CANONICAL PERSON RESOLUTION LAYER (SHADOW MODE)
 * Pruebas puras. No tocan la base de datos, no fusionan, no escriben.
 * Las filas reproducen registros reales de producción (solo lectura).
 */

import { describe, expect, it } from "vitest";
import {
  buildCanonicalPerson,
  classifyContactCompleteness,
  comparePersonRecords,
  type PersonRecord,
} from "@/lib/identity/canonical-person";

const QS = "quality-staff";
const PARCEROS = "parceros";

/* ---------------- Daniel Ochoa ---------------- */

const danielQS: PersonRecord = {
  id: "751d864f",
  company_id: QS,
  first_name: "Daniel",
  last_name: "Ochoa",
  phone_number: "6317037813",
  email: "7daniel179@gmail.com",
  user_id: "de4b4faa",
  is_active: true,
  merged_into_employee_id: null,
};
const danielLegacy: PersonRecord = {
  id: "629d0b49",
  company_id: QS,
  first_name: "Daniel",
  last_name: "Ochoa",
  is_active: false,
  merged_into_employee_id: "751d864f",
};
const danielParceros: PersonRecord = {
  id: "c2897e98",
  company_id: PARCEROS,
  first_name: "Daniel",
  last_name: "Ochoa",
  email: "7daniel179@gmail.com",
  is_active: true,
  merged_into_employee_id: null,
};

describe("Daniel Ochoa — piloto canónico", () => {
  it("resuelve la misma persona desde la ficha viva y desde la fusionada", () => {
    const fromLive = buildCanonicalPerson(danielQS, [danielLegacy], { companyId: QS });
    const fromLegacy = buildCanonicalPerson(danielLegacy, [danielQS], { companyId: QS });
    expect(fromLive.canonical_employee_id).toBe("751d864f");
    expect(fromLegacy.canonical_employee_id).toBe("751d864f");
    expect(fromLegacy.person_key).toBe(fromLive.person_key);
    expect(fromLive.person_key_basis).toBe("account");
  });

  it("conserva el teléfono válido de Quality Staff aunque otra ficha no lo tenga", () => {
    const r = buildCanonicalPerson(danielLegacy, [danielQS], { companyId: QS });
    expect(r.contact.phone).toBe("6317037813");
    expect(r.contact.source_employee_id).toBe("751d864f");
    expect(r.contact.completeness).toBe("CONTACT_COMPLETE");
  });

  it("no expone datos de Parceros dentro del contexto de Quality Staff", () => {
    const r = buildCanonicalPerson(danielQS, [danielLegacy, danielParceros], {
      companyId: QS,
    });
    const parceros = r.records.find((x) => x.employee_id === "c2897e98");
    expect(parceros?.role).toBe("other_company_relationship");
    expect(parceros?.in_scope).toBe(false);
    expect(r.other_company_relationship_count).toBe(1);
    expect(r.contact.source_employee_id).toBe("751d864f");
  });

  it("no marca duplicado: la ficha antigua es legado, no competencia", () => {
    const r = buildCanonicalPerson(danielQS, [danielLegacy], { companyId: QS });
    expect(r.records.find((x) => x.employee_id === "629d0b49")?.role).toBe("legacy");
    expect(r.identity_review).toBe("IDENTITY_OK");
  });
});

/* ---------------- Angel Colon ---------------- */

const angelLive: PersonRecord = {
  id: "50f5c5ac",
  company_id: QS,
  first_name: "Angel",
  last_name: "Colon",
  phone_number: "3473132118",
  email: "Angelleonidascolonbermudez@gmail.com",
  user_id: "1b309cd7",
  is_active: true,
};
const angelSecond: PersonRecord = {
  id: "24c83018",
  company_id: QS,
  first_name: "Angel",
  last_name: "Colon",
  phone_number: "+1 347 313 2118",
  email: "Angelleonidascolonbermudez@gmail.com",
  is_active: false,
};

describe("Angel Colon — duplicado confirmado, sin fusión", () => {
  it("clasifica CONFIRMED_SAME_PERSON por teléfono y correo coincidentes", () => {
    const cmp = comparePersonRecords(angelLive, angelSecond);
    expect(cmp.confidence).toBe("CONFIRMED_SAME_PERSON");
    expect(cmp.evidence.map((e) => e.key)).toEqual(
      expect.arrayContaining(["same_normalized_phone", "same_email"]),
    );
  });

  it("propone la ficha con cuenta y actividad como canónica y la otra como relación inactiva", () => {
    const r = buildCanonicalPerson(angelLive, [angelSecond], { companyId: QS });
    expect(r.canonical_employee_id).toBe("50f5c5ac");
    expect(r.records.find((x) => x.employee_id === "24c83018")?.role).toBe(
      "inactive_relationship",
    );
    expect(r.linked_record_count).toBe(2);
  });
});

/* ---------------- Edinson Leon / Francisco Patino ---------------- */

const edinsonA: PersonRecord = {
  id: "ef4e5966",
  company_id: QS,
  first_name: "Edinson",
  last_name: "Leon",
  phone_number: "3478325243",
  email: "edinsonreal23@gmail.com",
  is_active: true,
};
const edinsonB: PersonRecord = {
  id: "d04a3506",
  company_id: QS,
  first_name: "Edinson",
  last_name: "Leon",
  is_active: true,
};

const franciscoA: PersonRecord = {
  id: "82e58682",
  company_id: QS,
  first_name: "Francisco",
  last_name: "Patino",
  phone_number: "9299915590",
  email: "Sebaspatino11@gmail.com",
  user_id: "38bd8811",
  is_active: true,
};
const franciscoB: PersonRecord = {
  id: "1f61628f",
  company_id: QS,
  first_name: "francisco",
  last_name: "patino",
  is_active: true,
};

describe("Edinson Leon y Francisco Patino — sin decisión automática", () => {
  it("quedan como posibles, nunca confirmados solo por nombre", () => {
    expect(comparePersonRecords(edinsonA, edinsonB).confidence).toBe(
      "POSSIBLE_SAME_PERSON",
    );
    expect(comparePersonRecords(franciscoA, franciscoB).confidence).toBe(
      "POSSIBLE_SAME_PERSON",
    );
  });

  it("la única evidencia registrada es el nombre (débil)", () => {
    const strong = comparePersonRecords(edinsonA, edinsonB).evidence.filter(
      (e) => e.strength === "strong",
    );
    expect(strong).toHaveLength(0);
  });

  it("la resolución los marca POSSIBLE_DUPLICATE para revisión humana", () => {
    const r = buildCanonicalPerson(edinsonA, [edinsonB], { companyId: QS });
    expect(r.identity_review).toBe("POSSIBLE_DUPLICATE");
  });
});

/* ---------------- Contacto incompleto != duplicado ---------------- */

describe("Contacto incompleto no es conflicto de identidad", () => {
  const sinTelefono: PersonRecord = {
    id: "solo-uno",
    company_id: QS,
    first_name: "Persona",
    last_name: "Sin Telefono",
    is_active: true,
  };

  it("clasifica CONTACT_INCOMPLETE sin tocar el estado de identidad", () => {
    expect(classifyContactCompleteness(sinTelefono)).toBe("CONTACT_INCOMPLETE");
    const r = buildCanonicalPerson(sinTelefono, [], { companyId: QS });
    expect(r.contact.completeness).toBe("CONTACT_INCOMPLETE");
    expect(r.identity_review).toBe("IDENTITY_OK");
  });

  it("un teléfono de menos de 10 dígitos sigue siendo incompleto", () => {
    expect(classifyContactCompleteness({ id: "x", phone_number: "555 12" })).toBe(
      "CONTACT_INCOMPLETE",
    );
  });
});

/* ---------------- Seguridad ---------------- */

describe("Aislamiento y no vinculación accidental", () => {
  it("personas distintas no se vinculan", () => {
    const a: PersonRecord = {
      id: "a",
      company_id: QS,
      first_name: "Ana",
      last_name: "Ruiz",
      phone_number: "3471110000",
    };
    const b: PersonRecord = {
      id: "b",
      company_id: QS,
      first_name: "Luis",
      last_name: "Mora",
      phone_number: "3472220000",
    };
    expect(comparePersonRecords(a, b).confidence).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("contacto compartido con cuentas distintas es conflicto, no duplicado confirmado", () => {
    const a: PersonRecord = {
      id: "a",
      company_id: QS,
      first_name: "Maria",
      last_name: "Gomez",
      phone_number: "3473334444",
      user_id: "user-1",
    };
    const b: PersonRecord = {
      id: "b",
      company_id: QS,
      first_name: "Rosa",
      last_name: "Gomez",
      phone_number: "3473334444",
      user_id: "user-2",
    };
    expect(comparePersonRecords(a, b).confidence).toBe("POSSIBLE_SAME_PERSON");
    expect(buildCanonicalPerson(a, [b], { companyId: QS }).identity_review).toBe(
      "IDENTITY_CONFLICT",
    );
  });

  it("nunca toma contacto de una ficha de otra empresa", () => {
    const qsSinTelefono: PersonRecord = {
      id: "qs",
      company_id: QS,
      first_name: "Daniel",
      last_name: "Ochoa",
      user_id: "de4b4faa",
      is_active: true,
    };
    const otra: PersonRecord = {
      id: "otra",
      company_id: PARCEROS,
      first_name: "Daniel",
      last_name: "Ochoa",
      phone_number: "6317037813",
      user_id: "de4b4faa",
      is_active: true,
    };
    const r = buildCanonicalPerson(qsSinTelefono, [otra], { companyId: QS });
    expect(r.contact.phone).toBeNull();
    expect(r.contact.completeness).toBe("CONTACT_INCOMPLETE");
  });
});
