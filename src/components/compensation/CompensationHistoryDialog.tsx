import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useCompensationChangeLog, type CompensationChangeLog } from "@/hooks/useCompensation";
import { Loader2, ArrowRight, FileSpreadsheet, Pencil, Upload, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: "Creado", color: "bg-earning/10 text-earning" },
  updated: { label: "Actualizado", color: "bg-primary/10 text-primary" },
  archived: { label: "Archivado", color: "bg-muted text-muted-foreground" },
  imported: { label: "Importado", color: "bg-accent/10 text-accent-foreground" },
  corrected: { label: "Corregido", color: "bg-warning/10 text-warning" },
  system_detected: { label: "Auto-detectado", color: "bg-muted text-muted-foreground" },
  inline_table_edit: { label: "Edición inline", color: "bg-primary/10 text-primary" },
};

const SOURCE_ICONS: Record<string, any> = {
  import: Upload,
  inline_edit: Pencil,
  admin_edit: Pencil,
  manual: Pencil,
  migration: RefreshCw,
  sync: RefreshCw,
};

export function CompensationHistoryDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
}) {
  const { data: logs, isLoading } = useCompensationChangeLog(employeeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Historial de compensación — {employeeName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : !logs || logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Sin historial de cambios</div>
          ) : (
            <div className="relative pl-6 space-y-0">
              {/* Timeline line */}
              <div className="absolute left-[9px] top-3 bottom-3 w-px bg-border/50" />

              {logs.map((log, i) => {
                const action = ACTION_LABELS[log.action_type] ?? ACTION_LABELS.updated;
                const SourceIcon = SOURCE_ICONS[log.source_type] ?? FileSpreadsheet;

                return (
                  <div key={log.id} className="relative pb-5 last:pb-0">
                    {/* Dot */}
                    <div className="absolute -left-6 top-1.5 h-[18px] w-[18px] rounded-full bg-card border-2 border-border flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] ${action.color} border-0`}>{action.label}</Badge>
                        {log.changed_field && (
                          <span className="text-[10px] font-mono text-muted-foreground">{log.changed_field}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground/50">
                          {format(parseISO(log.changed_at), "dd MMM yyyy HH:mm", { locale: es })}
                        </span>
                      </div>

                      {(log.old_value || log.new_value) && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground line-through">{log.old_value ?? "—"}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                          <span className="font-mono font-semibold text-foreground">{log.new_value ?? "—"}</span>
                        </div>
                      )}

                      {log.reason && (
                        <p className="text-[11px] text-muted-foreground/70 italic">"{log.reason}"</p>
                      )}

                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                        <SourceIcon className="h-2.5 w-2.5" />
                        <span>{log.source_type}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
