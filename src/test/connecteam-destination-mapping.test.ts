/**
 * P0 — CONNECTEAM DESTINATION MAPPING
 *
 * Caso real: Imperial exporta (mapping por cliente declarado) y Millennium no
 * (sin destino declarado). Este test fija el criterio de cierre: el bloqueo
 * desaparece EXCLUSIVAMENTE al declarar el destino canónico del cliente, y ese
 * mapping se reutiliza en los demás servicios del mismo cliente — con o sin
 * venue — sin cruzarse con otras compañías.
 */
import { describe, it, expect } from "vitest";
import { resolveConnecteamJobAndSubItem } from "@/lib/integrations/connecteam-compat";
import {
  candidateSubjects,
  mostReusableSubject,
  upsertEntry,
  type ConnecteamMappingConfig,
} from "@/lib/integrations/connecteam-mapping";

const IMPERIAL_ID = "30cc3b7f-9507-4586-8686-3e57ec00d1c8";
const MILLENNIUM_ID = "3e6f9c2f-2143-4209-b9e8-82eca0efd50a";
const MILLENNIUM_VENUE = "cc8e8986-3dc5-40a1-9d7e-83b52883d4d9";

const clients = [
  { id: IMPERIAL_ID, name: "IMPERIAL HALL" },
  { id: MILLENNIUM_ID, name: "The Millennium Simcha Hall" },
];
const locations = [{ id: MILLENNIUM_VENUE, name: "Millennium Simcha" }];

/** Estado real de la compañía hoy: solo Imperial (cliente) y Luminance (título). */
const baseMapping: ConnecteamMappingConfig = {
  entries: {
    [`client:${IMPERIAL_ID}`]: { job: "IMPERIAL HALL", subItem: "", label: "IMPERIAL HALL" },
    "title:luminance": { job: "LUMINANCE HALL", subItem: "", label: "Luminance" },
  },
};

const ctx = (mapping: ConnecteamMappingConfig) =>
  ({ clients, locations, employees: [], assignments: [], categories: [], mapping }) as any;

const shift = (over: Record<string, unknown>) =>
  ({
    id: "s1",
    date: "2026-08-30",
    start_time: "17:00:00",
    end_time: "23:30:00",
    title: "Evento",
    client_id: null,
    location_id: null,
    ...over,
  }) as any;

const millenniumNoVenue = shift({ client_id: MILLENNIUM_ID });
const millenniumWithVenue = shift({
  id: "s2",
  client_id: MILLENNIUM_ID,
  location_id: MILLENNIUM_VENUE,
  title: "THE MILENIUM SIMCHA - House Waiters",
});
const imperial = shift({ id: "s3", client_id: IMPERIAL_ID, title: "Meseros" });

describe("Connecteam destination mapping — Millennium vs Imperial", () => {
  it("Millennium sin mapping explícito: el mapping de Imperial NO lo bloquea", () => {
    const r = resolveConnecteamJobAndSubItem(millenniumNoVenue, ctx(baseMapping));
    expect(r.destinationSource).toBe("raw_fallback");
    expect(r.fallbackUsed).toBe(true);
    expect(r.warnings.some((w) => w.severity === "block")).toBe(false);
    expect(r.reason).toMatch(/Sin mapping explícito/);
  });


  it("ANTES: Imperial resuelve por el mapping de cliente ya declarado", () => {
    const r = resolveConnecteamJobAndSubItem(imperial, ctx(baseMapping));
    expect(r.confidence).toBe("exact");
    expect(r.job).toBe("IMPERIAL HALL");
    expect(r.source.job).toBe("mapping");
  });

  it("el sujeto por defecto de 'Resolver ahora' es el cliente (reutilizable), no el venue", () => {
    const subjects = candidateSubjects({
      locationId: MILLENNIUM_VENUE,
      locationName: "Millennium Simcha",
      clientId: MILLENNIUM_ID,
      clientName: "The Millennium Simcha Hall",
      title: "Meseros",
    });
    expect(mostReusableSubject(subjects)?.kind).toBe("client");
  });

  it("DESPUÉS: al declarar el destino del cliente, Millennium deja de estar bloqueado", () => {
    const subject = mostReusableSubject(
      candidateSubjects({ clientId: MILLENNIUM_ID, clientName: "The Millennium Simcha Hall" }),
    )!;
    const next: ConnecteamMappingConfig = {
      entries: upsertEntry(baseMapping, subject, { job: "MILLENNIUM", subItem: "Waiters" }),
    };

    const a = resolveConnecteamJobAndSubItem(millenniumNoVenue, ctx(next));
    expect(a.confidence).toBe("exact");
    expect(a.job).toBe("MILLENNIUM");
    expect(a.subItem).toBe("Waiters");
    expect(a.warnings.some((w) => w.severity === "block")).toBe(false);

    // Reutilización: otro servicio del mismo cliente, con venue distinto.
    const b = resolveConnecteamJobAndSubItem(millenniumWithVenue, ctx(next));
    expect(b.job).toBe("MILLENNIUM");
    expect(b.source.mappingKey).toBe(`client:${MILLENNIUM_ID}`);

    // Imperial intacto.
    const c = resolveConnecteamJobAndSubItem(imperial, ctx(next));
    expect(c.job).toBe("IMPERIAL HALL");
  });

  it("cero cross-tenant: sin las entradas de esta compañía no hay destino declarado", () => {
    const r = resolveConnecteamJobAndSubItem(imperial, ctx({ entries: {} }));
    // Nunca por mapping: otra compañía no hereda el destino de esta.
    expect(r.source.job).not.toBe("mapping");
    expect(r.source.mappingKey).toBeUndefined();
    expect(r.confidence).not.toBe("exact");
  });

});
