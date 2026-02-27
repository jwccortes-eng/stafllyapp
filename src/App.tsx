import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
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
import Pricing from "./pages/admin/Pricing";
import Billing from "./pages/admin/Billing";
import Requests from "./pages/admin/Requests";
import Leads from "./pages/admin/Leads";
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
import Install from "./pages/Install";

const queryClient = new QueryClient();

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CompanyProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/install" element={<Install />} />
              <Route path="/auth" element={<Auth />} />

              {/* Admin routes */}
              <Route path="/app" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="employees" element={<Employees />} />
                <Route path="periods" element={<PayPeriods />} />
                <Route path="import" element={<ImportConnecteam />} />
                <Route path="concepts" element={<Concepts />} />
                <Route path="movements" element={<Movements />} />
                <Route path="summary" element={<PeriodSummary />} />
                <Route path="summary/detail" element={<EmployeePeriodDetail />} />
                <Route path="reports" element={<Reports />} />
                <Route path="reports/employee" element={<EmployeeReport />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="companies" element={<CompaniesPage />} />
                <Route path="global" element={<OwnerDashboard />} />
                <Route path="invite" element={<InviteEmployees />} />
                <Route path="directory" element={<Directory />} />
                <Route path="clients" element={<Clients />} />
                <Route path="locations" element={<Locations />} />
                <Route path="shifts" element={<Shifts />} />
                <Route path="import-schedule" element={<ImportSchedule />} />
                <Route path="shift-requests" element={<ShiftRequests />} />
                <Route path="timeclock" element={<TimeClock />} />
                <Route path="today" element={<TodayView />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="chat" element={<InternalChat />} />
                <Route path="settings" element={<PlatformSettings />} />
                <Route path="activity" element={<ActivityLog />} />
                <Route path="onboarding" element={<OnboardingWizard />} />
                <Route path="permissions" element={<Permissions />} />
                <Route path="company-config" element={<CompanyConfig />} />
                <Route path="automations" element={<Automations />} />
                <Route path="payroll-settings" element={<PayrollSettings />} />
                <Route path="monetization" element={<MonetizationReport />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="billing" element={<Billing />} />
                <Route path="system-health" element={<SystemHealth />} />
                <Route path="implementations" element={<Implementations />} />
                <Route path="notification-templates" element={<NotificationTemplates />} />
                <Route path="requests" element={<Requests />} />
                <Route path="leads" element={<Leads />} />
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
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </CompanyProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
