import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History, UserPlus, Pencil, Send, Trash2, ShieldCheck, Car, MessageSquare } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  details: any;
  old_data: any;
  new_data: any;
  created_at: string;
  user_id: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof History; label: string; color: string }> = {
  create_shift: { icon: Send, label: "Turno creado", color: "text-primary" },
  update_shift: { icon: Pencil, label: "Turno editado", color: "text-warning" },
  publish_shift: { icon: Send, label: "Turno publicado", color: "text-earning" },
  delete_shift: { icon: Trash2, label: "Turno eliminado", color: "text-destructive" },
  assign_employee: { icon: UserPlus, label: "Empleado asignado", color: "text-primary" },
  remove_assignment: { icon: Trash2, label: "Empleado removido", color: "text-destructive" },
  update_assignment: { icon: ShieldCheck, label: "Asignación actualizada", color: "text-warning" },
  set_admin: { icon: ShieldCheck, label: "Admin asignado", color: "text-primary" },
  set_driver: { icon: Car, label: "Conductor asignado", color: "text-earning" },
  add_comment: { icon: MessageSquare, label: "Nota agregada", color: "text-muted-foreground" },
  confirm_attendance: { icon: ShieldCheck, label: "Asistencia confirmada", color: "text-earning" },
  consolidate_clock: { icon: History, label: "Consolidación", color: "text-muted-foreground" },
};

export function ShiftAuditTrail({ shiftId }: { shiftId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("activity_log")
        .select("id, action, entity_type, details, old_data, new_data, created_at, user_id")
        .eq("entity_id", shiftId)
        .order("created_at", { ascending: false })
        .limit(50);
      setEntries((data ?? []) as AuditEntry[]);
      setLoading(false);
    }
    load();
  }, [shiftId]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Sin historial registrado</p>
        <p className="text-[10px] text-muted-foreground/50 mt-1">Las acciones futuras aparecerán aquí</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <History className="h-3 w-3" /> Historial operativo
      </p>
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border/30" />
        {entries.map((entry) => {
          const config = ACTION_CONFIG[entry.action] ?? { icon: History, label: entry.action, color: "text-muted-foreground" };
          const Icon = config.icon;
          return (
            <div key={entry.id} className="relative pl-8 pb-3">
              <div className={cn("absolute left-1.5 top-0.5 h-3 w-3 rounded-full bg-background border-2 border-border/50 flex items-center justify-center z-10")}>
                <div className={cn("h-1.5 w-1.5 rounded-full", config.color === "text-primary" ? "bg-primary" : config.color === "text-earning" ? "bg-earning" : config.color === "text-destructive" ? "bg-destructive" : config.color === "text-warning" ? "bg-warning" : "bg-muted-foreground")} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-3 w-3 shrink-0", config.color)} />
                  <span className="text-[11px] font-semibold">{config.label}</span>
                  <span className="text-[9px] text-muted-foreground/50 ml-auto shrink-0">
                    {format(parseISO(entry.created_at), "d MMM HH:mm", { locale: es })}
                  </span>
                </div>
                {entry.details && typeof entry.details === "object" && Object.keys(entry.details).length > 0 && (
                  <p className="text-[10px] text-muted-foreground/70 truncate">
                    {JSON.stringify(entry.details).slice(0, 120)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
