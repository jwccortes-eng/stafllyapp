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

const LEGAL_DOC_HINTS = ["w9", "w-9", "i9", "i-9", "tax", "contract", "contrato", "legal", "id", "ssn"];

interface RawIdentityData {
  employees: IdentityRecord[];
  assignments: Record<string, { count: number; last: string | null }>;
  timeEntries: Record<string, { total: number; approved: number }>;
  documents: Record<string, { total: number; legal: number }>;
  payroll: Record<string, number>;
  availability: Set<string>;
  reviewsByEmployee: Record<string, number>;
  identityReviews: IdentityReviewRow[];
}

export interface IdentityReviewRow {
  id: string;
  group_key: string;
  employee_ids: string[];
  decision: string;
  confirmed_primary_employee_id: string | null;
  recommended_primary_employee_id: string | null;
  verdict_at_review: string | null;
  notes: string | null;
  merge_plan: unknown;
  updated_at: string;
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
  const [
    employees,
    assignmentRows,
    timeRows,
    docRows,
    payrollRows,
    availabilityRows,
    reviewRows,
    identityReviewRows,
  ] = await Promise.all([
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
    fetchAll<{ employee_id: string; status: string | null }>((from, to) =>
      supabase
        .from("time_entries")
        .select("employee_id, status")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<{ employee_id: string; category: string | null; name: string | null }>(
      (from, to) =>
        supabase
          .from("employee_documents")
          .select("employee_id, category, name")
          .eq("company_id", companyId)
          .range(from, to) as never,
    ),
    fetchAll<{ employee_id: string }>((from, to) =>
      supabase
        .from("period_base_pay")
        .select("employee_id")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<{ employee_id: string }>((from, to) =>
      supabase
        .from("employee_availability_config")
        .select("employee_id")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<{ evaluated_entity_id: string | null }>((from, to) =>
      supabase
        .from("review_submissions")
        .select("evaluated_entity_id")
        .eq("company_id", companyId)
        .range(from, to) as never,
    ),
    fetchAll<IdentityReviewRow>((from, to) =>
      supabase
        .from("employee_identity_reviews")
        .select(
          "id, group_key, employee_ids, decision, confirmed_primary_employee_id, recommended_primary_employee_id, verdict_at_review, notes, merge_plan, updated_at",
        )
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

  const timeEntries: RawIdentityData["timeEntries"] = {};
  for (const row of timeRows) {
    if (!row.employee_id) continue;
    const entry = timeEntries[row.employee_id] ?? { total: 0, approved: 0 };
    entry.total += 1;
    if ((row.status ?? "").toLowerCase() === "approved") entry.approved += 1;
    timeEntries[row.employee_id] = entry;
  }

  const documents: RawIdentityData["documents"] = {};
  for (const row of docRows) {
    if (!row.employee_id) continue;
    const entry = documents[row.employee_id] ?? { total: 0, legal: 0 };
    entry.total += 1;
    const hay = `${row.category ?? ""} ${row.name ?? ""}`.toLowerCase();
    if (LEGAL_DOC_HINTS.some((h) => hay.includes(h))) entry.legal += 1;
    documents[row.employee_id] = entry;
  }

  const payroll: Record<string, number> = {};
  for (const row of payrollRows) {
    if (!row.employee_id) continue;
    payroll[row.employee_id] = (payroll[row.employee_id] ?? 0) + 1;
  }

  const reviewsByEmployee: Record<string, number> = {};
  for (const row of reviewRows) {
    const id = row.evaluated_entity_id;
    if (!id) continue;
    reviewsByEmployee[id] = (reviewsByEmployee[id] ?? 0) + 1;
  }

  return {
    employees,
    assignments,
    timeEntries,
    documents,
    payroll,
    availability: new Set(
      availabilityRows.map((r) => r.employee_id).filter(Boolean) as string[],
    ),
    reviewsByEmployee,
    identityReviews: identityReviewRows,
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
