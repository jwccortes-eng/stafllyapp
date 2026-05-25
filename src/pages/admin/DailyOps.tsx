/**
 * Daily Operations Command Center — Phase A.
 *
 * Read-only desktop page that joins Scheduling + Time Clock context for the
 * selected day and surfaces a premium card grid.
 *
 * Restrictions:
 *   - No writes. No payroll. No notifications. No schema/RLS changes.
 *   - Scheduled hours are NEVER treated as worked hours; clock counters come
 *     only from time_entries.
 *   - Admin-tenant-scoped via useCompany.selectedCompanyId; AdminLayout
 *     already gates the route per-tenant role.
 */
import { useMemo, useState } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useTodayOperations } from "@/hooks/useTodayOperations";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { OpsShiftCard } from "@/components/operations/OpsShiftCard";
import { cn } from "@/lib/utils";

type FilterKey =
  | "all"
  | "needs_staff"
  | "in_progress"
  | "needs_closeout"
  | "urgent";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "needs_staff", label: "Necesita personal" },
  { key: "in_progress", label: "En operación" },
  { key: "needs_closeout", label: "Pendiente cierre" },
  { key: "urgent", label: "Urgentes" },
];


export default function DailyOps() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const [date, setDate] = useState<Date>(() => new Date());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const { loading, error, shifts, totals, refresh } = useTodayOperations(
    selectedCompanyId ?? null,
    date,
  );

  const isToday = isSameDay(date, new Date());

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shifts.filter((s) => {
      if (filter === "needs_staff" && s.ops.bucket !== "needs_staff") return false;
      if (filter === "in_progress" && s.ops.bucket !== "in_progress") return false;
      if (filter === "needs_closeout" && s.ops.bucket !== "needs_closeout")
        return false;
      if (filter === "urgent" && s.ops.alert_level !== "urgent") return false;
      if (!q) return true;
      const hay = `${s.title} ${s.client_name ?? ""} ${s.job_site_name ?? ""} ${
        s.shift_code ?? ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [shifts, search, filter]);

  return (
    <div className="space-y-5">
      <PageHeader
        variant="3"
        title="Operación diaria"
        subtitle="Turnos de hoy, cobertura y contexto de fichajes — una sola pantalla."
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
              <Clock className="h-3.5 w-3.5" /> Reloj de tiempo
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

      {/* Date nav */}
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

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <SummaryTile label="Turnos" value={totals.shifts} icon={<CalendarDays className="h-3.5 w-3.5" />} />
        <SummaryTile label="Necesita personal" value={totals.needs_staff} tone={totals.needs_staff > 0 ? "warning" : "neutral"} icon={<Users className="h-3.5 w-3.5" />} />
        <SummaryTile label="En operación" value={totals.in_progress} tone="info" icon={<Radar className="h-3.5 w-3.5" />} />
        <SummaryTile
          label="Solicitudes"
          value={totals.pending_claims}
          tone={totals.pending_claims > 0 ? "warning" : "neutral"}
          icon={<Inbox className="h-3.5 w-3.5" />}
          onClick={() => navigate("/app/shift-requests")}
        />
        <SummaryTile label="Fichajes abiertos" value={totals.open_clocks} tone={totals.open_clocks > 0 ? "warning" : "neutral"} icon={<Clock className="h-3.5 w-3.5" />} />
        <SummaryTile label="Falta salida" value={totals.missing_clock_outs} tone={totals.missing_clock_outs > 0 ? "danger" : "neutral"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <SummaryTile label="Urgentes" value={totals.urgent} tone={totals.urgent > 0 ? "danger" : "neutral"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
      </div>


      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 h-7 text-[11px] font-semibold rounded-full border transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border/50 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

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
      ) : filteredShifts.length === 0 ? (
        <EmptyState
          title="Ningún turno coincide con esta vista"
          body={
            shifts.length === 0
              ? `No hay nada programado para ${format(date, "EEE d MMM")}.`
              : "Quita el filtro o limpia la búsqueda para ver más."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredShifts.map((s) => (
            <OpsShiftCard
              key={s.id}
              shift={s}
              onOperate={(id) => navigate(`/app/shift-ops?id=${id}`)}
            />
          ))}
        </div>
      )}

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
    neutral: "text-muted-foreground",
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
        <span className="font-semibold">{label}</span>
      </div>
      <div className={cn("text-xl font-bold tabular-nums mt-0.5", toneCls)}>
        {value}
      </div>
    </Comp>
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
