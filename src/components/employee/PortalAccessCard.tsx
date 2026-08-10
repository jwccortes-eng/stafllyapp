import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { PortalAccessBadge, getPortalAccessState, type PortalAccessState } from "./PortalAccessBadge";
import { Send, CheckCircle2, Smartphone, Clock, MailCheck, RefreshCw, Copy, Check, MessageCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmployeeInvitation } from "@/hooks/useEmployeeInvitations";
import { inviteUrl } from "@/lib/app-url";
import { buildWhatsAppTargets } from "@/lib/phone";
import { getInviteSubState, humanizeInvitationError, missingContactMessage } from "@/lib/invitation-error-messages";
import { isInviteStatusFailure } from "@/lib/invitation-status";

interface PortalAccessCardProps {
  employee: Record<string, any>;
  companyName: string;
  invitation?: EmployeeInvitation | null;
  onInvite?: () => void;
}

export function PortalAccessCard({ employee, companyName, invitation, onInvite }: PortalAccessCardProps) {
  const { toast } = useToast();
  const state = getPortalAccessState(employee, invitation);
  const hasPin = typeof employee.has_access_pin === "boolean"
    ? employee.has_access_pin
    : !!(employee.access_pin ?? "").toString().trim();

  const hasPhone = !!(employee.phone_number ?? "").toString().replace(/\D/g, "");
  const hasEmail = !!employee.email;

  const [linkCopied, setLinkCopied] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const subState = invitation?.status ? getInviteSubState(invitation.status) : null;
  const human = invitation?.last_error ? humanizeInvitationError(invitation.last_error) : null;
  const missingContact = missingContactMessage({ hasEmail, hasPhone });

  const link = invitation?.invite_token ? inviteUrl(invitation.invite_token) : null;
  const linkActive = !!link
    && !["expired", "revoked", "superseded", "accepted"].includes(invitation?.status ?? "");

  const isFailed = invitation ? isInviteStatusFailure(invitation.status) : false;
  const canRetryEmail = hasEmail && (isFailed || invitation?.status === "expired" || invitation?.status === "revoked");

  const portalMessage =
    `¡Hola ${employee.first_name ?? ""}! Te invitamos al portal de ${companyName}.${link ? `\n\nActiva tu cuenta: ${link}` : ""}`;
  const wa = buildWhatsAppTargets(employee.phone_number, portalMessage);

  const copyLink = async () => {
    if (!link || !linkActive) {
      toast({ title: "Enlace no disponible", description: "Genera una nueva invitación.", variant: "destructive" });
      return;
    }
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast({ title: "Enlace copiado" });
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const openWhatsApp = () => {
    if (!hasPhone || !wa.phoneWithCountry) {
      toast({ title: "Falta teléfono", description: "Agrega un teléfono al trabajador para invitar por WhatsApp.", variant: "destructive" });
      return;
    }
    window.open(wa.waMeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="rounded-xl border-border/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon state={state} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Acceso al portal</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {state === "active" && "El trabajador tiene acceso activo"}
                {state === "invited" && "Esperando al trabajador"}
                {state === "ready" && "Listo para enviar invitación"}
                {state === "incomplete" && "Faltan datos para invitar"}
                {state === "inactive" && "Cuenta desactivada"}
                {state === "failed" && "Falló el último envío"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <PortalAccessBadge employee={employee} invitation={invitation} />
            {subState && state !== "active" && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal" title={subState.description}>
                {subState.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Missing-contact hint */}
        {missingContact && state !== "active" && (
          <div className="rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-[10px] text-warning flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {missingContact}
          </div>
        )}

        {/* Humanized error with collapsible technical detail */}
        {human && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[10px] space-y-1">
            <div className="flex items-center gap-1.5 text-destructive font-semibold">
              <AlertCircle className="h-3 w-3 shrink-0" /> {human.title}
            </div>
            <p className="text-destructive/90 leading-snug">{human.message}</p>
            <Collapsible open={showTech} onOpenChange={setShowTech}>
              <CollapsibleTrigger asChild>
                <button type="button" className="text-[9px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                  {showTech ? "Ocultar detalle técnico" : "Ver detalle técnico"}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-0.5">
                <pre className="text-[9px] bg-background/60 border border-border/40 rounded px-1.5 py-1 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">
{human.technical}
                </pre>
                <div className="text-[9px] text-muted-foreground/80 space-y-0.5">
                  {invitation?.attempts ? <div>Intentos: {invitation.attempts}</div> : null}
                  {invitation?.bounce_reason && <div>Bounce: {invitation.bounce_reason}</div>}
                  {invitation?.provider_message_id && <div className="font-mono">{invitation.provider_message_id}</div>}
                  {invitation?.invite_recipient && <div>Destinatario: {invitation.invite_recipient}</div>}
                  {invitation?.last_attempt_at && <div>Último intento: {new Date(invitation.last_attempt_at).toLocaleString("es")}</div>}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Details grid — access-credential-only.
            Phase 1B 2026-06-18: phone/email here are labeled as login/invite
            credentials, not general contact info. General contact lives in
            Datos principales. No behavior change; relabel only. */}
        <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          Credenciales de acceso · usadas para invitación y login
        </p>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">Teléfono (login)</span>
            <p className={cn("font-medium mt-0.5", hasPhone ? "text-foreground" : "text-warning")}>
              {employee.phone_number || "No registrado"}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">PIN</span>
            <p className={cn("font-medium mt-0.5", hasPin ? "text-foreground" : "text-warning")}>
              {hasPin ? "PIN configurado" : "Sin PIN"}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg px-2.5 py-1.5">
            <span className="text-muted-foreground">Email (invitación)</span>
            <p className={cn("font-medium mt-0.5 truncate", hasEmail ? "text-foreground" : "text-muted-foreground/50")}>
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

        {/* Last invitation summary */}
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
                <span className="ml-1 font-medium">{subState?.label ?? invitation.status}</span>
              </div>
              {invitation.sent_at && (
                <div className="col-span-2 mt-0.5">
                  <span className="text-muted-foreground">Enviada:</span>
                  <span className="ml-1 font-medium">
                    {new Date(invitation.sent_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick actions row — visible when there's a link or a phone */}
        {(linkActive || hasPhone) && state !== "active" && state !== "incomplete" && (
          <div className="flex flex-wrap gap-1.5">
            {linkActive && (
              <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 flex-1 min-w-[110px]" onClick={copyLink}>
                {linkCopied ? <Check className="h-3 w-3 text-[hsl(var(--earning))]" /> : <Copy className="h-3 w-3" />}
                {linkCopied ? "Copiado" : "Copiar link"}
              </Button>
            )}
            {hasPhone && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] gap-1 flex-1 min-w-[110px] border-[#25D366]/30 hover:bg-[#25D366]/10"
                onClick={openWhatsApp}
              >
                <MessageCircle className="h-3 w-3 text-[#25D366]" />
                Abrir WhatsApp
              </Button>
            )}
          </div>
        )}

        {/* Primary actions */}
        {(state === "ready" || state === "invited" || state === "failed") && onInvite && (
          <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={onInvite}>
            {canRetryEmail ? <RefreshCw className="h-3.5 w-3.5" /> : state === "invited" ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {canRetryEmail ? "Reintentar email" : state === "invited" ? "Reenviar invitación" : "Enviar invitación"}
          </Button>
        )}

        {state === "active" && (
          <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--earning))]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-medium">Trabajador ya accedió al portal</span>
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
    active: { bg: "bg-earning/10", icon: CheckCircle2, iconClass: "text-earning" },
    invited: { bg: "bg-primary/10", icon: MailCheck, iconClass: "text-primary" },
    failed: { bg: "bg-destructive/10", icon: AlertCircle, iconClass: "text-destructive" },
    unlinked: { bg: "bg-warning/10", icon: AlertCircle, iconClass: "text-warning" },

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
