import { describe, it, expect } from "vitest";
import {
  buildDirectoryMatrix,
  clientMatchesQuery,
  duplicatePairKey,
  evaluateClientDataQuality,
  findDuplicatePairs,
  getClientTruth,
  matchClient,
  normalizeClientName,
  normalizePhone,
  sortActiveFirst,
  type ClientRecord,
} from "@/lib/clients/client-truth";

function client(over: Partial<ClientRecord> & { id: string; name: string }): ClientRecord {
  return {
    company_id: "co",
    client_code: `CL-${over.id}`,
    aliases: [],
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    status: "active",
    notes: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as ClientRecord;
}

describe("normalización", () => {
  it("colapsa espacios, mayúsculas y puntuación segura", () => {
    expect(normalizeClientName("  The Millennium,  Simcha Hall LLC ")).toBe("millennium simcha hall");
  });
  it("normaliza teléfonos a 10 dígitos", () => {
    expect(normalizePhone("+1 (347) 678-3647")).toBe("3476783647");
  });
});

describe("matchClient", () => {
  const catalog = [
    client({ id: "1", name: "IMPERIAL HALL" }),
    client({ id: "2", name: "The Millennium Simcha Hall" }),
    client({ id: "3", name: "JKitchen Staff", contact_email: "jk@x.com" }),
  ];

  it("detecta EXACT_MATCH ignorando mayúsculas y puntuación", () => {
    const r = matchClient({ name: "imperial hall." }, catalog);
    expect(r.status).toBe("EXACT_MATCH");
    expect(r.exact?.id).toBe("1");
  });

  it("detecta POSSIBLE_DUPLICATE por nombre parecido", () => {
    const r = matchClient({ name: "THE MILENIUM SIMCHA" }, catalog);
    expect(r.status).toBe("POSSIBLE_DUPLICATE");
    expect(r.candidates[0].clientId).toBe("2");
  });

  it("detecta duplicado por email aunque el nombre difiera", () => {
    const r = matchClient({ name: "Otra cosa distinta", email: "JK@x.com" }, catalog);
    expect(r.status).toBe("POSSIBLE_DUPLICATE");
    expect(r.candidates[0].reason).toBe("same_email");
  });

  it("devuelve NOT_FOUND para nombres nuevos", () => {
    expect(matchClient({ name: "Zeta Catering" }, catalog).status).toBe("NOT_FOUND");
  });

  it("ignora clientes archivados", () => {
    const archived = [client({ id: "9", name: "IMPERIAL HALL", deleted_at: "2026-01-02T00:00:00Z" })];
    expect(matchClient({ name: "Imperial Hall" }, archived).status).toBe("NOT_FOUND");
  });
});

describe("duplicados del directorio", () => {
  it("encuentra pares exactos y probables", () => {
    const pairs = findDuplicatePairs([
      client({ id: "1", name: "NEW CONSTUMER" }),
      client({ id: "2", name: "NEW CONSTUMER" }),
      client({ id: "3", name: "Emmincence" }),
      client({ id: "4", name: "EMMINENCE HALL" }),
      client({ id: "5", name: "ZEMER HALL" }),
    ]);
    expect(pairs.some((p) => p.reason === "same_normalized_name")).toBe(true);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
  });

  it("la clave del par no depende del orden", () => {
    expect(duplicatePairKey("b", "a")).toBe(duplicatePairKey("a", "b"));
  });
});

describe("data quality", () => {
  it("lista pendientes explicables sin tratarlos como error", () => {
    const q = evaluateClientDataQuality({
      client: client({ id: "1", name: "IMPERIAL HALL" }),
      contacts: [],
      venues: [],
    });
    expect(q.gaps.map((g) => g.key)).toEqual(["contact", "phone", "email", "venue"]);
    expect(q.completenessPct).toBe(0);
    expect(q.hasPrimaryContact).toBe(false);
  });
});

describe("getClientTruth", () => {
  const base = client({ id: "1", name: "IMPERIAL HALL", contact_name: "Yoli", contact_phone: "9999999999" });

  it("proyecta identidad estable y estado operativo", () => {
    const t = getClientTruth({
      client: base,
      venues: [{ id: "v1", name: "Salón principal", address: null }],
      serviceCount: 12,
      lastServiceAt: "2026-08-01",
      connecteamMapped: true,
    });
    expect(t.humanReference).toBe("CL-1");
    expect(t.isActive).toBe(true);
    expect(t.primaryContact?.name).toBe("Yoli");
    expect(t.connecteamMappingStatus).toBe("configured");
    expect(t.reason).toContain("12 servicio(s)");
  });

  it("no bloquea clientes sin contacto", () => {
    const t = getClientTruth({ client: client({ id: "2", name: "ZEMER HALL" }) });
    expect(t.primaryContact).toBeNull();
    expect(t.isActive).toBe(true);
  });

  it("marca archivados sin borrarlos", () => {
    const t = getClientTruth({ client: client({ id: "3", name: "X", deleted_at: "2026-02-02" }) });
    expect(t.lifecycle).toBe("archived");
    expect(t.isActive).toBe(false);
  });
});

describe("directorio", () => {
  const truths = [
    getClientTruth({ client: client({ id: "1", name: "Activo A" }), serviceCount: 3, lastServiceAt: "2026-08-01" }),
    getClientTruth({ client: client({ id: "2", name: "Archivado B", deleted_at: "2026-01-05" }) }),
    getClientTruth({ client: client({ id: "3", name: "Activo C" }) }),
  ];

  it("pone activos primero", () => {
    const sorted = sortActiveFirst(truths);
    expect(sorted.map((t) => t.clientId)).toEqual(["1", "3", "2"]);
  });

  it("busca por nombre y por código humano", () => {
    expect(clientMatchesQuery(truths[0], "activo a")).toBe(true);
    expect(clientMatchesQuery(truths[0], "CL-1")).toBe(true);
    expect(clientMatchesQuery(truths[0], "zzz")).toBe(false);
  });

  it("construye la matriz QA", () => {
    const m = buildDirectoryMatrix(truths, [], "2026-06-01");
    expect(m.total).toBe(3);
    expect(m.active).toBe(2);
    expect(m.archived).toBe(1);
    expect(m.withoutContact).toBe(3);
    expect(m.withRecentServices).toBe(1);
    expect(m.withoutConnecteamMapping).toBe(3);
  });
});
