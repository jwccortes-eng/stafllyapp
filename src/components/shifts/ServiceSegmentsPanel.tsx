import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  buildServiceGroups,
  describeServiceGroup,
  type SegmentShiftLike,
  type ServiceGroup,
} from "@/lib/shifts/service-segments";

/**
 * P1 — Horarios del mismo servicio (mismo QK).
 *
 * Solo lectura. Muestra el evento agrupado cuando tiene varios horarios
 * (Setup · Service · VIP · Breakdown o varias jornadas). Nunca escribe.
 */
interface Props {
  shift: { id: string; company_id?: string | null; parent_shift_id?: string | null };
  companyId: string | null;
  onOpenSegment?: (shiftId: string) => void;
  className?: string;
}

export function ServiceSegmentsPanel({ shift, companyId, onOpenSegment, className }: Props) {
  const [group, setGroup] = useState<ServiceGroup | null>(null);
  const rootId = shift.parent_shift_id ?? shift.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGroup(null);
      const { data } = await supabase
        .from("scheduled_shifts")
        .select("id, parent_shift_id, segment_label, title, date, start_time, end_time, slots, shift_ref, client_id")
        .is("deleted_at", null)
        .or(`id.eq.${rootId},parent_shift_id.eq.${rootId}`);
      if (cancelled) return;
      const rows = (data ?? []) as SegmentShiftLike[];
      if (rows.length < 2) return;
      const groups = buildServiceGroups(rows);
      setGroup(groups.find((g) => g.key === rootId) ?? null);
    })();
    return () => { cancelled = true; };
  }, [rootId, companyId]);

  if (!group || !group.isMultiSegment) return null;

  return (
    <div className={cn("rounded-lg border border-border/60 bg-muted/15 p-3", className)}>
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">
          {group.ref ? `${group.ref} · ` : ""}{group.title}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{describeServiceGroup(group)}</p>

      <ul className="mt-2 space-y-1">
        {group.segments.map((s) => (
          <li key={s.shift.id}>
            <button
              type="button"
              onClick={() => onOpenSegment?.(s.shift.id)}
              disabled={!onOpenSegment || s.shift.id === shift.id}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[11px]",
                s.shift.id === shift.id ? "bg-accent/60 font-semibold" : "hover:bg-accent/40",
              )}
            >
              <span className="truncate">
                {s.timeLabel} · {s.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {s.headcount == null ? "personal pendiente" : `${s.headcount}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
