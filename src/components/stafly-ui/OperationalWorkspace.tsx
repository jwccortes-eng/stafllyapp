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
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
    <div
      className={cn(
        // Móvil: una sola fila deslizable (misma información, sin apilar).
        // Desktop: envuelve con normalidad.
        "flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar -mx-4 px-4",
        "md:flex-wrap md:overflow-visible md:mx-0 md:px-0",
        className,
      )}
    >
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
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 h-8 md:h-7",
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
 * Buscador canónico de la cabecera. Una sola forma en todo el producto.
 * ──────────────────────────────────────────────────────────────────────────*/
export function WorkspaceSearch({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pestañas canónicas del workspace (subrayado + contador).
 * ──────────────────────────────────────────────────────────────────────────*/
export interface WorkspaceTabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
  tone?: "warning" | "destructive";
}

export function WorkspaceTabs<K extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: WorkspaceTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex items-center gap-0.5 overflow-x-auto", className)}
    >
      {items.map((tab) => {
        const isActive = value === tab.key;
        const isDestructive = tab.tone === "destructive";
        const isWarning = tab.tone === "warning";
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              isActive
                ? isDestructive
                  ? "border-destructive text-destructive"
                  : isWarning
                    ? "border-warning text-warning"
                    : "border-primary text-primary"
                : isDestructive
                  ? "border-transparent text-destructive/80 hover:text-destructive hover:border-destructive/40"
                  : isWarning
                    ? "border-transparent text-warning/80 hover:text-warning hover:border-warning/40"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "ml-1.5 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md",
                  isActive
                    ? isDestructive
                      ? "bg-destructive/10 text-destructive"
                      : isWarning
                        ? "bg-warning/15 text-warning"
                        : "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
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
  /** Filtros — inline en desktop, hoja inferior en móvil (mismas opciones). */
  filters?: ReactNode;
  /** Nº de filtros activos: se muestra sobre el botón "Filtros" en móvil. */
  filtersActiveCount?: number;
  /** Acciones secundarias en móvil (van dentro de "Más" del propio slot action). */
  mobileFiltersTitle?: string;
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
  filtersActiveCount = 0,
  mobileFiltersTitle = "Filtros",
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
            {filters ? (
              <>
                {/* Desktop: filtros inline. */}
                <div className="hidden md:block py-2">{filters}</div>
                {/* Móvil: mismas opciones, dentro de una hoja inferior. */}
                <div className="md:hidden py-2">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(true)}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-border/60 bg-card text-[13px] font-medium"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    {mobileFiltersTitle}
                    {filtersActiveCount > 0 ? (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-bold tabular-nums text-primary">
                        {filtersActiveCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </>
            ) : null}
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
