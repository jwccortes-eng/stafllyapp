/**
 * ShiftSummaryPanel — sticky right-side operational summary.
 *
 * Receives precomputed signals from ShiftFormFields (via useMemo) and
 * renders KPIs + grouped validations. Memoized so typing in text fields
 * does NOT re-render this panel unless a derived signal actually changes.
 */
import { memo } from "react";
import {
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  MapPin,
  Car,
  Users,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  // Identity
  title: string;
  clientName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  // KPIs
  slotsNum: number;
  assignedCount: number;
  ridesNeeded: number;
  transportRequired: boolean;
  driversInTeam: number;
  // Job site
  jobSiteLabel: string | null;
  meetingPointLabel: string | null;
  // Validations
  dateMissing: boolean;
  adminMissing: boolean;
  adminInvalid: boolean;
  noLocation: boolean;
  noTeam: boolean;
  driverMissing: boolean;
  driversShortage: boolean;
  capacityShortage: boolean;
  hasConflicts: boolean;
  conflictNames: string[];
  payOverrideActive: boolean;
  payTypeLabel: string;
  mode: "create" | "edit";
}

function fmtDate(d: string): string {
  if (!d) return "—";
  try {
    return format(parse(d, "yyyy-MM-dd", new Date()), "EEE d 'de' MMM", { locale: es });
  } catch {
    return d;
  }
}

function ShiftSummaryPanelImpl(p: Props) {
  const allGood =
    !p.dateMissing &&
    !p.adminMissing &&
    !p.adminInvalid &&
    !p.noLocation &&
    !p.driverMissing &&
    !p.driversShortage &&
    !p.capacityShortage &&
    !p.noTeam &&
    !p.hasConflicts;

  const Row = ({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-2 text-[11px]">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="ml-auto text-foreground font-medium text-right truncate min-w-0">{value}</span>
    </div>
  );

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/20">
        <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <div className="text-[13px] font-semibold leading-tight">Resumen del turno</div>
          <p className="text-[10px] text-muted-foreground">Validación operativa en vivo.</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Identity rows */}
        <div className="space-y-1.5">
          <Row icon={ListChecks} label="Título" value={p.title.trim() || "Sin título"} />
          <Row icon={Users} label="Cliente" value={p.clientName || "Sin asignar"} />
          <Row
            icon={CalendarDays}
            label="Fecha"
            value={
              <>
                {fmtDate(p.date)}
                {p.startTime && p.endTime && (
                  <span className="text-muted-foreground"> · {p.startTime}–{p.endTime}</span>
                )}
              </>
            }
          />
          <Row icon={MapPin} label="Job Site" value={p.jobSiteLabel || "Sin definir"} />
          <Row
            icon={Car}
            label="Transporte"
            value={
              p.transportRequired ? (
                <span>
                  ON · {p.ridesNeeded} veh · {p.driversInTeam} drivers
                </span>
              ) : (
                "OFF"
              )
            }
          />
          {p.transportRequired && (
            <Row icon={MapPin} label="Meeting" value={p.meetingPointLabel || "Sin definir"} />
          )}
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
          <div className="rounded-lg border border-border/30 bg-muted/10 p-2">
            <div className="text-[10px] text-muted-foreground">Plazas</div>
            <div className="font-semibold text-foreground text-base leading-none mt-0.5">{p.slotsNum || "—"}</div>
          </div>
          <div
            className={cn(
              "rounded-lg border p-2",
              p.assignedCount === 0
                ? "border-border/30 bg-muted/10"
                : p.assignedCount >= p.slotsNum
                  ? "border-[hsl(142_76%_36%/0.3)] bg-[hsl(142_76%_36%/0.06)]"
                  : "border-[hsl(var(--status-pending)/0.3)] bg-[hsl(var(--status-pending)/0.06)]",
            )}
          >
            <div className="text-[10px] text-muted-foreground">Cobertura</div>
            <div className="font-semibold text-foreground text-base leading-none mt-0.5">
              {p.assignedCount}/{p.slotsNum || 1}
            </div>
          </div>
          <div className="rounded-lg border border-border/30 bg-muted/10 p-2">
            <div className="text-[10px] text-muted-foreground">Vehículos</div>
            <div className="font-semibold text-foreground text-base leading-none mt-0.5">
              {p.transportRequired ? p.ridesNeeded : "—"}
            </div>
          </div>
        </div>

        {/* Validations */}
        <div className="space-y-1.5 pt-1">
          {p.dateMissing && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span><span className="font-semibold">Falta la fecha</span> del turno.</span>
            </div>
          )}
          {p.adminMissing && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span><span className="font-semibold">Falta el admin del turno</span> (obligatorio con equipo asignado).</span>
            </div>
          )}
          {p.adminInvalid && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>El <span className="font-semibold">admin seleccionado</span> no está en el equipo.</span>
            </div>
          )}
          {p.noLocation && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Sin <span className="font-semibold">Job Site</span> definido.</span>
            </div>
          )}
          {p.noTeam && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Turno <span className="font-semibold">sin equipo</span> y no es reclamable.</span>
            </div>
          )}
          {p.driverMissing && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Transporte activado pero <span className="font-semibold">sin conductor</span>.</span>
            </div>
          )}
          {p.driversShortage && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Faltan conductores</span>: {p.driversInTeam} de {p.ridesNeeded} necesarios.
              </span>
            </div>
          )}
          {p.capacityShortage && (
            <div className="flex items-start gap-1.5 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Capacidad insuficiente</span> para mover el equipo.
              </span>
            </div>
          )}
          {p.hasConflicts && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--status-pending))]">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Conflicto de horario</span>:{" "}
                {p.conflictNames.slice(0, 3).join(", ")}
                {p.conflictNames.length > 3 && ` y ${p.conflictNames.length - 3} más`}.
              </span>
            </div>
          )}
          {p.payOverrideActive && p.mode === "edit" && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <CreditCard className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Override de pago: <span className="font-semibold">{p.payTypeLabel}</span>.</span>
            </div>
          )}
          {allGood && (
            <div className="flex items-start gap-1.5 text-[11px] text-[hsl(142_76%_36%)] font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" /> Todo en orden — listo para guardar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ShiftSummaryPanel = memo(ShiftSummaryPanelImpl);
