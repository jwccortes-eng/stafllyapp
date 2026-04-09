import { useEffect, useState, useMemo } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard, Users, CalendarDays, Tags, FileSpreadsheet,
  BarChart3, DollarSign, Building2,
  PanelLeftClose, PanelLeft, Settings2,
  Clock, MapPin, Megaphone, MessageCircle, ChevronDown,
  Inbox, Wrench, Lock, Sparkles, ClipboardList, Receipt, Brain,
  Map as MapIcon, ContactRound, Award, GitCompareArrows,
  FileText, Bell, UserPlus, Star, ArrowLeftRight, Globe,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "./AdminLayout";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StaflyMark } from "@/components/brand/StaflyBrand";
import CompanySwitcher from "@/components/CompanySwitcher";

interface LinkDef {
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
  badge?: string;
  roles?: string[];
}

/* ── Company-scoped links ── */
const COMPANY_LINKS: LinkDef[] = [
  // PRINCIPAL — core daily operations
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Principal" },
  { to: "/app/shifts", icon: CalendarDays, label: "Turnos", module: "shifts", section: "Principal" },
  { to: "/app/timeclock", icon: Clock, label: "Reloj", module: "shifts", section: "Principal" },
  { to: "/app/employees", icon: Users, label: "Trabajadores", module: "employees", section: "Principal" },
  { to: "/app/clients", icon: Building2, label: "Clientes", module: "clients", section: "Principal" },
  { to: "/app/locations", icon: MapPin, label: "Ubicaciones", module: "locations", section: "Principal" },
  { to: "/app/quality", icon: Star, label: "Calidad", module: null, section: "Principal" },

  // NÓMINA — payroll & finance
  { to: "/app/periods", icon: CalendarDays, label: "Periodos", module: "periods", section: "Nómina" },
  { to: "/app/compensation-validation", icon: Receipt, label: "Compensación", module: null, section: "Nómina" },
  { to: "/app/movements", icon: DollarSign, label: "Novedades", module: "movements", section: "Nómina" },
  { to: "/app/concepts", icon: Tags, label: "Conceptos", module: "concepts", section: "Nómina" },
  { to: "/app/payroll-reconciliation", icon: GitCompareArrows, label: "Reconciliación", module: null, section: "Nómina" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Reportes", module: "summary", section: "Nómina" },

  // MÁS — communication, monitoring & config
  { to: "/app/announcements", icon: Megaphone, label: "Anuncios", module: "announcements", section: "Más" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Más" },
  { to: "/app/live-map", icon: MapIcon, label: "Mapa en Vivo", module: null, section: "Más" },
  { to: "/app/notifications", icon: Bell, label: "Notificaciones", module: null, section: "Más" },
  { to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Más", badge: "tickets" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Configuración", module: null, section: "Más" },
  { to: "/app/migration", icon: ArrowLeftRight, label: "Migración", module: null, section: "Más", roles: ["developer", "owner"] },
];

/* ── Global/Platform-level links (developer/owner only) ── */
const GLOBAL_LINKS: LinkDef[] = [
  { to: "/app", icon: LayoutDashboard, label: "Panel Global", module: null, end: true, section: "Plataforma" },
  { to: "/app/companies", icon: Building2, label: "Empresas", module: null, section: "Plataforma" },
  { to: "/app/directory", icon: Users, label: "Directorio", module: null, section: "Plataforma" },
  { to: "/app/activity", icon: FileText, label: "Actividad", module: null, section: "Plataforma" },
  { to: "/app/notifications", icon: Bell, label: "Notificaciones", module: null, section: "Plataforma" },
  { to: "/app/admin", icon: Wrench, label: "Administración", module: null, section: "Herramientas" },
  { to: "/app/billing", icon: Receipt, label: "Facturación", module: null, section: "Herramientas" },
  { to: "/app/system-health", icon: BarChart3, label: "Sistema", module: null, section: "Herramientas" },
];

const COMPANY_SECTION_ORDER = ["Principal", "Nómina", "Más"];
const GLOBAL_SECTION_ORDER = ["Plataforma", "Herramientas"];

export default function AdminSidebar() {
  const { signOut, role, hasModuleAccess, user, fullName } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive, isGlobalMode, canUseGlobalMode } = useCompany();
  const { canAccessModule, requiredPlanForModule, isTrial, trialDaysLeft } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, setCollapsed } = useSidebarCollapsed();

  const [openSections, setOpenSections] = useState<Set<string>>(new Set([...COMPANY_SECTION_ORDER, ...GLOBAL_SECTION_ORDER]));
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

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

  const activeLinks = isGlobalMode ? GLOBAL_LINKS : COMPANY_LINKS;
  const activeSectionOrder = isGlobalMode ? GLOBAL_SECTION_ORDER : COMPANY_SECTION_ORDER;

  const isLinkVisible = (link: LinkDef) => {
    if (isGlobalMode) return true; // Global mode shows all platform links
    if (link.module) {
      if (!isModuleActive(link.module)) return false;
      if (role === 'developer' || role === 'owner' || role === 'company_owner' || role === 'admin') return true;
      if (role === 'manager' || role === 'supervisor') return hasModuleAccess(link.module, 'view');
      return false;
    }
    if (link.roles && !link.roles.includes(role ?? '')) return false;
    return true;
  };

  const isModuleLocked = (module: string | null): boolean => {
    if (!module || isGlobalMode) return false;
    return !canAccessModule(module);
  };

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };

  const isOwner = role === 'developer' || role === 'owner';

  const visibleSections = useMemo(() => {
    const sectionMap = new Map<string, LinkDef[]>();
    for (const link of activeLinks) {
      if (!isLinkVisible(link)) continue;
      if (!sectionMap.has(link.section)) sectionMap.set(link.section, []);
      sectionMap.get(link.section)!.push(link);
    }
    const result: { label: string; links: LinkDef[] }[] = [];
    for (const sec of activeSectionOrder) {
      if (sectionMap.has(sec)) result.push({ label: sec, links: sectionMap.get(sec)! });
    }
    return result;
  }, [role, selectedCompanyId, isGlobalMode]);

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
      if (locked) { e.preventDefault(); navigate("/app/pricing"); }
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
              : active ? "sidebar-link-active" : "sidebar-link-idle"
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
                <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-primary/[0.08] text-primary">
                  {requiredPlan}
                </span>
              )}
              {!locked && badge > 0 && (
                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive/[0.1] text-destructive text-[10px] font-bold tabular-nums px-1">
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
            {locked && requiredPlan && <span className="text-[9px] font-bold text-primary">🔒 {requiredPlan}</span>}
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
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-1.5 group/section cursor-pointer mt-4 first:mt-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 group-hover/section:text-muted-foreground/60 transition-colors select-none">
            {section.label}
          </span>
          <div className="flex items-center gap-1.5">
            {!isOpen && sectionBadge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-destructive/[0.1] text-destructive text-[9px] font-bold px-1 tabular-nums">
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
      {/* ── Brand + Company Switcher ── */}
      <div className={cn(
        "shrink-0 border-b border-border/40",
        collapsed ? "px-2 py-3 flex justify-center" : "px-3 py-3"
      )}>
        <CompanySwitcher collapsed={collapsed} />
      </div>

      {/* ── Global mode banner ── */}
      {isGlobalMode && !collapsed && (
        <div className="mx-3 mt-3 rounded-xl border border-accent bg-accent/30 px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-accent-foreground" />
            <span className="text-[11px] font-bold text-accent-foreground">Modo Global</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
            Selecciona una empresa para operar en contexto.
          </p>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {visibleSections.map(renderSection)}

        {/* Admin link only in company mode for owners */}
        {!isGlobalMode && isOwner && (
          <>
            <div className="border-t border-border/20 my-2.5" />
            {renderLink({ to: "/app/admin", icon: Wrench, label: "Administración", module: null, section: "", end: true })}
          </>
        )}
      </nav>

      {/* Trial banner */}
      {isTrial && trialDaysLeft !== null && !collapsed && !isGlobalMode && (
        <div className="mx-3 mb-2 rounded-xl border border-primary/15 bg-primary/[0.05] px-3 py-2.5 shrink-0">
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

      {/* ── Collapse toggle ── */}
      <div className="px-2 py-2 border-t border-border/40 shrink-0">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex items-center justify-center rounded-xl text-muted-foreground/50 hover:bg-accent/40 hover:text-foreground transition-all duration-200 w-full h-8",
                !collapsed && "gap-2 px-3 justify-start"
              )}
            >
              {collapsed ? <PanelLeft className="h-[15px] w-[15px]" /> : <PanelLeftClose className="h-[15px] w-[15px]" />}
              {!collapsed && <span className="text-[12px]">Colapsar</span>}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="text-xs">Expandir</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}