import { describe, it, expect } from "vitest";
import {
  candidateSubjects,
  lookupMapping,
  upsertEntry,
  removeEntry,
  mappingKey,

  knownJobs,
  knownSubItems,
  EMPTY_CONNECTEAM_MAPPING,
  type ConnecteamMappingConfig,
} from "@/lib/integrations/connecteam-mapping";

const base = (): ConnecteamMappingConfig => ({ entries: {} });

describe("connecteam-mapping: sujetos candidatos", () => {
  it("prioriza venue → cliente → título", () => {
    const subs = candidateSubjects({
      locationId: "loc-1",
      locationName: "Millennium Hall",
      clientId: "cli-1",
      clientName: "Luminance",
      title: "Servicio noche",
    });
    expect(subs.map(s => s.kind)).toEqual(["location", "client", "title"]);
    expect(subs[0].label).toBe("Millennium Hall");
  });

  it("omite sujetos sin identidad y normaliza el título", () => {
    const subs = candidateSubjects({ title: "  IMPERIAL   Gala  " });
    expect(subs).toHaveLength(1);
    expect(subs[0].kind).toBe("title");
    // La clave de almacenamiento normaliza mayúsculas y espacios.
    expect(mappingKey("title", subs[0].id)).toBe(mappingKey("title", "imperial gala"));
  });

  it("sin ningún dato no hay sujeto: no se puede mapear", () => {
    expect(candidateSubjects({})).toEqual([]);
  });
});

describe("connecteam-mapping: lookup y persistencia", () => {
  it("guarda y recupera por venue", () => {
    const subs = candidateSubjects({ locationId: "loc-1", locationName: "Millennium" });
    const cfg: ConnecteamMappingConfig = {
      entries: upsertEntry(base(), subs[0], { job: "Millennium", subItem: "Events" }),
    };
    const hit = lookupMapping(cfg, subs);
    expect(hit?.entry.job).toBe("Millennium");
    expect(hit?.entry.subItem).toBe("Events");
    expect(mappingKey(hit!.subject.kind, hit!.subject.id)).toBe(mappingKey("location", "loc-1"));
  });

  it("cae al cliente cuando el venue no está mapeado", () => {
    const subs = candidateSubjects({
      locationId: "loc-9", locationName: "Sin mapping",
      clientId: "cli-1", clientName: "Luminance",
    });
    const cfg: ConnecteamMappingConfig = {
      entries: upsertEntry(base(), subs[1], { job: "Luminance", subItem: "" }),
    };
    expect(lookupMapping(cfg, subs)?.entry.job).toBe("Luminance");
  });

  it("sin mapping devuelve null — nunca inventa un Job", () => {
    const subs = candidateSubjects({ clientId: "cli-x", clientName: "Nuevo" });
    expect(lookupMapping(EMPTY_CONNECTEAM_MAPPING, subs)).toBeNull();
  });

  it("upsert sobrescribe el mismo sujeto sin duplicar claves", () => {
    const subs = candidateSubjects({ clientId: "cli-1", clientName: "Luminance" });
    let entries = upsertEntry(base(), subs[0], { job: "A", subItem: "" });
    entries = upsertEntry({ entries }, subs[0], { job: "B", subItem: "Events" });
    expect(Object.keys(entries)).toHaveLength(1);
    expect(entries[mappingKey("client", "cli-1")].job).toBe("B");
  });

  it("removeEntry elimina solo la clave indicada", () => {
    const a = candidateSubjects({ clientId: "c1", clientName: "A" })[0];
    const b = candidateSubjects({ clientId: "c2", clientName: "B" })[0];
    let entries = upsertEntry(base(), a, { job: "JA", subItem: "" });
    entries = upsertEntry({ entries }, b, { job: "JB", subItem: "" });
    entries = removeEntry({ entries }, mappingKey("client", "c1"));
    expect(Object.keys(entries)).toEqual([mappingKey("client", "c2")]);
  });
});

describe("connecteam-mapping: reutilización (aprendizaje tenant-scoped)", () => {
  it("knownJobs y knownSubItems alimentan la sugerencia del siguiente servicio", () => {
    const a = candidateSubjects({ clientId: "c1", clientName: "A" })[0];
    const b = candidateSubjects({ clientId: "c2", clientName: "B" })[0];
    let entries = upsertEntry(base(), a, { job: "Millennium", subItem: "Events" });
    entries = upsertEntry({ entries }, b, { job: "Millennium", subItem: "Setup" });
    const cfg = { entries };
    expect(knownJobs(cfg)).toEqual(["Millennium"]);
    expect(knownSubItems(cfg, "Millennium").sort()).toEqual(["Events", "Setup"]);
    expect(knownSubItems(cfg, "Otro")).toEqual([]);
  });
});
