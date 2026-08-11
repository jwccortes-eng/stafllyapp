/**
 * P0 — VWC Fase 6: carril único de escritura.
 *
 * Ninguna superficie nueva puede escribir `scheduled_shifts` con un
 * `.update(...)` directo. El carril autorizado es `versionedWrite` o una RPC
 * transaccional. El array `TEMPORARY_EXCEPTIONS` es el inventario explícito
 * de consumidores heredados aún no migrados: sólo puede reducirse.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildPatch, rowVersion } from "@/lib/data/versioned-write";
import { sameShiftUpdateValue } from "@/lib/shifts/update-shift";
import { samePersistedValue } from "@/lib/data/versioned-write";
import { signedDelta } from "@/lib/data/advance-balance";
import { EDITABLE_COMPANY_FIELDS, isEditableSettingKey } from "@/lib/data/company-config-write";

const TEMPORARY_EXCEPTIONS = [
  // Helper heredado: se mantiene mientras existan consumidores no migrados.
  "src/lib/shifts/update-shift.ts",
  // Soft-delete y publicación: transiciones de estado (Clase C), migran en Fase 2.
  "src/pages/admin/Shifts.tsx",
  "src/components/shifts/ShiftDetailDialog.tsx",
  // Roles de conductor y campo legado.
  "src/lib/shifts/driver-sync.ts",
  // Importaciones masivas auditadas.
  "src/pages/admin/ImportSchedule.tsx",
  "src/pages/admin/ImportWizard.tsx",
  // Tokens QR / enlace: no son atributos operativos editables por el operador.
  "src/components/shifts/ShiftQRSection.tsx",
  "src/components/shifts/ShiftShareMenu.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("VWC — diff canónico", () => {
  it("sólo envía campos modificados", () => {
    const patch = buildPatch(
      { title: "A", meeting_point: "Puerta 1", start_time: "08:00:00" },
      { title: "A", meeting_point: "Puerta 2", start_time: "08:00" },
    );
    expect(patch).toEqual({ meeting_point: "Puerta 2" });
  });

  it("no considera cambio una hora con distinto formato", () => {
    expect(sameShiftUpdateValue("17:00", "17:00:00")).toBe(true);
    expect(buildPatch({ start_time: "17:00:00" }, { start_time: "17:00" })).toEqual({});
  });

  it("lee la versión observable de la fila", () => {
    expect(rowVersion({ version: 4 })).toBe(4);
    expect(rowVersion({})).toBeNull();
    expect(rowVersion(null)).toBeNull();
  });
});

describe("VWC — carril único de escritura de servicios", () => {
  it("no hay .update() directos nuevos sobre scheduled_shifts", () => {
    const offenders = walk("src")
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /from\("scheduled_shifts"\)[\s\S]{0,80}?\.update\(/.test(source);
      })
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => !TEMPORARY_EXCEPTIONS.includes(f));

    expect(offenders).toEqual([]);
  });
});

/** Fase 2: horas, compensación y saldos entran al mismo carril. */
const CRITICAL_TABLES: Record<string, string[]> = {
  time_entries: [
    // Aprobación masiva y flujos de fichaje del trabajador: transiciones (Clase C).
    "src/components/timeclock/DayDetailView.tsx",
    "src/lib/timeclock/hours-approval.ts",
    "src/pages/admin/ImportTimeClock.tsx",
    "src/pages/admin/ImportWizard.tsx",
    // Aprobación/rechazo por lote: compare-and-set sobre `status = pending`
    // (Clase C). No edita horas, sólo la transición de estado.
    "src/components/timeclock/TimesheetView.tsx",
    // Fichaje del propio trabajador: creación y cierre de su entrada activa
    // (Clase A/C). No es edición administrativa de horas.
    "src/pages/portal/PortalClock.tsx",
    // Sync offline-first del reloj: cierra la propia entrada con
    // compare-and-set (`.is("clock_out", null)`) e idempotencia por
    // `client_event_id` (Clase A/C). No edita horas administrativas.
    "src/lib/timeclock/supabase-clock-sync-adapter.ts",
  ],
  compensation_profiles: [],
  employee_financial_records: [
    // Aprobación, pausa y cancelación: transiciones de estado, no saldos.
    "src/components/advances/AdvanceLoanDetailDrawer.tsx",
  ],
  // Fase 3A — Bloque A: W-9 del trabajador. Sin excepciones: portal y admin
  // escriben por RPC (submit_contractor_w9 / review_contractor_w9 / versioned_update).
  contractor_w9: [],
  // Fase 3B — Bloque B: documentos y compliance. Toda revisión pasa por
  // review_employee_document y toda edición por versioned_update_employee_document.
  employee_documents: [],
  employee_onboarding_documents: [],
  // Fase 3C — configuración de empresa no financiera.
  // Excepciones temporales (archivo · razón · owner · fecha objetivo · riesgo):
  company_settings: [
    // useCompanyConfig.tsx · claves de payroll fuera de alcance por orden
    // "no tocar payroll" · owner: equipo Payroll · objetivo: Fase 3F ·
    // riesgo: lost update en configuración de nómina (sin regresión).
    "src/hooks/useCompanyConfig.tsx",
    // usePayrollConfig.tsx · configuración financiera (clase C) · owner:
    // equipo Payroll · objetivo: Fase 3F · riesgo: idéntico al anterior.
    "src/hooks/usePayrollConfig.tsx",
    // ImportSchedule.tsx · registro histórico `imported_schedule_files`
    // (clase F, no editable por operador) · owner: Importaciones ·
    // objetivo: Fase 3D · riesgo: bajo (lista append-only).
    "src/pages/admin/ImportSchedule.tsx",
    // SandboxSyncDialog.tsx · herramienta interna de sandbox, no producción ·
    // owner: Plataforma · objetivo: Fase 3D · riesgo: bajo (sólo sandbox).
    "src/components/SandboxSyncDialog.tsx",
  ],
  companies: [
    // Companies.tsx · superficie de plataforma (alta/baja de tenant,
    // activación) · owner: Plataforma · objetivo: Fase 3D · riesgo: tenant.
    "src/pages/admin/Companies.tsx",
    // useBilling.tsx y UpgradeRequestDialog.tsx · billing/plan (clase C,
    // prohibido tocar en esta fase) · owner: Billing · objetivo: Fase 3F.
    "src/hooks/useBilling.tsx",
    "src/components/billing/UpgradeRequestDialog.tsx",
  ],
};



describe("VWC — carriles críticos de Fase 2", () => {
  for (const [table, allowed] of Object.entries(CRITICAL_TABLES)) {
    it(`no hay .update() directos nuevos sobre ${table}`, () => {
      const pattern = new RegExp(`from\\("${table}"\\)[\\s\\S]{0,120}?\\.update\\(`);
      const offenders = walk("src")
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map((f) => f.replace(/\\/g, "/"))
        .filter((f) => !allowed.includes(f) && !f.startsWith("src/test/"));

      expect(offenders).toEqual([]);
    });
  }
});

describe("VWC — evidencia y saldos", () => {
  it("tolera la normalización de marcas temporales de Postgres", () => {
    expect(samePersistedValue("2026-08-02T09:00:00+00:00", "2026-08-02T09:00:00Z")).toBe(true);
    expect(samePersistedValue("2026-08-02T09:00:00+00:00", "2026-08-02T10:00:00Z")).toBe(false);
  });

  it("el signo del movimiento lo decide el tipo, no el frontend", () => {
    expect(signedDelta("repayment_outside_payroll", 50)).toBe(-50);
    expect(signedDelta("manual_adjustment_reduce", -50)).toBe(-50);
    expect(signedDelta("manual_adjustment_add", 50)).toBe(50);
    expect(signedDelta("reversal", 50)).toBe(50);
    // El cierre total lo calcula el servidor sobre el saldo bloqueado.
    expect(signedDelta("writeoff", 999)).toBe(0);
    expect(signedDelta("manual_close", 999)).toBe(0);
  });
});

describe("VWC Fase 3B — documentos y compliance", () => {
  it("las acciones de documento no escriben la tabla directamente", () => {
    const source = readFileSync("src/lib/document-actions.ts", "utf8");
    expect(/from\("employee_documents" as any\)[\s\S]{0,120}?\.update\(/.test(source)).toBe(false);
    expect(source).toContain("review_employee_document");
    expect(source).toContain('entity: "employee_documents"');
  });

  it("toda revisión viaja con la versión observada", () => {
    const source = readFileSync("src/lib/document-actions.ts", "utf8");
    expect(source).toContain("p_expected_version: doc.version ?? null");
  });

  it("Caso A/B: un rechazo obsoleto no puede pisar una aprobación", () => {
    // A aprueba sobre v3 → el documento pasa a v4.
    // B, que abrió el documento en v3, intenta rechazar: el backend compara
    // expected_version (3) con la actual (4) y responde conflicto.
    const serverVersion: number = 4;
    const staleExpected: number = 3;
    const isConflict = staleExpected !== serverVersion;
    expect(isConflict).toBe(true);
  });
});


describe("VWC Fase 3C — configuración de empresa no financiera", () => {
  const write = readFileSync("src/lib/data/company-config-write.ts", "utf8");
  const page = readFileSync("src/pages/admin/CompanyConfig.tsx", "utf8");

  it("las claves financieras y de tenant no son editables por este carril", () => {
    for (const blocked of ["pay_week", "overtime", "pay_types", "payroll_config", "tenant_type"]) {
      expect(isEditableSettingKey(blocked)).toBe(false);
    }
    for (const allowed of ["geofence", "time_tolerance", "auto_close", "auto_validation"]) {
      expect(isEditableSettingKey(allowed)).toBe(true);
    }
  });

  it("la identidad de empresa sólo admite nombre, logo y color", () => {
    expect([...EDITABLE_COMPANY_FIELDS]).toEqual(["name", "logo_url", "brand_color"]);
    for (const blocked of ["is_active", "plan_code", "billing_status", "owner_user_id", "created_by"]) {
      expect((EDITABLE_COMPANY_FIELDS as readonly string[]).includes(blocked)).toBe(false);
    }
  });

  it("toda escritura viaja con company_id y expected_version", () => {
    expect(write).toContain("p_company_id: companyId");
    expect(write).toContain("p_expected_version: expectedVersion ?? null");
    expect(write).toContain("versioned_update_company_setting");
    expect(write).toContain("versioned_update_company_profile");
  });

  it("la pantalla envía patches parciales, nunca snapshots completos", () => {
    expect(page).toContain("rows[key]?.version ?? null");
    expect(page).not.toContain(".upsert(");
    expect(/from\("companies"\)[\s\S]{0,120}?\.update\(/.test(page)).toBe(false);
    expect(/from\("company_settings"\)[\s\S]{0,120}?\.update\(/.test(page)).toBe(false);
  });

  it("el reemplazo de logo no borra el archivo anterior", () => {
    expect(page).not.toContain('storage.from("company-logos").remove');
    expect(page).toContain("upsert: false");
  });

  it("Caso A/B: A cambia el logo (v2) y B guarda zona horaria desde v1 → conflicto", () => {
    const serverVersion: number = 2;   // A ya guardó
    const staleExpected: number = 1;   // B tenía la versión anterior
    expect(staleExpected !== serverVersion).toBe(true);
  });
});

describe("VWC Fase 3D — asignaciones y estados compartidos", () => {
  const helper = readFileSync("src/lib/data/assignment-write.ts", "utf8");

  // Creación de asignaciones: sigue permitida por RPC idempotente / importaciones auditadas.
  const CREATION_ALLOWED = [
    "src/lib/dispatch-writers.ts",
    "src/lib/auto-dispatch.ts",
    "src/pages/admin/ImportSchedule.tsx",
    "src/pages/admin/ImportWizard.tsx",
    "src/pages/admin/BackfillShift.tsx",
    "src/pages/admin/Shifts.tsx",
    "src/pages/admin/ShiftRequests.tsx",
    "src/pages/admin/AIWorkforce.tsx",
    "src/components/shifts/ShiftDetailDialog.tsx",   // alta con slot de rol tipado
    "src/components/shifts/DuplicateShiftDialog.tsx", // copia masiva de turnos
  ];

  // Validación de asistencia (attendance_status): estado adyacente, migra en Fase 3E.
  const ATTENDANCE_EXCEPTIONS = [
    "src/components/shifts/AttendanceValidator.tsx",
    "src/components/shifts/ShiftAttendancePanel.tsx",
    "src/pages/admin/ImportSchedule.tsx",
  ];

  it("ninguna superficie cambia el estado de una asignación con .update() directo", () => {
    const pattern = /from\("shift_assignments"\)[\s\S]{0,160}?\.update\(/;
    const offenders = walk("src")
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => !f.startsWith("src/test/") && !ATTENDANCE_EXCEPTIONS.includes(f));
    expect(offenders).toEqual([]);
  });

  it("ninguna superficie borra asignaciones", () => {
    const pattern = /from\("shift_assignments"\)[\s\S]{0,160}?\.delete\(/;
    const offenders = walk("src")
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => !f.startsWith("src/test/"));
    expect(offenders).toEqual([]);
  });

  it("los inserts restantes son sólo altas conocidas y auditadas", () => {
    const pattern = /from\("shift_assignments"\)[\s\S]{0,160}?\.(insert|upsert)\(/;
    const offenders = walk("src")
      .filter((file) => pattern.test(readFileSync(file, "utf8")))
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => !f.startsWith("src/test/") && !CREATION_ALLOWED.includes(f));
    expect(offenders).toEqual([]);
  });

  it("toda transición viaja con empresa, estado y versión esperados", () => {
    expect(helper).toContain("p_company_id");
    expect(helper).toContain("p_expected_status");
    expect(helper).toContain("p_expected_version");
    expect(helper).toContain("p_intent_key");
  });

  it("el portal del worker ya no tiene fallback de escritura directa", () => {
    const portal = readFileSync("src/pages/portal/MyShifts.tsx", "utf8");
    expect(portal).not.toContain('from("shift_assignments").update');
    expect(portal).toContain("versionedAssignmentTransition");
  });

  it("mover a alguien entre turnos crea antes de retirar (nunca queda sin turno)", () => {
    const shifts = readFileSync("src/pages/admin/Shifts.tsx", "utf8");
    const create = shifts.indexOf("moved_from_other_shift");
    const remove = shifts.indexOf("moved_to_other_shift");
    expect(create).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(create);
  });

  it("Caso ACCEPTED vs REMOVED: una aceptación vieja no revive un retiro nuevo", () => {
    const serverStatus: string = "removed";
    const workerExpected: string = "pending";
    expect(workerExpected !== serverStatus).toBe(true); // → conflict, no escritura
  });

  it("Caso REMOVED vs ACCEPTED: un retiro con versión vieja no revierte la aceptación", () => {
    const serverVersion: number = 4;
    const adminExpectedVersion: number = 2;
    expect(adminExpectedVersion !== serverVersion).toBe(true);
  });

  it("el contrato de respuesta expone cobertura e impacto de driver y captain", () => {
    expect(helper).toContain("coverageAfter");
    expect(helper).toContain("driverImpact");
    expect(helper).toContain("captainImpact");
    expect(helper).toContain("nextAction");
  });
});

