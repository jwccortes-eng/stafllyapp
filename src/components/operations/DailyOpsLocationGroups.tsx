/**
 * DailyOpsLocationGroups — "Por localización".
 *
 * Groups today's shifts by job site / meeting point location / client.
 * Each group is collapsible (default open) with summary + compact shift cards.
 */
import { useState } from "react";
import { ChevronDown, MapPin, Users, Clock, AlertTriangle, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OpsShiftCard } from "@/components/operations/OpsShiftCard";
import type { LocationGroup } from "@/lib/operations/daily-ops-grouping";

const STATUS_TONE = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  watch: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
} as const;
const STATUS_LABEL = { ok: "OK", watch: "Atención", critical: "Crítico" } as const;

interface Props {
  groups: LocationGroup[];
  onOperate: (shiftId: string) => void;
  defaultCollapsed?: boolean;
}

export function DailyOpsLocationGroups({ groups, onOperate, defaultCollapsed }: Props) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <LocationGroupCard
          key={g.key}
          group={g}
          onOperate={onOperate}
          defaultCollapsed={defaultCollapsed}
        />
      ))}
    </div>
  );
}

function LocationGroupCard({
  group,
  onOperate,
  defaultCollapsed,
}: {
  group: LocationGroup;
  onOperate: (id: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const t = group.totals;
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{group.label}</p>
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 h-4 font-semibold border", STATUS_TONE[group.status])}
            >
              {STATUS_LABEL[group.status]}
            </Badge>
          </div>
          {group.sublabel && (
            <p className="text-[11px] text-muted-foreground truncate">{group.sublabel}</p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Stat icon={<Users className="h-3 w-3" />} label={`${t.assigned}/${t.required}`} />
          <Stat icon={<Clock className="h-3 w-3" />} label={`${t.clocked_in} fich.`} />
          {t.missing_clock_in > 0 && (
            <Stat icon={<AlertTriangle className="h-3 w-3" />} label={`${t.missing_clock_in} sin entrar`} tone="warn" />
          )}
          {t.missing_clock_out > 0 && (
            <Stat icon={<AlertTriangle className="h-3 w-3" />} label={`${t.missing_clock_out} sin salir`} tone="danger" />
          )}
          {t.drivers_needed > 0 && (
            <Stat
              icon={<Car className="h-3 w-3" />}
              label={`${t.drivers_assigned}/${t.drivers_needed} conductor${t.drivers_needed === 1 ? "" : "es"}`}
              tone={t.drivers_assigned === 0 ? "danger" : "neutral"}
            />
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/40 p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 bg-muted/10">
          {group.shifts.map((s) => (
            <OpsShiftCard key={s.id} shift={s} onOperate={onOperate} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "neutral" | "warn" | "danger";
}) {
  const t = {
    neutral: "text-muted-foreground",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-muted/50", t)}>
      {icon}
      <span className="font-medium tabular-nums">{label}</span>
    </span>
  );
}
