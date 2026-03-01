import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Eye, Plus, Pencil, Trash2, CheckCircle2, XCircle, Lock,
  Unlock, Send, Download, Printer, Mail, FileSpreadsheet,
  Activity, Calculator,
} from "lucide-react";
import DiffViewer from "./DiffViewer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface AuditEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  old_data: any;
  new_data: any;
  created_at: string;
  user_name?: string;
  user_email?: string;
}

const ACTION_ICONS: Record<string, typeof Activity> = {
  page_view: Eye,
  record_view: Eye,
  create: Plus,
  update: Pencil,
  delete: Trash2,
  approve: CheckCircle2,
  reject: XCircle,
  close: Lock,
  reopen: Unlock,
  publish: Send,
  paid: CheckCircle2,
  export: Download,
  print: Printer,
  email: Mail,
  import: FileSpreadsheet,
  consolidate_clock: Calculator,
};

const ACTION_COLORS: Record<string, string> = {
  page_view: "bg-muted text-muted-foreground",
  record_view: "bg-muted text-muted-foreground",
  create: "bg-earning/15 text-earning",
  update: "bg-primary/15 text-primary",
  delete: "bg-destructive/15 text-destructive",
  approve: "bg-earning/15 text-earning",
  reject: "bg-destructive/15 text-destructive",
  close: "bg-warning/15 text-warning",
  reopen: "bg-chart-1/15 text-chart-1",
  publish: "bg-chart-2/15 text-chart-2",
  paid: "bg-earning/15 text-earning",
  export: "bg-primary/15 text-primary",
  print: "bg-primary/15 text-primary",
  email: "bg-chart-4/15 text-chart-4",
  import: "bg-chart-1/15 text-chart-1",
  consolidate_clock: "bg-warning/15 text-warning",
};

const ACTION_LABELS: Record<string, string> = {
  page_view: "Vio página",
  record_view: "Vio registro",
  create: "Creó",
  update: "Actualizó",
  delete: "Eliminó",
  approve: "Aprobó",
  reject: "Rechazó",
  close: "Cerró",
  reopen: "Reabrió",
  publish: "Publicó",
  paid: "Marcó pagado",
  export: "Exportó",
  print: "Imprimió",
  email: "Envió email",
  import: "Importó",
  consolidate_clock: "Consolidó",
  login: "Inició sesión",
  invite: "Invitó",
  activate: "Activó",
  deactivate: "Desactivó",
};

const ENTITY_LABELS: Record<string, string> = {
  page: "página",
  company: "empresa",
  employee: "empleado",
  user: "usuario",
  pay_period: "periodo",
  period: "periodo",
  movement: "novedad",
  concept: "concepto",
  import: "importación",
  shift: "turno",
  announcement: "anuncio",
  platform_settings: "configuración",
  module: "módulo",
  time_entry: "fichaje",
  client: "cliente",
  location: "ubicación",
};

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    return (parts[0]?.[0] ?? "").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
  }
  return (email?.[0] ?? "S").toUpperCase();
}

function getSummary(entry: AuditEntry): string {
  const actionLabel = ACTION_LABELS[entry.action] || entry.action;
  const entityLabel = ENTITY_LABELS[entry.entity_type] || entry.entity_type;

  if (entry.action === "page_view") {
    return `${actionLabel}: ${entry.details?.page_name || entry.details?.route || ""}`;
  }
  if (entry.action === "export") {
    return `${actionLabel} ${entityLabel} (${entry.details?.format || "archivo"})`;
  }
  if (entry.action === "email") {
    const count = entry.details?.recipients_count;
    return `${actionLabel} a ${count ?? "?"} destinatario(s)`;
  }
  return `${actionLabel} ${entityLabel}`;
}

interface AuditTimelineProps {
  entries: AuditEntry[];
  compact?: boolean;
  maxItems?: number;
}

export default function AuditTimeline({ entries, compact = false, maxItems }: AuditTimelineProps) {
  const items = maxItems ? entries.slice(0, maxItems) : entries;

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Sin actividad registrada</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />

      <div className="space-y-0.5">
        {items.map((entry) => {
          const Icon = ACTION_ICONS[entry.action] || Activity;
          const colorClass = ACTION_COLORS[entry.action] || "bg-muted text-muted-foreground";
          const summary = getSummary(entry);
          const initials = getInitials(entry.user_name, entry.user_email);
          const displayName = entry.user_name || entry.user_email || "Sistema";

          return (
            <div key={entry.id} className="flex items-start gap-3 py-2.5 pl-1 pr-2 rounded-lg hover:bg-muted/40 transition-colors relative">
              {/* Icon */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`z-10 h-[38px] w-[38px] rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {ACTION_LABELS[entry.action] || entry.action}
                </TooltipContent>
              </Tooltip>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate max-w-[140px]">{displayName}</span>
                  <span className="text-xs text-muted-foreground">{summary}</span>
                </div>

                {entry.entity_id && !compact && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    #{entry.entity_id.slice(0, 8)}
                  </span>
                )}

                {!compact && <DiffViewer oldData={entry.old_data} newData={entry.new_data} />}

                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true, locale: es })}
                  {!compact && (
                    <span className="ml-1 text-muted-foreground/50">
                      · {format(parseISO(entry.created_at), "dd MMM HH:mm", { locale: es })}
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
