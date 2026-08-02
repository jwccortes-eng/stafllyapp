/**
 * useCompanyDocuments — Phase 1 read-only.
 *
 * Loads admin and onboarding documents for a single company, normalizes them
 * into UnifiedDocumentRow[], and computes per-worker compliance signals.
 *
 * No writes. No payroll math. Tenant-scoped by companyId. Skips when null.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeDocuments,
  buildWorkerDocSignals,
  type UnifiedDocumentRow,
  type WorkerDocumentSignals,
} from "@/lib/documents-signals";
import {
  getRequiredDocumentsForCompany,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";

export interface CompanyDocumentsState {
  loading: boolean;
  rows: UnifiedDocumentRow[];
  signals: Map<string, WorkerDocumentSignals>;
  refresh: () => Promise<void>;
}

interface Args {
  companyId: string | null;
  /** Optional employee list (already loaded by the caller) used for worker_name + can_drive. */
  employees?: any[];
}

export function useCompanyDocuments({ companyId, employees }: Args): CompanyDocumentsState {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UnifiedDocumentRow[]>([]);
  const [signals, setSignals] = useState<Map<string, WorkerDocumentSignals>>(new Map());

  const workerNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees ?? []) {
      const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "—";
      m.set(e.id, name);
    }
    return m;
  }, [employees]);

  const load = useCallback(async () => {
    if (!companyId) {
      setRows([]); setSignals(new Map()); setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sb: any = supabase;
      const [adminRes, onbRes] = await Promise.all([
        sb.from("employee_documents")
          .select("id, employee_id, company_id, name, file_url, file_type, file_size, category, created_at, review_status, reviewed_at, rejection_reason, expires_at, version")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        sb.from("employee_onboarding_documents")
          .select("id, employee_id, company_id, document_type, file_url, file_name, status, uploaded_at, verified_at, notes, created_at, version")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
      ]);

      const unified = normalizeDocuments({
        adminDocs: (adminRes?.data as any[]) ?? [],
        onboardingDocs: (onbRes?.data as any[]) ?? [],
        workerNames,
      });

      // Build required map per worker (honors per-company overrides + can_drive).
      const required = await getRequiredDocumentsForCompany(companyId, { canDrive: false });
      const requiredWithDriver = await getRequiredDocumentsForCompany(companyId, { canDrive: true });

      const requiredByEmp = new Map<string, DocumentCategory[]>();
      for (const e of employees ?? []) {
        // Only enforce for active workers — inactive shouldn't be flagged as missing required docs.
        if (e.is_active === false) continue;
        const hc = (e.has_car ?? "").toString().toLowerCase().trim();
        const isDriver = hc === "yes" || hc === "sí" || hc === "si" || hc === "true" || !!e.can_drive;
        requiredByEmp.set(e.id, isDriver ? requiredWithDriver : required);
      }

      setRows(unified);
      setSignals(buildWorkerDocSignals(unified, requiredByEmp));
    } finally {
      setLoading(false);
    }
  }, [companyId, employees, workerNames]);

  useEffect(() => { void load(); }, [load]);

  return { loading, rows, signals, refresh: load };
}
