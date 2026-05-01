import { useMemo } from "react";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Wallet, Upload, ListTree, Target, Repeat, CreditCard, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isFounder } from "@/lib/finance/founder-access";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/app/founder-finance", end: true, label: "Overview", icon: Wallet },
  { to: "/app/founder-finance/imports", end: false, label: "Smart Import", icon: Upload },
  { to: "/app/founder-finance/accounts", end: false, label: "Accounts", icon: CreditCard },
  { to: "/app/founder-finance/debts", end: false, label: "Debts", icon: AlertTriangle },
  { to: "/app/founder-finance/recurring", end: false, label: "Recurring", icon: Repeat },
  { to: "/app/founder-finance/categories", end: false, label: "Categories", icon: ListTree },
  { to: "/app/founder-finance/goals", end: false, label: "Goals", icon: Target },
];

export default function FounderFinanceLayout() {
  const { user, allRoles, loading } = useAuth();
  const navigate = useNavigate();
  const isOwner = useMemo(() => isFounder(allRoles), [allRoles]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <Card className="p-6 m-4">
        <p className="text-sm text-muted-foreground">Sign in required.</p>
      </Card>
    );
  }

  if (!isOwner) {
    return (
      <Card className="p-8 m-4 max-w-xl mx-auto text-center">
        <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
        <h2 className="text-lg font-semibold mb-1">Founder Finance</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This module is private to the founder. You don’t have access.
        </p>
        <Button variant="outline" onClick={() => navigate("/app")}>Back to dashboard</Button>
      </Card>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Founder Finance
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Private</Badge>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Personal command center. Fully isolated from tenants, payroll and billing.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-border/50 overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg whitespace-nowrap border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30"
              )
            }
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </NavLink>
        ))}
      </nav>

      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
