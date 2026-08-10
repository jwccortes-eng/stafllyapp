/**
 * P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 1
 * Read model de calidad de identidad. SOLO LECTURA.
 *
 * Lee empleados, conteos de asignaciones, existencia de horas y documentos, y
 * proyecta grupos de identidad + auditoría de asignaciones. No escribe nada,
 * no fusiona, no reasigna, no toca payroll, horas, documentos ni auth.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { classifyWorkerAssignability } from "@/lib/shifts/assignable-workers";
import {
  buildIdentityGroups,
  normalizeIdentityPhone,
  type IdentityGroup,
  type IdentityRecord,
} from "@/lib/identity/person-truth";
import {
  auditAssignmentIdentity,
  type AssignmentAuditRow,
} from "@/lib/identity/assignment-risk";

const EMPLOYEE_COLUMNS =
  "id, company_id, first_name, last_name, preferred_name, phone_number, email, connecteam_employee_id, employer_identification, user_id, is_active, employee_role, added_via, worker_type, identity_status, requires_identity_resolution, payroll_approval_blocked, onboarding_status, created_at, updated_at";

interface RawIdentityData {
  employees: IdentityRecord[];
  assignments: Record<string, { count: number; last: string | null }>;
  timeEntryEmployeeIds: Set<string>;
  documentCounts: Record<string, number>;
}

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000,
  maxPages = 12,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data } = await build(from, from + pageSize - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

async function fetchIdentityData(companyId: string): Promise<RawIdentityData> {
  const [employees, assignmentRows, timeRows, docRows] = await Promise.all([
    fetchAll<IdentityRecord>((from, to) =>
      supabase
        .from("employees")
        .select(EMPLOYEE_COLUMNS)
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<{ employee_id: string; created_at: string | null }>((from, to) =>
      supabase
        .from("shift_assignments")
        .select("employee_id, created_at")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<{ employee_id: string }>((from, to) =>
      supabase
        .from("time_entries")
        .select("employee_id")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<{ employee_id: string }>((from, to) =>
      supabase
        .from("employee_documents")
        .select("employee_id")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
  ]);

  const assignments: RawIdentityData["assignments"] = {};
  for (const row of assignmentRows) {
    if (!row.employee_id) continue;
    const entry = assignments[row.employee_id] ?? { count: 0, last: null };
    entry.count += 1;
    if (row.created_at && (!entry.last || row.created_at > entry.last))
      entry.last = row.created_at;
    assignments[row.employee_id] = entry;
  }

  const documentCounts: Record<string, number> = {};
  for (const row of docRows) {
    if (!row.employee_id) continue;
    documentCounts[row.employee_id] = (documentCounts[row.employee_id] ?? 0) + 1;
  }

  return {
    employees,
    assignments,
    timeEntryEmployeeIds: new Set(
      timeRows.map((r) => r.employee_id).filter(Boolean) as string[],
    ),
    documentCounts,
  };
}

export interface IdentityQualityTotals {
  total: number;
  assignable: number;
  placeholder: number;
  historical: number;
  pendingApproval: number;
  inactive: number;
  withPortal: number;
  withoutStrongIdentifier: number;
  exactGroups: number;
  probableGroups: number;
  possibleGroups: number;
  ambiguousGroups: number;
  portalInconsistentGroups: number;
  suspiciousAssignments: number;
  highRiskAssignments: number;
}

export interface IdentityQualityModel {
  records: IdentityRecord[];
  groups: IdentityGroup[];
  assignmentAudit: AssignmentAuditRow[];
  portalInconsistent: IdentityGroup[];
  withoutStrongIdentifier: IdentityRecord[];
  historical: IdentityRecord[];
  pending: IdentityRecord[];
  totals: IdentityQualityTotals;
}

export function useIdentityQuality() {
  const { selectedCompanyId } = useCompany();

  const query = useQuery({
    queryKey: ["identity-quality", selectedCompanyId],
    queryFn: () => fetchIdentityData(selectedCompanyId as string),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const model = useMemo<IdentityQualityModel | null>(() => {
    const raw = query.data;
    if (!raw) return null;

    const records: IdentityRecord[] = raw.employees.map((e) => ({
      ...e,
      assignments_count: raw.assignments[e.id]?.count ?? 0,
      last_assignment_at: raw.assignments[e.id]?.last ?? null,
      documents_count: raw.documentCounts[e.id] ?? 0,
    }));

    const groups = buildIdentityGroups(records);

    const groupByRecord = new Map<string, IdentityGroup>();
    for (const g of groups) for (const r of g.records) groupByRecord.set(r.id, g);

    const assignmentAudit = records
      .filter((r) => (r.assignments_count ?? 0) > 0)
      .map((r) => {
        const group = groupByRecord.get(r.id);
        return auditAssignmentIdentity(r, {
          employeeId: r.id,
          assignmentsCount: r.assignments_count ?? 0,
          lastAssignmentAt: r.last_assignment_at ?? null,
          hasTimeEntries: raw.timeEntryEmployeeIds.has(r.id),
          hasDocuments: (r.documents_count ?? 0) > 0,
          duplicateGroupKey: group?.key ?? null,
          groupPrimaryId: group?.primary?.candidateId ?? null,
        });
      })
      .sort((a, b) => b.assignmentsCount - a.assignmentsCount);

    const withoutStrongIdentifier = records.filter(
      (r) =>
        !normalizeIdentityPhone(r.phone_number) &&
        !String(r.email ?? "").trim() &&
        !String(r.connecteam_employee_id ?? "").trim(),
    );

    const portalInconsistent = groups.filter((g) =>
      g.fragmentation.some((f) => f.key === "portal_split"),
    );

    const buckets = { assignable: 0, placeholder: 0, historical: 0, pending_approval: 0, inactive: 0 };
    for (const r of records) buckets[classifyWorkerAssignability(r).bucket] += 1;

    const totals: IdentityQualityTotals = {
      total: records.length,
      assignable: buckets.assignable,
      placeholder: buckets.placeholder,
      historical: buckets.historical,
      pendingApproval: buckets.pending_approval,
      inactive: buckets.inactive,
      withPortal: records.filter((r) => !!r.user_id).length,
      withoutStrongIdentifier: withoutStrongIdentifier.length,
      exactGroups: groups.filter((g) => g.verdict === "EXACT_MATCH").length,
      probableGroups: groups.filter((g) => g.verdict === "PROBABLE_DUPLICATE").length,
      possibleGroups: groups.filter((g) => g.verdict === "POSSIBLE_DUPLICATE").length,
      ambiguousGroups: groups.filter((g) => g.verdict === "AMBIGUOUS").length,
      portalInconsistentGroups: portalInconsistent.length,
      suspiciousAssignments: assignmentAudit.filter(
        (a) => a.verdict === "SUSPICIOUS_IDENTITY" || a.verdict === "NON_ASSIGNABLE_RECORD",
      ).length,
      highRiskAssignments: assignmentAudit.filter(
        (a) => a.verdict === "HIGH_RISK_DO_NOT_TOUCH",
      ).length,
    };

    return {
      records,
      groups,
      assignmentAudit,
      portalInconsistent,
      withoutStrongIdentifier,
      historical: records.filter(
        (r) => classifyWorkerAssignability(r).bucket === "historical",
      ),
      pending: records.filter(
        (r) => classifyWorkerAssignability(r).bucket === "pending_approval",
      ),
      totals,
    };
  }, [query.data]);

  return {
    model,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    hasCompany: !!selectedCompanyId,
  };
}
