/**
 * P0 — VWC Fase 2, carril 4: SALDOS Y ACUMULADOS.
 *
 * Prohibido leer el saldo en el frontend, sumar/restar y escribir el resultado.
 * El delta se aplica con aritmética atómica en SQL (`apply_advance_balance_delta`),
 * con bloqueo de fila, verificación de versión, idempotencia por `intentKey`
 * y registro de before / delta / after en el libro y en la auditoría.
 */
import { supabase } from "@/integrations/supabase/client";

export type AdvanceTransactionType =
  | "payroll_deduction"
  | "repayment_outside_payroll"
  | "manual_adjustment_reduce"
  | "manual_adjustment_add"
  | "reversal"
  | "writeoff"
  | "manual_close"
  | "cancellation";

/** Movimientos que reducen el saldo pendiente. */
const REDUCING: AdvanceTransactionType[] = [
  "payroll_deduction",
  "repayment_outside_payroll",
  "manual_adjustment_reduce",
];

/** Movimientos que aumentan el saldo pendiente. */
const INCREASING: AdvanceTransactionType[] = ["manual_adjustment_add", "reversal"];

/** Signo canónico del movimiento. El monto siempre se envía en valor absoluto. */
export function signedDelta(type: AdvanceTransactionType, amount: number): number {
  const abs = Math.abs(Number(amount) || 0);
  if (REDUCING.includes(type)) return -abs;
  if (INCREASING.includes(type)) return abs;
  return 0; // writeoff / manual_close / cancellation: el servidor calcula el delta
}

export interface AdvanceBalanceDeltaInput {
  recordId: string;
  companyId: string | null | undefined;
  type: AdvanceTransactionType;
  /** Monto en positivo. El signo lo determina el tipo de movimiento. */
  amount: number;
  expectedVersion: number | null | undefined;
  /** Una intención = un solo efecto, aunque haya doble tap o reintento. */
  intentKey: string;
  reason?: string | null;
  surface?: string;
}

export type AdvanceBalanceResult =
  | {
      status: "applied";
      version: number | null;
      beforeBalance: number;
      delta: number;
      afterBalance: number;
      currency: string;
      row: Record<string, any>;
      idempotent: boolean;
    }
  | {
      status: "conflict";
      expectedVersion: number | null;
      actualVersion: number | null;
      row: Record<string, any> | null;
      updatedAt: string | null;
    }
  | { status: "error"; reason: "denied" | "not_found" | "invalid" | "error"; message: string };

export async function applyAdvanceBalanceDelta(
  input: AdvanceBalanceDeltaInput,
): Promise<AdvanceBalanceResult> {
  const { recordId, companyId, type, amount, expectedVersion, intentKey, reason, surface } = input;

  if (!companyId) {
    return {
      status: "error",
      reason: "denied",
      message: "Falta el contexto de empresa. Vuelve a seleccionar la empresa e inténtalo otra vez.",
    };
  }

  const { data, error } = await supabase.rpc("apply_advance_balance_delta" as any, {
    p_record_id: recordId,
    p_company_id: companyId,
    p_delta: signedDelta(type, amount),
    p_transaction_type: type,
    p_expected_version: expectedVersion ?? null,
    p_intent_key: intentKey,
    p_reason: reason ?? null,
    p_surface: surface ?? null,
  } as any);

  if (error) return { status: "error", reason: "error", message: error.message };

  const result = (data ?? {}) as Record<string, any>;

  switch (result.status) {
    case "applied":
      return {
        status: "applied",
        version: typeof result.version === "number" ? result.version : null,
        beforeBalance: Number(result.before_balance ?? 0),
        delta: Number(result.delta ?? 0),
        afterBalance: Number(result.after_balance ?? 0),
        currency: String(result.currency ?? "USD"),
        row: (result.row as Record<string, any>) ?? {},
        idempotent: result.idempotent === true,
      };
    case "conflict":
      return {
        status: "conflict",
        expectedVersion: result.expected_version ?? null,
        actualVersion: result.actual_version ?? null,
        row: (result.row as Record<string, any>) ?? null,
        updatedAt: result.updated_at ?? null,
      };
    case "not_found":
      return { status: "error", reason: "not_found", message: result.message ?? "El registro no existe en esta empresa." };
    case "denied":
      return { status: "error", reason: "denied", message: result.message ?? "No tienes permiso para mover este saldo." };
    case "invalid":
      return { status: "error", reason: "invalid", message: result.message ?? "Movimiento no permitido." };
    default:
      return { status: "error", reason: "error", message: "Respuesta inesperada del servidor." };
  }
}
