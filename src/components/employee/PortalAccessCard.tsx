import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PortalAccessBadge, getPortalAccessState, type PortalAccessState } from "./PortalAccessBadge";
import { Send, CheckCircle2, Smartphone, Clock, MailCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";

interface PortalAccessCardProps {
  employee: Record<string, any>;
  companyName: string;
  invitation?: EmployeeInvitation | null;
  onInvite?: () => void;
}

export function PortalAccessCard({ employee, companyName, invitation, onInvite }: PortalAccessCardProps) {
  const state = getPortalAccessState(employee, invitation);

  return (
    <Card className="rounded-xl border-border/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon state={state} />
            <div>
              <p className="text-sm font-semibold">Acceso al portal</p>
              <p className="text-[10px] text-muted-foreground">
                {state === "active" && "El empleado tiene acceso activo al portal"}
                {state === "invited" && "Invitación enviada — pendiente de activación"}
                {state === "ready" && "Listo para recibir invitación"}
                {state === "incomplete" && "Faltan datos para poder invitar"}
                {state === "inactive" && "Cuenta desactivada"}
              </p>
            </div>
          </div>
          <PortalAccessBadge employee={employee} invitation={invitation} />
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">Teléfono</span>
            <p className={cn("font-medium mt-0.5", employee.phone_number ? "text-foreground" : "text-warning")}>
              {employee.phone_number || "No registrado"}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">PIN</span>
            <p className={cn("font-medium mt-0.5 font-mono tracking-wider", employee.access_pin ? "text-foreground" : "text-warning")}>
              {employee.access_pin || "Sin PIN"}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">Email</span>
            <p className={cn("font-medium mt-0.5 truncate", employee.email ? "text-foreground" : "text-muted-foreground/50")}>
              {employee.email || "Sin email"}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">Cuenta portal</span>
            <p className={cn("font-medium mt-0.5", employee.user_id ? "text-[hsl(var(--earning))]" : "text-muted-foreground/50")}>
              {employee.user_id ? "✓ Vinculada" : "Sin cuenta"}
            </p>
          </div>
        </div>

        {/* Invitation history */}
        {invitation && (
          <div className="bg-primary/[0.03] rounded-lg px-2.5 py-2 space-y-1 border border-primary/10">
            <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
              <MailCheck className="h-3 w-3" /> Última invitación
            </p>
            <div className="grid grid-cols-2 gap-x-4 text-[10px]">
              <div>
                <span className="text-muted-foreground">Canal:</span>
                <span className="ml-1 font-medium capitalize">{invitation.channel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Estado:</span>
                <span className="ml-1 font-medium capitalize">{invitation.status}</span>
              </div>
              <div className="col-span-2 mt-0.5">
                <span className="text-muted-foreground">Enviada:</span>
                <span className="ml-1 font-medium">
                  {new Date(invitation.sent_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {(state === "ready" || state === "invited") && onInvite && (
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={onInvite}>
            {state === "invited" ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {state === "invited" ? "Reenviar invitación" : "Enviar invitación"}
          </Button>
        )}

        {state === "active" && (
          <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--earning))]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-medium">Empleado ya accedió al portal</span>
          </div>
        )}

        {state === "incomplete" && (
          <p className="text-[10px] text-warning flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Completa teléfono y PIN en la pestaña de Acceso para poder invitar
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIcon({ state }: { state: PortalAccessState }) {
  const config: Record<PortalAccessState, { bg: string; icon: typeof CheckCircle2; iconClass: string }> = {
    active: { bg: "bg-[hsl(var(--earning)/0.1)]", icon: CheckCircle2, iconClass: "text-[hsl(var(--earning))]" },
    invited: { bg: "bg-primary/10", icon: MailCheck, iconClass: "text-primary" },
    ready: { bg: "bg-warning/10", icon: Send, iconClass: "text-warning" },
    incomplete: { bg: "bg-destructive/10", icon: Clock, iconClass: "text-destructive" },
    inactive: { bg: "bg-muted", icon: Smartphone, iconClass: "text-muted-foreground" },
  };
  const c = config[state];
  const Icon = c.icon;
  return (
    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", c.bg)}>
      <Icon className={cn("h-4 w-4", c.iconClass)} />
    </div>
  );
}
