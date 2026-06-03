/**
 * LiveMapDrawers — Fase 2A solo lectura
 *
 * Worker y Location drawers para `/app/live-map`.
 * - 0 writes a DB
 * - 0 migraciones / edge functions / cambios RLS
 * - solo resumen operativo + deep-links a rutas existentes
 *
 * Rutas usadas (existentes en App.tsx):
 *  - /app/employees/:id   → UnifiedPersonProfile (worker passport/profile)
 *  - /app/locations/:id   → LocationProfile
 *  - /app/timeclock       → TimeClock
 *  - /app/shifts          → Shifts (no hay /app/shifts/:id; abrimos lista)
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  OpsSheetHeader,
  OpsSheetBody,
  OpsSheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildWhatsAppTargets, normalizePhone } from "@/lib/phone";
import {
  Phone, MessageCircle, MapPin, Clock, Navigation, Signal,
  WifiOff, UserX, Timer, ExternalLink, Info, Building2,
} from "lucide-react";

export type WorkerStatus =
  | "clocked_in"
  | "no_show"
  | "late"
  | "missing"
  | "outside"
  | "no_gps"
  | "ending_soon"
  | "unknown";

const STATUS_LABEL: Record<WorkerStatus, string> = {
  clocked_in: "Fichado",
  no_show: "No-show",
  late: "Tarde",
  missing: "Sin fichaje",
  outside: "Fuera de zona",
  no_gps: "Sin GPS",
  ending_soon: "Termina pronto",
  unknown: "Sin estado",
};

const STATUS_TONE: Record<WorkerStatus, string> = {
  clocked_in: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  no_show: "bg-destructive/10 text-destructive border-destructive/30",
  late: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  missing: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  outside: "bg-destructive/10 text-destructive border-destructive/30",
  no_gps: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  ending_soon: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export interface WorkerDrawerContext {
  employee_id: string;
  employee_name: string;
  phone: string | null;
  status: WorkerStatus;
  shift_title?: string | null;
  client_name?: string | null;
  location_name?: string | null;
  scheduled_start?: string | null; // HH:MM:SS
  scheduled_end?: string | null;   // HH:MM:SS
  date?: string | null;            // yyyy-mm-dd
  clock_in?: string | null;        // ISO
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  dist_to_site_m?: number | null;
  open_alerts?: number;
}

function initialsOf(name: string) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function InfoRow({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-foreground font-medium min-w-0 break-words">{value}</span>
    </div>
  );
}

function PrivacyNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded-lg px-2.5 py-2">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
      <p>{text}</p>
    </div>
  );
}

export function WorkerDrawer({
  open, onOpenChange, ctx, isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ctx: WorkerDrawerContext | null;
  isMobile: boolean;
}) {
  const navigate = useNavigate();
  if (!ctx) return null;

  const phoneDigits = normalizePhone(ctx.phone);
  const wa = ctx.phone ? buildWhatsAppTargets(ctx.phone, "Hola, te escribo desde operaciones.") : null;

  const headerLeading = (
    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-bold">
      {initialsOf(ctx.employee_name)}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        tone="ops"
        hideClose
        className={isMobile ? "h-[88dvh] rounded-t-2xl" : undefined}
      >
        <OpsSheetHeader
          title={ctx.employee_name}
          subtitle={
            <span className="flex items-center gap-1.5">
              <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold", STATUS_TONE[ctx.status])}>
                {STATUS_LABEL[ctx.status]}
              </span>
              {ctx.shift_title && <span className="truncate">· {ctx.shift_title}</span>}
            </span>
          }
          leading={headerLeading}
          onClose={() => onOpenChange(false)}
        />
        <OpsSheetBody>
          {/* Turno */}
          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Turno actual</p>
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              {ctx.shift_title && (
                <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Turno" value={ctx.shift_title} />
              )}
              {ctx.client_name && (
                <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Cliente" value={ctx.client_name} />
              )}
              {ctx.location_name && (
                <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación" value={ctx.location_name} />
              )}
              {(ctx.scheduled_start || ctx.scheduled_end) && (
                <InfoRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Programado"
                  value={`${(ctx.scheduled_start || "—").slice(0, 5)} → ${(ctx.scheduled_end || "—").slice(0, 5)}`}
                />
              )}
              {!ctx.shift_title && !ctx.client_name && !ctx.scheduled_start && (
                <p className="text-[11px] text-muted-foreground">Información limitada en esta fase.</p>
              )}
            </div>
          </section>

          {/* Fichaje real */}
          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Fichaje real</p>
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              {ctx.clock_in ? (
                <InfoRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Entrada"
                  value={format(new Date(ctx.clock_in), "PP · hh:mm a")}
                />
              ) : (
                <p className="text-[11px] text-muted-foreground">Aún no hay fichaje real.</p>
              )}
            </div>
          </section>

          {/* Ubicación */}
          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Ubicación (evidencia)</p>
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              {ctx.latitude != null && ctx.longitude != null ? (
                <>
                  <InfoRow
                    icon={<Navigation className="h-3.5 w-3.5" />}
                    label="GPS"
                    value={`${ctx.latitude.toFixed(5)}, ${ctx.longitude.toFixed(5)}`}
                  />
                  {ctx.accuracy != null && (
                    <InfoRow icon={<Signal className="h-3.5 w-3.5" />} label="Precisión" value={`±${Math.round(ctx.accuracy)}m`} />
                  )}
                  {ctx.dist_to_site_m != null && (
                    <InfoRow
                      icon={<MapPin className="h-3.5 w-3.5" />}
                      label="Al sitio"
                      value={`${Math.round(ctx.dist_to_site_m)}m`}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <WifiOff className="h-3.5 w-3.5" /> Sin GPS compartido al fichar.
                </div>
              )}
            </div>
            <PrivacyNote text="La ubicación es evidencia operativa; payroll usa fichajes reales, no horas programadas ni GPS." />
          </section>

          {/* Alertas */}
          {ctx.open_alerts != null && ctx.open_alerts > 0 && (
            <section className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Alertas</p>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-center gap-2 text-[12px] text-destructive">
                <UserX className="h-4 w-4" />
                {ctx.open_alerts} alerta{ctx.open_alerts === 1 ? "" : "s"} abierta{ctx.open_alerts === 1 ? "" : "s"}
              </div>
            </section>
          )}
        </OpsSheetBody>
        <OpsSheetFooter className="flex-wrap gap-1.5 justify-start">
          {phoneDigits && (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <a href={`tel:${phoneDigits}`}>
                <Phone className="h-3.5 w-3.5" /> Llamar
              </a>
            </Button>
          )}
          {wa?.waMeUrl && phoneDigits && (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <a href={wa.waMeUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              onOpenChange(false);
              navigate(`/app/employees/${ctx.employee_id}`);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir pasaporte
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              onOpenChange(false);
              navigate(`/app/timeclock`);
            }}
          >
            <Clock className="h-3.5 w-3.5" /> Time clock
          </Button>
        </OpsSheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export interface LocationDrawerContext {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  geofence_radius_m?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** "legacy" (locations table) | "v2" (locations_v2 ligado a turno) */
  source: "legacy" | "v2";
  // Derivados (calculados por LiveMap):
  assigned_today: number;
  clocked_here: number;
  missing_here: number;
  issues: {
    late: number;
    no_show: number;
    missing: number;
    outside: number;
  };
}

export function LocationDrawer({
  open, onOpenChange, ctx, isMobile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ctx: LocationDrawerContext | null;
  isMobile: boolean;
}) {
  const navigate = useNavigate();
  if (!ctx) return null;

  const canOpenProfile = ctx.source === "legacy"; // /app/locations/:id es legacy
  const mapsUrl = ctx.latitude != null && ctx.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${ctx.latitude},${ctx.longitude}`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        tone="ops"
        hideClose
        className={isMobile ? "h-[88dvh] rounded-t-2xl" : undefined}
      >
        <OpsSheetHeader
          title={ctx.name}
          subtitle={
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold bg-muted text-muted-foreground border-border">
                {ctx.source === "v2" ? "Sitio de turno" : "Ubicación guardada"}
              </span>
              {ctx.city && <span className="truncate">· {ctx.city}</span>}
            </span>
          }
          leading={
            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <MapPin className="h-4 w-4" />
            </div>
          }
          onClose={() => onOpenChange(false)}
        />
        <OpsSheetBody>
          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Detalles</p>
            <div className="rounded-lg border bg-card p-3 space-y-1.5">
              {ctx.address && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Dirección" value={ctx.address} />}
              {ctx.geofence_radius_m != null && (
                <InfoRow
                  icon={<Navigation className="h-3.5 w-3.5" />}
                  label="Geofence"
                  value={`${ctx.geofence_radius_m}m`}
                />
              )}
              {ctx.latitude != null && ctx.longitude != null && (
                <InfoRow
                  icon={<Signal className="h-3.5 w-3.5" />}
                  label="Coordenadas"
                  value={`${ctx.latitude.toFixed(5)}, ${ctx.longitude.toFixed(5)}`}
                />
              )}
              {!ctx.address && ctx.geofence_radius_m == null && (
                <p className="text-[11px] text-muted-foreground">Información limitada en esta fase.</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Operación de hoy</p>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Asignados" value={ctx.assigned_today} />
              <MiniStat label="Fichados aquí" value={ctx.clocked_here} tone="emerald" />
              <MiniStat label="Sin fichaje" value={ctx.missing_here} tone={ctx.missing_here > 0 ? "amber" : undefined} />
              <MiniStat label="Fuera de zona" value={ctx.issues.outside} tone={ctx.issues.outside > 0 ? "red" : undefined} />
            </div>
          </section>

          {(ctx.issues.late + ctx.issues.no_show) > 0 && (
            <section className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Problemas vinculados</p>
              <div className="rounded-lg border bg-card p-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-amber-500" /> Tarde: <b>{ctx.issues.late}</b></div>
                <div className="flex items-center gap-1.5"><UserX className="h-3.5 w-3.5 text-destructive" /> No-show: <b>{ctx.issues.no_show}</b></div>
              </div>
            </section>
          )}

          <PrivacyNote text="Datos derivados de las asignaciones y fichajes ya cargados en pantalla. Información limitada en esta fase." />
        </OpsSheetBody>
        <OpsSheetFooter className="flex-wrap gap-1.5 justify-start">
          {canOpenProfile ? (
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                onOpenChange(false);
                navigate(`/app/locations/${ctx.id}`);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir ubicación
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled className="h-8 text-xs gap-1.5" title="Sin perfil dedicado para sitios de turno">
              <ExternalLink className="h-3.5 w-3.5" /> Sin perfil dedicado
            </Button>
          )}
          {mapsUrl && (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                <Navigation className="h-3.5 w-3.5" /> Ver en Maps
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              onOpenChange(false);
              navigate(`/app/shifts`);
            }}
          >
            <Clock className="h-3.5 w-3.5" /> Turnos
          </Button>
        </OpsSheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  label, value, tone,
}: { label: string; value: number; tone?: "emerald" | "amber" | "red" }) {
  const toneCls = tone === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : tone === "amber"
    ? "text-amber-700 dark:text-amber-400"
    : tone === "red"
    ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", toneCls)}>{value}</p>
    </div>
  );
}
