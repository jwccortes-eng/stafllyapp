import {
  LayoutDashboard, CalendarDays, Upload, DollarSign, FileSpreadsheet,
  BarChart3, Users, Tags, ContactRound, Building2,
  Clock, MapPin, Megaphone, MessageCircle, ScanEye, Inbox, Bell, Monitor,
  MessageSquare, Settings2, Home, User, Wrench, UserPlus, FileText, GitCompareArrows,
  ClipboardList, Receipt, Brain, Map as MapIcon, Award, CalendarCheck, ArrowLeftRight,
  Banknote, ShieldCheck, Scale, Zap, UserPlus2, Radio, FolderOpen,
} from "lucide-react";

export type MobileVisibility = "primary" | "secondary" | "hidden";
export type MobileSection = "Inicio" | "Operación" | "Personas" | "Comunicación";

export interface NavItem {
  id: string;
  to: string;
  icon: any;
  label: string;
  module: string | null;
  end?: boolean;
  section: string;
  badge?: string;
  roles?: string[]; // which roles can see this
  /** Mobile-only visibility flag. Desktop ignores this. Default treated as "secondary". */
  mobile?: MobileVisibility;
  /** Mobile-only grouping (Spanish). Desktop ignores this. */
  mobileSection?: MobileSection;
}

/* ── Admin / Manager nav items ── */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Home", mobile: "secondary", mobileSection: "Inicio" },
  { id: "command-center", to: "/app/command-center", icon: Radio, label: "Command Center", module: null, section: "Home", badge: "NEW", mobile: "primary", mobileSection: "Operación" },
  { id: "control-tower", to: "/app/dev-command-center", icon: ShieldCheck, label: "Control Tower", module: null, section: "Home", badge: "OWNER", roles: ["developer", "owner"], mobile: "secondary", mobileSection: "Inicio" },
  { id: "staffing-center", to: "/app/staffing-center", icon: Radio, label: "Staffing Center", module: "shifts", section: "Operations", badge: "NEW", mobile: "hidden" },
  { id: "ops-center", to: "/app/ops-center", icon: Radio, label: "Ops Center", module: "shifts", section: "Operations", mobile: "primary", mobileSection: "Operación" },
  { id: "front-desk", to: "/app/front-desk", icon: ContactRound, label: "Front Desk", module: null, section: "Operations", mobile: "primary", mobileSection: "Operación" },
  { id: "shifts", to: "/app/shifts", icon: CalendarDays, label: "Shifts", module: "shifts", section: "Operations", mobile: "primary", mobileSection: "Operación" },
  { id: "timeclock", to: "/app/timeclock", icon: Clock, label: "Time Clock", module: "shifts", section: "Operations", mobile: "primary", mobileSection: "Operación" },
  { id: "clients", to: "/app/clients", icon: Building2, label: "Clients", module: "clients", section: "Operations", mobile: "secondary", mobileSection: "Operación" },
  { id: "locations", to: "/app/locations", icon: MapPin, label: "Locations", module: "locations", section: "Operations", mobile: "secondary", mobileSection: "Operación" },
  { id: "periods", to: "/app/periods", icon: CalendarDays, label: "Periods", module: "periods", section: "Payroll", mobile: "hidden" },
  { id: "import", to: "/app/import", icon: Upload, label: "Import", module: "import", section: "Payroll", mobile: "hidden" },
  { id: "movements", to: "/app/movements", icon: DollarSign, label: "Adjustments", module: "movements", section: "Payroll", mobile: "hidden" },
  { id: "summary", to: "/app/summary", icon: FileSpreadsheet, label: "Reports", module: "summary", section: "Payroll", mobile: "hidden" },
  { id: "comparison", to: "/app/comparison", icon: GitCompareArrows, label: "Comparison", module: "shifts", section: "Operations", mobile: "hidden" },
  { id: "payroll-settings", to: "/app/payroll-settings", icon: Settings2, label: "Payroll Settings", module: null, section: "Management", mobile: "hidden" },
  { id: "w9", to: "/app/w9", icon: FileText, label: "W-9", module: "employees", section: "Tax", mobile: "hidden" },
  { id: "1099", to: "/app/1099", icon: FileText, label: "1099-NEC", module: "employees", section: "Tax", mobile: "hidden" },
  { id: "employees", to: "/app/employees", icon: Users, label: "Workers", module: "employees", section: "Management", mobile: "primary", mobileSection: "Personas" },
  { id: "documents", to: "/app/documents", icon: FolderOpen, label: "Documents", module: null, section: "Management", mobile: "primary", mobileSection: "Personas" },
  { id: "directory", to: "/app/directory", icon: ContactRound, label: "Directory", module: "employees", section: "Operations", mobile: "secondary", mobileSection: "Personas" },
  { id: "concepts", to: "/app/concepts", icon: Tags, label: "Concepts", module: "concepts", section: "Management", mobile: "hidden" },
  { id: "announcements", to: "/app/announcements", icon: Megaphone, label: "Announcements", module: "announcements", section: "Operations", mobile: "primary", mobileSection: "Comunicación" },
  { id: "chat", to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Operations", mobile: "primary", mobileSection: "Comunicación" },
  { id: "tickets", to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Intake", badge: "tickets", mobile: "hidden" },
  { id: "notifications", to: "/app/notifications", icon: Bell, label: "Notifications", module: null, section: "Management", mobile: "primary", mobileSection: "Comunicación" },
  { id: "invite", to: "/app/invite", icon: UserPlus, label: "Invitations", module: null, section: "Management", mobile: "primary", mobileSection: "Personas" },
  { id: "admin-hub", to: "/app/admin", icon: Wrench, label: "Admin", module: null, section: "Administration", roles: ["owner"], mobile: "hidden" },
  { id: "service-requests", to: "/app/service-requests", icon: ClipboardList, label: "Requests · Intake", module: null, section: "Intake", badge: "NEW", mobile: "hidden" },
  { id: "staffing-requests", to: "/app/staffing-requests", icon: ClipboardList, label: "Staffing Requests", module: null, section: "Intake", mobile: "hidden" },
  { id: "invoices", to: "/app/invoices", icon: Receipt, label: "Invoices", module: null, section: "Commercial", mobile: "hidden" },
  { id: "service-categories", to: "/app/service-categories", icon: Tags, label: "Service Categories", module: null, section: "Administration", mobile: "hidden" },
  { id: "ai-workforce", to: "/app/ai-workforce", icon: Brain, label: "AI Workforce", module: null, section: "Operations", mobile: "hidden" },
  { id: "live-map", to: "/app/live-map", icon: MapIcon, label: "Live Map", module: null, section: "Operations", mobile: "primary", mobileSection: "Operación" },
  { id: "leaderboard", to: "/app/leaderboard", icon: Award, label: "Leaderboard", module: null, section: "Operations", mobile: "hidden" },
  { id: "kiosk", to: "/app/kiosk", icon: Monitor, label: "Kiosk", module: null, section: "Operations", mobile: "hidden" },
  { id: "attendance", to: "/app/attendance", icon: ScanEye, label: "Attendance", module: null, section: "Operations", mobile: "primary", mobileSection: "Operación" },
  { id: "migration", to: "/app/migration", icon: ArrowLeftRight, label: "Migration", module: null, section: "Administration", roles: ["owner"], mobile: "hidden" },
  { id: "payroll-review-queue", to: "/app/payroll-review-queue", icon: ScanEye, label: "Centro de Validación", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"], mobile: "hidden" },
  { id: "staged-recon", to: "/app/payroll-reconciliation", icon: GitCompareArrows, label: "Reconciliation", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"], mobile: "hidden" },
  { id: "advances-loans", to: "/app/advances-loans", icon: Banknote, label: "Advances", module: null, section: "Payroll", mobile: "hidden" },
  { id: "comp-validation", to: "/app/compensation-validation", icon: DollarSign, label: "Compensation", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"], mobile: "hidden" },
  { id: "pilot-close", to: "/app/payroll-pilot-close", icon: ShieldCheck, label: "Pilot Close", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"], mobile: "hidden" },
  { id: "payroll-recon", to: "/app/payroll-reconciliation", icon: Scale, label: "Payroll Recon", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"], mobile: "hidden" },
  { id: "comp-adoption", to: "/app/compensation-adoption", icon: Zap, label: "Comp. Adoption", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"], mobile: "hidden" },
  { id: "applications", to: "/app/applications", icon: UserPlus2, label: "Applications", module: null, section: "Management", mobile: "primary", mobileSection: "Personas" },
];

/** Desktop default pinned dock — unchanged. */
export const ADMIN_DEFAULT_PINS = ["dashboard", "shifts", "employees", "movements"];

/** Mobile default pinned dock — operational tools only. */
export const ADMIN_DEFAULT_PINS_MOBILE = ["shifts", "attendance", "employees", "documents", "front-desk", "live-map"];

/* ── Employee portal nav items ── */
export const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { id: "portal-home", to: "/portal", icon: Home, label: "Home", module: null, end: true, section: "Main" },
  { id: "portal-clock", to: "/portal/clock", icon: Clock, label: "Clock", module: null, section: "Main" },
  { id: "portal-shifts", to: "/portal/shifts", icon: CalendarDays, label: "Shifts", module: null, section: "Main" },
  { id: "portal-availability", to: "/portal/availability", icon: CalendarCheck, label: "Availability", module: null, section: "Main" },
  { id: "portal-chat", to: "/portal/chat", icon: MessageSquare, label: "Chat", module: null, section: "Main" },
  { id: "portal-parceros", to: "/parceros", icon: Users, label: "Parceros", module: null, section: "Community" },
  { id: "portal-profile", to: "/portal/profile", icon: User, label: "Profile", module: null, section: "Main" },
];

export const EMPLOYEE_DEFAULT_PINS = ["portal-home", "portal-clock", "portal-shifts", "portal-availability", "portal-profile"];
