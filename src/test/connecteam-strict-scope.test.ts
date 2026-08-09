/**
 * P0 — SCOPE DEL FLAG `strict` EN CONNECTEAM
 *
 * Regresión del efecto colateral: declarar un destino explícito (Imperial) NO
 * puede desactivar las reglas legacy ni el fallback válido de otros destinos
 * de la misma compañía (Millennium, Eminence). La resolución es POR DESTINO.
 */
import { describe, it, expect } from "vitest";
import { resolveConnecteamJobAndSubItem } from "@/lib/integrations/connecteam-compat";
import { type ConnecteamMappingConfig } from "@/lib/integrations/connecteam-mapping";

const IMPERIAL = "cli-imperial";
const MILLENNIUM = "cli-millennium";
const EMINENCE = "cli-eminence";

const clients = [
  { id: IMPERIAL, name: "IMPERIAL HALL" },
  { id: MILLENNIUM, name: "The Millennium Simcha Hall" },
  { id: EMINENCE, name: "Eminence Ballroom" },
];

const withImperialMapping: ConnecteamMappingConfig = {
  entries: {
    [`client:${IMPERIAL}`]: { job: "IMPERIAL HALL", subItem: "", label: "IMPERIAL HALL" },
  },
};

const ctx = (mapping: ConnecteamMappingConfig) =>
  ({ clients, locations: [], employees: [], assignments: [], categories: [], mapping }) as any;

const shift = (over: Record<string, unknown>) =>
  ({
    id: "s",
    date: "2026-08-30",
    start_time: "17:00:00",
    end_time: "23:30:00",
    title: "Evento",
    client_id: null,
    location_id: null,
    ...over,
  }) as any;

describe("Connecteam — el mapping explícito no contamina otros destinos", () => {
  it("CASO A — Imperial usa su mapping explícito", () => {
    const r = resolveConnecteamJobAndSubItem(shift({ client_id: IMPERIAL }), ctx(withImperialMapping));
    expect(r.destinationSource).toBe("explicit_mapping");
    expect(r.mappingScope).toBe("client");
    expect(r.job).toBe("IMPERIAL HALL");
    expect(r.fallbackUsed).toBe(false);
  });

  it("CASO C — Eminence conserva su regla legacy pese al mapping de Imperial", () => {
    const r = resolveConnecteamJobAndSubItem(
      shift({ client_id: EMINENCE, title: "Meseros" }),
      ctx(withImperialMapping),
    );
    expect(r.destinationSource).toBe("legacy_rule");
    expect(r.job).toBe("Eminence");
    expect(r.warnings.some(w => w.severity === "block")).toBe(false);
  });

  it("CASO B — Millennium conserva su fallback válido y no queda bloqueado", () => {
    const r = resolveConnecteamJobAndSubItem(shift({ client_id: MILLENNIUM }), ctx(withImperialMapping));
    expect(r.destinationSource).toBe("raw_fallback");
    expect(r.warnings.some(w => w.severity === "block")).toBe(false);
  });

  it("CASO D — sin cliente, lugar ni categoría sigue fail-closed", () => {
    const r = resolveConnecteamJobAndSubItem(shift({ title: "" }), ctx(withImperialMapping));
    expect(r.destinationSource).toBe("unresolved");
    expect(r.warnings.some(w => w.code === "missing_job_mapping" && w.severity === "block")).toBe(true);
  });

  it("CASO E — declarar Millennium gana sobre el fallback y no afecta a los demás", () => {
    const next: ConnecteamMappingConfig = {
      entries: {
        ...withImperialMapping.entries,
        [`client:${MILLENNIUM}`]: { job: "MILLENNIUM", subItem: "Waiters", label: "Millennium" },
      },
    };
    expect(resolveConnecteamJobAndSubItem(shift({ client_id: MILLENNIUM }), ctx(next)).destinationSource)
      .toBe("explicit_mapping");
    expect(resolveConnecteamJobAndSubItem(shift({ client_id: EMINENCE }), ctx(next)).destinationSource)
      .toBe("legacy_rule");
    expect(resolveConnecteamJobAndSubItem(shift({ client_id: IMPERIAL }), ctx(next)).job)
      .toBe("IMPERIAL HALL");
  });

  it("CASO F — multi-tenant: sin las entradas de esta compañía no hay mapping explícito", () => {
    const r = resolveConnecteamJobAndSubItem(shift({ client_id: IMPERIAL }), ctx({ entries: {} }));
    expect(r.destinationSource).not.toBe("explicit_mapping");
    expect(r.source.mappingKey).toBeUndefined();
  });

  it("`strict` sigue disponible como opt-in por llamada, nunca global", () => {
    const r = resolveConnecteamJobAndSubItem(
      shift({ client_id: MILLENNIUM }),
      ctx(withImperialMapping),
      { strict: true },
    );
    expect(r.destinationSource).toBe("unresolved");
  });
});
