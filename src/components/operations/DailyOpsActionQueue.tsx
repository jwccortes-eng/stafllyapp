/**
 * DailyOpsActionQueue — "Qué resolver ahora".
 *
 * Read-only. Renders prioritized action cards from buildActionQueue().
 * Mobile (< md): each item is a tappable row that opens a bottom Sheet
 * (Mobile Action Queue pattern) with full context + the existing Operar CTA.
 * Desktop: unchanged grid of cards with inline Operar button.
 */
import { getShiftDisplayIdentity } from "@/lib/shifts/shift-identity";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MobileQueueRow, MobileQueueDrawer } from "@/components/admin/mobile";
import {
  AlertTriangle,
  Car,
  ChevronRight,
  Clock,
  Inbox,
  MapPin,
  UserMinus,
  Users,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionItem, ActionKind } from "@/lib/operations/daily-ops-grouping";
import { ACTION_KIND_LABEL } from "@/lib/operations/daily-ops-grouping";

const ICON: Record<ActionKind, React.ReactNode> = {
  missing_driver: <Car className="h-4 w-4" />,
  transport_short: <Car className="h-4 w-4" />,
  missing_staff: <Users className="h-4 w-4" />,
  missing_clock_in: <Clock className="h-4 w-4" />,
  missing_clock_out: <AlertTriangle className="h-4 w-4" />,
  missing_location: <MapPin className="h-4 w-4" />,
  pending_closeout: <CheckCircle2 className="h-4 w-4" />,
  pending_claims: <Inbox className="h-4 w-4" />,
  extra_worker: <UserMinus className="h-4 w-4" />,
};

const TONE = {
  critical: "border-destructive/30 bg-destructive/5 text-destructive",
  high: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  info: "border-primary/20 bg-primary/5 text-primary",
} as const;

const URGENCY_LABEL: Record<ActionItem["urgency"], string> = {
  critical: "Crítico",
  high: "Alto",
  info: "Informativo",
};

interface Props {
  items: ActionItem[];
  onOperate: (shiftId: string) => void;
  compact?: boolean;
}

export function DailyOpsActionQueue({ items, onOperate, compact }: Props) {
  const [drawerItem, setDrawerItem] = useState<ActionItem | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-6 text-center">
        <CheckCircle2 className="h-5 w-5 mx-auto text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-semibold mt-2 text-foreground">
          Todo bajo control por ahora.
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          No hay acciones urgentes en la operación de hoy.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")}>
        {items.map((it) =>
          compact ? (
            <MobileQueueRow
              key={it.id}
              onClick={() => setDrawerItem(it)}
              className={cn("rounded-2xl p-3.5", TONE[it.urgency])}
              leading={<div className="mt-0.5">{ICON[it.kind]}</div>}
              topMeta={
                <>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 font-semibold border-current"
                  >
                    {ACTION_KIND_LABEL[it.kind]}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {it.subtitle}
                  </span>
                </>
              }
              primary={it.title}
              secondary={it.message}
            />
          ) : (
            <div
              key={it.id}
              className={cn(
                "rounded-2xl border p-3.5 flex items-start gap-3",
                TONE[it.urgency],
              )}
            >
              <div className="mt-0.5 shrink-0">{ICON[it.kind]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 font-semibold border-current"
                  >
                    {ACTION_KIND_LABEL[it.kind]}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {it.subtitle}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-1 truncate">
                  {it.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{it.message}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 shrink-0"
                onClick={() => onOperate(it.shiftId)}
              >
                Operar
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ),
        )}
      </div>

      <MobileQueueDrawer
        open={!!drawerItem}
        onOpenChange={(o) => !o && setDrawerItem(null)}
        maxHeightClassName="max-h-[88vh]"
        headerMeta={drawerItem ? (
          <>
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-5 font-semibold", TONE[drawerItem.urgency])}
            >
              {URGENCY_LABEL[drawerItem.urgency]}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-semibold">
              {ACTION_KIND_LABEL[drawerItem.kind]}
            </Badge>
          </>
        ) : undefined}
        title={drawerItem?.title}
        description={drawerItem?.subtitle}
        footer={drawerItem ? (
          <Button
            className="w-full h-11 text-sm gap-1"
            onClick={() => {
              const id = drawerItem.shiftId;
              setDrawerItem(null);
              onOperate(id);
            }}
          >
            Operar turno
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : undefined}
      >
        {drawerItem && (
          <>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                Qué pasa
              </p>
              <p className="text-foreground text-sm">{drawerItem.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <MetaCell label="Horario" value={fmtTimeRange(drawerItem.shift)} />
              <MetaCell label="Afectados" value={String(drawerItem.count)} />
              {drawerItem.shift.client_name && (
                <MetaCell label="Cliente" value={drawerItem.shift.client_name} />
              )}
              {(drawerItem.shift.job_site_name ||
                drawerItem.shift.meeting_point_location_name ||
                drawerItem.shift.meeting_point) && (
                <MetaCell
                  label="Lugar"
                  value={
                    drawerItem.shift.job_site_name ??
                    drawerItem.shift.meeting_point_location_name ??
                    drawerItem.shift.meeting_point ??
                    "—"
                  }
                />
              )}
              {getShiftDisplayIdentity(drawerItem.shift).primaryRefKind !== "none" && (
                <MetaCell label="Referencia" value={getShiftDisplayIdentity(drawerItem.shift).primaryRef} />
              )}
              {getShiftDisplayIdentity(drawerItem.shift).legacyRef && (
                <MetaCell label="Referencia anterior" value={getShiftDisplayIdentity(drawerItem.shift).legacyRef!} />
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              Las horas programadas son referencia operativa. Payroll se calcula
              con fichajes reales o validaciones aprobadas.
            </p>
          </>
        )}
      </MobileQueueDrawer>
    </>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="text-xs font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function fmtTimeRange(s: { start_time: string; end_time: string }): string {
  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };
  return `${fmt(s.start_time)} – ${fmt(s.end_time)}`;
}
