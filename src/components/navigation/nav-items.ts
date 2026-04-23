import {
  LayoutDashboard, CalendarDays, Upload, DollarSign, FileSpreadsheet,
  BarChart3, Users, Tags, ContactRound, Building2,
  Clock, MapPin, Megaphone, MessageCircle, ScanEye, Inbox, Bell, Monitor,
  MessageSquare, Settings2, Home, User, Wrench, UserPlus, FileText, GitCompareArrows,
  ClipboardList, Receipt, Brain, Map as MapIcon, Award, CalendarCheck, ArrowLeftRight,
  Banknote, ShieldCheck, Scale, Zap, UserPlus2, Radio,
} from "lucide-react";

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
}

/* ── Admin / Manager nav items ── */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: "dashboard", to: "/app", icon: LayoutDashboard, label: "Dashboard", module: null, end: true, section: "Home" },
  { id: "ops-center", to: "/app/ops-center", icon: Radio, label: "Ops Center", module: "shifts", section: "Operations" },
  { id: "front-desk", to: "/app/front-desk", icon: ContactRound, label: "Front Desk", module: null, section: "Operations" },
  { id: "shifts", to: "/app/shifts", icon: CalendarDays, label: "Shifts", module: "shifts", section: "Operations" },
  { id: "timeclock", to: "/app/timeclock", icon: Clock, label: "Time Clock", module: "shifts", section: "Operations" },
  { id: "clients", to: "/app/clients", icon: Building2, label: "Clients", module: "clients", section: "Operations" },
  { id: "locations", to: "/app/locations", icon: MapPin, label: "Locations", module: "locations", section: "Operations" },
  { id: "periods", to: "/app/periods", icon: CalendarDays, label: "Periods", module: "periods", section: "Payroll" },
  { id: "import", to: "/app/import", icon: Upload, label: "Import", module: "import", section: "Payroll" },
  { id: "movements", to: "/app/movements", icon: DollarSign, label: "Adjustments", module: "movements", section: "Payroll" },
  { id: "summary", to: "/app/summary", icon: FileSpreadsheet, label: "Reports", module: "summary", section: "Payroll" },
  { id: "comparison", to: "/app/comparison", icon: GitCompareArrows, label: "Comparison", module: "shifts", section: "Operations" },
  { id: "payroll-settings", to: "/app/payroll-settings", icon: Settings2, label: "Payroll Settings", module: null, section: "Management" },
  { id: "w9", to: "/app/w9", icon: FileText, label: "W-9", module: "employees", section: "Tax" },
  { id: "1099", to: "/app/1099", icon: FileText, label: "1099-NEC", module: "employees", section: "Tax" },
  { id: "employees", to: "/app/employees", icon: Users, label: "Employees", module: "employees", section: "Management" },
  { id: "directory", to: "/app/directory", icon: ContactRound, label: "Directory", module: "employees", section: "Operations" },
  { id: "concepts", to: "/app/concepts", icon: Tags, label: "Concepts", module: "concepts", section: "Management" },
  { id: "announcements", to: "/app/announcements", icon: Megaphone, label: "Announcements", module: "announcements", section: "Operations" },
  { id: "chat", to: "/app/chat", icon: MessageCircle, label: "Chat", module: null, section: "Operations" },
  { id: "tickets", to: "/app/requests", icon: Inbox, label: "Tickets", module: null, section: "Management", badge: "tickets" },
  { id: "notifications", to: "/app/notifications", icon: Bell, label: "Notifications", module: null, section: "Management" },
  { id: "invite", to: "/app/invite", icon: UserPlus, label: "Invitations", module: null, section: "Management" },
  { id: "admin-hub", to: "/app/admin", icon: Wrench, label: "Admin", module: null, section: "Administration", roles: ["owner"] },
  { id: "service-requests", to: "/app/service-requests", icon: ClipboardList, label: "Service Requests", module: null, section: "Commercial" },
  { id: "staffing-requests", to: "/app/staffing-requests", icon: ClipboardList, label: "Requests", module: null, section: "Commercial" },
  { id: "invoices", to: "/app/invoices", icon: Receipt, label: "Invoices", module: null, section: "Commercial" },
  { id: "service-categories", to: "/app/service-categories", icon: Tags, label: "Categories", module: null, section: "Commercial" },
  { id: "ai-workforce", to: "/app/ai-workforce", icon: Brain, label: "AI Workforce", module: null, section: "Operations" },
  { id: "live-map", to: "/app/live-map", icon: MapIcon, label: "Live Map", module: null, section: "Operations" },
  { id: "leaderboard", to: "/app/leaderboard", icon: Award, label: "Leaderboard", module: null, section: "Operations" },
  { id: "kiosk", to: "/app/kiosk", icon: Monitor, label: "Kiosk", module: null, section: "Operations" },
  { id: "attendance", to: "/app/attendance", icon: ScanEye, label: "Attendance", module: null, section: "Operations" },
  { id: "migration", to: "/app/migration", icon: ArrowLeftRight, label: "Migration", module: null, section: "Administration", roles: ["owner"] },
  { id: "staged-recon", to: "/app/payroll-reconciliation", icon: GitCompareArrows, label: "Reconciliation", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "advances-loans", to: "/app/advances-loans", icon: Banknote, label: "Advances", module: null, section: "Payroll" },
  { id: "comp-validation", to: "/app/compensation-validation", icon: DollarSign, label: "Compensation", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "pilot-close", to: "/app/payroll-pilot-close", icon: ShieldCheck, label: "Pilot Close", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "payroll-recon", to: "/app/payroll-reconciliation", icon: Scale, label: "Payroll Recon", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "comp-adoption", to: "/app/compensation-adoption", icon: Zap, label: "Comp. Adoption", module: null, section: "Payroll", roles: ["developer", "owner", "company_owner", "admin"] },
  { id: "applications", to: "/app/applications", icon: UserPlus2, label: "Applications", module: null, section: "Management" },
];

export const ADMIN_DEFAULT_PINS = ["dashboard", "shifts", "employees", "movements"];

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
