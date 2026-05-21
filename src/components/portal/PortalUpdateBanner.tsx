/**
 * PortalUpdateBanner — Phase 1 friendly nudge shown on the portal home
 * when the worker has missing requirements. Read-only, dismissible per
 * session (no DB writes).
 */
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useWorkerCompliance } from "@/hooks/useWorkerCompliance";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "stafly:portal-update-banner:dismissed-session";

export function PortalUpdateBanner({ className }: { className?: string }) {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const { summary, loading } = useWorkerCompliance(effectiveEmployeeId);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (loading || dismissed || !summary || summary.pending === 0) return null;

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2.5",
        className,
      )}
    >
      <div className="mt-0.5 rounded-full bg-primary/15 p-1.5 text-primary shrink-0">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-foreground leading-snug">
          Te faltan {summary.pending} {summary.pending === 1 ? "dato" : "datos"} para mantener tu perfil listo
        </p>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Queremos mantener tu perfil listo para recibir trabajos y cobrar sin problemas.
        </p>
        <Link
          to="/portal/update-center"
          className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-primary"
        >
          Completar ahora <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <button
        type="button"
        aria-label="Ocultar"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* no-op */
          }
          setDismissed(true);
        }}
        className="h-6 w-6 -mr-1 -mt-1 inline-flex items-center justify-center rounded-md text-muted-foreground/55 hover:text-foreground hover:bg-muted/60"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default PortalUpdateBanner;
