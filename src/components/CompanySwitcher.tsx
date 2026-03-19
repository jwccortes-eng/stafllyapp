import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Search, LayoutDashboard, User, Shield } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import CompanySwitchPinDialog from "@/components/CompanySwitchPinDialog";

const COMPANY_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#3b82f6", "#84cc16",
];

const ROLE_LABELS: Record<string, string> = {
  developer: "Dev",
  owner: "Owner",
  company_owner: "Company Owner",
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  employee: "Empleado",
};

function getCompanyColor(brandColor: string | null | undefined, index: number): string {
  return brandColor || COMPANY_COLORS[index % COMPANY_COLORS.length];
}

function getCompanyInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

interface CompanySwitcherProps {
  collapsed?: boolean;
}

export default function CompanySwitcher({ collapsed = false }: CompanySwitcherProps) {
  const { companies, selectedCompanyId, selectedCompany, switchCompany } = useCompany();
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

    // For multi-company users, require PIN confirmation
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

    // Single company - direct switch (shouldn't normally happen)
    performSwitch(company.id);
  };

  const performSwitch = (companyId: string) => {
    switchCompany(companyId);
    // Navigate to safe landing page to avoid stale entity detail pages
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

  if (companies.length === 0) return null;

  const currentColor = getCompanyColor(selectedCompany?.brand_color, 0);
  const currentInitials = selectedCompany ? getCompanyInitials(selectedCompany.name) : "?";
  const isDual = canAccessAdmin && canAccessPortal;
  const isAdmin = activeMode === 'admin';
  const isMulti = companies.length > 1;

  // Active mode pill
  const ModePill = () => {
    if (!isDual) return null;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none",
        isAdmin
          ? "bg-primary/10 text-primary"
          : "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40"
      )}>
        {isAdmin ? <LayoutDashboard className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
        {isAdmin ? "Admin" : "Portal"}
      </span>
    );
  };

  // Single company
  if (companies.length === 1) {
    return (
      <div className={cn(
        "flex items-center gap-2.5",
        collapsed ? "justify-center" : ""
      )}>
        <div className="relative">
          <Avatar className="h-7 w-7 rounded-lg shrink-0" style={{ borderColor: `${currentColor}30`, borderWidth: 1.5 }}>
            {selectedCompany?.logo_url ? (
              <AvatarImage src={selectedCompany.logo_url} alt={selectedCompany.name} className="rounded-lg object-cover" />
            ) : null}
            <AvatarFallback
              className="rounded-lg text-[10px] font-bold"
              style={{ backgroundColor: `${currentColor}15`, color: currentColor }}
            >
              {currentInitials}
            </AvatarFallback>
          </Avatar>
          {isDual && collapsed && (
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
              isAdmin ? "bg-primary" : "bg-emerald-500"
            )} />
          )}
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-semibold text-foreground truncate leading-tight">{selectedCompany?.name}</span>
            <ModePill />
          </div>
        )}
      </div>
    );
  }

  // Multi company - full switcher
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={cn(
            "flex items-center gap-2.5 rounded-xl transition-all duration-200 hover:bg-accent/40 group w-full",
            collapsed ? "justify-center p-1.5" : "px-2.5 py-2"
          )}>
            <div className="relative">
              <Avatar className="h-7 w-7 rounded-lg shrink-0 ring-1 ring-border/30">
                {selectedCompany?.logo_url ? (
                  <AvatarImage src={selectedCompany.logo_url} alt={selectedCompany.name} className="rounded-lg object-cover" />
                ) : null}
                <AvatarFallback
                  className="rounded-lg text-[10px] font-bold"
                  style={{ backgroundColor: `${currentColor}15`, color: currentColor }}
                >
                  {currentInitials}
                </AvatarFallback>
              </Avatar>
              {isDual && collapsed && (
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                  isAdmin ? "bg-primary" : "bg-emerald-500"
                )} />
              )}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{selectedCompany?.name}</p>
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
                  Cambiar empresa
                </p>
              </div>
              {isDual && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold",
                  isAdmin
                    ? "bg-primary/10 text-primary"
                    : "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40"
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
            {filtered.map((company, i) => {
              const color = getCompanyColor(company.brand_color, i);
              const initials = getCompanyInitials(company.name);
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
                  <Avatar className="h-8 w-8 rounded-lg shrink-0">
                    {company.logo_url ? (
                      <AvatarImage src={company.logo_url} alt={company.name} className="rounded-lg object-cover" />
                    ) : null}
                    <AvatarFallback
                      className="rounded-lg text-[10px] font-bold"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
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
              🔒 Se requiere código de confirmación para cambiar
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
