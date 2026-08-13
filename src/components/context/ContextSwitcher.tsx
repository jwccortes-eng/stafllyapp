/**
 * OX-4.5 — Context Switcher unificado.
 *
 * Un solo control para las dos preguntas que definen el contexto:
 *   ¿En qué compañía estoy?  ¿En qué modo estoy?
 *
 * Reemplaza a CompanySwitcher + ModeSwitcher + AdminProductSwitcher.
 * Mobile: trigger >= 44px que abre un bottom sheet.
 * Desktop: popover anclado al sidebar o al header.
 *
 * El cambio es atómico y visible: permiso → transición → confirmación
 * terminal. Nunca deja al usuario adivinando dónde quedó.
 */
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Globe,
  LayoutDashboard,
  Loader2,
  Lock,
  Search,
  Shield,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CompanyLogo } from "@/components/ui/company-logo";
import CompanySwitchPinDialog from "@/components/CompanySwitchPinDialog";
import { TerminalCard } from "@/components/ocs";
import { useIsMobile } from "@/hooks/use-mobile";
import { MT, TAP, FOCUS_RING } from "@/lib/mobile/mobile-scale";
import { notifyError } from "@/lib/feedback/notify";
import { BADGE_CLASSES } from "@/lib/company-governance";
import {
  buildContextSwitcherModel,
  MODE_LABEL,
  type ContextCompanyOption,
  type ContextMode,
  type ContextSwitcherModel,
} from "@/lib/context/context-switcher-model";
import {
  companySwitchedTerminal,
  modeSwitchedTerminal,
} from "@/lib/ox/terminal-state";

export interface ContextSwitcherProps {
  /**
   * `sidebar` y `header` son desktop; en mobile siempre se usa bottom sheet.
   * `hero` es el bloque de identidad de la empresa (anfitriona) en Home.
   */
  placement?: "sidebar" | "header" | "hero";
  collapsed?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Trigger                                                             */
/* ------------------------------------------------------------------ */

function TriggerContent({
  model,
  collapsed,
  compact,
}: {
  model: ContextSwitcherModel;
  collapsed: boolean;
  compact: boolean;
}) {
  const busy =
    model.transition.kind === "switching_company" ||
    model.transition.kind === "switching_mode";

  return (
    <>
      {model.isGlobalMode ? (
        <span
          className={cn(
            "rounded-xl bg-accent flex items-center justify-center shrink-0",
            collapsed || compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          <Globe className="h-4 w-4 text-accent-foreground" aria-hidden />
        </span>
      ) : (
        <CompanyLogo
          name={model.companyLabel}
          logoUrl={model.logoUrl}
          brandColor={model.brandColor}
          size={collapsed || compact ? "sm" : "md"}
          active
          glow
        />
      )}
      {!collapsed && (
        <>
          <span className="flex-1 min-w-0 text-left">
            <span
              className={cn(
                "block truncate font-semibold leading-tight tracking-tight",
                compact ? "text-[13px]" : "text-[14px]",
              )}
            >
              {model.companyLabel}
            </span>
            <span
              className={cn(
                MT.caption,
                "flex items-center gap-1.5 truncate text-muted-foreground leading-tight",
              )}
            >
              {!busy && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-status-success shrink-0"
                  aria-hidden
                />
              )}
              <span className="truncate">
                {busy ? model.transition.message : `Modo ${model.modeLabel}`}
              </span>
            </span>
          </span>
          {busy ? (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : (
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 text-muted-foreground/60"
              aria-hidden
            />
          )}
        </>
      )}
    </>
  );
}


/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function ContextPanel({
  model,
  search,
  onSearch,
  onSelectCompany,
  onSelectGlobal,
  onSelectMode,
  onDismissResult,
  isMobile,
}: {
  model: ContextSwitcherModel;
  search: string;
  onSearch: (v: string) => void;
  onSelectCompany: (c: ContextCompanyOption) => void;
  onSelectGlobal: () => void;
  onSelectMode: (m: ContextMode) => void;
  onDismissResult: () => void;
  isMobile: boolean;
}) {
  const t = model.transition;
  const row = isMobile ? "min-h-[56px]" : "min-h-[44px]";

  // Confirmación terminal: el cambio terminó y se dice exactamente en qué
  // contexto quedó el usuario.
  if (t.kind === "success") {
    const terminal =
      model.activeMode && model.transition.detail?.includes("modo")
        ? modeSwitchedTerminal({
            companyName: model.companyLabel,
            modeLabel: model.modeLabel,
          })
        : companySwitchedTerminal(model.companyLabel);
    return (
      <div className="p-3">
        <TerminalCard
          terminal={terminal}
          subtitle={`Modo ${model.modeLabel}`}
          action={{ label: "Entendido", onClick: onDismissResult }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[70vh]">
      {/* Estado de la transición: nunca silencioso */}
      {t.kind !== "idle" && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mx-3 mt-3 rounded-lg px-3 py-2 border",
            t.kind === "error" || t.kind === "no_access"
              ? "border-status-danger/30 bg-status-danger/5"
              : "border-border bg-muted/40",
          )}
        >
          <p className={cn(MT.body, "font-medium flex items-center gap-2")}>
            {(t.kind === "switching_company" || t.kind === "switching_mode") && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {(t.kind === "error" || t.kind === "no_access") && (
              <AlertTriangle
                className="h-3.5 w-3.5 text-status-danger"
                aria-hidden
              />
            )}
            {t.message}
          </p>
          {t.detail && (
            <p className={cn(MT.caption, "text-muted-foreground mt-0.5")}>
              {t.detail}
            </p>
          )}
        </div>
      )}

      {/* Modo — permisos fail-closed */}
      <div className="px-3 pt-3">
        <p
          className={cn(
            MT.caption,
            "px-1 pb-1.5 font-semibold uppercase tracking-wider text-muted-foreground",
          )}
        >
          Modo
        </p>
        <div className="space-y-1">
          {model.modes.map((m) => {
            const Icon = m.mode === "admin" ? LayoutDashboard : User;
            return (
              <button
                key={m.mode}
                type="button"
                disabled={!m.available || m.isActive}
                onClick={() => onSelectMode(m.mode)}
                aria-current={m.isActive}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors",
                  row,
                  FOCUS_RING,
                  m.isActive
                    ? "bg-primary/[0.07] ring-1 ring-primary/15"
                    : m.available
                      ? "hover:bg-accent/40"
                      : "opacity-60 cursor-not-allowed",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className={cn(MT.body, "block font-medium truncate")}>
                    {m.label}
                  </span>
                  <span
                    className={cn(
                      MT.caption,
                      "block truncate",
                      m.available
                        ? "text-muted-foreground"
                        : "text-status-warning",
                    )}
                  >
                    {m.available ? m.description : m.unavailableReason}
                  </span>
                </span>
                {m.isActive && (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                )}
                {!m.available && !m.isActive && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compañía */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5 px-1 pb-1.5">
          <Shield className="h-3 w-3 text-muted-foreground" aria-hidden />
          <p
            className={cn(
              MT.caption,
              "font-semibold uppercase tracking-wider text-muted-foreground",
            )}
          >
            Compañía
          </p>
        </div>
        {model.showCompanySearch && (
          <div className="relative mb-2">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Buscar compañía…"
              aria-label="Buscar compañía"
              className={cn(
                "w-full h-11 pl-9 pr-3 rounded-lg bg-muted/30 border border-border outline-none",
                MT.body,
                "focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground",
              )}
            />
          </div>
        )}
      </div>

      <div className="px-2 pb-3 overflow-y-auto scrollbar-thin space-y-0.5">
        {model.groups.length === 0 && (
          <p className={cn(MT.body, "text-muted-foreground text-center py-6")}>
            No encontramos compañías con ese nombre.
          </p>
        )}
        {model.groups.map((group) => (
          <div key={group.group} className="mb-1.5">
            <p
              className={cn(
                MT.caption,
                "px-2 pt-2 pb-1 font-bold uppercase tracking-wider text-muted-foreground",
              )}
            >
              {group.label}
            </p>
            {group.companies.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!c.operable}
                onClick={() => onSelectCompany(c)}
                aria-current={c.isActive}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors",
                  row,
                  FOCUS_RING,
                  c.isActive
                    ? "bg-primary/[0.06] ring-1 ring-primary/10"
                    : c.operable
                      ? "hover:bg-accent/40"
                      : "opacity-60 cursor-not-allowed",
                )}
              >
                <CompanyLogo
                  name={c.name}
                  logoUrl={c.logoUrl}
                  brandColor={c.brandColor}
                  size="sm"
                  active={c.isActive}
                />
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      MT.body,
                      "block truncate font-medium",
                      c.isActive && "text-primary font-semibold",
                    )}
                  >
                    {c.name}
                  </span>
                  <span className="flex items-center gap-1 flex-wrap mt-0.5">
                    {c.roleLabel && (
                      <span className={cn(MT.caption, "text-muted-foreground")}>
                        {c.roleLabel}
                      </span>
                    )}
                    {c.badges.map((b) => (
                      <span
                        key={b.label}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          BADGE_CLASSES[b.tone as keyof typeof BADGE_CLASSES],
                        )}
                      >
                        {b.label}
                      </span>
                    ))}
                    {c.blockedReason && (
                      <span className={cn(MT.caption, "text-status-warning")}>
                        {c.blockedReason}
                      </span>
                    )}
                  </span>
                </span>
                {c.isActive && (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                )}
              </button>
            ))}
          </div>
        ))}

        {model.isGlobalMode !== undefined && model.canSwitchCompany && (
          <GlobalRow
            active={model.isGlobalMode}
            onSelect={onSelectGlobal}
            row={row}
          />
        )}
      </div>
    </div>
  );
}

function GlobalRow({
  active,
  onSelect,
  row,
}: {
  active: boolean;
  onSelect: () => void;
  row: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors",
        row,
        FOCUS_RING,
        active ? "bg-accent/60 ring-1 ring-accent" : "hover:bg-accent/40",
      )}
    >
      <span className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <Globe className="h-4 w-4 text-accent-foreground" aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn(MT.body, "block font-medium")}>Vista Global</span>
        <span className={cn(MT.caption, "block text-muted-foreground")}>
          Todas las compañías, sólo lectura consolidada
        </span>
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-accent-foreground" aria-hidden />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Contenedor                                                          */
/* ------------------------------------------------------------------ */

export const ContextSwitcher = forwardRef<HTMLDivElement, ContextSwitcherProps>(
  function ContextSwitcher(
    { placement = "sidebar", collapsed = false, className },
    _ref,
  ) {
    const {
      companies,
      selectedCompanyId,
      switchCompany,
      isGlobalMode,
      canUseGlobalMode,
      switchState,
      switchError,
    } = useCompany();
    const {
      user,
      role,
      activeMode,
      setActiveMode,
      canAccessAdmin,
      canAccessPortal,
      loading: authLoading,
    } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isMobile = useIsMobile();

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [companyRoles, setCompanyRoles] = useState<Record<string, string>>({});
    const [modeSwitching, setModeSwitching] = useState<ContextMode | null>(null);
    const [lastCompleted, setLastCompleted] = useState<
      { kind: "company" | "mode"; label: string } | null
    >(null);
    const [online, setOnline] = useState(
      typeof navigator === "undefined" ? true : navigator.onLine,
    );

    const pendingCompanyRef = useRef<string | null>(null);

    useEffect(() => {
      const on = () => setOnline(true);
      const off = () => setOnline(false);
      window.addEventListener("online", on);
      window.addEventListener("offline", off);
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", off);
      };
    }, []);

    // Roles reales por compañía. Nunca se hereda el rol de otra compañía.
    useEffect(() => {
      if (!user || companies.length <= 1) return;
      supabase
        .from("company_users")
        .select("company_id, role")
        .eq("user_id", user.id)
        .then(({ data }) => {
          if (!data) return;
          const map: Record<string, string> = {};
          data.forEach((r) => {
            map[r.company_id] = r.role;
          });
          setCompanyRoles(map);
        });
    }, [user, companies]);

    // Confirmación terminal del cambio de compañía.
    useEffect(() => {
      if (
        switchState === "idle" &&
        pendingCompanyRef.current &&
        pendingCompanyRef.current === selectedCompanyId
      ) {
        const name =
          companies.find((c) => c.id === selectedCompanyId)?.name ?? "";
        pendingCompanyRef.current = null;
        setLastCompleted({ kind: "company", label: name });
      }
    }, [switchState, selectedCompanyId, companies]);

    // Errores de cambio de tenant: se avisan aunque el panel esté cerrado.
    useEffect(() => {
      if (switchState === "error" && switchError) {
        pendingCompanyRef.current = null;
        notifyError({
          key: "context-switch",
          title: "No pudimos cambiar de compañía",
          fact: switchError,
          consequence: "Sigues en la compañía anterior; no se mezclaron datos.",
        });
      }
    }, [switchState, switchError]);

    const model = useMemo(
      () =>
        buildContextSwitcherModel({
          companies,
          selectedCompanyId,
          isGlobalMode,
          canUseGlobalMode,
          isDeveloper: role === "developer",
          companyRoles,
          activeMode: activeMode as ContextMode,
          canAccessAdmin,
          canAccessPortal,
          permissionsResolved: !authLoading,
          search,
          switchState,
          switchError,
          modeSwitching,
          lastCompleted,
          online,
        }),
      [
        companies,
        selectedCompanyId,
        isGlobalMode,
        canUseGlobalMode,
        role,
        companyRoles,
        activeMode,
        canAccessAdmin,
        canAccessPortal,
        authLoading,
        search,
        switchState,
        switchError,
        modeSwitching,
        lastCompleted,
        online,
      ],
    );

    const resetResult = () => {
      setLastCompleted(null);
      setOpen(false);
      setSearch("");
    };

    const performSwitch = (companyId: string) => {
      pendingCompanyRef.current = companyId;
      setLastCompleted(null);
      switchCompany(companyId);
      const isDetailPage = /\/app\/[^/]+\/[^/]+/.test(location.pathname);
      const basePath = activeMode === "employee" ? "/portal" : "/app";
      if (isDetailPage) navigate(basePath, { replace: true });
    };

    const handleSelectCompany = (c: ContextCompanyOption) => {
      if (c.isActive || !c.operable) return;
      if (!online) {
        notifyError({
          key: "context-switch",
          title: "Sin conexión",
          fact: "No pudimos verificar tu acceso a esa compañía.",
          consequence: "Sigues en el contexto actual.",
        });
        return;
      }
      // P0 AUTH PIN CANONICALIZATION: el cambio de compañía no pide PIN.
      // La membresía ya está resuelta por el acceso; un segundo PIN solo
      // reintroducía credenciales divergentes.
      performSwitch(c.id);
    };

    const handleGlobal = () => {
      pendingCompanyRef.current = null;
      setLastCompleted(null);
      switchCompany(null);
      setOpen(false);
      if (/\/app\/[^/]+\/[^/]+/.test(location.pathname)) {
        navigate("/app", { replace: true });
      }
    };

    const handleSelectMode = (mode: ContextMode) => {
      const target = model.modes.find((m) => m.mode === mode);
      // Fail-closed: sin permiso confirmado no se cambia de modo.
      if (!target?.available || target.isActive) return;
      setModeSwitching(mode);
      setActiveMode(mode);
      navigate(mode === "admin" ? "/app" : "/portal");
      window.setTimeout(() => {
        setModeSwitching(null);
        setLastCompleted({ kind: "mode", label: MODE_LABEL[mode] });
      }, 250);
    };

    if (companies.length === 0 && !canUseGlobalMode) return null;

    const triggerClass = cn(
      "flex items-center gap-3 rounded-2xl w-full transition-colors",
      "border border-border/50 bg-card/60 hover:bg-accent/40 hover:border-border",
      FOCUS_RING,
      isMobile ? TAP : "min-h-[56px]",
      collapsed ? "justify-center p-1.5 min-h-[48px] rounded-xl" : "px-3 py-2.5",
      placement === "header" && !isMobile && "w-auto min-h-[44px] px-2.5 py-2 rounded-xl",
      placement === "hero" &&
        !collapsed &&
        "min-h-[64px] px-4 py-3 rounded-2xl bg-card border-border/60 shadow-2xs active:scale-[0.995]",
      className,
    );



    const trigger = (
      <button
        type="button"
        aria-label={model.ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={isMobile ? () => setOpen(true) : undefined}
        className={triggerClass}
      >
        <TriggerContent
          model={model}
          collapsed={collapsed}
          compact={placement === "header"}
        />
      </button>
    );

    const panel = (
      <ContextPanel
        model={model}
        search={search}
        onSearch={setSearch}
        onSelectCompany={handleSelectCompany}
        onSelectGlobal={handleGlobal}
        onSelectMode={handleSelectMode}
        onDismissResult={resetResult}
        isMobile={isMobile}
      />
    );

    return (
      <>
        {isMobile ? (
          <>
            {trigger}
            <Sheet
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setLastCompleted(null);
              }}
            >
              <SheetContent
                side="bottom"
                className="p-0 rounded-t-3xl max-h-[88vh] pb-[env(safe-area-inset-bottom,0px)]"
                aria-label="Cambiar compañía y modo"
              >
                <div className="pt-3 pb-3 px-4 border-b border-border/40">
                  <div
                    className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30"
                    aria-hidden
                  />
                  <div className="flex items-center gap-3 pt-3">
                    <CompanyLogo
                      name={model.companyLabel}
                      logoUrl={model.logoUrl}
                      brandColor={model.brandColor}
                      size="md"
                      active
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold tracking-tight truncate">
                        {model.companyLabel}
                      </span>
                      <span className={cn(MT.caption, "block text-muted-foreground truncate")}>
                        Modo {model.modeLabel} · toca otra empresa para cambiar
                      </span>
                    </span>
                  </div>
                </div>
                {panel}
              </SheetContent>

            </Sheet>
          </>
        ) : (
          <Popover
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setLastCompleted(null);
            }}
          >
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
              align="start"
              side={collapsed ? "right" : "bottom"}
              sideOffset={collapsed ? 8 : 4}
              className="w-[320px] p-0 rounded-xl shadow-xl"
            >
              {panel}
            </PopoverContent>
          </Popover>
        )}

      </>
    );
  },
);

export default ContextSwitcher;
