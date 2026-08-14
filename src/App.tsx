import { lazy, Suspense } from "react";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SoundProvider } from "@/hooks/useSound";
import { LanguageProvider } from "@/i18n";
import { Loader2 } from "lucide-react";
import { EnvBadge } from "@/components/EnvBadge";
import { SignOutConfirmRoot } from "@/components/LogoutConfirmDialog";

// Eager: shell components needed immediately
import AdminLayout from "./components/AdminLayout";
import EmployeeLayout from "./components/EmployeeLayout";
import ModuleGate from "./components/ModuleGate";
import { CompanyRequiredGuard } from "./components/CompanyRequiredGuard";
import { PortalModuleGuard } from "./components/portal/PortalModuleGuard";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminHome from "./pages/admin/Home";

import Employees from "./pages/admin/Employees";
import Shifts from "./pages/admin/Shifts";
import PayrollReconciliation from "./pages/admin/PayrollReconciliation";

// Lazy: all pages
const Index = lazy(() => import("./pages/Index"));
const PublicLanding = lazy(() => import("./pages/PublicLanding"));
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
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const PortalIntegrations = lazy(() => import("./pages/portal/Integrations"));

// Admin pages
const PayPeriods = lazy(() => import("./pages/admin/PayPeriods"));
const WeeklyPayrollReconciliation = lazy(() => import("./pages/admin/WeeklyPayrollReconciliation"));
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
const EmployeeMerge = lazy(() => import("./pages/admin/EmployeeMerge"));
const Directory = lazy(() => import("./pages/admin/Directory"));
const Clients = lazy(() => import("./pages/admin/Clients"));
const IdentityQuality = lazy(() => import("./pages/admin/IdentityQuality"));

const ClientProfile = lazy(() => import("./pages/admin/ClientProfile"));
const LocationProfile = lazy(() => import("./pages/admin/LocationProfile"));
const Locations = lazy(() => import("./pages/admin/Locations"));
const ImportSchedule = lazy(() => import("./pages/admin/ImportSchedule"));
const CompanyDictionary = lazy(() => import("./pages/admin/CompanyDictionary"));
const ImportReview = lazy(() => import("./pages/admin/ImportReview"));
const BackfillShift = lazy(() => import("./pages/admin/BackfillShift"));
const ImportTimeClock = lazy(() => import("./pages/admin/ImportTimeClock"));
const ImportPayrollExtras = lazy(() => import("./pages/admin/ImportPayrollExtras"));
const BulkImportShifts = lazy(() => import("./pages/admin/BulkImportShifts"));
const ImportWizard = lazy(() => import("./pages/admin/ImportWizard"));
const ShiftRequests = lazy(() => import("./pages/admin/ShiftRequests"));
const TimeClock = lazy(() => import("./pages/admin/TimeClock"));
const Announcements = lazy(() => import("./pages/admin/Announcements"));
const InternalChat = lazy(() => import("./pages/admin/InternalChat"));
const PlatformSettings = lazy(() => import("./pages/admin/PlatformSettings"));
const ActivityLog = lazy(() => import("./pages/admin/ActivityLog"));
const OnboardingWizard = lazy(() => import("./pages/admin/OnboardingWizard"));
const EmployeeOnboarding = lazy(() => import("./pages/admin/EmployeeOnboarding"));
const Workforce = lazy(() => import("./pages/admin/Workforce"));
const UnifiedPersonProfile = lazy(() => import("./pages/admin/UnifiedPersonProfile"));
const Permissions = lazy(() => import("./pages/admin/AccessConsole"));
const CompanyConfig = lazy(() => import("./pages/admin/CompanyConfig"));
const Automations = lazy(() => import("./pages/admin/Automations"));
const PayrollSettings = lazy(() => import("./pages/admin/PayrollSettings"));
const PayrollReviewQueue = lazy(() => import("./pages/admin/PayrollReviewQueue"));
const ChangeIntelligenceObservation = lazy(() => import("./pages/admin/dev/ChangeIntelligenceObservation"));
const OperationalAuthorizationObservation = lazy(() => import("./pages/admin/dev/OperationalAuthorizationObservation"));
const OperationalSignalsShadow = lazy(() => import("./pages/admin/dev/OperationalSignalsShadow"));
const OcsCatalog = lazy(() => import("./pages/admin/dev/OcsCatalog"));

const MonetizationReport = lazy(() => import("./pages/admin/MonetizationReport"));
const Pricing = lazy(() => import("./pages/admin/Pricing"));
const Billing = lazy(() => import("./pages/admin/Billing"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const Implementations = lazy(() => import("./pages/admin/Implementations"));
const CommandCenter = lazy(() => import("./pages/admin/CommandCenter"));
const CommandCenterHub = lazy(() => import("./pages/admin/CommandCenterHub"));
const StaffingCenter = lazy(() => import("./pages/admin/StaffingCenter"));
const DevCommandCenter = lazy(() => import("./pages/admin/DevCommandCenter"));
const SmartWorkCardSandbox = lazy(() => import("./pages/admin/SmartWorkCardSandbox"));
const DocumentsCenter = lazy(() => import("./pages/admin/DocumentsCenter"));
const DocumentIntakeCenter = lazy(() => import("./pages/admin/DocumentIntakeCenter"));
const ComplianceCenter = lazy(() => import("./pages/admin/ComplianceCenter"));
const NeedsAttention = lazy(() => import("./pages/admin/NeedsAttention"));
const DailyClose = lazy(() => import("./pages/admin/DailyClose"));
const Today = lazy(() => import("./pages/admin/Today"));
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
const WorkerDuplicates = lazy(() => import("./pages/admin/WorkerDuplicates"));
const ImportInactiveEmployees = lazy(() => import("./pages/admin/ImportInactiveEmployees"));
const UnpaidShiftsReport = lazy(() => import("./pages/admin/UnpaidShiftsReport"));
const StaffingRequests = lazy(() => import("./pages/admin/StaffingRequests"));
const ServiceRequests = lazy(() => import("./pages/admin/ServiceRequests"));
const ClientExperience = lazy(() => import("./pages/admin/ClientExperience"));
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
const DailyOps = lazy(() => import("./pages/admin/DailyOps"));
const OpsHome = lazy(() => import("./pages/admin/OpsHome"));
const PayrollNativeDryRun = lazy(() => import("./pages/admin/PayrollNativeDryRun"));
const StagedReconciliation = lazy(() => import("./pages/admin/StagedReconciliation"));
const CompensationValidation = lazy(() => import("./pages/admin/CompensationValidation"));
const ValidationCenter = lazy(() => import("./pages/admin/ValidationCenter"));
const PayrollPilotClose = lazy(() => import("./pages/admin/PayrollPilotClose"));
const PayrollMappings = lazy(() => import("./pages/admin/PayrollMappings"));
const CompensationAdoption = lazy(() => import("./pages/admin/CompensationAdoption"));
const Applications = lazy(() => import("./pages/admin/Applications"));
const ApplicationSettings = lazy(() => import("./pages/admin/ApplicationSettings"));
const Referrals = lazy(() => import("./pages/admin/Referrals"));
const Refer = lazy(() => import("./pages/Refer"));
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
const PayReports = lazy(() => import("./pages/portal/PayReports"));
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
const UpdateCenter = lazy(() => import("./pages/portal/UpdateCenter"));
const ShiftCaptainRoom = lazy(() => import("./pages/portal/ShiftCaptainRoom"));

// Parceros community — own layout
const ParcerosLayout = lazy(() => import("./layouts/ParcerosLayout"));
const ParcerosCommunity = lazy(() => import("./pages/parceros/ParcerosCommunity"));
const ChannelView = lazy(() => import("./pages/parceros/ChannelView"));
const FlashJobDetail = lazy(() => import("./pages/parceros/FlashJobDetail"));

// Founder Finance — private founder-only module
const FounderFinanceLayout = lazy(() => import("./pages/founder-finance/FounderFinanceLayout"));
const FounderFinanceOverview = lazy(() => import("./pages/founder-finance/Overview"));
const FounderFinanceImports = lazy(() => import("./pages/founder-finance/Imports"));
const FounderFinanceStub = lazy(() => import("./pages/founder-finance/StubPage"));

import { queryClient } from "@/lib/query-client";
import { IS_PARCEROS_FLAVOR } from "@/lib/app-flavor";

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

function WorkerProfileRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/app/people/${id}` : "/app/employees"} replace />;
}

/**
 * Root route — depends on build flavor.
 *
 * - Parceros native build (VITE_APP_FLAVOR=parceros): `/` redirects to
 *   `/parceros`. ParcerosLayout itself redirects unauthenticated visitors to
 *   `/auth?from=parceros`, so no extra auth wiring is needed here.
 * - Stafly Core / web (default): `/` keeps the existing PublicLanding behavior.
 */
function RootRoute() {
  if (IS_PARCEROS_FLAVOR) {
    return <Navigate to="/parceros" replace />;
  }
  return <PublicLanding />;
}

import { useEffect } from "react";
import { logMount, logUnmount } from "@/lib/ctx001-forensics";
import { WorkspaceRouteMemory } from "@/components/session/WorkspaceRouteMemory";

function App() {
  useEffect(() => {
    const id = logMount("App");
    return () => logUnmount("App", id);
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CompanyProvider>
          <SoundProvider>
          <Toaster />
          <Sonner />
          <NetworkListener />
          <OfflineBanner />
          <EnvBadge />
          <SignOutConfirmRoot />
          <ErrorBoundary>
          <BrowserRouter>
            <WorkspaceRouteMemory />
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/home" element={<Index />} />
              <Route path="/install" element={<Install />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

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
              <Route path="/refer" element={<Refer />} />
              <Route path="/join/:inviteCode" element={<JoinCompany />} />
              <Route path="/invite" element={<AcceptInvite />} />
              <Route path="/activate/:token" element={<ActivateAccount />} />
              <Route path="/s/:token" element={<ShiftLink />} />
              {/* Defensive redirect: top-level /document-intake → /app/document-intake */}
              <Route path="/document-intake" element={<Navigate to="/app/document-intake" replace />} />
              <Route path="/client" element={<ClientLayout />}>
                <Route index element={<ClientDashboard />} />
                <Route path="requests" element={<ClientRequests />} />
                <Route path="requests/new" element={<ClientNewRequest />} />
              </Route>
              {/* Parceros — own layout, branded */}
              <Route path="/parceros" element={<ParcerosLayout />}>
                <Route index element={<ParcerosCommunity />} />
                <Route path="channels" element={<ParcerosCommunity />} />
                <Route path="flash" element={<ParcerosCommunity />} />
                <Route path="radar" element={<ParcerosCommunity />} />
                <Route path="channel/:id" element={<ChannelView />} />
                <Route path="flash/:id" element={<FlashJobDetail />} />
              </Route>
              {/* Admin routes */}
              <Route path="/app" element={<AdminLayout />}>
                <Route index element={<AdminHome />} />
                <Route path="dashboard-classic" element={<AdminDashboard />} />

                <Route path="needs-attention" element={<NeedsAttention />} />
                <Route path="daily-close" element={<CompanyRequiredGuard><DailyClose /></CompanyRequiredGuard>} />
                <Route path="today" element={<Today />} />
                <Route path="command-center" element={<CompanyRequiredGuard><CommandCenterHub /></CompanyRequiredGuard>} />
                <Route path="command-center-classic" element={<CommandCenter />} />
                <Route path="staffing-center" element={<StaffingCenter />} />
                <Route path="dev-command-center" element={<DevCommandCenter />} />
                <Route path="owner-command-center" element={<DevCommandCenter />} />
                <Route path="smart-work-card-sandbox" element={<SmartWorkCardSandbox />} />
                <Route path="employees" element={<CompanyRequiredGuard><Employees /></CompanyRequiredGuard>} />
                <Route path="workers" element={<CompanyRequiredGuard><Navigate to="/app/employees" replace /></CompanyRequiredGuard>} />
                <Route path="workers-data-quality" element={<CompanyRequiredGuard><Navigate to="/app/employees?risk=pending_identity" replace /></CompanyRequiredGuard>} />
                <Route path="documents" element={<CompanyRequiredGuard><DocumentsCenter /></CompanyRequiredGuard>} />
                <Route path="document-intake" element={<CompanyRequiredGuard><DocumentIntakeCenter /></CompanyRequiredGuard>} />
                <Route path="compliance-center" element={<CompanyRequiredGuard><ComplianceCenter /></CompanyRequiredGuard>} />
                <Route path="employees/merge" element={<CompanyRequiredGuard><EmployeeMerge /></CompanyRequiredGuard>} />
                <Route path="workforce" element={<CompanyRequiredGuard><Workforce /></CompanyRequiredGuard>} />
                <Route path="employees/:id/onboarding" element={<CompanyRequiredGuard><EmployeeOnboarding /></CompanyRequiredGuard>} />
                {/* Unified Person Profile — canonical People OS route + retro-compat alias */}
                <Route path="people/:id" element={<CompanyRequiredGuard><UnifiedPersonProfile /></CompanyRequiredGuard>} />
                <Route path="employees/:id" element={<CompanyRequiredGuard><UnifiedPersonProfile /></CompanyRequiredGuard>} />
                <Route path="workers/:id" element={<CompanyRequiredGuard><WorkerProfileRedirect /></CompanyRequiredGuard>} />
                <Route path="periods" element={<PermissionGate permission="payroll.view"><CompanyRequiredGuard><ModuleGate moduleKey="periods"><PayPeriods /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="import" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportConnecteam /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="concepts" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><Concepts /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="movements" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><ModuleGate moduleKey="movements"><Movements /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="summary" element={<PermissionGate permission="payroll.view"><CompanyRequiredGuard><ModuleGate moduleKey="summary"><PeriodSummary /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="summary/detail" element={<PermissionGate permission="payroll.view"><CompanyRequiredGuard><ModuleGate moduleKey="summary"><EmployeePeriodDetail /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="reports" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><PeriodSummary /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="reports/employee" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><EmployeeReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="users" element={<PermissionGate permission="users.manage"><CompanyRequiredGuard><UsersPage /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="identity-quality" element={<CompanyRequiredGuard><IdentityQuality /></CompanyRequiredGuard>} />

                <Route path="companies" element={<CompaniesPage />} />
                <Route path="global" element={<OwnerDashboard />} />
                <Route path="invite" element={<PermissionGate permission="workers.invite"><CompanyRequiredGuard><InviteEmployees /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="directory" element={<Directory />} />
                <Route path="clients" element={<CompanyRequiredGuard><ModuleGate moduleKey="clients"><Clients /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="clients/:clientId" element={<CompanyRequiredGuard><ModuleGate moduleKey="clients"><ClientProfile /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="locations" element={<CompanyRequiredGuard><ModuleGate moduleKey="locations"><Locations /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="locations/:locationId" element={<CompanyRequiredGuard><ModuleGate moduleKey="locations"><LocationProfile /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="shifts" element={<CompanyRequiredGuard><Shifts /></CompanyRequiredGuard>} />
                <Route path="import-schedule" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportSchedule /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="company-dictionary" element={<CompanyRequiredGuard><ModuleGate moduleKey="import"><CompanyDictionary /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="import-review" element={<CompanyRequiredGuard><ImportReview /></CompanyRequiredGuard>} />
                <Route path="backfill-shift/:shiftCode" element={<CompanyRequiredGuard><BackfillShift /></CompanyRequiredGuard>} />
                <Route path="import-timeclock" element={<PermissionGate permission="time_entries.adjust"><CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportTimeClock /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="import-extras" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportPayrollExtras /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="bulk-import-shifts" element={<CompanyRequiredGuard><BulkImportShifts /></CompanyRequiredGuard>} />
                <Route path="import-wizard" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="import"><ImportWizard /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="shift-requests" element={<CompanyRequiredGuard><ShiftRequests /></CompanyRequiredGuard>} />
                <Route path="timeclock" element={<CompanyRequiredGuard><ModuleGate moduleKey="timeclock"><TimeClock /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="announcements" element={<CompanyRequiredGuard><Announcements /></CompanyRequiredGuard>} />
                <Route path="chat" element={<CompanyRequiredGuard><ModuleGate moduleKey="chat"><InternalChat /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="settings" element={<PlatformSettings />} />
                <Route path="activity" element={<ActivityLog />} />
                <Route path="onboarding" element={<CompanyRequiredGuard><OnboardingWizard /></CompanyRequiredGuard>} />
                <Route path="permissions" element={<PermissionGate permission="roles.manage"><CompanyRequiredGuard><Permissions /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="assignment-overrides" element={<CompanyRequiredGuard><AssignmentOverrides /></CompanyRequiredGuard>} />
                <Route path="admin/assignment-overrides" element={<CompanyRequiredGuard><AssignmentOverrides /></CompanyRequiredGuard>} />
                <Route path="workers/duplicates" element={<CompanyRequiredGuard><WorkerDuplicates /></CompanyRequiredGuard>} />
                <Route path="employees/duplicates" element={<CompanyRequiredGuard><WorkerDuplicates /></CompanyRequiredGuard>} />
                <Route path="admin/worker-duplicates" element={<CompanyRequiredGuard><WorkerDuplicates /></CompanyRequiredGuard>} />
                <Route path="company-config" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><CompanyConfig /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="automations" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="automations"><Automations /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="payroll-settings" element={<PermissionGate permission="payroll.settings"><CompanyRequiredGuard><PayrollSettings /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="monetization" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="monetization"><MonetizationReport /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="billing" element={<PermissionGate permission="company.settings"><Billing /></PermissionGate>} />
                <Route path="system-health" element={<SystemHealth />} />
                <Route path="implementations" element={<Implementations />} />
                <Route path="notification-templates" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><NotificationTemplates /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="requests" element={<CompanyRequiredGuard><Requests /></CompanyRequiredGuard>} />
                <Route path="leads" element={<Leads />} />
                <Route path="admin" element={<AdminHub />} />
                <Route path="discrepancies" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><DiscrepancyReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="comparison" element={<CompanyRequiredGuard><ComparisonReport /></CompanyRequiredGuard>} />
                <Route path="w9" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><ContractorW9 /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="1099" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><TaxForms1099 /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="import-inactive" element={<PermissionGate permission="workers.edit"><CompanyRequiredGuard><ImportInactiveEmployees /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="unpaid-shifts" element={<CompanyRequiredGuard><ModuleGate moduleKey="reports"><UnpaidShiftsReport /></ModuleGate></CompanyRequiredGuard>} />
                <Route path="staffing-requests" element={<CompanyRequiredGuard><StaffingRequests /></CompanyRequiredGuard>} />
                <Route path="service-requests" element={<CompanyRequiredGuard><ServiceRequests /></CompanyRequiredGuard>} />
                <Route path="client-experience" element={<CompanyRequiredGuard><ClientExperience /></CompanyRequiredGuard>} />
                <Route path="invoices" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><InvoicesPage /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="service-categories" element={<CompanyRequiredGuard><ServiceCategories /></CompanyRequiredGuard>} />
                <Route path="ai-workforce" element={<CompanyRequiredGuard><AIWorkforce /></CompanyRequiredGuard>} />
                <Route path="live-map" element={<CompanyRequiredGuard><LiveMap /></CompanyRequiredGuard>} />
                <Route path="leaderboard" element={<CompanyRequiredGuard><Leaderboard /></CompanyRequiredGuard>} />
                <Route path="passport" element={<CompanyRequiredGuard><WorkerPassport /></CompanyRequiredGuard>} />
                <Route path="attendance" element={<CompanyRequiredGuard><Attendance /></CompanyRequiredGuard>} />
                <Route path="quality" element={<CompanyRequiredGuard><QualityDashboard /></CompanyRequiredGuard>} />
                <Route path="migration" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><MigrationCommandCenter /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="company-migration" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><CompanyMigration /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="reconciliation-report" element={<CompanyRequiredGuard><ReconciliationReport /></CompanyRequiredGuard>} />
                <Route path="staged-reconciliation" element={<CompanyRequiredGuard><StagedReconciliation /></CompanyRequiredGuard>} />
                <Route path="advances-loans" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><AdvancesLoans /></CompanyRequiredGuard></PermissionGate>} />
                {/* Legacy redirects — KioskDevices/FrontDeskReports consolidated into KioskHub/FrontDeskHub */}
                <Route path="kiosk-devices" element={<Navigate to="/app/kiosk" replace />} />
                <Route path="kiosk" element={<CompanyRequiredGuard><KioskHub /></CompanyRequiredGuard>} />
                <Route path="shift-ops" element={<CompanyRequiredGuard><ShiftOperations /></CompanyRequiredGuard>} />
                <Route path="ops-center" element={<CompanyRequiredGuard><OperationsCommandCenter /></CompanyRequiredGuard>} />
                <Route path="daily-ops" element={<CompanyRequiredGuard><DailyOps /></CompanyRequiredGuard>} />
                <Route path="ops" element={<CompanyRequiredGuard><OpsHome /></CompanyRequiredGuard>} />
                <Route path="front-desk-reports" element={<Navigate to="/app/front-desk" replace />} />
                <Route path="front-desk" element={<CompanyRequiredGuard><FrontDeskHub /></CompanyRequiredGuard>} />
                <Route path="validation-center" element={<CompanyRequiredGuard><ValidationCenter /></CompanyRequiredGuard>} />
                <Route path="compensation-validation" element={<PermissionGate permission="payroll.view"><CompanyRequiredGuard><CompensationValidation /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="payroll-pilot-close" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><PayrollPilotClose /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="payroll-mappings" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><PayrollMappings /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="payroll-reconciliation" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><PayrollReconciliation /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="payroll-review-queue" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><PayrollReviewQueue /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="dev/change-intelligence" element={<ChangeIntelligenceObservation />} />
                <Route path="dev/operational-authorization" element={<OperationalAuthorizationObservation />} />
                <Route path="dev/ocs" element={<OcsCatalog />} />
                <Route path="dev/operational-signals" element={<CompanyRequiredGuard><OperationalSignalsShadow /></CompanyRequiredGuard>} />

                <Route path="weekly-payroll-reconciliation" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><WeeklyPayrollReconciliation /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="payroll-native-dry-run" element={<PermissionGate permission="payroll.manage"><CompanyRequiredGuard><PayrollNativeDryRun /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="compensation-adoption" element={<PermissionGate permission="payroll.view"><CompanyRequiredGuard><CompensationAdoption /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="applications" element={<CompanyRequiredGuard><Applications /></CompanyRequiredGuard>} />
                <Route path="referrals" element={<Referrals />} />
                <Route path="application-settings" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ApplicationSettings /></CompanyRequiredGuard></PermissionGate>} />
                <Route path="upgrade-requests" element={<UpgradeRequests />} />
                <Route path="invoicing/clients" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingClients /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="invoicing/clients/import" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingClientsImport /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="invoicing/service-blocks" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingServiceBlocks /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="invoicing/invoices" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingInvoices /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="invoicing/invoices/new" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingInvoiceNew /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                <Route path="invoicing/invoices/:id" element={<PermissionGate permission="company.settings"><CompanyRequiredGuard><ModuleGate moduleKey="tenant_invoicing"><InvoicingInvoiceDetail /></ModuleGate></CompanyRequiredGuard></PermissionGate>} />
                {/* Founder Finance — private to founder role; gated inside layout */}
                <Route path="founder-finance" element={<FounderFinanceLayout />}>
                  <Route index element={<FounderFinanceOverview />} />
                  <Route path="imports" element={<FounderFinanceImports />} />
                  <Route path="accounts" element={<FounderFinanceStub title="Accounts" description="Manage bank accounts, credit cards and wallets." />} />
                  <Route path="debts" element={<FounderFinanceStub title="Debts" description="Track loans, credit-card balances and payoff plans." />} />
                  <Route path="recurring" element={<FounderFinanceStub title="Recurring expenses" description="Subscriptions and auto-charges, detected from imports." />} />
                  <Route path="categories" element={<FounderFinanceStub title="Categories" description="Customize your personal expense categories." />} />
                  <Route path="goals" element={<FounderFinanceStub title="Goals" description="Set savings and payoff targets." />} />
                </Route>
              </Route>

              {/* Employee portal routes */}
              <Route path="/portal" element={<EmployeeLayout />}>
                <Route index element={<EmployeeDashboard />} />
                {/* /portal/payments deprecated for workers — showed unvalidated time_entries × rate (e.g. 604h / $18k). Redirect to finalized Pay Reports. MyPayments code is kept for audit. */}
                <Route path="payments" element={<Navigate to="/portal/pay-reports" replace />} />
                <Route path="pay-reports" element={<PortalModuleGuard moduleKey="my_payments"><PayReports /></PortalModuleGuard>} />
                <Route path="week/:periodId" element={<PortalModuleGuard moduleKey="my_payments"><WeekDetail /></PortalModuleGuard>} />
                <Route path="accumulated" element={<PortalModuleGuard moduleKey="my_payments"><Accumulated /></PortalModuleGuard>} />
                <Route path="shifts" element={<PortalModuleGuard moduleKey="my_shifts"><MyShifts /></PortalModuleGuard>} />
                <Route path="shifts/:shiftId" element={<PortalModuleGuard moduleKey="my_shifts"><PortalShiftDetail /></PortalModuleGuard>} />
                <Route path="announcements" element={<PortalModuleGuard moduleKey="my_announcements"><MyAnnouncements /></PortalModuleGuard>} />
                <Route path="resources" element={<PortalModuleGuard moduleKey="my_resources"><PortalResources /></PortalModuleGuard>} />
                <Route path="clock" element={<PortalModuleGuard moduleKey="my_clock"><PortalClock /></PortalModuleGuard>} />
                <Route path="paystub/:periodId" element={<PortalModuleGuard moduleKey="my_payments"><PayStub /></PortalModuleGuard>} />
                <Route path="chat" element={<PortalModuleGuard moduleKey="my_chat"><PortalChat /></PortalModuleGuard>} />
                <Route path="profile" element={<PortalProfile />} />
                <Route path="profile/complete" element={<CompleteProfile />} />
                <Route path="availability" element={<PortalModuleGuard moduleKey="my_availability"><MyAvailability /></PortalModuleGuard>} />
                <Route path="w9" element={<PortalModuleGuard moduleKey="my_w9"><MyW9 /></PortalModuleGuard>} />
                <Route path="documents" element={<PortalModuleGuard moduleKey="my_documents"><MyDocuments /></PortalModuleGuard>} />
                <Route path="update-center" element={<UpdateCenter />} />
                <Route path="shift-captain/:shiftId" element={<ShiftCaptainRoom />} />
                <Route path="integrations" element={<PortalIntegrations />} />
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
    </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
