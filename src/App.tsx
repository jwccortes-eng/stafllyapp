import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import MyPayments from "./pages/portal/MyPayments";
import WeekDetail from "./pages/portal/WeekDetail";
import Accumulated from "./pages/portal/Accumulated";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CompanyProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />

              {/* Admin routes */}
              <Route path="/admin" element={<AdminLayout />}>
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
              </Route>

              {/* Employee portal routes */}
              <Route path="/portal" element={<EmployeeLayout />}>
                <Route index element={<MyPayments />} />
                <Route path="week/:periodId" element={<WeekDetail />} />
                <Route path="accumulated" element={<Accumulated />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </CompanyProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
