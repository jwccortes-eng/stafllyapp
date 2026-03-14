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
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import AdminLayout from "./components/AdminLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import Employees from "./pages/admin/Employees";
import PayPeriods from "./pages/admin/PayPeriods";
import ImportConnecteam from "./pages/admin/ImportConnecteam";
import Concepts from "./pages/admin/Concepts";
import Movements from "./pages/admin/Movements";
import PeriodSummary from "./pages/admin/PeriodSummary";
import EmployeePeriodDetail from "./pages/admin/EmployeePeriodDetail";
import Reports from "./pages/admin/Reports";
import EmployeeReport from "./pages/admin/EmployeeReport";
import UsersPage from "./pages/admin/Users";
import CompaniesPage from "./pages/admin/Companies";
import OwnerDashboard from "./pages/admin/OwnerDashboard";
import InviteEmployees from "./pages/admin/InviteEmployees";
import Directory from "./pages/admin/Directory";
import Clients from "./pages/admin/Clients";
import Locations from "./pages/admin/Locations";
import Shifts from "./pages/admin/Shifts";
import ImportSchedule from "./pages/admin/ImportSchedule";
import ImportTimeClock from "./pages/admin/ImportTimeClock";
import ImportPayrollExtras from "./pages/admin/ImportPayrollExtras";
import BulkImportShifts from "./pages/admin/BulkImportShifts";
import ImportWizard from "./pages/admin/ImportWizard";
import TimeClock from "./pages/admin/TimeClock";
import TodayView from "./pages/admin/TodayView";
import Announcements from "./pages/admin/Announcements";
import InternalChat from "./pages/admin/InternalChat";
import PlatformSettings from "./pages/admin/PlatformSettings";
import ActivityLog from "./pages/admin/ActivityLog";
import OnboardingWizard from "./pages/admin/OnboardingWizard";
import Permissions from "./pages/admin/Permissions";
import CompanyConfig from "./pages/admin/CompanyConfig";
import Automations from "./pages/admin/Automations";
import MonetizationReport from "./pages/admin/MonetizationReport";
import SystemHealth from "./pages/admin/SystemHealth";
import Implementations from "./pages/admin/Implementations";
import ShiftRequests from "./pages/admin/ShiftRequests";
import PayrollSettings from "./pages/admin/PayrollSettings";
import NotificationTemplates from "./pages/admin/NotificationTemplates";
import NotificationsPage from "./pages/admin/Notifications";
import Pricing from "./pages/admin/Pricing";
import Billing from "./pages/admin/Billing";
import Requests from "./pages/admin/Requests";
import Leads from "./pages/admin/Leads";
import AdminHub from "./pages/admin/AdminHub";
import DiscrepancyReport from "./pages/admin/DiscrepancyReport";
import ComparisonReport from "./pages/admin/ComparisonReport";
import ContractorW9 from "./pages/admin/ContractorW9";
import TaxForms1099 from "./pages/admin/TaxForms1099";
import ImportInactiveEmployees from "./pages/admin/ImportInactiveEmployees";
import UnpaidShiftsReport from "./pages/admin/UnpaidShiftsReport";
import StaffingRequests from "./pages/admin/StaffingRequests";
import InvoicesPage from "./pages/admin/Invoices";
import ServiceCategories from "./pages/admin/ServiceCategories";
import AIWorkforce from "./pages/admin/AIWorkforce";
import LiveMap from "./pages/admin/LiveMap";
import PublicPricing from "./pages/PublicPricing";
import Leaderboard from "./pages/admin/Leaderboard";
import ModuleGate from "./components/ModuleGate";
import MyPayments from "./pages/portal/MyPayments";
import WeekDetail from "./pages/portal/WeekDetail";
import Accumulated from "./pages/portal/Accumulated";
import MyShifts from "./pages/portal/MyShifts";
import MyAnnouncements from "./pages/portal/MyAnnouncements";
import EmployeeDashboard from "./pages/portal/EmployeeDashboard";
import PortalResources from "./pages/portal/PortalResources";
import PortalProfile from "./pages/portal/PortalProfile";
import PortalClock from "./pages/portal/PortalClock";
import PayStub from "./pages/portal/PayStub";
import PortalChat from "./pages/portal/PortalChat";
import MyW9 from "./pages/portal/MyW9";
import Install from "./pages/Install";
import TermsOfService from "./pages/legal/TermsOfService";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import CookiePolicy from "./pages/legal/CookiePolicy";
import HelpCenter from "./pages/help/HelpCenter";
import UserManual from "./pages/help/UserManual";
const queryClient = new QueryClient();

function NetworkListener() {
  useNetworkStatus();
  return null;
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
          <ErrorBoundary>
          <BrowserRouter>
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
                <Route path="w9" element={<MyW9 />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
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
