import { useEffect, useState, useCallback, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard, Users, CalendarDays, Upload, Tags, FileSpreadsheet,
  BarChart3, LogOut, ContactRound, DollarSign, Shield, Building2,
  PanelLeftClose, PanelLeft, Moon, Sun, Settings2,
  MessageSquare, Clock, MapPin, Megaphone, MessageCircle, ChevronDown,
  ScanEye, Inbox, Wrench,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
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
  // Inicio (always visible, no group header)
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Inicio" },

  // Operaciones — scheduling, field ops, real-time
  { to: "/app/today", icon: ScanEye, label: "Hoy", module: "shifts", section: "Operaciones" },
  { to: "/app/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Operaciones" },
  { to: "/app/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Operaciones" },
  { to: "/app/shift-requests", icon: MessageSquare, label: "Solicitudes", module: "shifts", section: "Operaciones", badge: "shift_requests" },
  { to: "/app/clients", icon: Building2, label: "Clientes", module: "clients", section: "Operaciones" },
  { to: "/app/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Operaciones" },

  // Nómina — payroll, imports, reports
  { to: "/app/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/app/import", icon: Upload, label: "Importar horas", module: "import", section: "Nómina" },
  { to: "/app/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Resumen", module: "summary", section: "Nómina" },
  { to: "/app/reports", icon: BarChart3, label: "Reportes", module: "reports", section: "Nómina" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Config Nómina", module: null, section: "Nómina" },

  // Gestión — people, communication, requests
  { to: "/app/employees", icon: Users, label: "Empleados", module: "employees", section: "Gestión" },
  { to: "/app/directory", icon: ContactRound, label: "Directorio", module: "employees", section: "Gestión" },
  { to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Gestión" },
  { to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Gestión" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Gestión" },
  { to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Gestión", badge: "tickets" },
];

const SECTION_ORDER = ["Inicio", "Operaciones", "Nómina", "Gestión"];

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess, user, fullName } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive } = useCompany();
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const { theme, setTheme } = useTheme();

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["Operaciones", "Nómina", "Gestión"]));
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null);

  // Fetch badge counts
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
    if (role === 'owner' || role === 'admin') return true;
    if (role === 'manager') return hasModuleAccess(module, 'view');
    return false;
  };

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  // User identity display
  const roleLabel = role === 'owner' ? 'Super Admin' : role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Usuario';
  const roleBg = role === 'owner' ? 'owner-badge bg-accent-warm text-accent-warm-foreground' : role === 'admin' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground';
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

  // Auto-open section with active route
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
    if (label === "Inicio") return; // never collapse
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

    const linkContent = (
      <div key={link.to} className="group/link relative">
        <NavLink
          to={link.to}
          data-active={active || undefined}
          className={cn(
            "relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full min-w-0",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
            active
              ? cn("bg-sidebar-primary/8 text-sidebar-primary font-semibold")
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
          )}
        >
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary" />
          )}
          <div className="relative">
            <link.icon className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
              active ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover/link:text-sidebar-foreground"
            )} />
            {collapsed && badge > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
            )}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 truncate leading-tight">{link.label}</span>
              {badge > 0 && (
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
            {badge > 0 && (
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
    // "Inicio" renders flat, no collapsible
    if (section.label === "Inicio") {
      return (
        <div key="Inicio" className="space-y-0.5">
          {section.links.map(l => renderLink(l))}
        </div>
      );
    }

    if (collapsed) {
      return (
        <div key={section.label} className="space-y-0.5">
          <div className="border-t border-sidebar-border/30 my-2" />
          {section.links.map(l => renderLink(l))}
        </div>
      );
    }

    const isOpen = openSections.has(section.label);
    const sectionBadge = section.links.reduce((sum, l) => sum + (l.badge ? (badgeCounts[l.badge] ?? 0) : 0), 0);

    return (
      <Collapsible key={section.label} open={isOpen} onOpenChange={() => toggleSection(section.label)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 group/section cursor-pointer mt-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 group-hover/section:text-muted-foreground/60 transition-colors">
            {section.label}
          </span>
          <div className="flex items-center gap-1.5">
            {!isOpen && sectionBadge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-[9px] font-bold px-1 tabular-nums">
                {sectionBadge}
              </span>
            )}
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground/25 transition-transform duration-300 ease-in-out",
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

  const isOwner = role === 'owner';

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-in-out",
      "bg-card border-r border-border/40",
      collapsed ? "w-[60px]" : "w-[250px]",
      isOwner && "owner-sidebar"
    )}>
      {/* ── User identity header ── */}
      <div className={cn(
        "flex items-center shrink-0 border-b border-border/30",
        collapsed ? "px-2 py-3 justify-center" : "px-3 py-3 gap-3"
      )}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Avatar className={cn("h-8 w-8 border-2", isOwner ? "border-amber-500/40" : "border-primary/20")}>
                  <AvatarFallback className={cn("text-[11px] font-bold", isOwner ? "bg-amber-500/15 text-amber-400" : "bg-primary/8 text-primary")}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                  isOwner ? "bg-amber-500" : role === 'admin' ? "bg-accent-foreground" : "bg-muted-foreground"
                )} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <p className="font-semibold">{fullName || 'Usuario'}</p>
              <p className="text-muted-foreground">{userIdentifier}</p>
              <p className="mt-1 text-[10px] font-medium">{roleLabel}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="relative shrink-0">
              <Avatar className={cn("h-9 w-9 border-2", isOwner ? "border-amber-500/40" : "border-primary/20")}>
                <AvatarFallback className={cn("text-[11px] font-bold", isOwner ? "bg-amber-500/15 text-amber-400" : "bg-primary/8 text-primary")}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                isOwner ? "bg-amber-500" : role === 'admin' ? "bg-accent-foreground" : "bg-muted-foreground"
              )} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                {fullName || 'Usuario'}
              </p>
              <p className="text-[10px] text-muted-foreground/60 truncate leading-tight mt-0.5">
                {userIdentifier}
              </p>
              <span className={cn(
                "inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                roleBg
              )}>
                {roleLabel}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Search */}
      <div className={cn("shrink-0 border-b border-border/30", collapsed ? "px-2 py-2" : "px-3 py-2")}>
        <CommandPaletteTrigger collapsed={collapsed} />
      </div>

      {/* Company selector / Company context */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-border/30">
          {companies.length > 1 ? (
            <Select value={selectedCompanyId ?? ""} onValueChange={(id) => setPendingCompanyId(id)}>
              <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/30 rounded-xl hover:bg-muted/50 transition-colors">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : companies.length === 1 ? (
            <div className="flex items-center gap-2 px-1">
              <Building2 className="h-4 w-4 text-primary/60 shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate">{companies[0].name}</span>
            </div>
          ) : null}
        </div>
      )}
      {collapsed && companies.length === 1 && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="px-2 py-3 border-b border-border/30 flex justify-center">
              <Building2 className="h-4 w-4 text-primary/60" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium">{companies[0].name}</TooltipContent>
        </Tooltip>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleSections.map(renderSection)}

        {/* Owner admin hub link */}
        {role === 'owner' && (
          <>
            <div className="border-t border-sidebar-border/30 my-2" />
            {renderLink({ to: "/app/admin", icon: Wrench, label: "Administración", module: null, section: "", end: true })}
          </>
        )}
      </nav>

      {/* ── Footer ── */}
      <div className="px-2 py-2.5 border-t border-border/30 space-y-0.5 shrink-0">
        {/* Brand */}
        <div className={cn("flex items-center mb-1", collapsed ? "justify-center" : "px-3")}>
          {collapsed ? (
            <StaflyMark size={20} className="opacity-40" />
          ) : (
            <StaflyLogo size={20} muted />
          )}
        </div>

        {/* Theme */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-all duration-200 w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
              )}
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              {!collapsed && (theme === "dark" ? "Modo claro" : "Modo oscuro")}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</TooltipContent>}
        </Tooltip>

        {/* Collapse */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-all duration-200 w-full",
                collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
              )}
            >
              {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
              {!collapsed && "Colapsar"}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">{collapsed ? "Expandir" : "Colapsar"}</TooltipContent>}
        </Tooltip>

        {/* Sign out */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span className="w-full">
              <LogoutConfirmDialog onConfirm={signOut}>
                <button
                  className={cn(
                    "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground/60 hover:bg-destructive/8 hover:text-destructive transition-all duration-200 w-full",
                    collapsed ? "justify-center px-2 py-2" : "px-3 py-2"
                  )}
                >
                  <LogOut className="h-[18px] w-[18px]" />
                  {!collapsed && "Cerrar sesión"}
                </button>
              </LogoutConfirmDialog>
            </span>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right" className="text-xs">Cerrar sesión</TooltipContent>}
        </Tooltip>
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
