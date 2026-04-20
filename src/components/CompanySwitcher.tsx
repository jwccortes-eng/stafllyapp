import { forwardRef, useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Search, LayoutDashboard, User, Shield, Globe } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import CompanySwitchPinDialog from "@/components/CompanySwitchPinDialog";
import { CompanyLogo } from "@/components/ui/company-logo";

const ROLE_LABELS: Record<string, string> = {
  developer: "Dev",
  owner: "Owner",
  company_owner: "Company Owner",
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  employee: "Empleado",
};

interface CompanySwitcherProps {
  collapsed?: boolean;
}

const CompanySwitcher = forwardRef<HTMLDivElement, CompanySwitcherProps>(function CompanySwitcher({ collapsed = false }, _ref) {
  const { companies, selectedCompanyId, selectedCompany, switchCompany, isGlobalMode, canUseGlobalMode } = useCompany();
  const { user, role, activeMode, canAccessAdmin, canAccessPortal } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [companyRoles, setCompanyRoles] = useState<Record<string, string>>({});

  // PIN dialog state
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pendingCompany, setPendingCompany] = useState<{
    id: string; name: string; logo_url?: string | null; brand_color?: string | null;
  } | null>(null);

  // Fetch per-company roles
  useEffect(() => {
    if (!user || companies.length <= 1) return;
    supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach(r => { map[r.company_id] = r.role; });
        setCompanyRoles(map);
      });
  }, [user, companies]);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const handleSelect = (company: typeof companies[0]) => {
    if (company.id === selectedCompanyId) {
      setOpen(false);
      return;
    }

    // Developer/owner can switch without PIN
    if (canUseGlobalMode) {
      performSwitch(company.id);
      setOpen(false);
      return;
    }

    if (companies.length > 1) {
      setOpen(false);
      setPendingCompany({
        id: company.id,
        name: company.name,
        logo_url: company.logo_url,
        brand_color: company.brand_color,
      });
      setPinDialogOpen(true);
      return;
    }

    performSwitch(company.id);
  };

  const handleGoGlobal = () => {
    switchCompany(null);
    setOpen(false);
    const isDetailPage = /\/app\/[^/]+\/[^/]+/.test(location.pathname);
    if (isDetailPage) {
      navigate('/app', { replace: true });
    }
  };

  const performSwitch = (companyId: string) => {
    switchCompany(companyId);
    const isDetailPage = /\/app\/[^/]+\/[^/]+/.test(location.pathname);
    const basePath = activeMode === 'employee' ? '/portal' : '/app';
    if (isDetailPage) {
      navigate(basePath, { replace: true });
    }
  };

  const handlePinConfirm = (companyId: string) => {
    performSwitch(companyId);
    setPendingCompany(null);
  };

  if (companies.length === 0 && !canUseGlobalMode) return null;

  const isDual = canAccessAdmin && canAccessPortal;
  const isAdmin = activeMode === 'admin';

  // Active mode pill
  const ModePill = () => {
    if (isGlobalMode) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none bg-accent text-accent-foreground">
          <Globe className="h-2.5 w-2.5" />
          Global
        </span>
      );
    }
    if (!isDual) return null;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none",
        isAdmin
          ? "bg-primary/10 text-primary"
          : "text-earning bg-earning/10"
      )}>
        {isAdmin ? <LayoutDashboard className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
        {isAdmin ? "Admin" : "Portal"}
      </span>
    );
  };

  // Single company, non-global user
  if (companies.length === 1 && !canUseGlobalMode) {
    return (
      <div className={cn(
        "flex items-center gap-2.5",
        collapsed ? "justify-center" : ""
      )}>
        <CompanyLogo
          name={selectedCompany?.name || ""}
          logoUrl={selectedCompany?.logo_url}
          brandColor={selectedCompany?.brand_color}
          size="sm"
          active={isDual}
          glow
        />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-semibold text-foreground truncate leading-tight">{selectedCompany?.name}</span>
            <ModePill />
          </div>
        )}
      </div>
    );
  }

  // Multi company or global-mode capable - full switcher
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={cn(
            "flex items-center gap-2.5 rounded-xl transition-all duration-200 hover:bg-accent/40 group w-full",
            collapsed ? "justify-center p-1.5" : "px-2.5 py-2"
          )}>
            {isGlobalMode ? (
              <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                <Globe className="h-4 w-4 text-accent-foreground" />
              </div>
            ) : (
              <CompanyLogo
                name={selectedCompany?.name || ""}
                logoUrl={selectedCompany?.logo_url}
                brandColor={selectedCompany?.brand_color}
                size="sm"
                active
                glow
              />
            )}
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-semibold text-foreground truncate leading-tight">
                    {isGlobalMode ? "Vista Global" : selectedCompany?.name}
                  </p>
                  <ModePill />
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side={collapsed ? "right" : "bottom"}
          sideOffset={collapsed ? 8 : 4}
          className="w-[300px] p-0 rounded-xl shadow-xl border-border/50"
        >
          {/* Header */}
          <div className="p-3 pb-0">
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-muted-foreground/40" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  {canUseGlobalMode ? "Contexto" : "Cambiar empresa"}
                </p>
              </div>
              {isDual && !isGlobalMode && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold",
                  isAdmin
                    ? "bg-primary/10 text-primary"
                    : "text-earning bg-earning/10"
                )}>
                  {isAdmin ? <LayoutDashboard className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                  Modo {isAdmin ? "Admin" : "Empleado"}
                </span>
              )}
            </div>
            {companies.length > 4 && (
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="w-full h-8 pl-8 pr-3 text-[12px] bg-muted/30 border border-border/30 rounded-lg outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/30"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="px-2 pb-2 max-h-[320px] overflow-y-auto scrollbar-thin space-y-0.5">
            {/* Global mode option for developer/owner */}
            {canUseGlobalMode && (
              <button
                onClick={handleGoGlobal}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2.5 text-left transition-all duration-150",
                  isGlobalMode
                    ? "bg-accent/60 ring-1 ring-accent"
                    : "hover:bg-accent/40"
                )}
              >
                <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <Globe className="h-4 w-4 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[12px] font-medium truncate leading-tight", isGlobalMode && "font-semibold")}>
                    Vista Global
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Todas las empresas</p>
                </div>
                {isGlobalMode && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-bold uppercase text-accent-foreground/60 tracking-wider">Activa</span>
                    <Check className="h-3.5 w-3.5 text-accent-foreground" />
                  </div>
                )}
              </button>
            )}

            {canUseGlobalMode && companies.length > 0 && (
              <div className="border-t border-border/20 my-1" />
            )}

            {filtered.map((company) => {
              const isSelected = company.id === selectedCompanyId;
              const companyRole = companyRoles[company.id];
              const roleLabel = companyRole ? ROLE_LABELS[companyRole] || companyRole : null;

              return (
                <button
                  key={company.id}
                  onClick={() => handleSelect(company)}
                  className={cn(
                    "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2.5 text-left transition-all duration-150",
                    isSelected
                      ? "bg-primary/[0.06] ring-1 ring-primary/10"
                      : "hover:bg-accent/40"
                  )}
                >
                  <CompanyLogo
                    name={company.name}
                    logoUrl={company.logo_url}
                    brandColor={company.brand_color}
                    size="sm"
                    active={isSelected}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-medium truncate leading-tight", isSelected && "text-primary font-semibold")}>
                      {company.name}
                    </p>
                    {roleLabel && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{roleLabel}</p>
                    )}
                  </div>
                  {isSelected ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-bold uppercase text-primary/60 tracking-wider">Activa</span>
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </div>
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-[11px] text-muted-foreground/40 text-center py-4">No se encontraron empresas</p>
            )}
          </div>
          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
            <p className="text-[9px] text-muted-foreground/40 text-center">
              {canUseGlobalMode
                ? "🌐 Selecciona una empresa o usa Vista Global"
                : "🔒 Se requiere código de confirmación para cambiar"}
            </p>
          </div>
        </PopoverContent>
      </Popover>

      {/* PIN confirmation dialog */}
      <CompanySwitchPinDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        targetCompany={pendingCompany}
        onConfirm={handlePinConfirm}
      />
    </>
  );
}