/**
 * PayrollSourceGuardrailBanner
 *
 * Presentational-only banner reminding operators that the current source of
 * truth for payroll is Connecteam / external reconciliation. Native time
 * entries are operational evidence only and are NOT the final source of pay.
 *
 * No logic. No hooks. No writes. Safe to drop anywhere payroll numbers or
 * pending-hour reviews are shown.
 */
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "banner" | "compact";
}

export function PayrollSourceGuardrailBanner({
  className,
  variant = "banner",
}: Props) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200",
          className,
        )}
      >
        <Info className="h-3 w-3" />
        Fuente de payroll: Connecteam · time entries nativos = evidencia
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100",
        className,
      )}
      role="note"
      aria-label="Guardrail de payroll"
    >
      <div className="flex items-start gap-2.5">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold">
            Fuente de payroll: Connecteam / Reconciliación externa.
          </p>
          <p className="text-amber-800/90 dark:text-amber-100/80 mt-0.5">
            Los time entries nativos todavía no son la fuente final de pago.
            Modo seguro: no calcular payroll nativo desde <code>time_entries</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
