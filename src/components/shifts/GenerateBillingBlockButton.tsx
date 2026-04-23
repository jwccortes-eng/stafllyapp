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
 * Constraints respected:
 *  - Only renders when there is a billing-resolvable client.
 *  - Calls the edge fn with the exact shift date as a 1-day window, plus the
 *    operational client_id so we never touch unrelated shifts.
 *  - Surfaces skip reasons inline so the admin can fix mapping (missing rate,
 *    location, etc.) without leaving the sheet.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Receipt, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  shiftId: string;
  shiftDate: string;       // YYYY-MM-DD
  clientId: string | null;
  className?: string;
}

export function GenerateBillingBlockButton({ shiftId, shiftDate, clientId, className }: Props) {
  const { selectedCompanyId } = useCompany();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<
    | { kind: "ok"; generated: number; updated: number }
    | { kind: "skip"; reason: string }
    | null
  >(null);

  if (!clientId || !selectedCompanyId) return null;

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
      // Find a skip that matches THIS shift, if any
      const mySkip = Array.isArray(skipped)
        ? skipped.find((s: any) => s.shift_id === shiftId)
        : null;

      if (generated > 0 || updated > 0) {
        toast.success(
          generated > 0
            ? "Bloque facturable generado"
            : "Bloque facturable actualizado",
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
      toast.error(e?.message ?? "No se pudo generar el bloque facturable");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={running}
        className="w-full justify-start gap-2 h-9"
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : lastResult?.kind === "ok" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
        ) : (
          <Receipt className="h-3.5 w-3.5" />
        )}
        <span className="text-xs">
          {running
            ? "Generando bloque facturable…"
            : lastResult?.kind === "ok"
              ? lastResult.generated > 0
                ? "Bloque facturable creado"
                : "Bloque facturable actualizado"
              : "Generar bloque facturable"}
        </span>
      </Button>
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
