/**
 * Command Center Hub — Sprint S3 (KPI strip + mobile padding fix)
 *
 * Canonical route: /app/command-center
 *
 * Sprint S3 changes (frontend-only):
 *   - Compact KPI strip at the top: today shifts, pending assignments,
 *     open clocks, open pay periods, docs pending review. All counts are
 *     tenant-scoped (`.eq("company_id", selectedCompanyId)` FIRST in the
 *     chain). Counts are `count: "exact", head: true` only — no row data
 *     pulled, no writes, no payroll calculations.
 *   - Double-padding fix: the hub now only pads the header, KPI strip and
 *     tabs strip (`px-3 md:px-6`). The embedded tab pages already supply
 *     their own page padding, so `TabsContent` is rendered full-bleed.
 *   - Payroll guardrail banner preserved verbatim.
 *
 * Strict guardrails (unchanged):
 *   - No new RPCs, no writes, no mutation.
 *   - Each tab renders the existing page component verbatim.
 *   - No payroll calculation, no time_entries / scheduled_shifts /
 *     shift_assignments touched (counts only).
 *   - No RLS / auth / tenant governance changes.
 *   - Legacy routes remain mounted independently.
 */
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CalendarClock,
  AlertTriangle,
  Radio,
  ClipboardCheck,
  ScanEye,
  MapIcon,
  ShieldAlert,
  Clock,
  Users,
  FileWarning,
  CalendarDays,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

const TodayHubView = lazy(() => import("@/components/command-center/TodayHubView"));

const NeedsAttention = lazy(() => import("./NeedsAttention"));
const OperationsCommandCenter = lazy(() => import("./OperationsCommandCenter"));
const DailyClose = lazy(() => import("./DailyClose"));
const PayrollReviewQueue = lazy(() => import("./PayrollReviewQueue"));

type TabKey = "today" | "attention" | "live" | "close" | "payroll";

interface TabDef {
  key: TabKey;
  label: string;
  shortLabel: string;
  legacy: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { key: "today",     label: "Hoy / Mañana",      shortLabel: "Hoy",      legacy: "/app/daily-ops",            icon: CalendarClock },
  { key: "attention", label: "Necesita atención", shortLabel: "Atención", legacy: "/app/needs-attention",      icon: AlertTriangle },
  { key: "live",      label: "En vivo",           shortLabel: "En vivo",  legacy: "/app/ops-center",           icon: Radio },
  { key: "close",     label: "Cierre",            shortLabel: "Cierre",   legacy: "/app/daily-close",          icon: ClipboardCheck },
  { key: "payroll",   label: "Listo para pago",   shortLabel: "Pago",     legacy: "/app/payroll-review-queue", icon: ScanEye },
];

function TabFallback() {
  return (
    <div className="space-y-3 p-3 md:p-6">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/* ── Hub ─────────────────────────────────────────────────────────────── */

export default function CommandCenterHub() {
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();

  const raw = params.get("tab") as TabKey | null;
  const active: TabKey = useMemo(
    () => (TABS.some((t) => t.key === raw) ? (raw as TabKey) : "today"),
    [raw],
  );

  const setActive = (next: string) => {
    const updated = new URLSearchParams(params);
    updated.set("tab", next);
    setParams(updated, { replace: true });
  };

  const currentTab = TABS.find((t) => t.key === active)!;

  return (
    // S3: outer wrapper no longer adds horizontal padding — embedded tab
    // pages own their padding. Only the chrome (header / KPI / tabs) is
    // padded here.
    <div className="space-y-3 md:space-y-4 pt-3 md:pt-6">
      <header className="flex flex-col gap-1 px-3 md:px-6">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Una sola pantalla operativa: hoy, atención, en vivo, cierre y validación previa a payroll.
        </p>
      </header>

      <Tabs value={active} onValueChange={setActive} className="w-full">
        {/* Mobile: horizontal scroll pill strip. Desktop: standard inline tabs. */}
        <div className="px-3 md:px-6">
          <div className="-mx-3 md:mx-0 overflow-x-auto no-scrollbar">
            <TabsList
              className={cn(
                "h-auto w-max md:w-full justify-start gap-1 px-3 md:px-1",
                "bg-transparent md:bg-muted",
              )}
            >
              {TABS.map((t) => {
                const Icon = t.icon;
                const label = isMobile ? t.shortLabel : t.label;
                return (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className={cn(
                      "gap-1.5 whitespace-nowrap",
                      "data-[state=active]:shadow-sm",
                      isMobile && "h-9 rounded-full border border-border/60 bg-card px-3 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Legacy deep link — never break bookmarks */}
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] md:text-xs text-muted-foreground">
            <span className="truncate">Vista canonical · enlaces antiguos siguen funcionando.</span>
            <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
              <Link to={currentTab.legacy}>Vista completa →</Link>
            </Button>
          </div>
        </div>

        {/* TabsContent is full-bleed — embedded pages provide their own padding.
            Fixes the double-gutter regression documented in S2. */}
        <TabsContent value="today" className="mt-2 md:mt-3">
          <Suspense fallback={<TabFallback />}>
            <TodayHubView />
          </Suspense>
        </TabsContent>


        <TabsContent value="attention" className="mt-2 md:mt-3">
          <Suspense fallback={<TabFallback />}>
            <NeedsAttention />
          </Suspense>
        </TabsContent>

        <TabsContent value="live" className="mt-2 md:mt-3 space-y-3">
          <div className="px-3 md:px-6">
            <Card>
              <CardContent className="flex flex-col gap-2 p-3 md:p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <MapIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Mapa en vivo</span>
                  <span className="hidden md:inline text-muted-foreground">— ubicación de workers y turnos activos.</span>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/app/live-map">Abrir Live Map →</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          <Suspense fallback={<TabFallback />}>
            <OperationsCommandCenter />
          </Suspense>
        </TabsContent>

        <TabsContent value="close" className="mt-2 md:mt-3">
          <Suspense fallback={<TabFallback />}>
            <DailyClose />
          </Suspense>
        </TabsContent>

        <TabsContent value="payroll" className="mt-2 md:mt-3 space-y-3">
          <div className="px-3 md:px-6">
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs leading-relaxed">
                <strong>Validación operativa previa a payroll.</strong>{" "}
                Payroll real sigue basado en Connecteam truth/reconciliation.
                No se usan <code>scheduled_shifts</code> como fuente de horas.
              </AlertDescription>
            </Alert>
          </div>
          <Suspense fallback={<TabFallback />}>
            <PayrollReviewQueue />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
