import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPersonName, formatDisplayName } from "@/lib/format-helpers";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { Link } from "react-router-dom";
import { usePortalModules } from "@/hooks/usePortalModules";
import {
  Wallet, Clock, CalendarDays, ArrowRight,
  ChevronRight,
  User, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek } from "date-fns";
import { PendingReviewPrompt } from "@/components/reviews/PendingReviewPrompt";
import { NextBestActionCard } from "@/components/portal/home/NextBestActionCard";
import { TodayBlock } from "@/components/portal/home/TodayBlock";
import { ProfileReadinessStrip } from "@/components/portal/home/ProfileReadinessStrip";
import { WorkerHero, type WorkerHeroStatus } from "@/components/portal/home/WorkerHero";
import { QuickActions, type QuickAction } from "@/components/portal/home/QuickActions";
import { selectNextBestAction, type NbaShift } from "@/lib/portal/next-best-action";
import { PortalUpdateBanner } from "@/components/portal/PortalUpdateBanner";
import { getPageCache, setPageCache, hasPageCache } from "@/lib/portal/page-cache";
import { ErrorBlock } from "@/components/ui/error-block";

interface NextShift {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  client_name: string | null;
  meeting_point: string | null;
  status: string;
}

interface DashSnapshot {
  empName: string;
  empAvatar: string | null;
  companyName: string;
  nextShift: NextShift | null;
  upcomingShifts: NextShift[];
  estimatedPay: number | null;
  clockStatus: { isClockedIn: boolean; clockInTime: string | null; shiftTitle: string | null };
  clockStatusAgeHours: number | null;
  weeklyHours: string;
  pendingCount: number;
  unreadAlerts: number;
  claimableCount: number;
}

const PAGE_KEY = "portal:dashboard";

export default function EmployeeDashboard() {
  const { effectiveEmployeeId, stableEmployeeId, isResolvingEmployee } = useEffectiveEmployee();
  const employeeId = stableEmployeeId;
  const { isModuleEnabled } = usePortalModules();
  const readiness = useEmployeeReadiness(employeeId);
  // Hydrate from cache so a tab-switch back to /portal renders content
  // instantly instead of the skeleton flashing on every remount.
  const cached = getPageCache<DashSnapshot>(PAGE_KEY, employeeId);
  const [empName, setEmpName] = useState(cached?.empName ?? "");
  const [empAvatar, setEmpAvatar] = useState<string | null>(cached?.empAvatar ?? null);
  const [companyName, setCompanyName] = useState(cached?.companyName ?? "");
  const [nextShift, setNextShift] = useState<NextShift | null>(cached?.nextShift ?? null);
  const [upcomingShifts, setUpcomingShifts] = useState<NextShift[]>(cached?.upcomingShifts ?? []);
  const [estimatedPay, setEstimatedPay] = useState<number | null>(cached?.estimatedPay ?? null);
  // Only show skeleton on a true first-load for this employee.
  const [loading, setLoading] = useState(!cached);
  const [clockStatus, setClockStatus] = useState<{
    isClockedIn: boolean;
    clockInTime: string | null;
    shiftTitle: string | null;
  }>(cached?.clockStatus ?? { isClockedIn: false, clockInTime: null, shiftTitle: null });
  const [clockStatusAgeHours, setClockStatusAgeHours] = useState<number | null>(cached?.clockStatusAgeHours ?? null);
  const [weeklyHours, setWeeklyHours] = useState(cached?.weeklyHours ?? "0h");
  const [pendingCount, setPendingCount] = useState(cached?.pendingCount ?? 0);
  const [unreadAlerts, setUnreadAlerts] = useState(cached?.unreadAlerts ?? 0);
  const [claimableCount, setClaimableCount] = useState(cached?.claimableCount ?? 0);
  const [now, setNow] = useState(new Date());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingEmployeeProfile, setMissingEmployeeProfile] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!employeeId) {
      setMissingEmployeeProfile(!isResolvingEmployee);
      setLoading(false);
      return;
    }
    // Only show full skeleton on first-ever load for this employee.
    // Subsequent refetches happen silently in the background; existing
    // content stays on screen so the page never flashes empty.
    if (!hasPageCache(PAGE_KEY, employeeId)) setLoading(true);
    setLoadError(null);
    setMissingEmployeeProfile(false);

    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id, avatar_url")
        .eq("id", employeeId)
        .maybeSingle();
      if (!emp) {
        setMissingEmployeeProfile(true);
        setLoading(false);
        return;
      }

      const nextEmpName = formatPersonName(`${emp.first_name} ${emp.last_name}`);
      const nextEmpAvatar = emp.avatar_url;
      setEmpName(nextEmpName);
      setEmpAvatar(nextEmpAvatar);

    const today = new Date().toISOString().split("T")[0];
    // Ventana operativa del Home (P0 portal module/window fix):
    // desde ayer (00:00 local) hacia adelante, para que un turno de hoy ya
    // terminado o de ayer pendiente de clock-out / cierre siga siendo visible.
    // No incluye historial: solo [hoy - 1 día, ∞).
    const operationalWindowStart = new Date();
    operationalWindowStart.setDate(operationalWindowStart.getDate() - 1);
    const windowStartDate = operationalWindowStart.toISOString().split("T")[0];
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();

      const [companyRes, periodRes, assignRes, clockRes, weekRes] = await Promise.all([
      supabase.from("companies").select("name").eq("id", emp.company_id).maybeSingle(),
      supabase.from("pay_periods").select("id, start_date, end_date, status, published_at")
        .eq("company_id", emp.company_id).order("start_date", { ascending: false }).limit(1).maybeSingle(),
      // Hide soft-deleted shifts (see src/lib/shifts/visibility.ts)
      supabase.from("shift_assignments")
        .select("status, scheduled_shifts!inner (id, title, date, start_time, end_time, status, meeting_point, locations (name), clients (name))")
        .eq("employee_id", employeeId)
        .eq("company_id", emp.company_id)
        .eq("is_draft_reservation", false)
        .not("status", "in", "(removed,rejected)")
        .eq("scheduled_shifts.publication_status", "published")
        .not("scheduled_shifts.status", "in", "(cancelled,canceled)")
        .is("scheduled_shifts.deleted_at", null)
        .gte("scheduled_shifts.date", windowStartDate).order("scheduled_shifts(date)", { ascending: true }).order("created_at", { ascending: true }).limit(5),
      supabase.from("time_entries").select("id, clock_in, clock_out, shift_id, scheduled_shifts(title)").eq("employee_id", employeeId).is("clock_out", null).limit(1) as any,
      supabase.from("time_entries").select("clock_in, clock_out")
        .eq("employee_id", employeeId).gte("clock_in", weekStart).lte("clock_in", weekEnd),
    ]);

      const notifRes = await (supabase.from("notifications").select("id, read_at")
        .eq("recipient_id", employeeId!) as any);

      const nextCompanyName = companyRes.data?.name ?? "";
      setCompanyName(nextCompanyName);

      const activeClocks = (clockRes.data ?? []) as any[];
      const nextClockStatus = activeClocks.length > 0
        ? { isClockedIn: true, clockInTime: activeClocks[0].clock_in, shiftTitle: activeClocks[0].scheduled_shifts?.title ?? null }
        : { isClockedIn: false, clockInTime: null, shiftTitle: null };
      const nextClockStatusAgeHours = nextClockStatus.clockInTime
        ? Math.max(0, (Date.now() - new Date(nextClockStatus.clockInTime).getTime()) / 36e5)
        : null;
      setClockStatus(nextClockStatus);
      setClockStatusAgeHours(nextClockStatusAgeHours);

      let totalSec = 0;
      for (const e of (weekRes.data ?? []) as any[]) {
        const end = e.clock_out ? new Date(e.clock_out) : new Date();
        totalSec += (end.getTime() - new Date(e.clock_in).getTime()) / 1000;
      }
      const wh = Math.floor(totalSec / 3600);
      const wm = Math.floor((totalSec % 3600) / 60);
      const nextWeeklyHours = wm > 0 ? `${wh}h ${wm}m` : `${wh}h`;
      setWeeklyHours(nextWeeklyHours);

      const shifts = (assignRes.data ?? []) as any[];
      let pCount = 0;
      const mapped: NextShift[] = shifts.map((a: any) => {
        const s = a.scheduled_shifts;
        if (a.status === "pending") pCount++;
        return {
          id: s.id, title: s.title, date: s.date,
          start_time: s.start_time, end_time: s.end_time,
          location_name: s.locations?.name ?? null,
          client_name: s.clients?.name ?? null,
          meeting_point: s.meeting_point ?? null,
          status: a.status,
        };
      });
      const nextNextShift = mapped[0] ?? null;
      const nextUpcoming = mapped.slice(1, 4);
      setPendingCount(pCount);
      setNextShift(nextNextShift);
      setUpcomingShifts(nextUpcoming);

    // Count claimable shifts (open/published, future, not full, not already mine)
      const myShiftIds = new Set(mapped.map(s => s.id));
    // Align with PortalShiftDetail / MyShifts: pending requests hide the shift
      const { data: myPendingReqs } = await supabase
      .from("shift_requests")
      .select("shift_id")
      .eq("employee_id", employeeId!)
      .eq("status", "pending");
      const pendingRequestShiftIds = new Set((myPendingReqs ?? []).map((r: any) => r.shift_id as string));
      const { data: claimRows } = await supabase
      .from("scheduled_shifts")
      .select("id, slots, claimable, publication_status, status, deleted_at, shift_assignments(id, status, response_status, is_draft_reservation)")
      .eq("company_id", emp.company_id)
      .eq("claimable", true)
      .in("status", ["open", "published"])
      .is("deleted_at", null)
      .gte("date", today);
      const cCount = (claimRows ?? []).filter((s: any) => {
      if (myShiftIds.has(s.id)) return false;
      if (pendingRequestShiftIds.has(s.id)) return false;
      // Verdad canónica: publicado, no cancelado y con cupo real disponible.
      return canAnnounceOpenShift({ shift: s, assignments: s.shift_assignments ?? [] });
      }).length;
      setClaimableCount(cCount);

      let nextEstimatedPay: number | null = estimatedPay;
      if (periodRes.data) {
        const p = periodRes.data;
        const [bpRes, movRes] = await Promise.all([
          supabase.from("period_base_pay").select("base_total_pay").eq("employee_id", employeeId!).eq("period_id", p.id).maybeSingle(),
          supabase.from("movements").select("total_value, concepts(category)").eq("employee_id", employeeId!).eq("period_id", p.id),
        ]);
        const base = Number(bpRes.data?.base_total_pay) || 0;
        let extras = 0, deductions = 0;
        (movRes.data ?? []).forEach((m: any) => {
          if (m.concepts?.category === "extra") extras += Number(m.total_value) || 0;
          else deductions += Number(m.total_value) || 0;
        });
        nextEstimatedPay = base + extras - deductions;
        setEstimatedPay(nextEstimatedPay);
      }

      const nextUnreadAlerts = (notifRes?.data ?? []).filter((n: any) => !n.read_at).length;
      setUnreadAlerts(nextUnreadAlerts);

    // Snapshot for cross-mount hydration. No payroll math is persisted —
    // only display values that the UI already shows.
      setPageCache<DashSnapshot>(PAGE_KEY, employeeId, {
      empName: nextEmpName,
      empAvatar: nextEmpAvatar,
      companyName: nextCompanyName,
      nextShift: nextNextShift,
      upcomingShifts: nextUpcoming,
      estimatedPay: nextEstimatedPay,
      clockStatus: nextClockStatus,
      clockStatusAgeHours: nextClockStatusAgeHours,
      weeklyHours: nextWeeklyHours,
      pendingCount: pCount,
      unreadAlerts: nextUnreadAlerts,
      claimableCount: cCount,
      });
    } catch (err: any) {
      console.error("[EmployeeDashboard] load failed", err);
      setLoadError(err?.message ?? "No pudimos actualizar tu inicio.");
    } finally {
      setLoading(false);
    }
    // NOTE: estimatedPay is intentionally NOT in deps — loadData writes it via
    // setEstimatedPay, so including it created a self-triggering refetch loop
    // that made the dashboard feel "stuck refreshing to the same point".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, isResolvingEmployee]);

  useEffect(() => { loadData(); }, [loadData]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  })();

  const firstName = empName.split(" ")[0] || "";
  const lastName = empName.split(" ").slice(1).join(" ") || "";

  // ── Build NBA shift snapshot from existing fetched data ──
  // NOTE: All hooks must be declared before any early return to satisfy
  // React's Rules of Hooks. Do not move these below the `if (loading)` guard.
  const nbaShift: NbaShift | null = useMemo(() => (
    nextShift
      ? {
          id: nextShift.id,
          title: nextShift.title,
          date: nextShift.date,
          start_time: nextShift.start_time,
          end_time: nextShift.end_time,
          status: nextShift.status,
          client_name: nextShift.client_name,
          location_name: nextShift.location_name,
          meeting_point: nextShift.meeting_point,
        }
      : null
  ), [nextShift]);

  const nba = useMemo(() => selectNextBestAction({
    clockStatus: { isClockedIn: clockStatus.isClockedIn, shiftTitle: clockStatus.shiftTitle },
    clockStatusAgeHours,
    nextShift: nbaShift,
    pendingCount,
    claimableCount,
    readinessStatus: readiness.status,
    readinessMissingPersonal: readiness.missingPersonal.length,
    readinessMissingDocs: readiness.missingDocuments.length,
    now,
  }), [
    clockStatus.isClockedIn, clockStatus.shiftTitle, clockStatusAgeHours, nbaShift, pendingCount,
    claimableCount, readiness.status, readiness.missingPersonal.length,
    readiness.missingDocuments.length, now,
  ]);

  if (loading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-muted animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="h-32 animate-pulse bg-muted rounded-2xl" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-muted rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!employeeId && missingEmployeeProfile) {
    return (
      <div className="pt-4">
        <ErrorBlock
          title="No encontramos tu perfil"
          message="No encontramos tu perfil de empleado para esta compañía."
        />
      </div>
    );
  }

  const nbaCoversToday = (
    nba.kind === "clocked_in" ||
    nba.kind === "clock_in_now" ||
    nba.kind === "next_shift_today" ||
    nba.kind === "confirm_shift"
  );
  const showTodayBlock = nbaShift && isToday(parseISO(nbaShift.date)) && !nbaCoversToday;
  const showFutureBlock =
    nbaShift && !isToday(parseISO(nbaShift.date)) &&
    nba.kind !== "next_shift_future";

  // ── Hero status — single source of truth derived from clockStatus + readiness ──
  // No new queries: same fields the rest of the page already uses.
  const heroStatus: WorkerHeroStatus = clockStatus.isClockedIn
    ? "on_shift"
    : (readiness.status && readiness.status !== "ready" && readiness.status !== "active")
    ? "incomplete"
    : "ready";

  // ── Quick actions — sólo lo que NO está en bottom nav (Inicio/Turnos/Reloj/Más).
  // Perfil + Documentos + Pagos. Nada más.
  const quickActions: QuickAction[] = [
    { id: "profile", label: "Perfil", href: "/portal/profile", icon: User, accent: "muted" },
    isModuleEnabled("my_documents") || isModuleEnabled("my_w9")
      ? { id: "documents", label: "Documentos", href: "/portal/documents", icon: FileText, accent: "warning" as const }
      : null,
    isModuleEnabled("my_payments")
      ? {
          id: "pay-reports",
          label: "Mis pagos",
          href: "/portal/pay-reports",
          icon: Wallet,
          accent: "earning" as const,
        }
      : null,
  ].filter(Boolean) as QuickAction[];

  return (
    <div className="space-y-3 animate-fade-in pb-28">
      {isResolvingEmployee && (
        <div className="rounded-xl border border-border/50 bg-card/70 px-3 py-2 text-[11px] text-muted-foreground">
          Actualizando…
        </div>
      )}
      {loadError && (
        <div className="rounded-xl border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[11px] text-muted-foreground">
          {loadError}
        </div>
      )}
      {/* ── Worker Hero — saludo compacto ── */}
      <WorkerHero
        firstName={firstName}
        lastName={lastName}
        greeting={greeting}
        companyName={companyName || null}
        avatarUrl={empAvatar}
        status={heroStatus}
      />

      {/* ── Update Center nudge (Phase 1, dismissible per session) ── */}
      <PortalUpdateBanner />

      {/* ── Acción principal ── */}
      <NextBestActionCard nba={nba} />

      {/* ── Detalle del turno (si NBA no lo cubre ya) ── */}
      {(showTodayBlock || showFutureBlock) && nbaShift && (
        <TodayBlock shift={nbaShift} />
      )}

      {/* ── Estado del perfil — auto-oculto si NBA ya lo cubre ── */}
      <ProfileReadinessStrip nbaKind={nba.kind} />

      {/* ── Próximos turnos ── */}
      {upcomingShifts.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Próximos turnos
            </h2>
            <Link to="/portal/shifts" className="text-[11px] text-primary font-semibold flex items-center gap-1">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {upcomingShifts.map((s) => {
              const sIsToday = isToday(parseISO(s.date));
              const sIsTomorrow = isTomorrow(parseISO(s.date));
              return (
                <Link key={s.id} to="/portal/shifts" className="block">
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-card border shadow-sm active:scale-[0.98] transition-all",
                    sIsToday ? "border-primary/20" : "border-border/50"
                  )}>
                    <div className="text-center shrink-0 w-10">
                      {sIsToday ? (
                        <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-primary/12 text-primary tracking-wide">Today</span>
                      ) : sIsTomorrow ? (
                        <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-accent/40 text-accent-foreground tracking-wide">Mañ</span>
                      ) : (
                        <>
                          <p className="text-[8px] font-bold uppercase text-muted-foreground/50 leading-none">
                            {format(parseISO(s.date), "MMM")}
                          </p>
                          <p className="text-base font-bold text-foreground leading-tight tabular-nums mt-0.5">
                            {format(parseISO(s.date), "d")}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-foreground truncate">
                        {formatDisplayName(s.title)}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/70 mt-0.5 min-w-0">
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        <span className="font-semibold text-foreground">Clock In <span className="tabular-nums font-mono">{s.start_time?.slice(0, 5)}</span></span>
                        {s.end_time && (
                          <span className="text-muted-foreground/65 truncate">· Ends approx. <span className="tabular-nums font-mono">{s.end_time?.slice(0, 5)}</span></span>
                        )}
                        {s.location_name && <span className="truncate">· {formatDisplayName(s.location_name)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/25 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Empty state — premium "Próximo turno" placeholder ── */}
      {!nextShift && upcomingShifts.length === 0 && (
        <section
          aria-label="Próximo turno"
          className="rounded-3xl border border-border/50 bg-card shadow-[0_6px_24px_-18px_hsl(var(--foreground)/0.25)] px-4 py-5"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Próximo turno
            </h2>
            <span className="text-[10px] font-semibold text-muted-foreground/55">
              Sin asignar
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-primary/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-foreground leading-tight">
                Aún no tienes turnos asignados
              </p>
              <p className="text-[11.5px] text-muted-foreground/75 mt-1 leading-relaxed">
                Cuando tengas uno nuevo, aparecerá aquí con hora, lugar y punto de encuentro.
              </p>
            </div>
          </div>
          <Link
            to="/portal/shifts"
            className="mt-3 h-10 w-full rounded-xl flex items-center justify-center gap-1.5 text-[12.5px] font-semibold border border-border/60 bg-card hover:bg-muted/40 active:scale-[0.98] transition-all text-foreground"
          >
            Ver mis turnos
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* ── Más (Perfil / Documentos / Pagos) ── */}
      <QuickActions actions={quickActions} />

      {/* ── Pending Reviews ── */}
      <PendingReviewPrompt />
    </div>
  );
}
