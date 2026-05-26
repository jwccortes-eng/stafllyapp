/**
 * Daily Operations Control Tower v2.
 *
 * Read-only command center for today's operation: priority action queue +
 * transport strip + location groups. Desktop = full tower; mobile = action-first.
 *
 * Hard rules:
 *  - No writes. No payroll. No notifications. No schema/RLS changes.
 *  - Scheduled hours are NEVER worked hours.
 *  - Spanish-first.
 */
import { useMemo, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useTodayOperations } from "@/hooks/useTodayOperations";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Radar,
  Search,
  CalendarDays,
  AlertTriangle,
  Clock,
  Users,
  RefreshCw,
  Inbox,
  Car,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DailyOpsActionQueue } from "@/components/operations/DailyOpsActionQueue";
import { DailyOpsLocationGroups } from "@/components/operations/DailyOpsLocationGroups";
import { DailyOpsTransportStrip } from "@/components/operations/DailyOpsTransportStrip";
import {
  buildActionQueue,
  buildLocationGroups,
} from "@/lib/operations/daily-ops-grouping";

export default function DailyOps() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const isMobile = useIsMobile();
  const [date, setDate] = useState<Date>(() => new Date());
  const [search, setSearch] = useState("");
  const { loading, error, shifts, totals, refresh } = useTodayOperations(
    selectedCompanyId ?? null,
    date,
  );

  const isToday = isSameDay(date, new Date());
  const operate = (id: string) => navigate(`/app/shift-ops?id=${id}`);

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shifts;
    return shifts.filter((s) => {
      const hay = `${s.title} ${s.client_name ?? ""} ${s.job_site_name ?? ""} ${
        s.shift_code ?? ""
      } ${s.meeting_point ?? ""} ${s.meeting_point_location_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [shifts, search]);

  const actionQueue = useMemo(() => buildActionQueue(filteredShifts), [filteredShifts]);
  const locationGroups = useMemo(() => buildLocationGroups(filteredShifts), [filteredShifts]);

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Operación diaria"
        subtitle="Control tower de hoy — qué resolver, dónde y con quién."
        rightSlot={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => navigate("/app/shifts")}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Programación
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => navigate("/app/timeclock")}
            >
              <Clock className="h-3.5 w-3.5" /> Reloj
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={refresh}
              title="Actualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Date nav + search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl bg-secondary p-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDate((d) => addDays(d, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setDate(new Date())}
            className={cn(
              "px-3 h-8 text-xs font-semibold rounded-lg",
              isToday ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {isToday ? "Hoy" : format(date, "EEE d MMM")}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDate((d) => addDays(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar turno, cliente, sitio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Command header summary */}
      {!isMobile && (
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          <SummaryTile label="Turnos" value={totals.shifts} icon={<CalendarDays className="h-3.5 w-3.5" />} />
          <SummaryTile label="Localizaciones" value={totals.locations} icon={<MapPin className="h-3.5 w-3.5" />} />
          <SummaryTile label="Requeridos" value={totals.required} icon={<Users className="h-3.5 w-3.5" />} />
          <SummaryTile label="Asignados" value={totals.assigned} tone={totals.assigned < totals.required ? "warning" : "neutral"} icon={<Users className="h-3.5 w-3.5" />} />
          <SummaryTile label="Confirmados" value={totals.confirmed} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
          <SummaryTile label="Fichados ahora" value={totals.clocked_in_now} tone="info" icon={<Radar className="h-3.5 w-3.5" />} />
          <SummaryTile label="Falta entrada" value={totals.not_clocked_in} tone={totals.not_clocked_in > 0 ? "warning" : "neutral"} icon={<Clock className="h-3.5 w-3.5" />} />
          <SummaryTile label="Falta salida" value={totals.missing_clock_outs} tone={totals.missing_clock_outs > 0 ? "danger" : "neutral"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
          <SummaryTile
            label="Transporte"
            value={totals.transport_missing_driver}
            tone={totals.transport_missing_driver > 0 ? "danger" : "neutral"}
            icon={<Car className="h-3.5 w-3.5" />}
          />
          <SummaryTile
            label="Solicitudes"
            value={totals.pending_claims}
            tone={totals.pending_claims > 0 ? "warning" : "neutral"}
            icon={<Inbox className="h-3.5 w-3.5" />}
            onClick={() => navigate("/app/shift-requests")}
          />
        </div>
      )}

      {/* Mobile compact summary */}
      {isMobile && shifts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <MobileTile label="Turnos" value={totals.shifts} />
          <MobileTile
            label="Fichados"
            value={totals.clocked_in_now}
            tone={totals.clocked_in_now > 0 ? "info" : "neutral"}
          />
          <MobileTile
            label="Urgentes"
            value={totals.urgent}
            tone={totals.urgent > 0 ? "danger" : "neutral"}
          />
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          No se pudo cargar la operación: {error}
        </div>
      ) : !selectedCompanyId ? (
        <EmptyState
          title="Sin compañía seleccionada"
          body="Elige una compañía para ver la operación de hoy."
        />
      ) : shifts.length === 0 ? (
        <EmptyState
          title="No hay turnos para esta fecha."
          body={`Nada programado para ${format(date, "EEE d MMM")}.`}
        />
      ) : (
        <div className="space-y-6">
          {/* Priority action queue */}
          <section className="space-y-2">
            <SectionHeading
              title="Qué resolver ahora"
              caption={
                actionQueue.length > 0
                  ? `${actionQueue.length} acción${actionQueue.length === 1 ? "" : "es"} priorizada${actionQueue.length === 1 ? "" : "s"}`
                  : "Sin incidencias activas"
              }
            />
            <DailyOpsActionQueue
              items={actionQueue}
              onOperate={operate}
              compact={isMobile}
            />
          </section>

          {/* Transport strip (only if relevant) */}
          {totals.transport_required_shifts > 0 && (
            <section className="space-y-2">
              <SectionHeading title="Transporte" caption="Conductores y capacidad de hoy" />
              <DailyOpsTransportStrip shifts={filteredShifts} onOperate={operate} />
            </section>
          )}

          {/* Location groups */}
          <section className="space-y-2">
            <SectionHeading
              title="Por localización"
              caption={`${locationGroups.length} ${locationGroups.length === 1 ? "grupo" : "grupos"}`}
            />
            <DailyOpsLocationGroups
              groups={locationGroups}
              onOperate={operate}
              defaultCollapsed={isMobile}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
        {title}
      </h2>
      {caption && <span className="text-[11px] text-muted-foreground">{caption}</span>}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "neutral" | "info" | "warning" | "danger";
  onClick?: () => void;
}) {
  const toneCls = {
    neutral: "text-foreground",
    info: "text-primary",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  }[tone];
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/50 bg-card px-3 py-2.5 text-left",
        onClick && "hover:bg-muted/40 transition-colors",
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="font-semibold truncate">{label}</span>
      </div>
      <div className={cn("text-xl font-bold tabular-nums mt-0.5", toneCls)}>
        {value}
      </div>
    </Comp>
  );
}

function MobileTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "info" | "warning" | "danger";
}) {
  const toneCls = {
    neutral: "text-foreground",
    info: "text-primary",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="rounded-xl border border-border/50 bg-card px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className={cn("text-lg font-bold tabular-nums", toneCls)}>{value}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{body}</p>
    </div>
  );
}
