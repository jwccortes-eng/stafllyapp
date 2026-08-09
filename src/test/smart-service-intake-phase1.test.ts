import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCandidate,
  canCreateDraft,
  getCandidateReadiness,
  recomputeCandidate,
  SERVICE_INTAKE_BATCH_TYPE,
  INTAKE_SOURCES,
} from "@/lib/intake/candidate";
import {
  resolveEntity,
  confirmRef,
  normalizeEntityName,
} from "@/lib/intake/entity-resolution";
import { detectDuplicate, buildIntakeSourceReference } from "@/lib/intake/duplicate";
import { assertExtractionResult } from "@/lib/intake/extraction-contract";
import { scheduleRowsToCandidates } from "@/lib/intake/schedule-adapter";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const base = () =>
  createCandidate({
    id: "c1",
    companyId: COMPANY,
    source: "pasted_text",
    sourceBatchId: "batch-1",
    sourceRowId: "row-1",
    serviceDate: "2026-08-20",
    startTime: "18:00",
    endTime: "23:00",
    clientCandidate: {
      raw: "Millenium",
      resolvedId: null,
      suggestedId: null,
      suggestedLabel: null,
      confidence: 0,
      requiresConfirmation: false,
    },
    serviceType: "banquet",
    requestedWorkers: 6,
  });

describe("modelo canónico de candidato", () => {
  it("usa el batch_type de intake y el catálogo de sources", () => {
    expect(SERVICE_INTAKE_BATCH_TYPE).toBe("service_intake");
    expect(INTAKE_SOURCES).toContain("whatsapp_text");
    expect(INTAKE_SOURCES).toContain("voice_note");
  });

  it("marca campos faltantes sin bloquear el borrador (nivel A ≠ nivel B)", () => {
    const c = recomputeCandidate({ ...base(), endTime: null });
    expect(c.missingFields).toContain("end_time");
    // Hora de fin pendiente no impide guardar el trabajo como borrador.
    expect(canCreateDraft(c).ok).toBe(true);
    expect(getCandidateReadiness(c).publishGaps).toContain("end_time");
  });

  it("sin fecha no hay borrador posible", () => {
    const c = recomputeCandidate({ ...base(), serviceDate: null });
    expect(canCreateDraft(c)).toMatchObject({ ok: false, reason: "missing_service_date" });
  });

  it("permite crear cuando está completo", () => {
    expect(canCreateDraft(base()).ok).toBe(true);
  });
});

describe("resolución cliente / venue", () => {
  const catalog = [
    { id: "v1", name: "The Millennium Hall" },
    { id: "v2", name: "Zemer Banquet" },
  ];

  it("normaliza alias comerciales", () => {
    expect(normalizeEntityName("The Millennium Hall")).toBe(normalizeEntityName("Millennium"));
  });

  it("propone coincidencia sin crear nada y exige confirmación", () => {
    const ref = resolveEntity("Millenium", catalog);
    expect(ref.suggestedId).toBe("v1");
    expect(ref.resolvedId).toBeNull();
    expect(ref.requiresConfirmation).toBe(true);
  });

  it("resuelve alias Zemer → Zemer Banquet", () => {
    const ref = resolveEntity("Zemer", catalog);
    expect(ref.suggestedLabel).toBe("Zemer Banquet");
  });

  it("un venue sin vincular NO bloquea el borrador, pero sí publicar y exportar", () => {
    let c = base();
    c = recomputeCandidate({ ...c, venueCandidate: resolveEntity("Millenium", catalog) });
    expect(canCreateDraft(c).ok).toBe(true);
    const r = getCandidateReadiness(c);
    expect(r.publishGaps).toContain("venue_link");
    expect(r.exportGaps).toContain("connecteam_job");
    expect(r.pendingEntities).toContain("Millenium");
  });

  it("no sugiere nada cuando no hay parecido", () => {
    expect(resolveEntity("Aeropuerto Internacional", catalog).suggestedId).toBeNull();
  });
});

describe("detección de duplicados", () => {
  const existing = [
    {
      id: "s1",
      company_id: COMPANY,
      date: "2026-08-20",
      start_time: "18:00:00",
      end_time: "23:00:00",
      client_name: "Millenium",
      venue_name: "Millenium",
      service_type: "banquet",
    },
  ];

  it("detecta duplicado exacto por cliente+venue+horario", () => {
    const c = { ...base(), venueCandidate: { ...base().clientCandidate, raw: "Millenium" } };
    const v = detectDuplicate(c, existing);
    expect(v.status).toBe("exact_duplicate");
    expect(v.matchedShiftId).toBe("s1");
  });

  it("nunca crea duplicado exacto en silencio", () => {
    const c = { ...base(), duplicateStatus: "exact_duplicate" as const };
    expect(canCreateDraft(c).ok).toBe(false);
  });

  it("posible duplicado exige aceptación humana", () => {
    const pending = { ...base(), duplicateStatus: "possible_duplicate" as const };
    expect(canCreateDraft(pending).ok).toBe(false);
    const accepted = { ...pending, reviewStatus: "accepted" as const };
    expect(canCreateDraft(accepted).ok).toBe(true);
  });

  it("ignora servicios de otro tenant", () => {
    const v = detectDuplicate(base(), existing.map((e) => ({ ...e, company_id: OTHER })));
    expect(v.status).toBe("no_match");
  });

  it("reconoce la misma referencia de origen como duplicado exacto", () => {
    const c = base();
    const ref = buildIntakeSourceReference(c);
    const v = detectDuplicate(c, [
      { id: "s9", company_id: COMPANY, date: "1900-01-01", start_time: null, end_time: null, reconciliation_hash: ref },
    ]);
    expect(v.status).toBe("exact_duplicate");
    expect(v.reasons).toContain("source_reference");
  });
});

describe("contrato de extracción (suggestion-only)", () => {
  it("rechaza resultados que ya crearon filas de negocio", () => {
    const bad = assertExtractionResult(
      {
        batchId: "b",
        companyId: COMPANY,
        source: "image",
        candidates: [{ ...base(), createdShiftId: "shift-x" }],
        fieldConfidence: [],
        warnings: [],
      },
      COMPANY,
    );
    expect(bad.ok).toBe(false);
    expect(bad.violations).toContain("extractor_created_business_row");
  });

  it("rechaza company_id que no viene del contexto autenticado", () => {
    const bad = assertExtractionResult(
      { batchId: "b", companyId: OTHER, source: "pdf", candidates: [], fieldConfidence: [], warnings: [] },
      COMPANY,
    );
    expect(bad.violations).toContain("company_id_mismatch");
  });
});

describe("helper canónico de creación de draft", () => {
  beforeEach(() => vi.resetModules());

  async function loadHelper(handlers: {
    existingId?: string | null;
    insertId?: string;
    insertError?: { message: string } | null;
    checkRow?: Record<string, unknown> | null;
  }) {
    const inserts: any[] = [];
    const tablesTouched: string[] = [];
    let selectCall = 0;
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        from(table: string) {
          tablesTouched.push(table);
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            is: () => chain,
            maybeSingle: async () => {
              selectCall += 1;
              if (selectCall % 2 === 1) {
                return { data: handlers.existingId ? { id: handlers.existingId } : null };
              }
              return {
                data:
                  handlers.checkRow === undefined
                    ? {
                        id: handlers.insertId,
                        publication_status: "draft",
                        company_id: COMPANY,
                        import_batch_id: "batch-1",
                      }
                    : handlers.checkRow,
              };
            },
            insert: (payload: any) => {
              inserts.push(payload);
              return {
                select: () => ({
                  single: async () =>
                    handlers.insertError
                      ? { data: null, error: handlers.insertError }
                      : { data: { id: handlers.insertId ?? "shift-1" }, error: null },
                }),
              };
            },
          };
          return chain;
        },
      },
    }));
    const mod = await import("@/lib/intake/create-draft-service");
    return { mod, inserts, tablesTouched };
  }

  it("escribe sólo en scheduled_shifts, en draft y con import_batch_id", async () => {
    const { mod, inserts, tablesTouched } = await loadHelper({ insertId: "shift-1" });
    const out = await mod.createDraftServiceFromCandidate(base(), {
      companyId: COMPANY,
      userId: "user-1",
    });
    expect(out.status).toBe("created");
    expect(tablesTouched.every((t) => t === "scheduled_shifts")).toBe(true);
    expect(tablesTouched).not.toContain("shifts");
    expect(tablesTouched).not.toContain("shift_assignments");
    expect(tablesTouched).not.toContain("time_entries");
    expect(inserts[0].publication_status).toBe("draft");
    expect(inserts[0].status).toBe("open");
    expect(inserts[0].claimable).toBe(false);
    expect(inserts[0].published_at).toBeNull();
    expect(inserts[0].import_batch_id).toBe("batch-1");
    expect(inserts[0].company_id).toBe(COMPANY);
    expect(inserts[0].reconciliation_hash).toContain("batch-1");
  });

  it("es idempotente: el reintento reutiliza el draft existente", async () => {
    const { mod, inserts } = await loadHelper({ existingId: "shift-1" });
    const out = await mod.createDraftServiceFromCandidate(base(), {
      companyId: COMPANY,
      userId: "user-1",
    });
    expect(out.status).toBe("reused");
    expect(inserts).toHaveLength(0);
  });

  it("bloquea si el tenant activo no coincide con el candidato", async () => {
    const { mod, inserts } = await loadHelper({ insertId: "shift-1" });
    const out = await mod.createDraftServiceFromCandidate(base(), {
      companyId: OTHER,
      userId: "user-1",
    });
    expect(out).toMatchObject({ status: "blocked", reason: "tenant_mismatch" });
    expect(inserts).toHaveLength(0);
  });

  it("falla si la verificación de persistencia no confirma el draft", async () => {
    const { mod } = await loadHelper({ insertId: "shift-1", checkRow: null });
    const out = await mod.createDraftServiceFromCandidate(base(), {
      companyId: COMPANY,
      userId: "user-1",
    });
    expect(out).toMatchObject({ status: "error", reason: "persistence_check_failed" });
  });

  it("crea N drafts en lote sin abortar por un bloqueo", async () => {
    const { mod, inserts } = await loadHelper({ insertId: "shift-1" });
    const list = [
      base(),
      { ...base(), id: "c2", sourceRowId: "row-2" },
      { ...base(), id: "c3", serviceDate: null, missingFields: ["service_date"] },
    ];
    const out = await mod.createDraftServicesFromCandidates(list, {
      companyId: COMPANY,
      userId: "user-1",
    });
    expect(out.filter((o) => o.status === "created")).toHaveLength(2);
    expect(out[2]).toMatchObject({ status: "blocked", reason: "missing_service_date" });
    expect(inserts).toHaveLength(2);
  });
});

describe("reutilización desde ImportSchedule", () => {
  it("convierte filas de horario en candidatos canónicos", () => {
    const candidates = scheduleRowsToCandidates(
      [
        {
          shift_code: "SC-1",
          date: "2026-08-20",
          start_time: "18:00",
          end_time: "23:00",
          job: "Millennium",
          address: "100 Main St",
          employees: ["A", "B"],
          employee_statuses: ["ok", "ok"],
        },
      ],
      { companyId: COMPANY, batchId: "batch-1", source: "excel" },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].companyId).toBe(COMPANY);
    expect(candidates[0].sourceBatchId).toBe("batch-1");
    expect(candidates[0].requestedWorkers).toBe(2);
    expect(canCreateDraft(candidates[0]).ok).toBe(true);
  });
});
