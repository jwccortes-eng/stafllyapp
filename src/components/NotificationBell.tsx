import { useState } from "react";
import { Bell, CheckCheck, ExternalLink, Briefcase, Megaphone, CreditCard, Clock, UserPlus, Star } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

const TYPE_ROUTES: Record<string, string> = {
  shift_request_new: "/app/requests",
  shift_assigned: "/portal/shifts",
  shift_available: "/portal/shifts",
  shift_updated: "/portal/shifts",
  shift_confirmed: "/app/shifts",
  shift_rejected: "/app/shifts",
  clock_request: "/app/requests",
  announcement: "/portal/announcements",
  payment_ready: "/portal/payments",
  shift_reminder: "/portal/shifts",
  shift_reminder_24h: "/portal/shifts",
  shift_reminder_1h: "/portal/shifts",
  shift_confirm_reminder: "/portal/shifts",
  shift_confirm_urgent: "/portal/shifts",
  no_clock: "/app/timeclock",
  no_clockin_alert: "/app/ops-center",
  no_show_alert: "/app/ops-center",
  period_closed: "/app/summary",
  payroll_email: "/app/summary",
  new_application: "/app/applications",
  invitation_accepted: "/app/employees",
  invitation_expired: "/app/employees",
  review_pending: "/app/shifts",
};

function getNotificationRoute(n: { type: string; metadata: Record<string, any> | null }) {
  return TYPE_ROUTES[n.type] || "/app";
}

const TYPE_COLORS: Record<string, string> = {
  shift_request_new: "bg-amber-500",
  shift_assigned: "bg-primary",
  shift_available: "bg-emerald-500",
  shift_updated: "bg-sky-500",
  clock_request: "bg-orange-500",
  announcement: "bg-blue-500",
  payment_ready: "bg-emerald-500",
  shift_reminder: "bg-indigo-500",
  no_clock: "bg-destructive",
  period_closed: "bg-teal-500",
  payroll_email: "bg-violet-500",
  new_application: "bg-cyan-500",
  invitation_accepted: "bg-green-500",
  invitation_expired: "bg-orange-400",
  review_pending: "bg-yellow-500",
};

type FilterTab = "all" | "shifts" | "clock" | "people" | "other";

const FILTER_GROUPS: Record<FilterTab, string[] | null> = {
  all: null,
  shifts: ["shift_request_new", "shift_assigned", "shift_available", "shift_updated", "shift_confirmed", "shift_rejected", "shift_reminder"],
  clock: ["clock_request", "no_clock"],
  people: ["new_application", "invitation_accepted", "invitation_expired", "review_pending"],
  other: ["announcement", "payment_ready", "period_closed", "payroll_email"],
};

const FILTER_ICONS: Record<FilterTab, React.ReactNode> = {
  all: <Bell className="h-3 w-3" />,
  shifts: <Briefcase className="h-3 w-3" />,
  clock: <Clock className="h-3 w-3" />,
  people: <UserPlus className="h-3 w-3" />,
  other: <Megaphone className="h-3 w-3" />,
};

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "Todo",
  shifts: "Turnos",
  clock: "Fichajes",
  people: "Personal",
  other: "Otros",
};

const TYPE_LABELS: Record<string, string> = {
  shift_request_new: "Solicitud",
  shift_assigned: "Asignación",
  shift_available: "Disponible",
  shift_updated: "Actualización",
  shift_confirmed: "Confirmado",
  shift_rejected: "Rechazado",
  clock_request: "Fichaje",
  announcement: "Anuncio",
  payment_ready: "Pago",
  shift_reminder: "Recordatorio",
  no_clock: "Sin fichaje",
  period_closed: "Periodo",
  payroll_email: "Nómina",
  new_application: "Aplicación",
  invitation_accepted: "Invitación",
  invitation_expired: "Expirada",
  review_pending: "Evaluación",
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const navigate = useNavigate();

  const handleClick = (n: typeof notifications[0]) => {
    if (!n.read_at) markAsRead(n.id);
    const route = getNotificationRoute(n);
    setOpen(false);
    navigate(route);
  };

  const filtered = FILTER_GROUPS[filter]
    ? notifications.filter(n => FILTER_GROUPS[filter]!.includes(n.type))
    : notifications;

  const filterCounts = Object.entries(FILTER_GROUPS).reduce((acc, [key, types]) => {
    acc[key as FilterTab] = types
      ? notifications.filter(n => !n.read_at && types.includes(n.type)).length
      : unreadCount;
    return acc;
  }, {} as Record<FilterTab, number>);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-2 rounded-xl hover:bg-muted/40 transition-all active:scale-90"
          aria-label="Notificaciones"
        >
          <Bell className="h-[18px] w-[18px] text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-primary-foreground bg-destructive rounded-full animate-in zoom-in-50">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0 rounded-2xl shadow-xl border-border/50" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-heading font-bold">Notificaciones</h3>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todo leído
              </button>
            )}
            <button
              onClick={() => { setOpen(false); navigate("/app/notifications"); }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Ver todas
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-border/20 overflow-x-auto">
          {(Object.keys(FILTER_LABELS) as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap",
                filter === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              {FILTER_ICONS[tab]}
              {FILTER_LABELS[tab]}
              {filterCounts[tab] > 0 && (
                <span className={cn(
                  "min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center",
                  filter === tab ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                )}>
                  {filterCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        <ScrollArea className="max-h-[380px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground/60">
                {filter === "all" ? "Sin notificaciones" : "Sin notificaciones en esta categoría"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex gap-3 items-start",
                    !n.read_at && "bg-primary/[0.03]"
                  )}
                >
                  <div className={cn(
                    "mt-1.5 h-2 w-2 rounded-full shrink-0 transition-opacity",
                    !n.read_at ? (TYPE_COLORS[n.type] || "bg-primary") : "opacity-0"
                  )} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                        !n.read_at ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {TYPE_LABELS[n.type] || n.type}
                      </span>
                    </div>
                    <p className={cn(
                      "text-[13px] leading-snug",
                      !n.read_at ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                    )}>
                      {n.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground/70 leading-snug mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] text-muted-foreground/40">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                      </p>
                      <span className="text-[10px] text-muted-foreground/25">·</span>
                      <p className="text-[10px] text-muted-foreground/30 tabular-nums">
                        {format(new Date(n.created_at), "dd MMM, HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
