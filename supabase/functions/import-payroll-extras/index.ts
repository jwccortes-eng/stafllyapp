import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseMoney, round2 } from "../_shared/payroll-money.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PayrollRow {
  firstName: string;
  lastName: string;
  employerIdentification: string;
  payperDay: number;
  ryde: number;
  tips: number;
  reimbursements: number;
  travelHours: number;
  otros: number;
  discount: number;
  notes: string;
}

/** Fila cruda del sheet PAYROLL (autoridad financiera). Valores tal cual vienen del Excel. */
interface BridgeRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  employerIdentification: string;
  basePay: unknown;        // "Total pay"
  payperDay: unknown;
  ryde: unknown;
  tips: unknown;
  reimbursements: unknown;
  travelHours: unknown;
  otros: unknown;
  discount: unknown;
  approvedTotal: unknown;  // "TOTAL" — cifra final aprobada
  observations?: string;   // interno, nunca visible al trabajador
}

// Concept mapping (Quality Staff). Se usa como fallback si no hay match por nombre.
const CONCEPT_MAP: Record<string, string> = {
  payperDay: "7b21cbef-0c1c-4e3a-baa9-836d433d5e87",     // Weekend Job
  ryde: "a3b46930-fe2e-4ce8-9f81-7b5ac3fc7197",           // Pago de Transporte Regular
  tips: "179c7ae9-3c8d-400e-b461-57ae0d16e59c",           // Propinas
  reimbursements: "ea95e7f5-d69c-4710-9e80-5560baf624cb", // Reintegros
  travelHours: "ce59e1ec-aae6-49c3-9866-601c25a19fc8",    // Horas de viaje
  otros: "560961d6-f845-4898-9a55-cbb0739bc1bc",          // Otros pagos
  discount: "0079755f-eff6-4ec1-af9d-a5658fcc997b",       // Descuentos
};

const CONCEPT_NAMES: Record<string, string> = {
  payperDay: "Weekend Job",
  ryde: "Pago de Transporte Regular",
  tips: "Propinas",
  reimbursements: "Reintegros",
  travelHours: "Horas de viaje",
  otros: "Otros pagos",
  discount: "Descuentos",
};

const COMPONENT_KEYS = [
  "payperDay", "ryde", "tips", "reimbursements", "travelHours", "otros", "discount",
] as const;
type ComponentKey = typeof COMPONENT_KEYS[number];

function normalizeName(s: string): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").trim();
}

function normalizeId(s: unknown): string {
  const raw = String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
  // Excel entrega los IDs numéricos como "1291.0"; se normaliza a "1291".
  const numeric = raw.match(/^(\d+)\.0+$/);
  return numeric ? numeric[1] : raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "No autorizado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Token inválido" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as {
      mode?: "preview" | "import";
      companyId: string;
      periodId: string;
      rows: (PayrollRow | BridgeRow)[];
      sheetName?: string;
      fileName?: string;
      expectedGrandTotal?: number;
      acknowledgeOverrides?: boolean;
    };

    const { companyId, periodId, rows } = body;
    if (!companyId || !periodId || !rows?.length) {
      return json({ error: "companyId, periodId y rows son requeridos" }, 400);
    }

    // Verify user belongs to company
    const { data: membership } = await supabase
      .from("company_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!membership) {
      return json({ error: "No tienes acceso a esta compañía" }, 403);
    }

    if (body.mode === "preview" || body.mode === "import") {
      return await handleBridge(supabase, user.id, body as any);
    }

    return await handleLegacy(supabase, user.id, companyId, periodId, rows as PayrollRow[]);
  } catch (e) {
    console.error("import-payroll-extras error:", e);
    return json({ error: "Error interno del servidor" }, 500);
  }
});

// ============================================================================
// BRIDGE: cierre externo aprobado (Payroll 142) — preview sin escrituras + import controlado
// ============================================================================

async function handleBridge(
  supabase: any,
  userId: string,
  body: {
    mode: "preview" | "import";
    companyId: string;
    periodId: string;
    rows: BridgeRow[];
    sheetName?: string;
    fileName?: string;
    expectedGrandTotal?: number;
    acknowledgeOverrides?: boolean;
  },
) {
  const { mode, companyId, periodId, rows } = body;

  // 1. Autoridad de sheet: solo PAYROLL alimenta el bridge.
  const sheetName = (body.sheetName ?? "").trim();
  if (sheetName && !/^payroll$/i.test(sheetName)) {
    return json({
      error: `Solo la hoja PAYROLL es autoridad financiera. Hoja recibida: "${sheetName}".`,
    }, 400);
  }

  const { data: period } = await supabase
    .from("pay_periods")
    .select("id, company_id, start_date, end_date, status")
    .eq("id", periodId)
    .maybeSingle();

  if (!period || period.company_id !== companyId) {
    return json({ error: "Periodo no encontrado para esta compañía" }, 400);
  }

  // 2. Identidad: matching por Employer identification (nunca crea empleados).
  //    Roster completo paginado (PostgREST corta en 1000 filas por defecto).
  const roster: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: rosterError } = await supabase
      .from("employees")
      .select("id, first_name, last_name, employer_identification, merged_into_employee_id")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (rosterError) {
      // Nunca convertir un fallo de lectura en NOT_FOUND masivos: bloquear el preview.
      return json({
        error: `No se pudo leer el roster de empleados (${rosterError.code ?? "?"}): ${rosterError.message}`,
        stage: "identity_roster_read",
      }, 500);
    }
    const batch = page ?? [];
    roster.push(...batch);
    if (batch.length < PAGE) break;
  }

  const rosterCount = roster.length;
  const canonical = roster.filter((e: any) => !e.merged_into_employee_id);

  const byEmployerId = new Map<string, any[]>();
  const byName = new Map<string, any[]>();
  for (const emp of canonical) {
    const eid = normalizeId(emp.employer_identification);
    if (eid) {
      byEmployerId.set(eid, [...(byEmployerId.get(eid) ?? []), emp]);
    }
    const nk = normalizeName(`${emp.first_name} ${emp.last_name}`);
    if (nk) byName.set(nk, [...(byName.get(nk) ?? []), emp]);
  }

  // Conceptos vigentes de la empresa (por nombre; fallback a IDs conocidos).
  const { data: concepts } = await supabase
    .from("concepts")
    .select("id, name, category, is_active")
    .eq("company_id", companyId);

  const conceptByName = new Map<string, any>();
  for (const c of concepts ?? []) conceptByName.set(String(c.name).toLowerCase().trim(), c);

  function resolveConcept(key: ComponentKey) {
    const byNm = conceptByName.get(CONCEPT_NAMES[key].toLowerCase());
    if (byNm) return { id: byNm.id as string, name: byNm.name as string, category: byNm.category as string };
    const fallbackId = CONCEPT_MAP[key];
    const byId = (concepts ?? []).find((c: any) => c.id === fallbackId);
    if (byId) return { id: byId.id as string, name: byId.name as string, category: byId.category as string };
    return null;
  }

  // Estado actual del periodo (para reportar impacto sin escribir)
  const { data: existingBase } = await supabase
    .from("period_base_pay")
    .select("employee_id")
    .eq("period_id", periodId)
    .eq("company_id", companyId);
  const baseExisting = new Set((existingBase ?? []).map((r: any) => r.employee_id));

  const { data: existingMovements } = await supabase
    .from("movements")
    .select("employee_id, concept_id")
    .eq("period_id", periodId)
    .eq("company_id", companyId);
  const movementExisting = new Set((existingMovements ?? []).map((m: any) => `${m.employee_id}|${m.concept_id}`));

  const previewRows: any[] = [];
  const blockers: string[] = [];
  let grandApproved = 0;
  let grandComponents = 0;
  let matched = 0, ambiguous = 0, notFound = 0, overrides = 0, parseIssues = 0;
  const seenEmployeeIds = new Set<string>();

  for (const row of rows) {
    const warnings: string[] = [];
    const label = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || `Fila ${row.rowNumber}`;

    // --- identidad
    let identityStatus: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND" = "NOT_FOUND";
    let employeeId: string | null = null;
    let identityMethod = "employer_identification";
    const eid = normalizeId(row.employerIdentification);
    const idCandidates = eid ? (byEmployerId.get(eid) ?? []) : [];

    if (idCandidates.length === 1) {
      identityStatus = "MATCHED";
      employeeId = idCandidates[0].id;
    } else if (idCandidates.length > 1) {
      identityStatus = "AMBIGUOUS";
      warnings.push(`Employer identification "${eid}" apunta a ${idCandidates.length} fichas.`);
    } else {
      identityMethod = "name";
      const nameCandidates = byName.get(normalizeName(label)) ?? [];
      if (nameCandidates.length === 1 && !eid) {
        identityStatus = "MATCHED";
        employeeId = nameCandidates[0].id;
        warnings.push("Sin Employer identification: emparejado por nombre único. Verificar.");
      } else if (nameCandidates.length > 1) {
        identityStatus = "AMBIGUOUS";
        warnings.push(`El nombre coincide con ${nameCandidates.length} fichas; el nombre nunca decide solo.`);
      } else {
        identityStatus = "NOT_FOUND";
        warnings.push("No existe una ficha canónica para este trabajador. No se crean empleados desde el Excel.");
      }
    }

    if (identityStatus === "MATCHED" && employeeId) {
      if (seenEmployeeIds.has(employeeId)) {
        identityStatus = "AMBIGUOUS";
        warnings.push("Este trabajador aparece en más de una fila del archivo.");
      } else {
        seenEmployeeIds.add(employeeId);
      }
    }

    if (identityStatus === "MATCHED") matched++;
    else if (identityStatus === "AMBIGUOUS") ambiguous++;
    else notFound++;

    // --- parseo monetario auditable
    const baseParse = parseMoney(row.basePay);
    if (!baseParse.ok) {
      warnings.push(`Total pay ilegible: ${baseParse.note}`);
      parseIssues++;
    } else if (baseParse.kind === "currency_text") {
      warnings.push(`Total pay en texto ("${baseParse.raw}") interpretado como ${baseParse.value}.`);
    }

    const components: any[] = [];
    let componentSum = baseParse.ok ? baseParse.value : 0;
    let rowParseOk = baseParse.ok;

    for (const key of COMPONENT_KEYS) {
      const parsed = parseMoney((row as any)[key]);
      if (!parsed.ok) {
        rowParseOk = false;
        parseIssues++;
        warnings.push(`${CONCEPT_NAMES[key]}: ${parsed.note} (valor "${parsed.raw}")`);
        continue;
      }
      if (parsed.value === 0) continue;

      const concept = resolveConcept(key);
      if (!concept) {
        rowParseOk = false;
        warnings.push(`Concepto "${CONCEPT_NAMES[key]}" no existe en el catálogo de la empresa.`);
        continue;
      }

      // Descuentos siempre negativos; el resto conserva el signo del Excel.
      const value = key === "discount" ? -Math.abs(parsed.value) : parsed.value;
      componentSum = round2(componentSum + value);

      if (parsed.kind === "currency_text") {
        warnings.push(`${CONCEPT_NAMES[key]} en texto ("${parsed.raw}") interpretado como ${parsed.value}.`);
      }

      components.push({
        key,
        conceptId: concept.id,
        conceptName: concept.name,
        category: concept.category,
        raw: parsed.raw,
        value,
        alreadyExists: employeeId ? movementExisting.has(`${employeeId}|${concept.id}`) : false,
      });
    }

    // --- total aprobado (autoridad final, no se recalcula)
    const totalParse = parseMoney(row.approvedTotal);
    if (!totalParse.ok) {
      rowParseOk = false;
      parseIssues++;
      warnings.push(`TOTAL aprobado ilegible: ${totalParse.note}`);
    }

    const approvedTotal = totalParse.ok ? totalParse.value : 0;
    const difference = round2(approvedTotal - componentSum);
    const hasOverride = totalParse.ok && Math.abs(difference) >= 0.01;
    if (hasOverride) {
      overrides++;
      warnings.push(
        `TOTAL aprobado ($${approvedTotal.toFixed(2)}) difiere del desglose ($${componentSum.toFixed(2)}) en $${difference.toFixed(2)}. Se congela el TOTAL aprobado; no se recalcula ni se inventan movimientos.`,
      );
    }

    grandApproved = round2(grandApproved + approvedTotal);
    grandComponents = round2(grandComponents + componentSum);

    const status = identityStatus !== "MATCHED" || !rowParseOk ? "BLOCKED" : (hasOverride ? "REVIEW" : "OK");
    if (status === "BLOCKED") {
      blockers.push(`${label}: ${identityStatus !== "MATCHED" ? identityStatus : "parseo inseguro"}`);
    }

    previewRows.push({
      rowNumber: row.rowNumber,
      worker: label,
      employerIdentification: row.employerIdentification ?? "",
      employeeId,
      identityStatus,
      identityMethod,
      basePay: baseParse.ok ? baseParse.value : null,
      basePayRaw: baseParse.raw,
      components,
      componentSum,
      approvedTotal: totalParse.ok ? approvedTotal : null,
      approvedTotalRaw: totalParse.raw,
      difference,
      hasApprovedTotalOverride: hasOverride,
      // Observaciones: SIEMPRE internas. Nunca se copian a worker_visible_note.
      internalNote: (row.observations ?? "").trim() || null,
      basePayAlreadyExists: employeeId ? baseExisting.has(employeeId) : false,
      warnings,
      status,
    });
  }

  const summary = {
    mode,
    sheet: sheetName || "PAYROLL",
    fileName: body.fileName ?? null,
    period: { id: period.id, startDate: period.start_date, endDate: period.end_date, status: period.status },
    workers: previewRows.length,
    matched,
    ambiguous,
    notFound,
    parseIssues,
    approvedTotalOverrides: overrides,
    grandApprovedTotal: grandApproved,
    grandComponentSum: grandComponents,
    grandDifference: round2(grandApproved - grandComponents),
    canImport: blockers.length === 0,
    blockers,
  };

  if (mode === "preview") {
    // 6. ZERO WRITE: ni una sola escritura en tablas productivas.
    return json({ success: true, preview: true, writes: 0, summary, rows: previewRows }, 200);
  }

  // ---------------- IMPORT CONTROLADO ----------------
  if (blockers.length > 0) {
    return json({ error: "Hay filas bloqueadas. Resuelve identidad y parseo antes de importar.", summary, rows: previewRows }, 409);
  }

  // 9. Control de total: el total esperado debe coincidir al centavo.
  if (typeof body.expectedGrandTotal === "number") {
    const diff = round2(body.expectedGrandTotal - grandApproved);
    if (Math.abs(diff) >= 0.01) {
      return json({
        error: `El total del archivo ($${grandApproved.toFixed(2)}) no coincide con el total confirmado ($${body.expectedGrandTotal.toFixed(2)}). Diferencia $${diff.toFixed(2)}.`,
        summary,
      }, 409);
    }
  } else {
    return json({ error: "Falta expectedGrandTotal: el importe total debe confirmarse explícitamente." }, 400);
  }

  if (overrides > 0 && !body.acknowledgeOverrides) {
    return json({
      error: `Hay ${overrides} trabajador(es) con TOTAL aprobado distinto al desglose. Confirma explícitamente para continuar.`,
      summary, rows: previewRows,
    }, 409);
  }

  const basePayload: any[] = [];
  const movementsPayload: any[] = [];

  for (const r of previewRows) {
    basePayload.push({
      company_id: companyId,
      period_id: periodId,
      employee_id: r.employeeId,
      base_total_pay: r.basePay ?? 0,
      approved_total_override: r.approvedTotal,
      approved_total_source: "external_approved",
      approved_total_note: r.hasApprovedTotalOverride
        ? `TOTAL aprobado externo. Desglose $${r.componentSum.toFixed(2)}, diferencia $${r.difference.toFixed(2)}.`
        : "TOTAL aprobado externo, coincide con el desglose.",
    });

    for (const c of r.components) {
      if (c.alreadyExists) continue;
      movementsPayload.push({
        company_id: companyId,
        period_id: periodId,
        employee_id: r.employeeId,
        concept_id: c.conceptId,
        quantity: 1,
        rate: c.value,
        total_value: c.value,
        // Observaciones del Excel = nota interna. Nunca visible al trabajador.
        note: r.internalNote ? `[Cierre externo] ${r.internalNote}` : "[Cierre externo aprobado]",
        worker_visible_note: null,
        visible_to_worker: true,
        approval_status: "approved",
        created_by: userId,
      });
    }
  }

  const { error: baseError } = await supabase
    .from("period_base_pay")
    .upsert(basePayload, { onConflict: "period_id,employee_id" });

  if (baseError) {
    console.error("period_base_pay upsert error:", baseError.message);
    return json({ error: "No se pudo guardar el pago base del cierre." }, 500);
  }

  let inserted = 0;
  const BATCH_SIZE = 200;
  for (let i = 0; i < movementsPayload.length; i += BATCH_SIZE) {
    const batch = movementsPayload.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("movements").insert(batch);
    if (error) {
      console.error("movements batch error:", error.message);
      return json({ error: "No se pudieron guardar todos los movimientos del cierre.", inserted }, 500);
    }
    inserted += batch.length;
  }

  await supabase.from("activity_log").insert({
    user_id: userId,
    company_id: companyId,
    action: "import_external_approved_payroll",
    entity_type: "pay_periods",
    entity_id: periodId,
    details: {
      fileName: body.fileName ?? null,
      sheet: summary.sheet,
      workers: summary.workers,
      grandApprovedTotal: summary.grandApprovedTotal,
      grandComponentSum: summary.grandComponentSum,
      approvedTotalOverrides: summary.approvedTotalOverrides,
      basePayRows: basePayload.length,
      movementsInserted: inserted,
      source: "external_approved",
    },
  });

  return json({
    success: true,
    preview: false,
    summary,
    basePayRows: basePayload.length,
    movementsInserted: inserted,
    skippedExistingMovements: previewRows.reduce(
      (n: number, r: any) => n + r.components.filter((c: any) => c.alreadyExists).length, 0),
  }, 200);
}

// ============================================================================
// LEGACY: comportamiento original (extras por nombre). Se conserva sin cambios.
// ============================================================================

async function handleLegacy(
  supabase: any,
  userId: string,
  companyId: string,
  periodId: string,
  rows: PayrollRow[],
) {
  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, connecteam_employee_id")
    .eq("company_id", companyId);

  const empByName = new Map<string, string>();
  for (const emp of employees ?? []) {
    empByName.set(normalizeName(`${emp.first_name} ${emp.last_name}`), emp.id);
  }

  const { data: existingMovements } = await supabase
    .from("movements")
    .select("employee_id, concept_id")
    .eq("period_id", periodId)
    .eq("company_id", companyId);

  const existingSet = new Set(
    (existingMovements ?? []).map((m: any) => `${m.employee_id}|${m.concept_id}`),
  );

  let inserted = 0;
  let skippedDuplicate = 0;
  let skippedNoEmployee = 0;
  const unmatchedEmployees = new Set<string>();
  const toInsert: any[] = [];

  for (const row of rows) {
    const empId = empByName.get(normalizeName(`${row.firstName} ${row.lastName}`));
    if (!empId) {
      unmatchedEmployees.add(`${row.firstName} ${row.lastName}`);
      skippedNoEmployee++;
      continue;
    }

    const extras: [string, number][] = [
      ["payperDay", row.payperDay],
      ["ryde", row.ryde],
      ["tips", row.tips],
      ["reimbursements", row.reimbursements],
      ["travelHours", row.travelHours],
      ["otros", row.otros],
      ["discount", row.discount],
    ];

    for (const [key, value] of extras) {
      if (!value || value === 0) continue;
      const conceptId = CONCEPT_MAP[key];
      if (!conceptId) continue;

      const dedupKey = `${empId}|${conceptId}`;
      if (existingSet.has(dedupKey)) {
        skippedDuplicate++;
        continue;
      }
      existingSet.add(dedupKey);

      const totalValue = key === "discount" ? -Math.abs(value) : Math.abs(value);
      toInsert.push({
        company_id: companyId,
        period_id: periodId,
        employee_id: empId,
        concept_id: conceptId,
        quantity: 1,
        rate: totalValue,
        total_value: totalValue,
        note: row.notes || `Importado desde Excel Connecteam`,
        approval_status: "approved",
        created_by: userId,
      });
    }
  }

  const BATCH_SIZE = 200;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("movements").insert(batch);
    if (error) {
      console.error("Batch insert error:", error);
      for (const item of batch) {
        const { error: singleError } = await supabase.from("movements").insert(item);
        if (singleError) console.error("Single insert error:", singleError.message);
        else inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }

  await supabase.from("activity_log").insert({
    user_id: userId,
    company_id: companyId,
    action: "import_payroll_extras",
    entity_type: "movements",
    entity_id: periodId,
    details: {
      totalRows: rows.length,
      inserted,
      skippedDuplicate,
      skippedNoEmployee,
      unmatchedEmployees: Array.from(unmatchedEmployees),
    },
  });

  return json({
    success: true,
    inserted,
    skippedDuplicate,
    skippedNoEmployee,
    unmatchedEmployees: Array.from(unmatchedEmployees),
  }, 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
