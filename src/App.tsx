import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { Loader2 } from "lucide-react";

// Eager: shell components needed immediately
import AdminLayout from "./components/AdminLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import ModuleGate from "./components/ModuleGate";

// Lazy: all pages
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Install = lazy(() => import("./pages/Install"));
const PublicPricing = lazy(() => import("./pages/PublicPricing"));
const PublicPassport = lazy(() => import("./pages/PublicPassport"));
const JoinCompany = lazy(() => import("./pages/JoinCompany"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const CookiePolicy = lazy(() => import("./pages/legal/CookiePolicy"));
const HelpCenter = lazy(() => import("./pages/help/HelpCenter"));
const UserManual = lazy(() => import("./pages/help/UserManual"));

// Admin pages
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Employees = lazy(() => import("./pages/admin/Employees"));
const PayPeriods = lazy(() => import("./pages/admin/PayPeriods"));
const ImportConnecteam = lazy(() => import("./pages/admin/ImportConnecteam"));
const Concepts = lazy(() => import("./pages/admin/Concepts"));
const Movements = lazy(() => import("./pages/admin/Movements"));
const PeriodSummary = lazy(() => import("./pages/admin/PeriodSummary"));
const EmployeePeriodDetail = lazy(() => import("./pages/admin/EmployeePeriodDetail"));
const EmployeeReport = lazy(() => import("./pages/admin/EmployeeReport"));
const UsersPage = lazy(() => import("./pages/admin/Users"));
const CompaniesPage = lazy(() => import("./pages/admin/Companies"));
const OwnerDashboard = lazy(() => import("./pages/admin/OwnerDashboard"));
const InviteEmployees = lazy(() => import("./pages/admin/InviteEmployees"));
const Directory = lazy(() => import("./pages/admin/Directory"));
const Clients = lazy(() => import("./pages/admin/Clients"));
const Locations = lazy(() => import("./pages/admin/Locations"));
const Shifts = lazy(() => import("./pages/admin/Shifts"));
const ImportSchedule = lazy(() => import("./pages/admin/ImportSchedule"));
const ImportTimeClock = lazy(() => import("./pages/admin/ImportTimeClock"));
const ImportPayrollExtras = lazy(() => import("./pages/admin/ImportPayrollExtras"));
const BulkImportShifts = lazy(() => import("./pages/admin/BulkImportShifts"));
const ImportWizard = lazy(() => import("./pages/admin/ImportWizard"));
const ShiftRequests = lazy(() => import("./pages/admin/ShiftRequests"));
const TimeClock = lazy(() => import("./pages/admin/TimeClock"));
const TodayView = lazy(() => import("./pages/admin/TodayView"));
const Announcements = lazy(() => import("./pages/admin/Announcements"));
const InternalChat = lazy(() => import("./pages/admin/InternalChat"));
const PlatformSettings = lazy(() => import("./pages/admin/PlatformSettings"));
const ActivityLog = lazy(() => import("./pages/admin/ActivityLog"));
const OnboardingWizard = lazy(() => import("./pages/admin/OnboardingWizard"));
const Permissions = lazy(() => import("./pages/admin/Permissions"));
const CompanyConfig = lazy(() => import("./pages/admin/CompanyConfig"));
const Automations = lazy(() => import("./pages/admin/Automations"));
const PayrollSettings = lazy(() => import("./pages/admin/PayrollSettings"));
const MonetizationReport = lazy(() => import("./pages/admin/MonetizationReport"));
const Pricing = lazy(() => import("./pages/admin/Pricing"));
const Billing = lazy(() => import("./pages/admin/Billing"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const Implementations = lazy(() => import("./pages/admin/Implementations"));
const NotificationTemplates = lazy(() => import("./pages/admin/NotificationTemplates"));
const NotificationsPage = lazy(() => import("./pages/admin/Notifications"));
const Requests = lazy(() => import("./pages/admin/Requests"));
const Leads = lazy(() => import("./pages/admin/Leads"));
const AdminHub = lazy(() => import("./pages/admin/AdminHub"));
const DiscrepancyReport = lazy(() => import("./pages/admin/DiscrepancyReport"));
const ComparisonReport = lazy(() => import("./pages/admin/ComparisonReport"));
const ContractorW9 = lazy(() => import("./pages/admin/ContractorW9"));
const TaxForms1099 = lazy(() => import("./pages/admin/TaxForms1099"));
const ImportInactiveEmployees = lazy(() => import("./pages/admin/ImportInactiveEmployees"));
const UnpaidShiftsReport = lazy(() => import("./pages/admin/UnpaidShiftsReport"));
const StaffingRequests = lazy(() => import("./pages/admin/StaffingRequests"));
const InvoicesPage = lazy(() => import("./pages/admin/Invoices"));
const ServiceCategories = lazy(() => import("./pages/admin/ServiceCategories"));
const AIWorkforce = lazy(() => import("./pages/admin/AIWorkforce"));
const LiveMap = lazy(() => import("./pages/admin/LiveMap"));
const Leaderboard = lazy(() => import("./pages/admin/Leaderboard"));
const WorkerPassport = lazy(() => import("./pages/admin/WorkerPassport"));
const KioskDevices = lazy(() => import("./pages/admin/KioskDevices"));
const Attendance = lazy(() => import("./pages/admin/Attendance"));
const KioskClock = lazy(() => import("./pages/kiosk/KioskClock"));

// Portal pages
const EmployeeDashboard = lazy(() => import("./pages/portal/EmployeeDashboard"));
const MyPayments = lazy(() => import("./pages/portal/MyPayments"));
const WeekDetail = lazy(() => import("./pages/portal/WeekDetail"));
const Accumulated = lazy(() => import("./pages/portal/Accumulated"));
const MyShifts = lazy(() => import("./pages/portal/MyShifts"));
const MyAnnouncements = lazy(() => import("./pages/portal/MyAnnouncements"));
const PortalResources = lazy(() => import("./pages/portal/PortalResources"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));
const PortalClock = lazy(() => import("./pages/portal/PortalClock"));
const PayStub = lazy(() => import("./pages/portal/PayStub"));
const PortalChat = lazy(() => import("./pages/portal/PortalChat"));
const MyW9 = lazy(() => import("./pages/portal/MyW9"));
const MyAvailability = lazy(() => import("./pages/portal/MyAvailability"));

const queryClient = new QueryClient();

function NetworkListener() {
  useNetworkStatus();
  return null;
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CompanyProvider>
          <Toaster />
          <Sonner />
          <NetworkListener />
          <OfflineBanner />
          <ErrorBoundary>
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/install" element={<Install />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/pricing" element={<PublicPricing />} />
              <Route path="/manual" element={<UserManual />} />
              <Route path="/passport/:slug" element={<PublicPassport />} />
              <Route path="/kiosk" element={<KioskClock />} />

              {/* Admin routes */}
              <Route path="/app" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="employees" element={<Employees />} />
                <Route path="periods" element={<ModuleGate moduleKey="periods"><PayPeriods /></ModuleGate>} />
                <Route path="import" element={<ModuleGate moduleKey="import"><ImportConnecteam /></ModuleGate>} />
                <Route path="concepts" element={<Concepts />} />
                <Route path="movements" element={<ModuleGate moduleKey="movements"><Movements /></ModuleGate>} />
                <Route path="summary" element={<ModuleGate moduleKey="summary"><PeriodSummary /></ModuleGate>} />
                <Route path="summary/detail" element={<ModuleGate moduleKey="summary"><EmployeePeriodDetail /></ModuleGate>} />
                <Route path="reports" element={<ModuleGate moduleKey="reports"><PeriodSummary /></ModuleGate>} />
                <Route path="reports/employee" element={<ModuleGate moduleKey="reports"><EmployeeReport /></ModuleGate>} />
                <Route path="users" element={<UsersPage />} />
                <Route path="companies" element={<CompaniesPage />} />
                <Route path="global" element={<OwnerDashboard />} />
                <Route path="invite" element={<InviteEmployees />} />
                <Route path="directory" element={<Directory />} />
                <Route path="clients" element={<ModuleGate moduleKey="clients"><Clients /></ModuleGate>} />
                <Route path="locations" element={<ModuleGate moduleKey="locations"><Locations /></ModuleGate>} />
                <Route path="shifts" element={<Shifts />} />
                <Route path="import-schedule" element={<ModuleGate moduleKey="import"><ImportSchedule /></ModuleGate>} />
                <Route path="import-timeclock" element={<ModuleGate moduleKey="import"><ImportTimeClock /></ModuleGate>} />
                <Route path="import-extras" element={<ModuleGate moduleKey="import"><ImportPayrollExtras /></ModuleGate>} />
                <Route path="bulk-import-shifts" element={<BulkImportShifts />} />
                <Route path="import-wizard" element={<ModuleGate moduleKey="import"><ImportWizard /></ModuleGate>} />
                <Route path="shift-requests" element={<ShiftRequests />} />
                <Route path="timeclock" element={<ModuleGate moduleKey="timeclock"><TimeClock /></ModuleGate>} />
                <Route path="today" element={<TodayView />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="chat" element={<ModuleGate moduleKey="chat"><InternalChat /></ModuleGate>} />
                <Route path="settings" element={<PlatformSettings />} />
                <Route path="activity" element={<ActivityLog />} />
                <Route path="onboarding" element={<OnboardingWizard />} />
                <Route path="permissions" element={<Permissions />} />
                <Route path="company-config" element={<CompanyConfig />} />
                <Route path="automations" element={<ModuleGate moduleKey="automations"><Automations /></ModuleGate>} />
                <Route path="payroll-settings" element={<PayrollSettings />} />
                <Route path="monetization" element={<ModuleGate moduleKey="monetization"><MonetizationReport /></ModuleGate>} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="billing" element={<Billing />} />
                <Route path="system-health" element={<SystemHealth />} />
                <Route path="implementations" element={<Implementations />} />
                <Route path="notification-templates" element={<NotificationTemplates />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="requests" element={<Requests />} />
                <Route path="leads" element={<Leads />} />
                <Route path="admin" element={<AdminHub />} />
                <Route path="discrepancies" element={<ModuleGate moduleKey="reports"><DiscrepancyReport /></ModuleGate>} />
                <Route path="comparison" element={<ComparisonReport />} />
                <Route path="w9" element={<ContractorW9 />} />
                <Route path="1099" element={<TaxForms1099 />} />
                <Route path="import-inactive" element={<ImportInactiveEmployees />} />
                <Route path="unpaid-shifts" element={<ModuleGate moduleKey="reports"><UnpaidShiftsReport /></ModuleGate>} />
                <Route path="staffing-requests" element={<StaffingRequests />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="service-categories" element={<ServiceCategories />} />
                <Route path="ai-workforce" element={<AIWorkforce />} />
                <Route path="live-map" element={<LiveMap />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="passport" element={<WorkerPassport />} />
                <Route path="attendance" element={<Attendance />} />
              </Route>

              {/* Employee portal routes */}
              <Route path="/portal" element={<EmployeeLayout />}>
                <Route index element={<EmployeeDashboard />} />
                <Route path="payments" element={<MyPayments />} />
                <Route path="week/:periodId" element={<WeekDetail />} />
                <Route path="accumulated" element={<Accumulated />} />
                <Route path="shifts" element={<MyShifts />} />
                <Route path="announcements" element={<MyAnnouncements />} />
                <Route path="resources" element={<PortalResources />} />
                <Route path="clock" element={<PortalClock />} />
                <Route path="paystub/:periodId" element={<PayStub />} />
                <Route path="chat" element={<PortalChat />} />
                <Route path="profile" element={<PortalProfile />} />
                <Route path="availability" element={<MyAvailability />} />
                <Route path="w9" element={<MyW9 />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </ErrorBoundary>
          </CompanyProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
