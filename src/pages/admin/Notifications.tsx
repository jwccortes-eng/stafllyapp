import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { Bell, Search, CheckCheck, ExternalLink, Filter, X, Loader2 } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";

const TYPE_LABELS: Record<string, string> = {
  shift_request_new: "Solicitud de turno",
  shift_assigned: "Turno asignado",
  shift_confirmed: "Turno confirmado",
  shift_rejected: "Turno rechazado",
  clock_request: "Solicitud de marcaje",
  announcement: "Anuncio",
  payment_ready: "Pago listo",
  payroll_email: "Email de nómina",
  shift_reminder: "Recordatorio de turno",
  no_clock: "Sin marcaje",
  period_closed: "Periodo cerrado",
  general: "General",
};

const TYPE_ROUTES: Record<string, string> = {
  shift_request_new: "/app/requests",
  shift_assigned: "/portal/shifts",
  shift_confirmed: "/app/shifts",
  shift_rejected: "/app/shifts",
  clock_request: "/app/requests",
  announcement: "/portal/announcements",
  payment_ready: "/portal/payments",
};

const TYPE_COLORS: Record<string, string> = {
  shift_request_new: "bg-amber-500",
  shift_assigned: "bg-primary",
  clock_request: "bg-orange-500",
  announcement: "bg-blue-500",
  payment_ready: "bg-emerald-500",
  shift_reminder: "bg-indigo-500",
  no_clock: "bg-destructive",
  period_closed: "bg-teal-500",
  payroll_email: "bg-violet-500",
};

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">("all");

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, type, read_at, created_at, metadata, company_id")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setNotifications(data as AppNotification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const markAllAsRead = async () => {
    const unreadIds = filtered.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const handleClick = (n: AppNotification) => {
    if (!n.read_at) markAsRead(n.id);
    const route = TYPE_ROUTES[n.type];
    if (route) navigate(route);
  };

  // Unique types in data
  const availableTypes = [...new Set(notifications.map(n => n.type))];

  const filtered = notifications.filter(n => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (statusFilter === "unread" && n.read_at) return false;
    if (statusFilter === "read" && !n.read_at) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notificaciones"
        subtitle={`${unreadCount} sin leer de ${notifications.length} totales`}
      />

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar notificaciones..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {availableTypes.map(t => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="unread">Sin leer</SelectItem>
            <SelectItem value="read">Leídos</SelectItem>
          </SelectContent>
        </Select>

        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            Marcar todo leído
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No se encontraron notificaciones</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden divide-y divide-border/20">
          {filtered.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                "w-full text-left px-4 py-3.5 hover:bg-muted/30 transition-colors flex gap-3 items-start",
                !n.read_at && "bg-primary/[0.03]"
              )}
            >
              <div className={cn(
                "mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 transition-opacity",
                !n.read_at ? (TYPE_COLORS[n.type] || "bg-primary") : "opacity-0"
              )} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={cn(
                    "text-sm leading-snug",
                    !n.read_at ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                  )}>
                    {n.title}
                  </p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                    {TYPE_LABELS[n.type] || n.type}
                  </Badge>
                </div>
                <p className="text-[13px] text-muted-foreground/70 leading-snug line-clamp-2">
                  {n.body}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1">
                  {format(new Date(n.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                  {" · "}
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                </p>
              </div>
              {TYPE_ROUTES[n.type] && (
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0 mt-1.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
