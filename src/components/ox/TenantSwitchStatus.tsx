import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, X } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

/**
 * P0 OX — the tenant switch can never fail silently.
 * Renders a global, blocking status layer while switching, and a visible,
 * retryable error when it fails (previous tenant stays active).
 */
export function TenantSwitchStatus() {
  const {
    switchState, switchError, retrySwitch, clearSwitchError,
    loadError, refetch, selectedCompany, loading,
  } = useCompany();

  const prevName = useRef<string | null>(null);
  const wasSwitching = useRef(false);

  useEffect(() => {
    if (switchState === "switching") { wasSwitching.current = true; return; }
    if (switchState === "idle" && wasSwitching.current && !loading && selectedCompany) {
      wasSwitching.current = false;
      if (prevName.current !== selectedCompany.name) {
        toast.success(`Ahora estás en ${selectedCompany.name}.`);
      }
    }
    prevName.current = selectedCompany?.name ?? null;
  }, [switchState, loading, selectedCompany]);

  if (switchState === "switching") {
    return (
      <div className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-center justify-center px-6">
        <div className="rounded-2xl border border-border/50 bg-card shadow-lg px-5 py-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-semibold">Cambiando compañía…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estamos limpiando los datos de la compañía anterior.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const message = switchError ?? loadError;
  if (!message) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border border-destructive/30 bg-card shadow-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-destructive">{message}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {switchError
              ? "Sigues trabajando en la compañía anterior. No se mezclaron datos."
              : "Puedes reintentar sin perder tu sesión."}
          </p>
          <div className="flex gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => (switchError ? retrySwitch() : void refetch())}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar
            </button>
            <button
              type="button"
              onClick={clearSwitchError}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-border/60 text-sm font-medium"
            >
              <X className="h-3.5 w-3.5" /> Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
