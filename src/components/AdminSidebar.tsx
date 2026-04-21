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
  FileText, Bell, UserPlus, Star, ArrowLeftRight, Globe, ShieldCheck,
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
  // MAIN — core daily operations
  { to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Main" },
  { to: "/app/shifts", icon: CalendarDays, label: "Shifts", module: "shifts", section: "Main" },
  { to: "/app/timeclock", icon: Clock, label: "Time Clock", module: "shifts", section: "Main" },
  { to: "/app/employees", icon: Users, label: "Workers", module: "employees", section: "Main" },
  { to: "/app/workforce", icon: ShieldCheck, label: "Workforce", module: "employees", section: "Main", badge: "new" },
  { to: "/app/clients", icon: Building2, label: "Clients", module: "clients", section: "Main" },
  { to: "/app/locations", icon: MapPin, label: "Locations", module: "locations", section: "Main" },
  { to: "/app/quality", icon: Star, label: "Reviews", module: null, section: "Main" },

  // PAYROLL — payroll & finance
  { to: "/app/periods", icon: CalendarDays, label: "Periods", module: "periods", section: "Payroll" },
  { to: "/app/compensation-validation", icon: Receipt, label: "Compensation", module: null, section: "Payroll" },
  { to: "/app/movements", icon: DollarSign, label: "Adjustments", module: "movements", section: "Payroll" },
  { to: "/app/concepts", icon: Tags, label: "Concepts", module: "concepts", section: "Payroll" },
  { to: "/app/payroll-reconciliation", icon: GitCompareArrows, label: "Reconciliation", module: null, section: "Payroll" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Reports", module: "summary", section: "Payroll" },

  // INVOICING — tenant billing to their own clients
  { to: "/app/invoicing/clients", icon: Receipt, label: "Billing Clients", module: "tenant_invoicing", section: "Invoicing", badge: "new" },
  { to: "/app/invoicing/service-blocks", icon: ClipboardList, label: "Service Blocks", module: "tenant_invoicing", section: "Invoicing", badge: "new" },

  // MORE — communication, monitoring & config
  { to: "/app/announcements", icon: Megaphone, label: "Announcements", module: "announcements", section: "More" },
  { to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "More" },
  { to: "/app/live-map", icon: MapIcon, label: "Live Map", module: null, section: "More" },
  { to: "/app/notifications", icon: Bell, label: "Notifications", module: null, section: "More" },
  { to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "More", badge: "tickets" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Settings", module: null, section: "More" },
  { to: "/app/migration", icon: ArrowLeftRight, label: "Migration", module: null, section: "More", roles: ["developer", "owner"] },
];

/* ── Global/Platform-level links (developer/owner only) ── */
const GLOBAL_LINKS: LinkDef[] = [
  { to: "/app", icon: LayoutDashboard, label: "Global Panel", module: null, end: true, section: "Platform" },
  { to: "/app/companies", icon: Building2, label: "Companies", module: null, section: "Platform" },
  { to: "/app/directory", icon: Users, label: "Directory", module: null, section: "Platform" },
  { to: "/app/activity", icon: FileText, label: "Activity", module: null, section: "Platform" },
  { to: "/app/notifications", icon: Bell, label: "Notifications", module: null, section: "Platform" },
  { to: "/app/admin", icon: Wrench, label: "Administration", module: null, section: "Tools" },
  { to: "/app/billing", icon: Receipt, label: "Billing", module: null, section: "Tools" },
  { to: "/app/system-health", icon: BarChart3, label: "System", module: null, section: "Tools" },
];

const COMPANY_SECTION_ORDER = ["Main", "Payroll", "Invoicing", "More"];
const GLOBAL_SECTION_ORDER = ["Platform", "Tools"];

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
            <span className="text-[11px] font-bold text-accent-foreground">Global Mode</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
            Select a company to operate in context.
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
            {renderLink({ to: "/app/admin", icon: Wrench, label: "Administration", module: null, section: "", end: true })}
          </>
        )}
      </nav>

      {/* Trial banner */}
      {isTrial && trialDaysLeft !== null && !collapsed && !isGlobalMode && (
        <div className="mx-3 mb-2 rounded-xl border border-primary/15 bg-primary/[0.05] px-3 py-2.5 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold text-primary">Pro Trial</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {trialDaysLeft > 0
              ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial.`
              : 'Your trial has expired.'}
          </p>
          <button
            onClick={() => navigate("/app/pricing")}
            className="mt-1.5 text-[10px] font-semibold text-primary hover:underline"
          >
            View plans →
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
              {!collapsed && <span className="text-[12px]">Collapse</span>}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="text-xs">Expand</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}