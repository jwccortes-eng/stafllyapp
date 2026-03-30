import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PortalAccessBadge, getPortalAccessState, type PortalAccessState } from "./PortalAccessBadge";
import { Send, MessageCircle, Copy, CheckCircle2, Smartphone, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface PortalAccessCardProps {
  employee: Record<string, any>;
  companyName: string;
  onInvite?: () => void;
}

/**
 * Portal access status card shown in the employee profile drawer.
 * Shows current state + contextual actions.
 */
export function PortalAccessCard({ employee, companyName, onInvite }: PortalAccessCardProps) {
  const state = getPortalAccessState(employee);

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
                {state === "ready" && "Listo para recibir invitación"}
                {state === "incomplete" && "Faltan datos para poder invitar"}
                {state === "inactive" && "Cuenta desactivada"}
              </p>
            </div>
          </div>
          <PortalAccessBadge employee={employee} />
        </div>

        {/* Details row */}
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
        </div>

        {/* Actions */}
        {state === "ready" && onInvite && (
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={onInvite}>
            <Send className="h-3.5 w-3.5" />
            Enviar invitación
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
    ready: { bg: "bg-primary/10", icon: Send, iconClass: "text-primary" },
    incomplete: { bg: "bg-warning/10", icon: Clock, iconClass: "text-warning" },
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
