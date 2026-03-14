import { useEffect, useState, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard, Users, CalendarDays, Tags, FileSpreadsheet,
  BarChart3, LogOut, ContactRound, DollarSign, Building2,
  PanelLeftClose, PanelLeft, Moon, Sun, Settings2,
  Clock, MapPin, Megaphone, MessageCircle, ChevronDown,
  Inbox, Wrench, Lock, Sparkles, ClipboardList, Receipt, Brain,
  Map as MapIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "./AdminLayout";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { CommandPaletteTrigger } from "@/components/CommandPalette";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StaflyLogo, StaflyMark } from "@/components/brand/StaflyBrand";
import CompanyActionGuard from "@/components/CompanyActionGuard";

interface LinkDef {
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
  badge?: string;
}

/* ── Simplified 3-group structure ── */
const ALL_LINKS: LinkDef[] = [
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Inicio" },
  { to: "/app/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Operaciones" },
  { to: "/app/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Operaciones" },
  { to: "/app/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/app/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/app/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Config Nómina", module: null, section: "Nómina" },
  { to: "/app/employees", icon: Users, label: "Empleados", module: "employees", section: "Gestión" },
  { to: "/app/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Gestión" },
  { to: "/app/clients", icon: Building2, label: "Clientes", module: "clients", section: "Gestión" },
  { to: "/app/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Gestión" },
  { to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Gestión" },
  { to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Gestión" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Gestión" },
  { to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Gestión", badge: "tickets" },
  { to: "/app/live-map", icon: MapIcon, label: "Mapa en Vivo", module: null, section: "Operaciones" },
  { to: "/app/ai-workforce", icon: Brain, label: "AI Workforce", module: null, section: "Operaciones" },
  { to: "/app/staffing-requests", icon: ClipboardList, label: "Solicitudes", module: null, section: "Comercial" },
  { to: "/app/invoices", icon: Receipt, label: "Facturación", module: null, section: "Comercial" },
  { to: "/app/service-categories", icon: Tags, label: "Categorías", module: null, section: "Comercial" },
];

const SECTION_ORDER = ["Inicio", "Operaciones", "Nómina", "Gestión", "Comercial"];

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess, user, fullName } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const { canAccessModule, requiredPlanForModule, isTrial, trialDaysLeft } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const { theme, setTheme } = useTheme();

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["Operaciones", "Nómina", "Gestión"]));
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompanyId) return;
    async function fetchBadges() {
      const [ticketsRes, shiftReqRes] = await Promise.all([
        supabase.from("employee_tickets").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("status", "pending"),
      ]);
      setBadgeCounts({
        tickets: ticketsRes.count ?? 0,
        shift_requests: shiftReqRes.count ?? 0,
      });
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [selectedCompanyId]);

  const isLinkVisible = (module: string | null) => {
    if (!module) return true;
    if (!isModuleActive(module)) return false;
    if (role === 'developer' || role === 'owner' || role === 'admin') return true;
    if (role === 'manager' || role === 'supervisor') return hasModuleAccess(module, 'view');
    return false;
  };

  const isModuleLocked = (module: string | null): boolean => {
    if (!module) return false;
    return !canAccessModule(module);
  };

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  const roleLabel = role === 'developer' ? 'Dev' : role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : role === 'supervisor' ? 'Supervisor' : 'User';
  const isOwner = role === 'developer' || role === 'owner';
  const userEmail = user?.email ?? null;
  const userPhone = user?.phone ?? null;
  const userIdentifier = userEmail || userPhone || '';
  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail ? userEmail[0].toUpperCase() : '?';

  const visibleSections = useMemo(() => {
    const sectionMap = new Map<string, LinkDef[]>();
    for (const link of ALL_LINKS) {
      if (!isLinkVisible(link.module)) continue;
      if (!sectionMap.has(link.section)) sectionMap.set(link.section, []);
      sectionMap.get(link.section)!.push(link);
    }
    const result: { label: string; links: LinkDef[] }[] = [];
    for (const sec of SECTION_ORDER) {
      if (sectionMap.has(sec)) result.push({ label: sec, links: sectionMap.get(sec)! });
    }
    return result;
  }, [role, selectedCompanyId]);

  useEffect(() => {
    const activeSection = visibleSections.find(s => s.links.some(l => isActive(l.to, l.end)));
    if (activeSection) {
      setOpenSections(prev => {
        if (prev.has(activeSection.label)) return prev;
        const next = new Set(prev);
        next.add(activeSection.label);
        return next;
      });
    }
  }, [location.pathname]);

  const toggleSection = (label: string) => {
    if (label === "Inicio") return;
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderLink = (link: LinkDef) => {
    const active = isActive(link.to, link.end);
    const badge = link.badge ? badgeCounts[link.badge] : 0;
    const locked = isModuleLocked(link.module);
    const requiredPlan = link.module ? requiredPlanForModule(link.module) : null;

    const handleClick = (e: React.MouseEvent) => {
      if (locked) {
        e.preventDefault();
        navigate("/app/pricing");
      }
    };

    const linkContent = (
      <div key={link.to} className="group/link relative">
        <NavLink
          to={locked ? "#" : link.to}
          onClick={handleClick}
          data-active={active || undefined}
          className={cn(
            "sidebar-link",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-[7px]",
            locked
              ? "text-foreground/20 cursor-pointer hover:bg-accent/20"
              : active
                ? "sidebar-link-active"
                : "sidebar-link-idle"
          )}
        >
          {active && !locked && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary transition-all" />
          )}
          <div className="relative flex items-center justify-center">
            {locked ? (
              <Lock className="h-[17px] w-[17px] shrink-0 text-foreground/20" />
            ) : (
              <link.icon className={cn(
                "h-[17px] w-[17px] shrink-0 transition-colors duration-200",
                active ? "text-primary" : "text-foreground/35 group-hover/link:text-foreground/70"
              )} />
            )}
            {collapsed && badge > 0 && !locked && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
            )}
          </div>
          {!collapsed && (
            <>
              <span className={cn("flex-1 truncate leading-tight", locked && "line-through decoration-foreground/15")}>{link.label}</span>
              {locked && requiredPlan && (
                <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-primary/8 text-primary">
                  {requiredPlan}
                </span>
              )}
              {!locked && badge > 0 && (
                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[10px] font-bold tabular-nums px-1">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </>
          )}
        </NavLink>
      </div>
    );

    if (collapsed) {
      return (
        <Tooltip key={link.to} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium flex items-center gap-2">
            {link.label}
            {locked && requiredPlan && (
              <span className="text-[9px] font-bold text-primary">🔒 {requiredPlan}</span>
            )}
            {!locked && badge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1">
                {badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }
    return linkContent;
  };

  const renderSection = (section: { label: string; links: LinkDef[] }) => {
    if (section.label === "Inicio") {
      return (
        <div key="Inicio" className="space-y-0.5 mb-1">
          {section.links.map(l => renderLink(l))}
        </div>
      );
    }

    if (collapsed) {
      return (
        <div key={section.label} className="space-y-0.5">
          <div className="border-t border-border/20 my-2.5" />
          {section.links.map(l => renderLink(l))}
        </div>
      );
    }

    const isOpen = openSections.has(section.label);
    const sectionBadge = section.links.reduce((sum, l) => sum + (l.badge ? (badgeCounts[l.badge] ?? 0) : 0), 0);

    return (
      <Collapsible key={section.label} open={isOpen} onOpenChange={() => toggleSection(section.label)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 group/section cursor-pointer mt-3 first:mt-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/35 group-hover/section:text-muted-foreground/55 transition-colors select-none">
            {section.label}
          </span>
          <div className="flex items-center gap-1.5">
            {!isOpen && sectionBadge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[9px] font-bold px-1 tabular-nums">
                {sectionBadge}
              </span>
            )}
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground/20 transition-transform duration-300 ease-in-out",
              isOpen && "rotate-180"
            )} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-0.5 mt-0.5 overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
          {section.links.map(l => renderLink(l))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-in-out",
      "bg-card border-r border-border/60",
      collapsed ? "w-[60px]" : "w-[240px]",
    )}>
      {/* ── Brand + Company ── */}
      <div className={cn(
        "flex items-center shrink-0 h-14",
        collapsed ? "justify-center px-2" : "px-4 gap-3"
      )}>
        {collapsed ? (
          <StaflyMark size={28} />
        ) : (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <StaflyMark size={28} />
            <div className="min-w-0 flex-1">
              {companies.length > 1 ? (
                <Select value={selectedCompanyId ?? ""} onValueChange={(id) => setPendingCompanyId(id)}>
                  <SelectTrigger className="h-7 text-[12px] font-semibold bg-transparent border-0 shadow-none px-0 hover:bg-accent/30 rounded-lg transition-colors">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : companies.length === 1 ? (
                <span className="text-[13px] font-semibold text-foreground truncate block">{companies[0].name}</span>
              ) : (
                <span className="text-[13px] font-semibold text-foreground">StaflyApps</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className={cn("shrink-0", collapsed ? "px-2 pb-2" : "px-3 pb-2")}>
        <CommandPaletteTrigger collapsed={collapsed} />
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleSections.map(renderSection)}

        {isOwner && (
          <>
            <div className="border-t border-border/20 my-2.5" />
            {renderLink({ to: "/app/admin", icon: Wrench, label: "Administración", module: null, section: "", end: true })}
          </>
        )}
      </nav>

      {/* Trial banner */}
      {isTrial && trialDaysLeft !== null && !collapsed && (
        <div className="mx-3 mb-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold text-primary">Prueba Pro</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {trialDaysLeft > 0
              ? `Te quedan ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''} de prueba.`
              : 'Tu prueba ha expirado.'}
          </p>
          <button
            onClick={() => navigate("/app/pricing")}
            className="mt-1.5 text-[10px] font-semibold text-primary hover:underline"
          >
            Ver planes →
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="px-2 py-2 border-t border-border/40 space-y-0.5 shrink-0">
        {/* User identity */}
        <div className={cn(
          "flex items-center rounded-xl transition-colors hover:bg-accent/40 cursor-default",
          collapsed ? "justify-center p-2" : "px-3 py-2 gap-2.5"
        )}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Avatar className={cn("h-7 w-7 border", isOwner ? "border-accent-warm/30" : "border-primary/15")}>
                  <AvatarFallback className={cn("text-[10px] font-bold", isOwner ? "bg-accent-warm/10 text-accent-warm" : "bg-primary/8 text-primary")}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <p className="font-semibold">{fullName || 'Usuario'}</p>
                <p className="text-muted-foreground text-[10px]">{roleLabel}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Avatar className={cn("h-7 w-7 border shrink-0", isOwner ? "border-accent-warm/30" : "border-primary/15")}>
                <AvatarFallback className={cn("text-[10px] font-bold", isOwner ? "bg-accent-warm/10 text-accent-warm" : "bg-primary/8 text-primary")}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-foreground truncate leading-tight">
                  {fullName || 'Usuario'}
                </p>
                <p className="text-[10px] text-muted-foreground/50 truncate leading-tight">
                  {roleLabel}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Actions row */}
        <div className={cn("flex items-center", collapsed ? "flex-col gap-0.5" : "gap-0.5")}>
          {/* Theme */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={cn(
                  "flex items-center justify-center rounded-xl text-muted-foreground/50 hover:bg-accent/40 hover:text-foreground transition-all duration-200",
                  collapsed ? "h-8 w-full" : "h-8 w-8"
                )}
              >
                {theme === "dark" ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</TooltipContent>
          </Tooltip>

          {/* Collapse */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className={cn(
                  "flex items-center justify-center rounded-xl text-muted-foreground/50 hover:bg-accent/40 hover:text-foreground transition-all duration-200",
                  collapsed ? "h-8 w-full" : "h-8 w-8"
                )}
              >
                {collapsed ? <PanelLeft className="h-[15px] w-[15px]" /> : <PanelLeftClose className="h-[15px] w-[15px]" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">{collapsed ? "Expandir" : "Colapsar"}</TooltipContent>
          </Tooltip>

          {/* Sign out */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className={collapsed ? "w-full" : ""}>
                <LogoutConfirmDialog onConfirm={signOut}>
                  <button
                    className={cn(
                      "flex items-center justify-center rounded-xl text-muted-foreground/50 hover:bg-destructive/8 hover:text-destructive transition-all duration-200",
                      collapsed ? "h-8 w-full" : "h-8 w-8"
                    )}
                  >
                    <LogOut className="h-[15px] w-[15px]" />
                  </button>
                </LogoutConfirmDialog>
              </span>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">Cerrar sesión</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Company switch guard */}
      <CompanyActionGuard
        open={!!pendingCompanyId && pendingCompanyId !== selectedCompanyId}
        onOpenChange={(v) => { if (!v) setPendingCompanyId(null); }}
        title="Cambiar de empresa"
        description="Estás a punto de cambiar el contexto a otra empresa. Confirma tu contraseña para continuar."
        requirePassword
        onConfirm={() => {
          if (pendingCompanyId) setSelectedCompanyId(pendingCompanyId);
          setPendingCompanyId(null);
        }}
      />
    </aside>
  );
}
