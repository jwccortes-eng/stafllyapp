/**
 * Manual trigger to generate a billable_service_block from an approved shift.
 *
 * Why this exists:
 *  - FASE 4: keep payroll untouched (it stays driven by real time_entries) but
 *    let admins push an approved shift into invoicing without manual data entry.
 *  - The edge function `billing-generate-service-blocks` is multi-tenant strict
 *    (admin-only, scoped to company_id) and idempotent — calling it twice for
 *    the same shift updates the existing pending block instead of duplicating.
 *
 * UI-only lifecycle gating (no edge fn / DB changes):
 *  - No closeout or draft closeout → disabled (after closeout)
 *  - Open clock-out → disabled (need exits registered or justified)
 *  - closeout.status === "submitted" → disabled (wait for María)
 *  - reviewed + approved OR final_approval_status === "approved" → enabled
 *    Always produces a `pending` block (never an invoice, never payroll).
 *
 * Constraints respected:
 *  - Only renders when there is a billing-resolvable client.
 *  - Calls the edge fn with the exact shift date as a 1-day window, plus the
 *    operational client_id so we never touch unrelated shifts.
 *  - Surfaces skip reasons inline so the admin can fix mapping (missing rate,
 *    location, etc.) without leaving the sheet.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Receipt, Loader2, AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getShiftCloseout,
  getShiftEvidencePacket,
} from "@/lib/shifts/closeout";

interface Props {
  shiftId: string;
  shiftDate: string;       // YYYY-MM-DD
  clientId: string | null;
  className?: string;
}

type GateState =
  | { kind: "loading" }
  | { kind: "ready"; isDraft: boolean }
  | { kind: "blocked"; reason: string };

export function GenerateBillingBlockButton({ shiftId, shiftDate, clientId, className }: Props) {
  const { selectedCompanyId } = useCompany();
  const { isFullAccess } = usePermissions();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<
    | { kind: "ok"; generated: number; updated: number }
    | { kind: "skip"; reason: string }
    | null
  >(null);
  const [gate, setGate] = useState<GateState>({ kind: "loading" });

  // Lifecycle gating — read-only.
  useEffect(() => {
    let cancelled = false;
    setGate({ kind: "loading" });
    Promise.all([
      getShiftCloseout(shiftId),
      getShiftEvidencePacket(shiftId),
    ])
      .then(([closeout, evidence]) => {
        if (cancelled) return;
        const status = closeout?.status ?? null;
        const reviewStatus = closeout?.review_status ?? null;
        const finalStatus = closeout?.final_approval_status ?? null;
        const missingClockOut = evidence?.missingClockOut ?? 0;

        if (finalStatus === "approved") {
          setGate({ kind: "ready", isDraft: false });
          return;
        }
        if (status === "reviewed" && reviewStatus === "approved") {
          setGate({ kind: "ready", isDraft: true });
          return;
        }
        if (status === "submitted") {
          setGate({
            kind: "blocked",
            reason: "Disponible cuando María apruebe.",
          });
          return;
        }
        if (missingClockOut > 0) {
          setGate({
            kind: "blocked",
            reason:
              "Disponible cuando todas las salidas estén registradas o justificadas.",
          });
          return;
        }
        // No closeout or draft
        setGate({
          kind: "blocked",
          reason: "Disponible después del cierre del turno.",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setGate({
          kind: "blocked",
          reason: "Disponible después del cierre del turno.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  // P0 Domain boundary — facturación no se concede por administrar servicios.
  if (!clientId || !selectedCompanyId || !isFullAccess(selectedCompanyId)) return null;

  const run = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "billing-generate-service-blocks",
        {
          body: {
            company_id: selectedCompanyId,
            date_from: shiftDate,
            date_to: shiftDate,
            client_id: clientId,
          },
        },
      );
      if (error) throw error;

      const generated = data?.generated ?? 0;
      const updated = data?.updated ?? 0;
      const skipped = data?.skipped ?? [];
      const mySkip = Array.isArray(skipped)
        ? skipped.find((s: any) => s.shift_id === shiftId)
        : null;

      if (generated > 0 || updated > 0) {
        toast.success(
          generated > 0
            ? "Borrador facturable generado"
            : "Borrador facturable actualizado",
        );
        setLastResult({ kind: "ok", generated, updated });
      } else if (mySkip) {
        toast.error(`No se pudo generar: ${mySkip.reason}`);
        setLastResult({ kind: "skip", reason: mySkip.reason });
      } else {
        toast.message("Sin cambios", {
          description:
            "El turno aún no tiene asistencia aprobada o ya fue facturado.",
        });
        setLastResult({ kind: "skip", reason: "missing_attendance_or_invoiced" });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el borrador facturable");
    } finally {
      setRunning(false);
    }
  };

  const disabled = running || gate.kind !== "ready";

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={disabled}
        className="w-full justify-start gap-2 h-9"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : gate.kind === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : gate.kind === "blocked" ? (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        ) : lastResult?.kind === "ok" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
        ) : (
          <Receipt className="h-3.5 w-3.5" />
        )}
        <span className="text-xs">
          {running
            ? "Generando borrador facturable…"
            : lastResult?.kind === "ok"
              ? lastResult.generated > 0
                ? "Borrador facturable creado"
                : "Borrador facturable actualizado"
              : "Generar borrador facturable"}
        </span>
      </Button>
      <p className="text-[10px] text-muted-foreground px-1 leading-snug">
        Borrador. No es factura ni payroll.
      </p>
      {gate.kind === "blocked" && (
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground px-1">
          <Lock className="h-3 w-3 mt-px shrink-0 text-muted-foreground/70" />
          <span>{gate.reason}</span>
        </div>
      )}
      {lastResult?.kind === "skip" && (
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground px-1">
          <AlertCircle className="h-3 w-3 mt-px shrink-0 text-warning" />
          <span>
            {lastResult.reason === "missing_billing_client"
              ? "El cliente no tiene un cliente facturable activo asociado."
              : lastResult.reason === "missing_billing_location"
                ? "Falta una ubicación facturable por defecto."
                : lastResult.reason === "missing_rate"
                  ? "Falta tarifa por defecto en el cliente facturable."
                  : lastResult.reason === "ambiguous_mapping"
                    ? "Hay múltiples ubicaciones facturables; selecciona una predeterminada."
                    : lastResult.reason === "already_invoiced"
                      ? "Este turno ya está incluido en una factura."
                      : "Sin cambios: revisa asistencia aprobada o facturación previa."}
          </span>
        </div>
      )}
    </div>
  );
}
