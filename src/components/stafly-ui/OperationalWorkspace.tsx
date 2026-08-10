/**
 * P0 — OPERATIONAL FIRST LAYOUT.
 *
 * Estándar visual único de las pantallas operativas (Equipo, Clientes,
 * Servicios, Identity Quality, Client Truth…).
 *
 * Jerarquía canónica, sin excepciones:
 *
 *   1. Cabecera compacta (sticky)  → empresa · título · buscador · acción
 *   2. Pestañas (sticky)           → nunca desaparecen al hacer scroll
 *   3. Filtros (sticky opcional)
 *   4. Resumen compacto de métricas (chips, una sola línea)
 *   5. Panel administrativo colapsable (calidad, duplicados, diagnóstico)
 *   6. Contenido operativo — empieza dentro del primer viewport
 *
 * Sólo presentación. No lee ni escribe operación, payroll, permisos ni estado
 * de negocio: recibe todo por slots.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";
import { CompanyLogo } from "@/components/ui/company-logo";
import { safeLocalStorage } from "@/lib/safe-storage";

/* ────────────────────────────────────────────────────────────────────────────
 * Modos visuales (arquitectura preparada; el modo administración se activará
 * en una entrega posterior, hoy sólo se expone el estado).
 * ──────────────────────────────────────────────────────────────────────────*/
export type WorkspaceMode = "operation" | "administration";

const WorkspaceModeContext = createContext<WorkspaceMode>("operation");

export function useWorkspaceMode(screenKey: string) {
  const storageKey = `stafly.workspace-mode.${screenKey}`;
  const [mode, setModeState] = useState<WorkspaceMode>(() => {
    const raw = safeLocalStorage.getItem(storageKey);
    return raw === "administration" ? "administration" : "operation";
  });
  const setMode = useCallback(
    (next: WorkspaceMode) => {
      setModeState(next);
      safeLocalStorage.setItem(storageKey, next);
    },
    [storageKey],
  );
  return { mode, setMode };
}

export function useCurrentWorkspaceMode() {
  return useContext(WorkspaceModeContext);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Resumen compacto de métricas — reemplaza filas de cards gigantes.
 * ──────────────────────────────────────────────────────────────────────────*/
export interface WorkspaceMetric {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "critical";
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}

const TONE_TEXT: Record<NonNullable<WorkspaceMetric["tone"]>, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
};

export function WorkspaceMetricChips({
  metrics,
  className,
}: {
  metrics: WorkspaceMetric[];
  className?: string;
}) {
  if (!metrics.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {metrics.map((m, i) => {
        const interactive = !!m.onClick;
        const Tag = (interactive ? "button" : "div") as "button";
        return (
          <Tag
            key={`${m.label}-${i}`}
            type={interactive ? "button" : undefined}
            onClick={m.onClick}
            title={m.hint}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 h-7",
              "text-[11px] leading-none transition-colors",
              interactive && "hover:border-primary/40 hover:bg-muted/60 cursor-pointer",
              m.active && "border-primary/50 bg-primary/[0.07]",
            )}
          >
            <span className={cn("font-semibold tabular-nums", TONE_TEXT[m.tone ?? "neutral"])}>
              {m.value}
            </span>
            <span className="text-muted-foreground">{m.label}</span>
          </Tag>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Panel administrativo colapsable.
 * ──────────────────────────────────────────────────────────────────────────*/
export function AdminSummaryPanel({
  title = "Resumen administrativo",
  hint,
  defaultOpen = false,
  children,
  className,
}: {
  title?: string;
  hint?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl border border-border/50 bg-card/40", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 h-9 text-left"
      >
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
        <span className="text-xs font-semibold">{title}</span>
        {hint ? <span className="ml-auto text-[11px] text-muted-foreground truncate">{hint}</span> : null}
      </button>
      {open && <div className="border-t border-border/40 p-3 space-y-3">{children}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shell operativo.
 * ──────────────────────────────────────────────────────────────────────────*/
export interface OperationalWorkspaceProps {
  title: string;
  /** Una sola línea de contexto. Opcional: la operación manda. */
  context?: ReactNode;
  breadcrumb?: ReactNode;
  /** Buscador embebido en la cabecera compacta. */
  search?: ReactNode;
  /** Acciones principales (máx. 2 visibles + overflow). */
  action?: ReactNode;
  /** Pestañas — permanecen visibles durante el scroll. */
  tabs?: ReactNode;
  /** Filtros — permanecen visibles durante el scroll. */
  filters?: ReactNode;
  /** Resumen compacto de métricas (chips). */
  metrics?: WorkspaceMetric[];
  /** Contenido administrativo (calidad, duplicados, diagnóstico). Colapsado. */
  admin?: ReactNode;
  adminTitle?: string;
  adminHint?: ReactNode;
  mode?: WorkspaceMode;
  children: ReactNode;
  className?: string;
}

export function OperationalWorkspace({
  title,
  context,
  breadcrumb,
  search,
  action,
  tabs,
  filters,
  metrics,
  admin,
  adminTitle,
  adminHint,
  mode = "operation",
  children,
  className,
}: OperationalWorkspaceProps) {
  const { selectedCompany, isGlobalMode } = useCompany();
  const hostLabel = isGlobalMode ? "Vista global" : selectedCompany?.name ?? "";
  const hasSticky = true;

  const metricChips = useMemo(() => metrics ?? [], [metrics]);

  return (
    <WorkspaceModeContext.Provider value={mode}>
      <div className={cn("min-w-0", className)}>
        {/* 1·2·3 — cabecera + pestañas + filtros: siempre visibles */}
        {hasSticky && (
          <div className="sticky top-12 md:top-16 z-20 -mx-4 px-4 md:-mx-8 md:px-8 bg-background/92 backdrop-blur-md border-b border-border/50">
            {breadcrumb ? <div className="pt-2 text-[11px]">{breadcrumb}</div> : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 min-w-0">
              {!isGlobalMode && selectedCompany ? (
                <CompanyLogo
                  name={selectedCompany.name}
                  logoUrl={selectedCompany.logo_url}
                  brandColor={selectedCompany.brand_color}
                  size="sm"
                  active
                  className="shrink-0"
                />
              ) : null}

              <div className="min-w-0 mr-auto">
                {hostLabel ? (
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate leading-3">
                    {hostLabel}
                  </p>
                ) : null}
                <h1 className="text-[17px] font-semibold tracking-tight leading-6 truncate">{title}</h1>
              </div>

              {search ? (
                <div className="hidden md:block w-full max-w-[320px] min-w-0">{search}</div>
              ) : null}

              {action ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">{action}</div>
              ) : null}
            </div>

            {search ? <div className="md:hidden pb-2">{search}</div> : null}

            {tabs ? <div className="overflow-x-auto">{tabs}</div> : null}
            {filters ? <div className="py-2">{filters}</div> : null}
          </div>
        )}

        {/* 4 — resumen compacto */}
        {metricChips.length > 0 && (
          <div className="pt-3">
            <WorkspaceMetricChips metrics={metricChips} />
          </div>
        )}

        {/* 5 — panel administrativo colapsable */}
        {admin ? (
          <div className="pt-3">
            <AdminSummaryPanel title={adminTitle} hint={adminHint}>
              {admin}
            </AdminSummaryPanel>
          </div>
        ) : null}

        {/* 6 — contenido operativo */}
        <div className="pt-3">{children}</div>
      </div>
    </WorkspaceModeContext.Provider>
  );
}

export default OperationalWorkspace;
