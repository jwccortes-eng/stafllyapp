/**
 * FASE 1 — carril único de transición de ciclo de vida de empresa.
 *
 * Ninguna superficie escribe `approval_state`, `access_state` ni
 * `commercial_state` directamente: la base de datos lo impide con un trigger.
 * Todo pasa por la RPC transaccional `company_lifecycle_transition`, que exige
 * estado y versión esperados (VWC), motivo, actor e idempotencia, y deja
 * auditoría en `company_lifecycle_events`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AccessState, ApprovalState, CommercialState } from "@/lib/company/access-state";

export type LifecycleTransition =
  | "submit_for_review"
  | "approve"
  | "reject"
  | "set_access_state"
  | "reactivate";

export interface LifecycleWriteInput {
  companyId: string;
  transition: LifecycleTransition;
  expectedApprovalState?: ApprovalState | null;
  expectedAccessState?: AccessState | null;
  expectedVersion?: number | null;
  targetAccessState?: AccessState | null;
  reason?: string | null;
  /** Un reintento con la misma clave no produce una segunda transición. */
  idempotencyKey?: string | null;
}

export type LifecycleWriteResult =
  | {
      status: "applied" | "noop";
      approvalState: ApprovalState;
      accessState: AccessState;
      commercialState: CommercialState;
      version: number | null;
      nextAction: string | null;
      replayed: boolean;
    }
  | {
      status: "conflict";
      expectedVersion: number | null;
      actualVersion: number | null;
      actualApprovalState: ApprovalState | null;
      actualAccessState: AccessState | null;
    }
  | {
      status: "error";
      reason: "denied" | "not_found" | "invalid" | "error";
      message: string;
    };

export async function transitionCompanyLifecycle(
  input: LifecycleWriteInput,
): Promise<LifecycleWriteResult> {
  const { data, error } = await supabase.rpc("company_lifecycle_transition" as never, {
    p_company_id: input.companyId,
    p_transition: input.transition,
    p_expected_approval_state: input.expectedApprovalState ?? null,
    p_expected_access_state: input.expectedAccessState ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_target_access_state: input.targetAccessState ?? null,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  } as never);

  if (error) {
    return { status: "error", reason: "error", message: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const status = String(row.status ?? "error");

  if (status === "conflict") {
    return {
      status: "conflict",
      expectedVersion: (row.expected_version as number) ?? null,
      actualVersion: (row.actual_version as number) ?? null,
      actualApprovalState: (row.actual_approval_state as ApprovalState) ?? null,
      actualAccessState: (row.actual_access_state as AccessState) ?? null,
    };
  }

  if (status === "applied" || status === "noop") {
    return {
      status,
      approvalState: row.approval_state as ApprovalState,
      accessState: row.access_state as AccessState,
      commercialState: (row.commercial_state as CommercialState) ?? "manual",
      version: (row.version as number) ?? null,
      nextAction: (row.next_action as string) ?? null,
      replayed: row.replayed === true,
    };
  }

  return {
    status: "error",
    reason: (row.reason as "denied" | "not_found" | "invalid") ?? "error",
    message: (row.message as string) ?? "No se pudo aplicar la transición",
  };
}

/** Azúcar legible sobre la misma RPC — no hay segundo camino de escritura. */
export const submitCompanyForReview = (i: Omit<LifecycleWriteInput, "transition">) =>
  transitionCompanyLifecycle({ ...i, transition: "submit_for_review" });
export const approveCompany = (i: Omit<LifecycleWriteInput, "transition">) =>
  transitionCompanyLifecycle({ ...i, transition: "approve" });
export const rejectCompany = (i: Omit<LifecycleWriteInput, "transition">) =>
  transitionCompanyLifecycle({ ...i, transition: "reject" });
export const setCompanyAccessState = (i: Omit<LifecycleWriteInput, "transition">) =>
  transitionCompanyLifecycle({ ...i, transition: "set_access_state" });
export const reactivateCompany = (i: Omit<LifecycleWriteInput, "transition">) =>
  transitionCompanyLifecycle({ ...i, transition: "reactivate" });
