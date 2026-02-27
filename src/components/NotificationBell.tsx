import { useState } from "react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const TYPE_ROUTES: Record<string, string> = {
  shift_request_new: "/app/requests",
  shift_assigned: "/portal/shifts",
  shift_confirmed: "/app/shifts",
  shift_rejected: "/app/shifts",
  clock_request: "/app/requests",
  announcement: "/portal/announcements",
  payment_ready: "/portal/payments",
};

function getNotificationRoute(n: { type: string; metadata: Record<string, any> | null }) {
  return TYPE_ROUTES[n.type] || "/app";
}

const TYPE_COLORS: Record<string, string> = {
  shift_request_new: "bg-amber-500",
  shift_assigned: "bg-primary",
  clock_request: "bg-orange-500",
  announcement: "bg-blue-500",
  payment_ready: "bg-emerald-500",
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleClick = (n: typeof notifications[0]) => {
    if (!n.read_at) markAsRead(n.id);
    const route = getNotificationRoute(n);
    setOpen(false);
    navigate(route);
  };

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
      <PopoverContent align="end" className="w-[360px] p-0 rounded-2xl shadow-xl border-border/50" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-heading font-bold">Notificaciones</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todo leído
            </button>
          )}
        </div>

        {/* Notifications list */}
        <ScrollArea className="max-h-[380px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground/60">Sin notificaciones</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex gap-3 items-start",
                    !n.read_at && "bg-primary/3"
                  )}
                >
                  <div className={cn(
                    "mt-1 h-2 w-2 rounded-full shrink-0 transition-opacity",
                    !n.read_at ? (TYPE_COLORS[n.type] || "bg-primary") : "opacity-0"
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-[13px] leading-snug",
                      !n.read_at ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                    )}>
                      {n.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground/70 leading-snug mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                    </p>
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
