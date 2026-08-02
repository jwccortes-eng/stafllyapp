/**
 * useIdentityResolution — Phase 2B mutation hook.
 *
 * Safe, minimal writes to the Phase-1 identity columns on `public.employees`
 * plus optional reuse of the existing `merge_employees` RPC. Never touches
 * payroll, time_entries, portal access, user_id, documents, auth, or RLS.
 *
 * Rules enforced client-side (server also enforces via
 * trg_validate_identity_resolution_same_company + RLS + merge_employees):
 *  - Same-company only. Every action is scoped by company_id.
 *  - No portal access changes. No payroll table writes.
 *  - Actions append audit-style lines to identity_notes (never overwrite).
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export type ResolutionAction =
  | "verify"
  | "reject"
  | "keep_unresolved"
  | "note"
  | "link"
  | "merge";

interface BaseArgs {
  employeeId: string;
  companyId: string;
  note?: string | null;
}

interface LinkArgs extends BaseArgs {
  targetEmployeeId: string;
  targetCompanyId: string;
}

interface MergeArgs extends BaseArgs {
  masterEmployeeId: string;
  masterCompanyId: string;
  confirmMasterName: string;
}

function stamp(actor: string | null, action: string, extra?: string) {
  const ts = new Date().toISOString();
  const who = actor ? actor.slice(0, 8) : "unknown";
  const tail = extra ? ` — ${extra}` : "";
  return `[${ts}] ${action} by ${who}${tail}`;
}

async function appendNote(
  employeeId: string,
  companyId: string,
  line: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("employees")
    .select("identity_notes")
    .eq("id", employeeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  const prev = (data?.identity_notes ?? "").toString();
  return prev ? `${prev}\n${line}` : line;
}

export function useIdentityResolution() {
  const { user } = useAuth();
  const [pending, setPending] = useState<ResolutionAction | null>(null);

  const runUpdate = useCallback(
    async (
      employeeId: string,
      companyId: string,
      patch: Record<string, unknown>,
      auditLine: string,
    ) => {
      const notes = await appendNote(employeeId, companyId, auditLine);
      const { error } = await supabase
        .from("employees")
        .update({ ...patch, identity_notes: notes })
        .eq("id", employeeId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    [],
  );

  const markVerified = useCallback(
    async ({ employeeId, companyId, note }: BaseArgs) => {
      setPending("verify");
      try {
        await runUpdate(
          employeeId,
          companyId,
          {
            identity_status: "verified",
            worker_type: "real_employee",
            requires_identity_resolution: false,
            identity_resolved_at: new Date().toISOString(),
            identity_resolved_by: user?.id ?? null,
          },
          stamp(user?.id ?? null, "verify", note ?? undefined),
        );
        toast({ title: "Identidad verificada", description: "Marcado como trabajador real." });
      } catch (e: any) {
        toast({ title: "No se pudo verificar", description: e?.message ?? "Error", variant: "destructive" });
        throw e;
      } finally { setPending(null); }
    },
    [runUpdate, user?.id],
  );

  const markRejected = useCallback(
    async ({ employeeId, companyId, note }: BaseArgs) => {
      setPending("reject");
      try {
        await runUpdate(
          employeeId,
          companyId,
          {
            identity_status: "rejected",
            requires_identity_resolution: false,
            identity_resolved_at: new Date().toISOString(),
            identity_resolved_by: user?.id ?? null,
          },
          stamp(user?.id ?? null, "reject", note ?? undefined),
        );
        toast({ title: "Marcado como inválido", description: "Historial preservado. No afecta payroll ni portal." });
      } catch (e: any) {
        toast({ title: "No se pudo marcar", description: e?.message ?? "Error", variant: "destructive" });
        throw e;
      } finally { setPending(null); }
    },
    [runUpdate, user?.id],
  );

  const keepUnresolved = useCallback(
    async ({ employeeId, companyId, note }: BaseArgs) => {
      setPending("keep_unresolved");
      try {
        await runUpdate(
          employeeId,
          companyId,
          {
            identity_status: "pending_identity",
            requires_identity_resolution: true,
          },
          stamp(user?.id ?? null, "keep_unresolved", note ?? undefined),
        );
        toast({ title: "Se mantiene pendiente", description: "Nota agregada al historial." });
      } catch (e: any) {
        toast({ title: "Error", description: e?.message ?? "Error", variant: "destructive" });
        throw e;
      } finally { setPending(null); }
    },
    [runUpdate, user?.id],
  );

  const addNote = useCallback(
    async ({ employeeId, companyId, note }: BaseArgs) => {
      if (!note || !note.trim()) return;
      setPending("note");
      try {
        const notes = await appendNote(employeeId, companyId, stamp(user?.id ?? null, "note", note.trim()));
        const { error } = await supabase
          .from("employees")
          .update({ identity_notes: notes })
          .eq("id", employeeId)
          .eq("company_id", companyId);
        if (error) throw error;
        toast({ title: "Nota agregada" });
      } catch (e: any) {
        toast({ title: "No se pudo guardar la nota", description: e?.message ?? "Error", variant: "destructive" });
        throw e;
      } finally { setPending(null); }
    },
    [user?.id],
  );

  /**
   * Link — mark this placeholder as resolved into another same-company
   * employee, WITHOUT moving any historical data. Payroll/time_entries stay
   * exactly where they were. Uses the same-company trigger for enforcement.
   */
  const linkToEmployee = useCallback(
    async ({ employeeId, companyId, targetEmployeeId, targetCompanyId, note }: LinkArgs) => {
      if (companyId !== targetCompanyId) {
        toast({ title: "Cross-tenant no permitido", variant: "destructive" });
        return;
      }
      setPending("link");
      try {
        await runUpdate(
          employeeId,
          companyId,
          {
            identity_status: "verified",
            requires_identity_resolution: false,
            identity_resolved_employee_id: targetEmployeeId,
            identity_resolved_at: new Date().toISOString(),
            identity_resolved_by: user?.id ?? null,
          },
          stamp(user?.id ?? null, "link", `→ ${targetEmployeeId}${note ? ` · ${note}` : ""}`),
        );
        toast({ title: "Identidad enlazada", description: "Referencia guardada. No se movió historial." });
      } catch (e: any) {
        toast({ title: "No se pudo enlazar", description: e?.message ?? "Error", variant: "destructive" });
        throw e;
      } finally { setPending(null); }
    },
    [runUpdate, user?.id],
  );

  /**
   * Merge — consolidate the placeholder INTO an existing same-company master
   * using the server-side `merge_employees` RPC. All safety guards live in
   * the RPC (cross-company, protected fields, active payroll periods, etc).
   */
  const mergeIntoEmployee = useCallback(
    async ({
      employeeId,
      companyId,
      masterEmployeeId,
      masterCompanyId,
      confirmMasterName,
      note,
    }: MergeArgs) => {
      if (companyId !== masterCompanyId) {
        toast({ title: "Cross-tenant no permitido", variant: "destructive" });
        return;
      }
      setPending("merge");
      try {
        // Pre-write an audit note on the placeholder before it is merged.
        try {
          const notes = await appendNote(
            employeeId,
            companyId,
            stamp(user?.id ?? null, "merge_initiated", `→ ${masterEmployeeId}${note ? ` · ${note}` : ""}`),
          );
          await supabase
            .from("employees")
            .update({ identity_notes: notes })
            .eq("id", employeeId)
            .eq("company_id", companyId);
        } catch { /* non-fatal */ }

        // VWC Fase 3A · carril 3: consolidación idempotente vía RPC endurecida.
        const { error } = await supabase.rpc("merge_employees_idempotent", {
          _master_id: masterEmployeeId,
          _duplicate_ids: [employeeId],
          _confirm_master_name: confirmMasterName,
          _reason: note ?? "Identity resolution merge (Phase 2B)",
          _intent_key: `merge-${masterEmployeeId}-${employeeId}`,
          _surface: "employee/IdentityResolutionDrawer",
        });
        if (error) throw error;
        toast({ title: "Consolidación completada", description: "Registro fusionado en el master." });
      } catch (e: any) {
        toast({ title: "No se pudo consolidar", description: e?.message ?? "Error", variant: "destructive" });
        throw e;
      } finally { setPending(null); }
    },
    [user?.id],
  );

  return {
    pending,
    markVerified,
    markRejected,
    keepUnresolved,
    addNote,
    linkToEmployee,
    mergeIntoEmployee,
  };
}
