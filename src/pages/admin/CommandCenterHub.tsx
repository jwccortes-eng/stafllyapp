/**
 * Command Center Hub — Sprint S1 Consolidation (READ-ONLY shell)
 *
 * Canonical route: /app/command-center
 *
 * Tabs (URL-driven via ?tab=…):
 *   - today     → existing DailyOps               (Hoy / Mañana)
 *   - attention → existing NeedsAttention         (Necesita atención)
 *   - live      → existing OperationsCommandCenter + link to LiveMap (En vivo)
 *   - close     → existing DailyClose             (Cierre)
 *   - payroll   → existing PayrollReviewQueue     (Listo para pago)
 *
 * Strict guardrails:
 *   - No new queries, no new RPCs, no new writes.
 *   - Each tab renders the existing page component verbatim.
 *   - No payroll calculation, no time_entries / scheduled_shifts / shift_assignments touched.
 *   - No RLS / auth / tenant governance changes.
 *   - Legacy routes (/app/daily-ops, /app/needs-attention, /app/ops-center,
 *     /app/daily-close, /app/payroll-review-queue, /app/live-map,
 *     /app/command-center-classic) remain mounted independently.
 */
import { Suspense, lazy, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarClock, AlertTriangle, Radio, ClipboardCheck, ScanEye, MapIcon, ShieldAlert } from "lucide-react";

const DailyOps = lazy(() => import("./DailyOps"));
const NeedsAttention = lazy(() => import("./NeedsAttention"));
const OperationsCommandCenter = lazy(() => import("./OperationsCommandCenter"));
const DailyClose = lazy(() => import("./DailyClose"));
const PayrollReviewQueue = lazy(() => import("./PayrollReviewQueue"));

type TabKey = "today" | "attention" | "live" | "close" | "payroll";

const TABS: Array<{
  key: TabKey;
  label: string;
  legacy: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "today",     label: "Hoy / Mañana",     legacy: "/app/daily-ops",            icon: CalendarClock },
  { key: "attention", label: "Necesita atención", legacy: "/app/needs-attention",      icon: AlertTriangle },
  { key: "live",      label: "En vivo",          legacy: "/app/ops-center",           icon: Radio },
  { key: "close",     label: "Cierre",           legacy: "/app/daily-close",          icon: ClipboardCheck },
  { key: "payroll",   label: "Listo para pago",  legacy: "/app/payroll-review-queue", icon: ScanEye },
];

function TabFallback() {
  return (
    <div className="space-y-3 p-2">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function CommandCenterHub() {
  const [params, setParams] = useSearchParams();
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
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Una sola pantalla operativa: hoy, atención, en vivo, cierre y validación previa a payroll.
        </p>
      </header>

      <Tabs value={active} onValueChange={setActive} className="w-full">
        {/* Desktop: full tab strip. Mobile: horizontally scrollable. */}
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar h-auto flex-wrap md:flex-nowrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-2">
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Legacy deep link — never break bookmarks */}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Vista canonical · los enlaces antiguos siguen funcionando.</span>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link to={currentTab.legacy}>Abrir vista completa →</Link>
          </Button>
        </div>

        <TabsContent value="today" className="mt-4">
          <Suspense fallback={<TabFallback />}>
            <DailyOps />
          </Suspense>
        </TabsContent>

        <TabsContent value="attention" className="mt-4">
          <Suspense fallback={<TabFallback />}>
            <NeedsAttention />
          </Suspense>
        </TabsContent>

        <TabsContent value="live" className="mt-4 space-y-3">
          <Card>
            <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <MapIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Mapa en vivo</span>
                <span className="text-muted-foreground">— ubicación de workers y turnos activos.</span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/app/live-map">Abrir Live Map →</Link>
              </Button>
            </CardContent>
          </Card>
          <Suspense fallback={<TabFallback />}>
            <OperationsCommandCenter />
          </Suspense>
        </TabsContent>

        <TabsContent value="close" className="mt-4">
          <Suspense fallback={<TabFallback />}>
            <DailyClose />
          </Suspense>
        </TabsContent>

        <TabsContent value="payroll" className="mt-4 space-y-3">
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="text-xs leading-relaxed">
              <strong>Validación operativa previa a payroll.</strong>{" "}
              Payroll real sigue basado en Connecteam truth/reconciliation. Esta vista no calcula pago;
              no se usan <code>scheduled_shifts</code> como fuente de horas.
            </AlertDescription>
          </Alert>
          <Suspense fallback={<TabFallback />}>
            <PayrollReviewQueue />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
