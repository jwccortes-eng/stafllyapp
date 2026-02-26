import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, User, Building2, Settings, FileSpreadsheet, Users, DollarSign,
  CalendarDays, Tags, Shield, Clock, Megaphone, Search, Filter,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface LogEntry {
  id: string;
  user_id: string;
  company_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  created_at: string;
  // joined
  user_email?: string;
  user_name?: string;
  company_name?: string;
}

const ENTITY_ICONS: Record<string, typeof Activity> = {
  company: Building2,
  employee: Users,
  user: User,
  period: CalendarDays,
  movement: DollarSign,
  concept: Tags,
  import: FileSpreadsheet,
  shift: Clock,
  announcement: Megaphone,
  platform_settings: Settings,
  module: Shield,
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-earning/10 text-earning border-earning/20",
  update: "bg-primary/10 text-primary border-primary/20",
  delete: "bg-destructive/10 text-destructive border-destructive/20",
  login: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  close: "bg-warning/10 text-warning border-warning/20",
  publish: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  reopen: "bg-accent text-accent-foreground border-border",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Creó",
  update: "Actualizó",
  delete: "Eliminó",
  login: "Inició sesión",
  close: "Cerró",
  publish: "Publicó",
  reopen: "Reabrió",
  import: "Importó",
  invite: "Invitó",
  activate: "Activó",
  deactivate: "Desactivó",
  claim: "Reclamó",
};

const ENTITY_LABELS: Record<string, string> = {
  company: "empresa",
  employee: "empleado",
  user: "usuario",
  period: "periodo",
  movement: "novedad",
  concept: "concepto",
  import: "importación",
  shift: "turno",
  announcement: "anuncio",
  platform_settings: "configuración",
  module: "módulo",
};

export default function ActivityLog() {
  const { role } = useAuth();
  const { companies, selectedCompanyId } = useCompany();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      let query = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (role !== "owner" && selectedCompanyId) {
        query = query.eq("company_id", selectedCompanyId);
      }
      if (filterEntity !== "all") {
        query = query.eq("entity_type", filterEntity);
      }
      if (filterAction !== "all") {
        query = query.eq("action", filterAction);
      }

      const { data } = await query;
      if (!data) { setLoading(false); return; }

      // Enrich with user and company names
      const userIds = [...new Set(data.map(l => l.user_id))];
      const companyIds = [...new Set(data.filter(l => l.company_id).map(l => l.company_id!))];

      const [{ data: profiles }, { data: companiesData }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds),
        companyIds.length > 0
          ? supabase.from("companies").select("id, name").in("id", companyIds)
          : Promise.resolve({ data: [] }),
      ]);

      const enriched: LogEntry[] = data.map(l => {
        const profile = profiles?.find(p => p.user_id === l.user_id);
        const company = companiesData?.find((c: any) => c.id === l.company_id);
        return {
          ...l,
          user_name: profile?.full_name || undefined,
          user_email: profile?.email || undefined,
          company_name: company?.name || undefined,
        };
      });

      setLogs(enriched);
      setLoading(false);
    }
    fetchLogs();
  }, [role, selectedCompanyId, filterEntity, filterAction, limit]);

  const filtered = logs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (l.user_name?.toLowerCase().includes(s)) ||
      (l.user_email?.toLowerCase().includes(s)) ||
      l.entity_type.toLowerCase().includes(s) ||
      l.action.toLowerCase().includes(s) ||
      (l.company_name?.toLowerCase().includes(s))
    );
  });

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Activity className="h-6 w-6" />
          Registro de Actividad
        </h1>
        <p className="page-subtitle">Historial de acciones realizadas en la plataforma</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuario, acción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las entidades</SelectItem>
            {Object.keys(ENTITY_LABELS).map(k => (
              <SelectItem key={k} value={k}>{ENTITY_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {Object.keys(ACTION_LABELS).map(k => (
              <SelectItem key={k} value={k}>{ACTION_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} {filtered.length === 1 ? "evento" : "eventos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 bg-muted rounded" />
                    <div className="h-3 w-1/2 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No hay actividad registrada</p>
              <p className="text-xs mt-1">Las acciones se registrarán automáticamente</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-1">
                {filtered.map((log, idx) => {
                  const Icon = ENTITY_ICONS[log.entity_type] || Activity;
                  const actionColor = ACTION_COLORS[log.action] || "bg-muted text-muted-foreground border-border";
                  const actionLabel = ACTION_LABELS[log.action] || log.action;
                  const entityLabel = ENTITY_LABELS[log.entity_type] || log.entity_type;

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 py-3 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${actionColor}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{log.user_name || log.user_email || "Sistema"}</span>
                          {" "}
                          <Badge variant="outline" className={`text-[10px] ${actionColor}`}>
                            {actionLabel}
                          </Badge>
                          {" "}
                          <span className="text-muted-foreground">{entityLabel}</span>
                          {log.entity_id && (
                            <span className="text-muted-foreground/60 text-xs ml-1">
                              #{log.entity_id.slice(0, 8)}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true, locale: es })}
                          </span>
                          {log.company_name && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-[11px] text-muted-foreground">{log.company_name}</span>
                            </>
                          )}
                        </div>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <pre className="text-[10px] text-muted-foreground/60 mt-1 bg-muted/50 rounded px-2 py-1 overflow-hidden max-h-16">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {filtered.length >= limit && (
                <div className="text-center pt-4">
                  <Button variant="outline" size="sm" onClick={() => setLimit(l => l + 50)}>
                    Cargar más
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
