import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SoundProvider } from "@/hooks/useSound";
import { Loader2 } from "lucide-react";

// Eager: shell components needed immediately
import AdminLayout from "./components/AdminLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import ModuleGate from "./components/ModuleGate";
import { CompanyRequiredGuard } from "./components/CompanyRequiredGuard";
import AdminDashboard from "./pages/admin/Dashboard";
import Employees from "./pages/admin/Employees";
import Shifts from "./pages/admin/Shifts";
import PayrollReconciliation from "./pages/admin/PayrollReconciliation";

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
const ImportSchedule = lazy(() => import("./pages/admin/ImportSchedule"));
const BackfillShift = lazy(() => import("./pages/admin/BackfillShift"));
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
const EmployeeOnboarding = lazy(() => import("./pages/admin/EmployeeOnboarding"));
const Workforce = lazy(() => import("./pages/admin/Workforce"));
const UnifiedPersonProfile = lazy(() => import("./pages/admin/UnifiedPersonProfile"));
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
const AssignmentOverrides = lazy(() => import("./pages/admin/AssignmentOverrides"));
const ImportInactiveEmployees = lazy(() => import("./pages/admin/ImportInactiveEmployees"));
const UnpaidShiftsReport = lazy(() => import("./pages/admin/UnpaidShiftsReport"));
const StaffingRequests = lazy(() => import("./pages/admin/StaffingRequests"));
const ServiceRequests = lazy(() => import("./pages/admin/ServiceRequests"));
const InvoicesPage = lazy(() => import("./pages/admin/Invoices"));
const ServiceCategories = lazy(() => import("./pages/admin/ServiceCategories"));
const AIWorkforce = lazy(() => import("./pages/admin/AIWorkforce"));
const LiveMap = lazy(() => import("./pages/admin/LiveMap"));
const Leaderboard = lazy(() => import("./pages/admin/Leaderboard"));
const WorkerPassport = lazy(() => import("./pages/admin/WorkerPassport"));
// KioskDevices removed from router — kiosk-devices route now redirects to /app/kiosk (KioskHub)
const KioskHub = lazy(() => import("./pages/admin/KioskHub"));
const Attendance = lazy(() => import("./pages/admin/Attendance"));
const QualityDashboard = lazy(() => import("./pages/admin/QualityDashboard"));
const KioskClock = lazy(() => import("./pages/kiosk/KioskClock"));
const FrontDesk = lazy(() => import("./pages/front-desk/FrontDesk"));
// FrontDeskReports removed from router — front-desk-reports route now redirects to /app/front-desk (FrontDeskHub)
const FrontDeskHub = lazy(() => import("./pages/admin/FrontDeskHub"));
const MigrationCommandCenter = lazy(() => import("./pages/admin/MigrationCommandCenter"));
const CompanyMigration = lazy(() => import("./pages/admin/CompanyMigration"));
const ReconciliationReport = lazy(() => import("./pages/admin/ReconciliationReport"));
const AdvancesLoans = lazy(() => import("./pages/admin/AdvancesLoans"));
const ShiftOperations = lazy(() => import("./pages/admin/ShiftOperations"));
const OperationsCommandCenter = lazy(() => import("./pages/admin/OperationsCommandCenter"));
const StagedReconciliation = lazy(() => import("./pages/admin/StagedReconciliation"));
const CompensationValidation = lazy(() => import("./pages/admin/CompensationValidation"));
const PayrollPilotClose = lazy(() => import("./pages/admin/PayrollPilotClose"));
const PayrollMappings = lazy(() => import("./pages/admin/PayrollMappings"));
const CompensationAdoption = lazy(() => import("./pages/admin/CompensationAdoption"));
const Applications = lazy(() => import("./pages/admin/Applications"));
const ApplicationSettings = lazy(() => import("./pages/admin/ApplicationSettings"));
const UpgradeRequests = lazy(() => import("./pages/admin/UpgradeRequests"));
const InvoicingClients = lazy(() => import("./pages/admin/InvoicingClients"));
const InvoicingClientsImport = lazy(() => import("./pages/admin/InvoicingClientsImport"));
const InvoicingServiceBlocks = lazy(() => import("./pages/admin/InvoicingServiceBlocks"));
const InvoicingInvoices = lazy(() => import("./pages/admin/InvoicingInvoices"));
const InvoicingInvoiceNew = lazy(() => import("./pages/admin/InvoicingInvoiceNew"));
const InvoicingInvoiceDetail = lazy(() => import("./pages/admin/InvoicingInvoiceDetail"));
const Apply = lazy(() => import("./pages/Apply"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const ActivateAccount = lazy(() => import("./pages/ActivateAccount"));
const ShiftLink = lazy(() => import("./pages/ShiftLink"));
const ClientLayout = lazy(() => import("./components/client/ClientLayout"));
const ClientDashboard = lazy(() => import("./pages/client/ClientDashboard"));
const ClientRequests = lazy(() => import("./pages/client/ClientRequests"));
const ClientNewRequest = lazy(() => import("./pages/client/ClientNewRequest"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
// Portal pages
const EmployeeDashboard = lazy(() => import("./pages/portal/EmployeeDashboard"));
const MyPayments = lazy(() => import("./pages/portal/MyPayments"));
const WeekDetail = lazy(() => import("./pages/portal/WeekDetail"));
const Accumulated = lazy(() => import("./pages/portal/Accumulated"));
const MyShifts = lazy(() => import("./pages/portal/MyShifts"));
const PortalShiftDetail = lazy(() => import("./pages/portal/PortalShiftDetail"));
const MyAnnouncements = lazy(() => import("./pages/portal/MyAnnouncements"));
const PortalResources = lazy(() => import("./pages/portal/PortalResources"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));
const CompleteProfile = lazy(() => import("./pages/portal/CompleteProfile"));
const PortalClock = lazy(() => import("./pages/portal/PortalClock"));
const PayStub = lazy(() => import("./pages/portal/PayStub"));
const PortalChat = lazy(() => import("./pages/portal/PortalChat"));
const MyW9 = lazy(() => import("./pages/portal/MyW9"));
const MyDocuments = lazy(() => import("./pages/portal/MyDocuments"));
const MyAvailability = lazy(() => import("./pages/portal/MyAvailability"));

// Parceros community — own layout
const ParcerosLayout = lazy(() => import("./layouts/ParcerosLayout"));
const ParcerosCommunity = lazy(() => import("./pages/parceros/ParcerosCommunity"));
const ChannelView = lazy(() => import("./pages/parceros/ChannelView"));
const FlashJobDetail = lazy(() => import("./pages/parceros/FlashJobDetail"));

import { queryClient } from "@/lib/query-client";

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
          <SoundProvider>
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
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/help" element={<HelpCenter />} />
              <Route path="/pricing" element={<PublicPricing />} />
              <Route path="/manual" element={<UserManual />} />
              <Route path="/passport/:slug" element={<PublicPassport />} />
              <Route path="/kiosk" element={<KioskClock />} />
              <Route path="/front-desk" element={<FrontDesk />} />
              <Route path="/apply/:slug" element={<Apply />} />
              <Route path="/join/:inviteCode" element={<JoinCompany />} />
              <Route path="/invite" element={<AcceptInvite />} />
              <Route path="/activate/:token" element={<ActivateAccount />} />
              <Route path="/s/:token" element={<ShiftLink />} />
              <Route path="/client" element={<ClientLayout />}>
                <Route index element={<ClientDashboard />} />
                <Route path="requests" element={<ClientRequests />} />
                <Route path="requests/new" element={<ClientNewRequest />} />
              </Route>
              {/* Parceros — own layout, branded */}
              <Route path="/parceros" element={<ParcerosLayout />}>
                <Route index element={<ParcerosCommunity />} />
                <Route path="channel/:id" element={<ChannelView />} />
                <Route path="flash/:id" element={<FlashJobDetail />} />
              </Route>
              {/* Admin routes */}
              <Route path="/app" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="employees" element={<CompanyRequiredGuard><Employees /></CompanyRequiredGuard>} />
                <Route path="workforce" element={<CompanyRequiredGuard><Workforce /></CompanyRequiredGuard>} />
                <Route path="employees/:id/onboarding" element={<CompanyRequiredGuard><EmployeeOnboarding /></CompanyRequiredGuard>} />
                {/* Unified Person Profile — canonical People OS route + retro-compat alias */}
                <Route path="people/:id" element={<CompanyRequiredGuard><UnifiedPersonProfile /></CompanyRequiredGuard>} />
                <Route path="employees/:id" element={<CompanyRequiredGuard><UnifiedPersonProfile /></CompanyRequiredGuard>} />
                <Route path="periods" element={<CompanyRequiredGuard><ModuleGate moduleKey="periods"><PayPeriods /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="import" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportConnecteam /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="concepts" element={<CompanyRequiredGuard><Concepts /></CompanyRequiredGuard>} />
                <Route path="movements" element={<CompanyRequiredGuard><ModuleGate moduleKey="movements"><Movements /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="summary" element={<CompanyRequiredGuard><ModuleGate moduleKey="summary"><PeriodSummary /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="summary/detail" element={<CompanyRequiredGuard><ModuleGate moduleKey="summary"><EmployeePeriodDetail /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="reports" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><PeriodSummary /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="reports/employee" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><EmployeeReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="users" element={<CompanyRequiredGuard><UsersPage /></CompanyRequiredGuard>} />
                <Route path="companies" element={<CompaniesPage />} />
                <Route path="global" element={<OwnerDashboard />} />
                <Route path="invite" element={<CompanyRequiredGuard><InviteEmployees /></CompanyRequiredGuard>} />
                <Route path="directory" element={<Directory />} />
                <Route path="clients" element={<CompanyRequiredGuard><ModuleGate moduleKey="clients"><Clients /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="locations" element={<CompanyRequiredGuard><ModuleGate moduleKey="locations"><Locations /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="shifts" element={<CompanyRequiredGuard><Shifts /></CompanyRequiredGuard>} />
                <Route path="import-schedule" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportSchedule /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="backfill-shift/:shiftCode" element={<CompanyRequiredGuard><BackfillShift /></CompanyRequiredGuard>} />
                <Route path="import-timeclock" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportTimeClock /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="import-extras" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportPayrollExtras /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="bulk-import-shifts" element={<CompanyRequiredGuard><BulkImportShifts /></CompanyRequiredGuard>} />
                <Route path="import-wizard" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportWizard /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="shift-requests" element={<CompanyRequiredGuard><ShiftRequests /></CompanyRequiredGuard>} />
                <Route path="timeclock" element={<CompanyRequiredGuard><ModuleGate moduleKey="timeclock"><TimeClock /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="today" element={<CompanyRequiredGuard><TodayView /></CompanyRequiredGuard>} />
                <Route path="announcements" element={<CompanyRequiredGuard><Announcements /></CompanyRequiredGuard>} />
                <Route path="chat" element={<CompanyRequiredGuard><ModuleGate moduleKey="chat"><InternalChat /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="settings" element={<PlatformSettings />} />
                <Route path="activity" element={<ActivityLog />} />
                <Route path="onboarding" element={<CompanyRequiredGuard><OnboardingWizard /></CompanyRequiredGuard>} />
                <Route path="permissions" element={<CompanyRequiredGuard><Permissions /></CompanyRequiredGuard>} />
                <Route path="assignment-overrides" element={<CompanyRequiredGuard><AssignmentOverrides /></CompanyRequiredGuard>} />
                <Route path="admin/assignment-overrides" element={<CompanyRequiredGuard><AssignmentOverrides /></CompanyRequiredGuard>} />
                <Route path="company-config" element={<CompanyRequiredGuard><CompanyConfig /></CompanyRequiredGuard>} />
                <Route path="automations" element={<CompanyRequiredGuard><ModuleGate moduleKey="automations"><Automations /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="payroll-settings" element={<CompanyRequiredGuard><PayrollSettings /></CompanyRequiredGuard>} />
                <Route path="monetization" element={<CompanyRequiredGuard><ModuleGate moduleKey="monetization"><MonetizationReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="billing" element={<Billing />} />
                <Route path="system-health" element={<SystemHealth />} />
                <Route path="implementations" element={<Implementations />} />
                <Route path="notification-templates" element={<CompanyRequiredGuard><NotificationTemplates /></CompanyRequiredGuard>} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="requests" element={<CompanyRequiredGuard><Requests /></CompanyRequiredGuard>} />
                <Route path="leads" element={<Leads />} />
                <Route path="admin" element={<AdminHub />} />
                <Route path="discrepancies" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><DiscrepancyReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="comparison" element={<CompanyRequiredGuard><ComparisonReport /></CompanyRequiredGuard>} />
                <Route path="w9" element={<CompanyRequiredGuard><ContractorW9 /></CompanyRequiredGuard>} />
                <Route path="1099" element={<CompanyRequiredGuard><TaxForms1099 /></CompanyRequiredGuard>} />
                <Route path="import-inactive" element={<CompanyRequiredGuard><ImportInactiveEmployees /></CompanyRequiredGuard>} />
                <Route path="unpaid-shifts" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><UnpaidShiftsReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="staffing-requests" element={<CompanyRequiredGuard><StaffingRequests /></CompanyRequiredGuard>} />
               <Route path="service-requests" element={<CompanyRequiredGuard><ServiceRequests /></CompanyRequiredGuard>} />
               {/* Canonical alias — operational entry point of the business flow */}
               <Route path="requests" element={<CompanyRequiredGuard><ServiceRequests /></CompanyRequiredGuard>} />
                <Route path="invoices" element={<CompanyRequiredGuard><InvoicesPage /></CompanyRequiredGuard>} />
                <Route path="service-categories" element={<CompanyRequiredGuard><ServiceCategories /></CompanyRequiredGuard>} />
                <Route path="ai-workforce" element={<CompanyRequiredGuard><AIWorkforce /></CompanyRequiredGuard>} />
                <Route path="live-map" element={<CompanyRequiredGuard><LiveMap /></CompanyRequiredGuard>} />
                <Route path="leaderboard" element={<CompanyRequiredGuard><Leaderboard /></CompanyRequiredGuard>} />
                <Route path="passport" element={<CompanyRequiredGuard><WorkerPassport /></CompanyRequiredGuard>} />
                <Route path="attendance" element={<CompanyRequiredGuard><Attendance /></CompanyRequiredGuard>} />
                <Route path="quality" element={<CompanyRequiredGuard><QualityDashboard /></CompanyRequiredGuard>} />
                <Route path="migration" element={<CompanyRequiredGuard><MigrationCommandCenter /></CompanyRequiredGuard>} />
                <Route path="company-migration" element={<CompanyRequiredGuard><CompanyMigration /></CompanyRequiredGuard>} />
                <Route path="reconciliation-report" element={<CompanyRequiredGuard><ReconciliationReport /></CompanyRequiredGuard>} />
                <Route path="staged-reconciliation" element={<CompanyRequiredGuard><StagedReconciliation /></CompanyRequiredGuard>} />
                <Route path="advances-loans" element={<CompanyRequiredGuard><AdvancesLoans /></CompanyRequiredGuard>} />
                {/* Legacy redirects — KioskDevices/FrontDeskReports consolidated into KioskHub/FrontDeskHub */}
                <Route path="kiosk-devices" element={<Navigate to="/app/kiosk" replace />} />
                <Route path="kiosk" element={<CompanyRequiredGuard><KioskHub /></CompanyRequiredGuard>} />
                <Route path="shift-ops" element={<CompanyRequiredGuard><ShiftOperations /></CompanyRequiredGuard>} />
                <Route path="ops-center" element={<CompanyRequiredGuard><OperationsCommandCenter /></CompanyRequiredGuard>} />
                <Route path="front-desk-reports" element={<Navigate to="/app/front-desk" replace />} />
                <Route path="front-desk" element={<CompanyRequiredGuard><FrontDeskHub /></CompanyRequiredGuard>} />
                <Route path="compensation-validation" element={<CompanyRequiredGuard><CompensationValidation /></CompanyRequiredGuard>} />
                <Route path="payroll-pilot-close" element={<CompanyRequiredGuard><PayrollPilotClose /></CompanyRequiredGuard>} />
                <Route path="payroll-mappings" element={<CompanyRequiredGuard><PayrollMappings /></CompanyRequiredGuard>} />
                <Route path="payroll-reconciliation" element={<CompanyRequiredGuard><PayrollReconciliation /></CompanyRequiredGuard>} />
                <Route path="compensation-adoption" element={<CompanyRequiredGuard><CompensationAdoption /></CompanyRequiredGuard>} />
                <Route path="applications" element={<CompanyRequiredGuard><Applications /></CompanyRequiredGuard>} />
                <Route path="application-settings" element={<CompanyRequiredGuard><ApplicationSettings /></CompanyRequiredGuard>} />
                <Route path="upgrade-requests" element={<UpgradeRequests />} />
                <Route path="invoicing/clients" element={<CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingClients /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="invoicing/clients/import" element={<CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingClientsImport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="invoicing/service-blocks" element={<CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingServiceBlocks /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="invoicing/invoices" element={<CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingInvoices /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="invoicing/invoices/new" element={<CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingInvoiceNew /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="invoicing/invoices/:id" element={<CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingInvoiceDetail /></ModuleGate></CompanyRequiredGuard>} />
              </Route>

              {/* Employee portal routes */}
              <Route path="/portal" element={<EmployeeLayout />}>
                <Route index element={<EmployeeDashboard />} />
                <Route path="payments" element={<MyPayments />} />
                <Route path="week/:periodId" element={<WeekDetail />} />
                <Route path="accumulated" element={<Accumulated />} />
                <Route path="shifts" element={<MyShifts />} />
                <Route path="shifts/:shiftId" element={<PortalShiftDetail />} />
                <Route path="announcements" element={<MyAnnouncements />} />
                <Route path="resources" element={<PortalResources />} />
                <Route path="clock" element={<PortalClock />} />
                <Route path="paystub/:periodId" element={<PayStub />} />
                <Route path="chat" element={<PortalChat />} />
                <Route path="profile" element={<PortalProfile />} />
                <Route path="profile/complete" element={<CompleteProfile />} />
                <Route path="availability" element={<MyAvailability />} />
                <Route path="w9" element={<MyW9 />} />
                <Route path="documents" element={<MyDocuments />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          </ErrorBoundary>
          </SoundProvider>
          </CompanyProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
