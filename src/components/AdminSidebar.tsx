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
  Monitor, Radio, UserPlus2, Banknote, Scale, FileSearch, ScanEye, Radar, Upload,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { isAdminLevelRole } from "@/lib/roles";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "./AdminLayout";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StaflyMark } from "@/components/brand/StaflyBrand";
import { ContextSwitcher } from "@/components/context/ContextSwitcher";
import { useT } from "@/i18n";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

const SECTION_I18N_KEY: Record<string, string> = {
  "Daily Operations": "sidebar.section.daily_operations",
  "Team": "sidebar.section.team",
  "Clients & Locations": "sidebar.section.clients_locations",
  "Payroll & Finance": "sidebar.section.payroll_finance",
  "Reports": "sidebar.section.reports",
  "Communication": "sidebar.section.communication",
  "Settings": "sidebar.section.configuration",
};

// Per-link i18n keys. Internal `label` stays English (used as identifier + EN value).
// ES strings live in src/i18n/dictionaries/es/app.ts under `sidebar.link.*`.
// Adding a link without a key here just falls back to its English label (safe).
const LINK_I18N_KEY: Record<string, string> = {
  "Command Center": "sidebar.link.command_center",
  "Today's Operations": "sidebar.link.todays_operations",
  "Shifts": "sidebar.link.shifts",
  "Import Services": "sidebar.link.import_services",
  "Attendance": "sidebar.link.attendance",
  "Time Clock": "sidebar.link.time_clock",
  "Live Map": "sidebar.link.live_map",
  "Front Desk": "sidebar.link.front_desk",
  "Team": "sidebar.link.team",
  "Documents": "sidebar.link.documents",
  "Document Inbox": "sidebar.link.document_inbox",
  "Compliance": "sidebar.link.compliance",
  "Applications": "sidebar.link.applications",
  "Referrals": "sidebar.link.referrals",
  "Invitations": "sidebar.link.invitations",
  "Requests": "sidebar.link.requests",
  "Clients": "sidebar.link.clients",
  "Locations": "sidebar.link.locations",
  "Validation Center": "sidebar.link.validation_center",
  "Periods": "sidebar.link.periods",
  "Compensation": "sidebar.link.compensation",
  "Adjustments": "sidebar.link.adjustments",
  "Advances": "sidebar.link.advances",
  "Concepts": "sidebar.link.concepts",
  "Reconciliation": "sidebar.link.reconciliation",
  "Payroll Reports": "sidebar.link.payroll_reports",
  "Import History": "sidebar.link.import_history",
  "Announcements": "sidebar.link.announcements",
  "Messages": "sidebar.link.messages",
  "Notifications": "sidebar.link.notifications",
  "Reviews": "sidebar.link.reviews",
  "Payroll Settings": "sidebar.link.payroll_settings",
  "Kiosk": "sidebar.link.kiosk",
  "Administration": "sidebar.link.administration",
};

function translateLinkLabel(label: string, t: (k: string) => string): string {
  const key = LINK_I18N_KEY[label];
  if (!key) return label;
  const v = t(key);
  // useT.t returns the key itself when missing — fall back to English label.
  return v === key ? label : v;
}

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

/* ── Company-scoped links.
 * UX PASS (App Shell): agrupación semántica en 5 grupos operativos en español.
 * Sólo cambian los grupos y su orden: rutas, módulos y roles quedan intactos. */
const COMPANY_LINKS: LinkDef[] = [
  // A) OPERACIÓN — el día a día
  { to: "/app/ops", icon: Radar, label: "Ops Cockpit", module: null, section: "Operación" },
  { to: "/app", icon: LayoutDashboard, label: "Home", module: null, end: true, section: "Operación" },
  { to: "/app/command-center", icon: Radio, label: "Command Center", module: null, section: "Operación" },
  { to: "/app/shifts", icon: CalendarDays, label: "Shifts", module: "shifts", section: "Operación" },
  // UX Entry Pass — Smart Service Intake vive en la ruta canónica /app/import-schedule.
  { to: "/app/import-schedule", icon: Upload, label: "Import Services", module: "import", section: "Operación" },
  { to: "/app/timeclock", icon: Clock, label: "Time Clock", module: "shifts", section: "Operación" },
  { to: "/app/attendance", icon: ShieldCheck, label: "Attendance", module: null, section: "Operación" },
  { to: "/app/live-map", icon: MapIcon, label: "Live Map", module: null, section: "Operación" },
  { to: "/app/front-desk", icon: ContactRound, label: "Front Desk", module: null, section: "Operación" },

  // B) PERSONAS
  { to: "/app/employees", icon: Users, label: "Team", module: "employees", section: "Personas" },
  { to: "/app/documents", icon: FileText, label: "Documents", module: null, section: "Personas", badge: "documents_review" },
  { to: "/app/document-intake", icon: Inbox, label: "Document Inbox", module: null, section: "Personas" },
  { to: "/app/compliance-center", icon: ShieldCheck, label: "Compliance", module: null, section: "Personas" },
  { to: "/app/applications", icon: UserPlus2, label: "Applications", module: null, section: "Personas" },
  { to: "/app/referrals", icon: UserPlus2, label: "Referrals", module: null, section: "Personas" },
  { to: "/app/invite", icon: UserPlus, label: "Invitations", module: null, section: "Personas" },
  { to: "/app/requests", icon: Inbox, label: "Requests", module: null, section: "Personas", badge: "tickets" },

  // C) CLIENTES
  { to: "/app/clients", icon: Building2, label: "Clients", module: "clients", section: "Clientes" },
  { to: "/app/locations", icon: MapPin, label: "Locations", module: "locations", section: "Clientes" },
  { to: "/app/service-requests", icon: ClipboardList, label: "Service Requests", module: null, section: "Clientes" },
  { to: "/app/invoicing/clients", icon: Receipt, label: "Billing Clients", module: "tenant_invoicing", section: "Clientes" },
  { to: "/app/invoicing/service-blocks", icon: ClipboardList, label: "Service Blocks", module: "tenant_invoicing", section: "Clientes" },

  // D) PAYROLL
  { to: "/app/payroll-review-queue", icon: ScanEye, label: "Validation Center", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },
  { to: "/app/periods", icon: CalendarDays, label: "Periods", module: "periods", section: "Payroll" },
  { to: "/app/compensation-validation", icon: DollarSign, label: "Compensation", module: null, section: "Payroll" },
  { to: "/app/movements", icon: DollarSign, label: "Adjustments", module: "movements", section: "Payroll" },
  { to: "/app/advances-loans", icon: Banknote, label: "Advances", module: null, section: "Payroll" },
  { to: "/app/concepts", icon: Tags, label: "Concepts", module: "concepts", section: "Payroll" },
  { to: "/app/payroll-reconciliation", icon: GitCompareArrows, label: "Reconciliation", module: null, section: "Payroll" },
  { to: "/app/weekly-payroll-reconciliation", icon: Scale, label: "Weekly Recon.", module: null, section: "Payroll" },
  { to: "/app/invoicing/invoices", icon: FileText, label: "Invoices", module: "tenant_invoicing", section: "Payroll" },
  { to: "/app/summary", icon: FileSpreadsheet, label: "Payroll Reports", module: "summary", section: "Payroll" },
  { to: "/app/import-review", icon: FileSearch, label: "Import History", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },

  // E) EMPRESA — comunicación + configuración (grupos huérfanos consolidados)
  { to: "/app/announcements", icon: Megaphone, label: "Announcements", module: "announcements", section: "Empresa" },
  { to: "/app/chat", icon: MessageCircle, label: "Messages", module: null, section: "Empresa" },
  { to: "/app/notifications", icon: Bell, label: "Notifications", module: null, section: "Empresa" },
  { to: "/app/quality", icon: Star, label: "Reviews", module: null, section: "Empresa" },
  { to: "/app/payroll-settings", icon: Settings2, label: "Payroll Settings", module: null, section: "Empresa" },
  { to: "/app/kiosk", icon: Monitor, label: "Kiosk", module: null, section: "Empresa" },
  { to: "/app/admin", icon: Wrench, label: "Administration", module: null, section: "Empresa", roles: ["developer", "owner", "company_owner"] },
  { to: "/app/migration", icon: ArrowLeftRight, label: "Migration (internal)", module: null, section: "Empresa", roles: ["developer", "owner"] },
];

/* ── Global/Platform-level links (developer/owner only).
 * Notifications + Administration intentionally NOT duplicated here — they live
 * in the Company sidebar (Comunicación / Empresa) and reuse the same routes. */
const GLOBAL_LINKS: LinkDef[] = [
  { to: "/app", icon: LayoutDashboard, label: "Global Panel", module: null, end: true, section: "Plataforma" },
  { to: "/app/companies", icon: Building2, label: "Companies", module: null, section: "Plataforma" },
  { to: "/app/directory", icon: Users, label: "Directory", module: null, section: "Plataforma" },
  { to: "/app/activity", icon: FileText, label: "Activity", module: null, section: "Plataforma" },
  { to: "/app/billing", icon: Receipt, label: "Billing", module: null, section: "Empresa" },
  { to: "/app/system-health", icon: BarChart3, label: "System Health", module: null, section: "Empresa" },
];

const COMPANY_SECTION_ORDER = ["Operación", "Personas", "Clientes", "Payroll", "Empresa"];
const GLOBAL_SECTION_ORDER = ["Plataforma", "Empresa"];



export default function AdminSidebar() {
  const { signOut, role: globalRole, hasModuleAccess, user, fullName, getRoleForCompany, canAccessAdminForCompany } = useAuth();
  const { companies, selectedCompanyId, setSelectedCompanyId, isModuleActive, isGlobalMode, canUseGlobalMode } = useCompany();
  // Tenant-scoped role: NEVER use global role to gate per-tenant UI.
  // In Global Mode (developer/owner platform view), fall back to global role.
  const role = isGlobalMode ? globalRole : getRoleForCompany(selectedCompanyId);
  const isAdminRole = isAdminLevelRole(role);
  const { canAccessModule, requiredPlanForModule, isTrial, trialDaysLeft } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const { t: tI18n } = useT();

  const SIDEBAR_OPEN_KEY = "stafly:sidebar:open-sections:v1";
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(SIDEBAR_OPEN_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch { /* noop */ }
    // Default: only the first (daily ops) group open; others collapsed for less clutter.
    return new Set(["Operación", "Plataforma"]);
  });
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!selectedCompanyId) return;
    async function fetchBadges() {
      const [ticketsRes, shiftReqRes, pendingDocsRes, rejectedDocsRes, pendingOnbDocsRes] = await Promise.all([
        supabase.from("employee_tickets").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).in("status", ["new", "in_progress"]),
        supabase.from("shift_assignments").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("status", "pending"),
        (supabase as any).from("employee_documents").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("review_status", "pending"),
        (supabase as any).from("employee_documents").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).eq("review_status", "rejected"),
        (supabase as any).from("employee_onboarding_documents").select("id", { count: "exact", head: true })
          .eq("company_id", selectedCompanyId!).in("status", ["pending", "rejected"]),
      ]);
      setBadgeCounts({
        tickets: ticketsRes.count ?? 0,
        shift_requests: shiftReqRes.count ?? 0,
        documents_review: (pendingDocsRes?.count ?? 0) + (rejectedDocsRes?.count ?? 0) + (pendingOnbDocsRes?.count ?? 0),
      });
    }
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [selectedCompanyId]);

  const activeLinks = isGlobalMode ? GLOBAL_LINKS : COMPANY_LINKS;
  const activeSectionOrder = isGlobalMode ? GLOBAL_SECTION_ORDER : COMPANY_SECTION_ORDER;

  /**
   * P0 Legacy Bypass Retirement — la visibilidad se decide por PERMISO
   * efectivo en la empresa activa, nunca por `role === 'admin'`.
   */
  const isLinkVisible = (link: LinkDef) => {
    if (isGlobalMode) return true; // Global mode shows all platform links
    if (permissionStatus !== "ready") return false;
    if (link.module && !isModuleActive(link.module)) return false;
    if (link.module && !isPlatformStaff && !canAccessModule(link.module)) return false;
    return isNavItemVisible({ to: link.to, canAny, isPlatformStaff });
  };

  const isModuleLocked = (module: string | null): boolean => {
    if (!module || isGlobalMode) return false;
    return !canAccessModule(module);
  };

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  };



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
      try { window.localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify([...next])); } catch { /* noop */ }
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
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
            locked
              ? "text-sidebar-foreground/25 cursor-pointer hover:bg-sidebar-accent/30"
              : active ? "sidebar-link-active" : "sidebar-link-idle"
          )}
        >
          {active && !locked && (
            <span className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-e-full bg-sidebar-primary transition-all" />
          )}
          <div className="relative flex items-center justify-center">
            {locked ? (
              <Lock className="h-[17px] w-[17px] shrink-0 text-sidebar-foreground/25" />
            ) : (
              <link.icon className={cn(
                "h-[17px] w-[17px] shrink-0 transition-colors duration-200",
                active ? "text-sidebar-primary" : "text-sidebar-foreground/45 group-hover/link:text-sidebar-foreground/85"
              )} />
            )}
            {collapsed && badge > 0 && !locked && (
              <span className="absolute -top-1 -end-1 h-2 w-2 rounded-full bg-rose-400/80 ring-2 ring-sidebar/80" />
            )}
          </div>
          {!collapsed && (
            <>
              <span className={cn("flex-1 truncate leading-tight", locked && "line-through decoration-sidebar-foreground/20")}>{translateLinkLabel(link.label, tI18n)}</span>
              {locked && requiredPlan && (
                <span className="ms-auto shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-sidebar-primary/15 text-sidebar-primary">
                  {requiredPlan}
                </span>
              )}
              {!locked && badge > 0 && (
                <span className="ms-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-semibold tabular-nums px-1.5 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/20">
                  {badge > 9 ? "9+" : badge}
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
            {translateLinkLabel(link.label, tI18n)}
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

  const renderSection = (section: { label: string; links: LinkDef[] }, idx: number) => {
    if (collapsed) {
      return (
        <div key={section.label} className="space-y-0.5">
          {idx > 0 && <div className="sidebar-divider" />}
          {section.links.map(l => renderLink(l))}
        </div>
      );
    }

    const isOpen = openSections.has(section.label);
    const sectionBadge = section.links.reduce((sum, l) => sum + (l.badge ? (badgeCounts[l.badge] ?? 0) : 0), 0);

    return (
      <Collapsible key={section.label} open={isOpen} onOpenChange={() => toggleSection(section.label)}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 pt-4 pb-1.5 group/section cursor-pointer first:pt-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40 group-hover/section:text-sidebar-foreground/65 transition-colors select-none">
            {(() => { const k = SECTION_I18N_KEY[section.label]; return k ? tI18n(k) : section.label; })()}
          </span>
          <div className="flex items-center gap-1.5">
            {!isOpen && sectionBadge > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-100 text-[9px] font-semibold px-1.5 tabular-nums dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/20">
                {sectionBadge > 9 ? "9+" : sectionBadge}
              </span>
            )}
            <ChevronDown className={cn(
              "h-3 w-3 text-sidebar-foreground/30 transition-transform duration-300 ease-in-out",
              isOpen && "rotate-180"
            )} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 mt-1 overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
          {section.links.map(l => renderLink(l))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside
      data-stafly-sidebar
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col transition-all duration-300 ease-in-out",
        "border-r border-sidebar-border/70 shadow-sm",
        "bg-sidebar/85 backdrop-blur-xl text-sidebar-foreground",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      {/* ── Marca Stafly + compañía activa (identidad única del shell) ── */}
      <div className={cn(
        "shrink-0 border-b border-sidebar-border/40",
        collapsed ? "px-2 py-3 flex flex-col items-center gap-2.5" : "px-3 pt-3.5 pb-3.5 space-y-2.5"
      )}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2 px-1")}>
          <StaflyMark size={collapsed ? 22 : 20} />
          {!collapsed && (
            <span className="text-[13px] font-bold tracking-tight text-sidebar-foreground">
              Stafly
            </span>
          )}
        </div>
        <ContextSwitcher placement="sidebar" collapsed={collapsed} />
      </div>


      {/* ── Global mode banner ── */}
      {isGlobalMode && !collapsed && (
        <div className="mx-3 mt-3 rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-sidebar-primary" />
            <span className="text-[11px] font-bold text-sidebar-primary">Global Mode</span>
          </div>
          <p className="text-[10px] text-sidebar-foreground/55 mt-0.5 leading-tight">
            Select a company to operate in context.
          </p>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto sidebar-scroll">
        {visibleSections.map((s, i) => renderSection(s, i))}

        {/* Administración now lives inside the "Sistema" group (StaflyCore IA v1). */}
      </nav>

      {/* Trial banner */}
      {isTrial && trialDaysLeft !== null && !collapsed && !isGlobalMode && (
        <div className="mx-3 mb-2 rounded-xl border border-sidebar-primary/25 bg-sidebar-primary/10 px-3 py-2.5 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-sidebar-primary" />
            <span className="text-[11px] font-bold text-sidebar-primary">Pro Trial</span>
          </div>
          <p className="text-[10px] text-sidebar-foreground/60 leading-tight">
            {trialDaysLeft > 0
              ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial.`
              : 'Your trial has expired.'}
          </p>
          <button
            onClick={() => navigate("/app/pricing")}
            className="mt-1.5 text-[10px] font-semibold text-sidebar-primary hover:underline"
          >
            View plans →
          </button>
        </div>
      )}

      {/* ── Language switcher (inline) ── */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <LanguageSwitcher variant="inline" className="w-full justify-center" />
        </div>
      )}

      {/* ── Collapse toggle ── */}
      <div className="px-2 py-2 border-t border-sidebar-border/40 shrink-0">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex items-center justify-center rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-all duration-200 w-full h-8",
                !collapsed && "gap-2 px-3 justify-start"
              )}
            >
              {collapsed ? <PanelLeft className="h-[15px] w-[15px]" /> : <PanelLeftClose className="h-[15px] w-[15px]" />}
              {!collapsed && <span className="text-[12px]">{tI18n("sidebar.collapse")}</span>}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="text-xs">{tI18n("sidebar.expand")}</TooltipContent>
          )}
        </Tooltip>
      </div>
    </aside>
  );
}