/**
 * OpsBroadcastDialog — sends a quick in-app notification to a set of workers
 * tied to one or more shifts. Reuses the existing `notifications` table — does
 * NOT create any new messaging system. Optional WhatsApp deep-link per worker.
 *
 * Use cases (from operations-actions.ts):
 *   - broadcast_shift  → "Necesitamos cubrir un turno"
 *   - urgent_broadcast → "URGENTE: cobertura ya"
 *   - alert_supervisors → notifies shift_admin / company admins
 *   - send_late_reminder → ping late workers
 *   - reactivate_workforce → re-engage inactive employees
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, Megaphone, Phone } from "lucide-react";

export type BroadcastIntent = "broadcast" | "urgent" | "supervisors" | "late_reminder" | "reactivate";

interface OpsBroadcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  intent: BroadcastIntent;
  /** Shifts the message refers to (for context + linking) */
  shiftIds: string[];
  /** When set, restricts the audience to these employee IDs */
  audienceEmployeeIds?: string[];
  /** Optional zone label shown in header */
  zone?: string;
}

interface AudienceRow {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  user_id: string | null;
  selected: boolean;
}

const INTENT_CONFIG: Record<BroadcastIntent, {
  title: string;
  description: string;
  defaultMessage: string;
  notifType: string;
  notifTitle: string;
}> = {
  broadcast: {
    title: "Enviar broadcast",
    description: "Aviso a los trabajadores elegibles para cubrir el turno.",
    defaultMessage: "Hola, necesitamos cubrir un turno. ¿Estás disponible?",
    notifType: "shift_broadcast",
    notifTitle: "Turno disponible",
  },
  urgent: {
    title: "Broadcast urgente",
    description: "Mensaje prioritario — el turno empieza pronto.",
    defaultMessage: "🚨 URGENTE: tenemos un turno por cubrir hoy. ¿Puedes entrar?",
    notifType: "shift_urgent",
    notifTitle: "🚨 Turno urgente",
  },
  supervisors: {
    title: "Avisar supervisores",
    description: "Notifica a admins de turno y administradores generales.",
    defaultMessage: "Atención: spike de no-shows detectado. Revisar Command Center.",
    notifType: "ops_supervisor_alert",
    notifTitle: "Alerta operativa",
  },
  late_reminder: {
    title: "Enviar reminder",
    description: "Recordatorio rápido a quienes llegaron tarde.",
    defaultMessage: "Recuerda fichar al llegar. Tu puntualidad cuenta.",
    notifType: "late_reminder",
    notifTitle: "Recordatorio de puntualidad",
  },
  reactivate: {
    title: "Reactivar workforce",
    description: "Mensaje a trabajadores sin actividad reciente.",
    defaultMessage: "¡Te extrañamos! Tenemos turnos disponibles. ¿Vuelves a trabajar con nosotros?",
    notifType: "workforce_reactivation",
    notifTitle: "Te extrañamos",
  },
};

export function OpsBroadcastDialog({
  open, onOpenChange, companyId, intent, shiftIds, audienceEmployeeIds, zone,
}: OpsBroadcastDialogProps) {
  const { user } = useAuth();
  const cfg = INTENT_CONFIG[intent];
  const [audience, setAudience] = useState<AudienceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(cfg.defaultMessage);

  useEffect(() => { setMessage(cfg.defaultMessage); }, [cfg.defaultMessage, intent]);

  const loadAudience = useCallback(async () => {
    setLoading(true);
    try {
      let employeeIds = audienceEmployeeIds ?? [];

      // If supervisors → resolve admins of company
      if (intent === "supervisors") {
        const { data: admins } = await supabase
          .from("company_users")
          .select("user_id")
          .eq("company_id", companyId)
          .in("role", ["admin", "owner"]);
        const adminUserIds = (admins ?? []).map(a => a.user_id);
        if (!adminUserIds.length) { setAudience([]); setLoading(false); return; }
        const { data: emps } = await supabase
          .from("employees")
          .select("id, first_name, last_name, phone_number, avatar_url, user_id")
          .eq("company_id", companyId)
          .in("user_id", adminUserIds);
        setAudience((emps ?? []).map(e => ({ ...e, selected: true })));
        setLoading(false);
        return;
      }

      // If no specific audience → derive from shifts (assigned workers) or all active for broadcast
      if (!employeeIds.length && shiftIds.length) {
        const { data: assigns } = await supabase
          .from("shift_assignments")
          .select("employee_id")
          .in("shift_id", shiftIds)
          .not("status", "in", "(rejected,removed)");
        employeeIds = Array.from(new Set((assigns ?? []).map(a => a.employee_id)));
      }

      // Reactivation/broadcast with no audience yet → fetch all active employees (cap 60)
      if (!employeeIds.length) {
        const { data: emps } = await supabase
          .from("employees")
          .select("id, first_name, last_name, phone_number, avatar_url, user_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .limit(60);
        setAudience((emps ?? []).map(e => ({ ...e, selected: true })));
        setLoading(false);
        return;
      }

      const { data: emps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, phone_number, avatar_url, user_id")
        .in("id", employeeIds);
      setAudience((emps ?? []).map(e => ({ ...e, selected: true })));
    } finally {
      setLoading(false);
    }
  }, [audienceEmployeeIds, companyId, intent, shiftIds]);

  useEffect(() => { if (open) loadAudience(); }, [open, loadAudience]);

  const toggle = (id: string) =>
    setAudience(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  const toggleAll = (val: boolean) =>
    setAudience(prev => prev.map(r => ({ ...r, selected: val })));

  const selectedCount = audience.filter(a => a.selected).length;

  const send = async () => {
    if (!message.trim()) { toast.error("Escribe un mensaje"); return; }
    const targets = audience.filter(a => a.selected && a.user_id);
    if (!targets.length) { toast.error("Selecciona al menos un destinatario con cuenta"); return; }

    setSending(true);
    try {
      const rows = targets.map(t => ({
        company_id: companyId,
        recipient_id: t.user_id!,
        recipient_type: "user",
        type: cfg.notifType,
        title: cfg.notifTitle,
        body: message.trim(),
        metadata: {
          shift_ids: shiftIds,
          intent,
          zone: zone ?? null,
          employee_id: t.id,
        },
        created_by: user?.id ?? null,
      }));
      const { error } = await supabase.from("notifications").insert(rows as any);
      if (error) throw error;
      toast.success(`Mensaje enviado a ${targets.length} ${targets.length === 1 ? "persona" : "personas"}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al enviar", { description: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" />
            {cfg.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {cfg.description}
            {zone && <span className="block mt-0.5 text-foreground font-semibold">{zone}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 space-y-3">
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Escribe el mensaje..."
            rows={3}
            className="text-sm resize-none"
          />

          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Destinatarios ({selectedCount}/{audience.length})
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => toggleAll(true)}>
                Todos
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => toggleAll(false)}>
                Ninguno
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[40vh] px-5 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : audience.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No hay destinatarios disponibles
            </div>
          ) : (
            <div className="space-y-1">
              {audience.map(a => (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                    a.selected ? "bg-primary/[0.04]" : "hover:bg-muted/40",
                  )}
                >
                  <Checkbox checked={a.selected} onCheckedChange={() => toggle(a.id)} />
                  <Avatar className="h-7 w-7">
                    {a.avatar_url && <AvatarImage src={a.avatar_url} />}
                    <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                      {a.first_name?.[0]}{a.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">
                      {a.first_name} {a.last_name}
                    </p>
                    {!a.user_id && (
                      <Badge variant="outline" className="text-[8px] h-4">sin cuenta</Badge>
                    )}
                  </div>
                  {a.phone_number && (
                    <a
                      href={`https://wa.me/${a.phone_number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`}
                      target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="rounded-md p-1 hover:bg-muted/60"
                      title="WhatsApp"
                    >
                      <Phone className="h-3 w-3 text-muted-foreground" />
                    </a>
                  )}
                </label>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-5 pb-5 pt-2 border-t border-border/30">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={send}
            disabled={sending || !selectedCount || !message.trim()}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar a {selectedCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
