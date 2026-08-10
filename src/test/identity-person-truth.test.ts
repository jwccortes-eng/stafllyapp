import { describe, it, expect } from "vitest";
import {
  buildIdentityGroups,
  computePrimaryCandidate,
  compareWithConnecteam,
  detectSharedMailboxes,
  maskEmail,
  maskPhone,
  normalizePersonName,
  normalizeIdentityPhone,
  type IdentityRecord,
} from "@/lib/identity/person-truth";
import { auditAssignmentIdentity } from "@/lib/identity/assignment-risk";

const base = (over: Partial<IdentityRecord>): IdentityRecord => ({
  id: over.id ?? "x",
  company_id: "c1",
  is_active: true,
  worker_type: "real_employee",
  identity_status: "verified",
  ...over,
});

describe("normalización", () => {
  it("normaliza nombre con acentos", () => {
    expect(normalizePersonName("José", "Pérez")).toBe("jose perez");
  });
  it("normaliza teléfono con prefijo 1", () => {
    expect(normalizeIdentityPhone("+1 (917) 555-1234")).toBe("9175551234");
  });
  it("descarta teléfonos cortos", () => {
    expect(normalizeIdentityPhone("123")).toBe("");
  });
});

describe("privacidad", () => {
  it("enmascara teléfono y email", () => {
    expect(maskPhone("9175551234")).toBe("•••••1234");
    expect(maskEmail("william@gmail.com")).toContain("@gmail.com");
    expect(maskEmail("william@gmail.com")).not.toContain("william");
  });
});

describe("buzones compartidos", () => {
  it("detecta email usado por 3+ registros", () => {
    const recs = [1, 2, 3].map((i) => base({ id: `e${i}`, email: "op@empresa.com" }));
    expect(detectSharedMailboxes(recs).has("op@empresa.com")).toBe(true);
  });
  it("no agrupa por buzón compartido", () => {
    const recs = [
      base({ id: "a", first_name: "Ana", last_name: "Uno", email: "op@empresa.com" }),
      base({ id: "b", first_name: "Beto", last_name: "Dos", email: "op@empresa.com" }),
      base({ id: "c", first_name: "Cira", last_name: "Tres", email: "op@empresa.com" }),
    ];
    expect(buildIdentityGroups(recs)).toHaveLength(0);
  });
});

describe("agrupación y veredicto", () => {
  it("mismo teléfono + mismo nombre → duplicado probable", () => {
    const recs = [
      base({ id: "a", first_name: "William", last_name: "Rodriguez", phone_number: "9175551234", user_id: "u1", assignments_count: 12 }),
      base({ id: "b", first_name: "William", last_name: "Rodriguez", phone_number: "917-555-1234" }),
    ];
    const [g] = buildIdentityGroups(recs);
    expect(g.verdict).toBe("PROBABLE_DUPLICATE");
    expect(g.primary?.candidateId).toBe("a");
  });

  it("solo nombre → duplicado posible, nunca exacto", () => {
    const recs = [
      base({ id: "a", first_name: "Ivan", last_name: "Morales" }),
      base({ id: "b", first_name: "Iván", last_name: "Morales" }),
    ];
    const [g] = buildIdentityGroups(recs);
    expect(g.verdict).toBe("POSSIBLE_DUPLICATE");
  });

  it("mismo teléfono con nombres distintos → ambiguo", () => {
    const recs = [
      base({ id: "a", first_name: "Ana", last_name: "Lopez", phone_number: "9175551234" }),
      base({ id: "b", first_name: "Luis", last_name: "Lopez", phone_number: "9175551234" }),
    ];
    const [g] = buildIdentityGroups(recs);
    expect(g.verdict).toBe("AMBIGUOUS");
  });

  it("detecta fragmentación de portal e historia", () => {
    const recs = [
      base({ id: "a", first_name: "Ana", last_name: "Ruiz", phone_number: "9175551234", user_id: "u1" }),
      base({ id: "b", first_name: "Ana", last_name: "Ruiz", phone_number: "9175551234", assignments_count: 5 }),
      base({ id: "c", first_name: "Ana", last_name: "Ruiz", phone_number: "9175551234", assignments_count: 3, documents_count: 2 }),
    ];
    const [g] = buildIdentityGroups(recs);
    expect(g.fragmentation.map((f) => f.key)).toContain("portal_split");
    expect(g.fragmentation.map((f) => f.key)).toContain("history_split");
  });

  it("no cruza empresas", () => {
    const recs = [
      base({ id: "a", company_id: "c1", first_name: "Ana", last_name: "Ruiz", phone_number: "9175551234" }),
      base({ id: "b", company_id: "c2", first_name: "Ana", last_name: "Ruiz", phone_number: "9175551234" }),
    ];
    expect(buildIdentityGroups(recs)).toHaveLength(0);
  });
});

describe("candidato principal", () => {
  it("prefiere el registro asignable con historia sobre el histórico", () => {
    const p = computePrimaryCandidate([
      base({ id: "old", employee_role: "historical", assignments_count: 40 }),
      base({ id: "new", assignments_count: 6, user_id: "u1" }),
    ]);
    expect(p?.candidateId).toBe("new");
  });
});

describe("auditoría de asignaciones", () => {
  it("marca no tocar cuando hay horas y dudas", () => {
    const row = auditAssignmentIdentity(base({ id: "a", is_active: false }), {
      employeeId: "a",
      assignmentsCount: 10,
      hasTimeEntries: true,
      hasDocuments: false,
      duplicateGroupKey: "g1",
      groupPrimaryId: "b",
    });
    expect(row.verdict).toBe("HIGH_RISK_DO_NOT_TOUCH");
  });

  it("marca correcto un asignable sin duplicados", () => {
    const row = auditAssignmentIdentity(base({ id: "a" }), {
      employeeId: "a",
      assignmentsCount: 3,
      hasTimeEntries: true,
      hasDocuments: true,
    });
    expect(row.verdict).toBe("CONFIRMED_OK");
  });
});

describe("comparación Connecteam", () => {
  it("clasifica matched, multiple y connecteam-only", () => {
    const recs = [
      base({ id: "a", first_name: "Ana", last_name: "Ruiz", connecteam_employee_id: "111" }),
      base({ id: "b", first_name: "Ana", last_name: "Ruiz" }),
    ];
    const rows = compareWithConnecteam(recs, [
      { externalId: "111", name: "Ana Ruiz" },
      { externalId: "999", name: "Nadie Aqui" },
    ]);
    expect(rows.find((r) => r.externalId === "111")?.verdict).toBe("MULTIPLE_STAFFLY_MATCHES");
    expect(rows.find((r) => r.externalId === "999")?.verdict).toBe("CONNECTEAM_ONLY");
  });
});
