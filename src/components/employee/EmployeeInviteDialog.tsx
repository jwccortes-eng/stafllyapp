import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingConfig } from "@/hooks/useOnboardingConfig";
import { isInviteStatusFailure, isInviteStatusInFlight, mapEmailLogStatusToInviteStatus, type InviteDeliveryStatus } from "@/lib/invitation-status";
import { buildWhatsAppTargets, normalizePhone } from "@/lib/phone";
import { Send, MessageCircle, Phone, Copy, Check, Mail, Smartphone, CheckCircle2, AlertTriangle, Link2, Loader2, RefreshCw, Clock, Shield, KeyRound, XCircle, AlertCircle, MailCheck, MailX } from "lucide-react";
import { cn } from "@/lib/utils";
import { portalAuthUrl, inviteUrl } from "@/lib/app-url";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { addDays } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Record<string, any>;
  onInviteSent?: (channel: "whatsapp" | "sms" | "email" | "copy" | "other") => void;
  inviteToken?: string | null;
}

const STATUS_CONFIG: Record<InviteDeliveryStatus, { label: string; color: string; icon: any; description: string }> = {
  created: { label: "Pendiente", color: "bg-muted text-muted-foreground", icon: Clock, description: "Invitación creada, no enviada aún" },
  queued: { label: "En cola", color: "bg-primary/10 text-primary", icon: Loader2, description: "Email en cola de envío" },
  processing: { label: "Procesando", color: "bg-primary/10 text-primary", icon: Loader2, description: "El backend está procesando el envío" },
  sent: { label: "Enviado al proveedor", color: "bg-primary/10 text-primary", icon: Send, description: "El proveedor aceptó el email, aún sin confirmación final" },
  provider_accepted: { label: "Aceptado por proveedor", color: "bg-primary/10 text-primary", icon: MailCheck, description: "Proveedor confirmó recepción" },
  delivered: { label: "Entregado", color: "bg-[hsl(var(--earning))]/10 text-[hsl(var(--earning))]", icon: CheckCircle2, description: "Email entregado al buzón" },
  opened: { label: "Abierto", color: "bg-warning/10 text-warning", icon: CheckCircle2, description: "El empleado abrió el email" },
  accepted: { label: "Activado", color: "bg-[hsl(var(--earning))]/10 text-[hsl(var(--earning))]", icon: CheckCircle2, description: "Cuenta activada exitosamente" },
  expired: { label: "Expirado", color: "bg-destructive/10 text-destructive", icon: Clock, description: "La invitación expiró" },
  revoked: { label: "Revocado", color: "bg-destructive/10 text-destructive", icon: XCircle, description: "Invitación revocada por admin" },
  failed: { label: "Fallido", color: "bg-destructive/10 text-destructive", icon: MailX, description: "Error al enviar el email" },
  bounced: { label: "Rebotado", color: "bg-destructive/10 text-destructive", icon: AlertCircle, description: "Email rebotó (dirección inválida)" },
  dlq: { label: "DLQ", color: "bg-destructive/10 text-destructive", icon: AlertCircle, description: "El email agotó sus reintentos y pasó a cola muerta" },
  resent: { label: "Reenviado", color: "bg-primary/10 text-primary", icon: RefreshCw, description: "Invitación reenviada" },
};

export function EmployeeInviteDialog({ open, onOpenChange, employee, onInviteSent, inviteToken: initialToken }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { config: onboardingConfig } = useOnboardingConfig();
  const { companies, selectedCompanyId } = useCompany();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [liveToken, setLiveToken] = useState<string | null>(initialToken ?? null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteDeliveryStatus>("created");
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(null);
  const [inviteChannel, setInviteChannel] = useState<string | null>(null);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [generatingPin, setGeneratingPin] = useState(false);
  const [livePin, setLivePin] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null);
  const [inviteRecipient, setInviteRecipient] = useState<string | null>(null);
  const [providerMessageId, setProviderMessageId] = useState<string | null>(null);
  const [statusChangedAt, setStatusChangedAt] = useState<string | null>(null);

  const company = companies.find(c => c.id === selectedCompanyId);
  const companyName = company?.name ?? "la empresa";

  const portalUrl = portalAuthUrl();
  const inviteLink = liveToken ? inviteUrl(liveToken) : null;
  const currentPin = livePin ?? (typeof employee.access_pin === "string" && employee.access_pin.trim() ? employee.access_pin.trim() : null);
  const pin = currentPin ?? "—";
  const hasPin = currentPin !== null;
  const hasPhone = !!(employee.phone_number ?? "").replace(/\D/g, "");
  const hasEmail = !!employee.email;

  const [companyMismatch, setCompanyMismatch] = useState(false);
  // Worker is archived/deactivated — block all send actions, keep view-only affordances.
  const isInactive = employee.is_active === false;

  // Reset livePin when dialog opens/closes
  useEffect(() => {
    if (!open) { setLivePin(null); setLastError(null); }
  }, [open]);

  useEffect(() => {
    if (!open || !providerMessageId) return;

    let cancelled = false;
    const syncEmailStatus = async () => {
      const { data } = await supabase
        .from("email_send_log")
        .select("status, error_message, created_at")
        .eq("message_id", providerMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data || cancelled) return;

      const nextStatus = mapEmailLogStatusToInviteStatus(data.status, inviteStatus);
      setInviteStatus(nextStatus);
      setStatusChangedAt(data.created_at ?? null);
      if (data.error_message) {
        setLastError(data.error_message);
      }
    };

    void syncEmailStatus();
    const shouldPoll = isInviteStatusInFlight(inviteStatus);
    if (!shouldPoll) {
      return () => {
        cancelled = true;
      };
    }

    const interval = window.setInterval(() => {
      void syncEmailStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, providerMessageId, inviteStatus]);

  // Load or create invitation when dialog opens
  useEffect(() => {
    if (!open) return;
    setLiveToken(initialToken ?? null);
    setCompanyMismatch(false);
    setLastError(null);
    if (!selectedCompanyId || !user?.id || !employee.id) return;

    if (employee.company_id && employee.company_id !== selectedCompanyId) {
      console.error("[invite] BLOCKED: company mismatch — employee.company_id=%s selectedCompanyId=%s employee=%s", employee.company_id, selectedCompanyId, employee.id);
      setCompanyMismatch(true);
      return;
    }

    let cancelled = false;
    (async () => {
      setCreatingInvite(true);

      const { data: existing } = await supabase
        .from("employee_invitations")
        .select("id, invite_token, status, sent_at, channel, last_error, attempts, last_attempt_at, invite_recipient, provider_message_id")
        .eq("company_id", selectedCompanyId)
        .eq("employee_id", employee.id)
        .in("status", ["created", "queued", "sent", "provider_accepted", "delivered", "opened"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single() as any;

      if (!cancelled && existing?.invite_token) {
        setLiveToken(existing.invite_token);
        setInviteStatus(existing.status);
        setInviteSentAt(existing.sent_at);
        setInviteChannel(existing.channel);
        setInviteId(existing.id);
        setLastError(existing.last_error);
        setAttempts(existing.attempts ?? 0);
        setLastAttemptAt(existing.last_attempt_at);
        setInviteRecipient(existing.invite_recipient);
        setProviderMessageId(existing.provider_message_id);
        setStatusChangedAt(existing.last_attempt_at ?? existing.sent_at ?? null);
        setCreatingInvite(false);
        return;
      }

      const { data: accepted } = await supabase
        .from("employee_invitations")
        .select("id, invite_token, status, sent_at, channel")
        .eq("company_id", selectedCompanyId)
        .eq("employee_id", employee.id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .single() as any;

      if (!cancelled && accepted) {
        setLiveToken(accepted.invite_token);
        setInviteStatus("accepted");
        setInviteSentAt(accepted.sent_at);
        setInviteChannel(accepted.channel);
        setInviteId(accepted.id);
        setCreatingInvite(false);
        return;
      }

      if (initialToken) { setCreatingInvite(false); return; }

      const { data, error } = await supabase
        .from("employee_invitations")
        .insert({
          company_id: selectedCompanyId,
          employee_id: employee.id,
          channel: "copy" as const,
          status: "created" as const,
          sent_by: user.id,
          sent_at: new Date().toISOString(),
          expires_at: addDays(new Date(), onboardingConfig.invite_expiry_days).toISOString(),
        })
        .select("id, invite_token, status, sent_at, channel")
        .single() as any;

      if (!cancelled && !error && data) {
        setLiveToken(data.invite_token);
        setInviteStatus(data.status);
        setInviteSentAt(data.sent_at);
        setInviteId(data.id);
      }
      if (!cancelled) setCreatingInvite(false);
    })();
    return () => { cancelled = true; };
  }, [open, initialToken, selectedCompanyId, user?.id, employee.id]);

  const markSent = async (channel: "whatsapp" | "sms" | "copy") => {
    if (!inviteId) return;
    await supabase
      .from("employee_invitations")
      .update({ status: "sent", channel, sent_at: new Date().toISOString() } as any)
      .eq("id", inviteId);
    setInviteStatus("sent");
    setInviteChannel(channel);
    setInviteSentAt(new Date().toISOString());
    onInviteSent?.(channel);
  };

  const resendInvite = async () => {
    if (!selectedCompanyId || !user?.id || !employee.id) return;
    if (employee.company_id && employee.company_id !== selectedCompanyId) {
      toast({ title: "Error de seguridad", description: "Este empleado no pertenece a la empresa seleccionada.", variant: "destructive" });
      return;
    }
    setCreatingInvite(true);
    setLastError(null);
    const { data, error } = await supabase
      .from("employee_invitations")
      .insert({
        company_id: selectedCompanyId,
        employee_id: employee.id,
        channel: "copy" as const,
        status: "created" as const,
        sent_by: user.id,
        sent_at: new Date().toISOString(),
        expires_at: addDays(new Date(), onboardingConfig.invite_expiry_days).toISOString(),
      })
      .select("id, invite_token, status, sent_at, channel")
      .single() as any;
    if (!error && data) {
      setLiveToken(data.invite_token);
      setInviteStatus(data.status);
      setInviteSentAt(data.sent_at);
      setInviteId(data.id);
      setAttempts(0);
      setProviderMessageId(null);
      toast({ title: "Nueva invitación generada" });
    }
    setCreatingInvite(false);
  };

  const generatePin = async () => {
    if (!employee.id) return;
    setGeneratingPin(true);
    try {
      const newPin = String(Math.floor(1000 + Math.random() * 9000));
      const { error } = await supabase
        .from("employees")
        .update({ access_pin: newPin } as any)
        .eq("id", employee.id);
      if (error) throw error;
      setLivePin(newPin);
      toast({ title: "PIN generado", description: `Nuevo PIN: ${newPin}` });
    } catch (err: any) {
      toast({ title: "Error al generar PIN", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPin(false);
    }
  };

  const message = `¡Hola ${employee.first_name}! 👋\n\nTe invitamos a acceder al portal de empleados de *${companyName}*.\n\n📱 Portal: ${portalUrl}\n📞 Tu teléfono: ${employee.phone_number ?? "—"}\n🔑 Tu PIN: ${pin}\n\nSelecciona "Acceso empleado" e ingresa con tu número y PIN.\n\nDesde el portal podrás:\n✅ Ver tus turnos asignados\n✅ Registrar entrada y salida\n✅ Consultar tus pagos\n✅ Recibir comunicados\n\n${inviteLink ? `🔗 Activa tu cuenta: ${inviteLink}\n\n` : ""}— Equipo ${companyName}`;

  const whatsappTargets = buildWhatsAppTargets(employee.phone_number, message);
  const smsLink = `sms:${employee.phone_number ?? ""}?body=${encodeURIComponent(message)}`;
  const copyPhoneNumber = async () => {
    const phoneValue = normalizePhone(employee.phone_number);
    if (!phoneValue) return;
    await navigator.clipboard.writeText(phoneValue);
    toast({ title: "Número copiado" });
  };

  const openWhatsApp = async (mode: "app" | "web") => {
    const targetUrl = mode === "app" ? whatsappTargets.waMeUrl : whatsappTargets.waWebUrl;
    const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (win) {
      await markSent("whatsapp");
      return;
    }
    toast({
      title: "No pudimos abrir WhatsApp",
      description: "Usa los botones de copiar mensaje, copiar número o WhatsApp Web.",
      variant: "destructive",
    });
  };

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    await markSent("copy");
    toast({ title: "Copiado al portapapeles" });
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    toast({ title: "Enlace copiado", description: inviteLink });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const sendEmail = async () => {
    if (!employee.email) {
      toast({ title: "Sin email", description: "Este empleado no tiene email registrado.", variant: "destructive" });
      return;
    }
    setSending(true);
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-invite-email", {
        body: {
          to: employee.email,
          subject: `Invitación al portal de ${companyName}`,
          html: `
            <div style="font-family: 'Sora', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 28px;">
              <h1 style="font-size: 22px; font-weight: 700; color: hsl(220, 60%, 7%); margin: 0 0 16px;">¡Hola ${employee.first_name}! 👋</h1>
              <p style="font-size: 14px; color: hsl(220, 15%, 46%); line-height: 1.6; margin: 0 0 20px;">
                Te invitamos a acceder al portal de empleados de <strong>${companyName}</strong>.
              </p>
              ${inviteLink ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${inviteLink}" style="display: inline-block; background: hsl(222, 100%, 59%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 16px; padding: 12px 28px; text-decoration: none;">Activar mi cuenta</a>
              </div>
              ` : ""}
              <div style="background: hsl(220, 20%, 97%); border-radius: 12px; padding: 16px; margin: 0 0 20px;">
                <p style="font-size: 13px; color: hsl(220, 15%, 30%); margin: 0 0 8px;">📱 <strong>Portal:</strong> <a href="${portalUrl}" style="color: hsl(222, 100%, 59%);">${portalUrl}</a></p>
                <p style="font-size: 13px; color: hsl(220, 15%, 30%); margin: 0;">🔑 <strong>Tu PIN:</strong> ${pin}</p>
              </div>
              <p style="font-size: 13px; color: hsl(220, 15%, 46%); line-height: 1.6;">Ingresa con tu número de teléfono y tu PIN de 4 dígitos.</p>
              <p style="font-size: 12px; color: hsl(220, 15%, 46%); margin: 30px 0 0;">Si no esperabas esta invitación, ignora este correo.</p>
            </div>
          `,
          // Pass metadata for tracking
          company_id: selectedCompanyId,
          employee_id: employee.id,
          invitation_id: inviteId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // The edge function returns status: "queued" — show honest status
      const returnedMessageId = data?.message_id ?? null;

      setInviteStatus("queued");
      setInviteChannel("email");
      setInviteSentAt(new Date().toISOString());
      setInviteRecipient(employee.email);
      if (returnedMessageId) setProviderMessageId(returnedMessageId);
      setAttempts(prev => prev + 1);
      setLastAttemptAt(new Date().toISOString());
      setStatusChangedAt(new Date().toISOString());

      // Update invitation record with queued status
      if (inviteId) {
        await supabase
          .from("employee_invitations")
          .update({
            status: "queued",
            channel: "email",
            sent_at: new Date().toISOString(),
            invite_recipient: employee.email,
            provider_message_id: returnedMessageId,
            last_attempt_at: new Date().toISOString(),
          } as any)
          .eq("id", inviteId);
      }

      onInviteSent?.("email");
      toast({
        title: "Email en cola de envío",
        description: `La invitación para ${employee.email} está siendo procesada. El estado se actualizará automáticamente.`,
      });
    } catch (err: any) {
      const errorMsg = err.message ?? "Error desconocido";
      setLastError(errorMsg);

      // Update invitation with failure
      if (inviteId) {
        await supabase
          .from("employee_invitations")
          .update({
            last_error: errorMsg,
            last_attempt_at: new Date().toISOString(),
          } as any)
          .eq("id", inviteId);
      }

      toast({ title: "Error al enviar", description: errorMsg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Readiness checks
  const readyChecks = [
    { label: "Teléfono", ok: hasPhone, detail: employee.phone_number || "No registrado" },
    { label: "PIN", ok: hasPin, detail: hasPin ? pin : "No asignado" },
    { label: "Email", ok: hasEmail, detail: employee.email || "Opcional" },
  ];
  const isReady = hasPhone && hasPin;

  const statusConfig = STATUS_CONFIG[inviteStatus] ?? STATUS_CONFIG.created;
  const StatusIcon = statusConfig.icon;
  const isAccepted = inviteStatus === "accepted";
  const isFailed = isInviteStatusFailure(inviteStatus);
  const isQueued = inviteStatus === "queued" || inviteStatus === "processing";
  const hasEmailAttempt = inviteChannel === "email" && inviteStatus !== "created";
  const canResend = isFailed || ["expired", "revoked", "dlq"].includes(inviteStatus) || (inviteStatus === "sent" && inviteSentAt && Date.now() - new Date(inviteSentAt).getTime() > 30 * 60 * 1000);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header with employee identity */}
        <div className="bg-gradient-to-br from-primary/[0.04] to-transparent border-b px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <EmployeeAvatar firstName={employee.first_name ?? ""} lastName={employee.last_name ?? ""} avatarUrl={employee.avatar_url} gender={employee.gender} size="lg" className="ring-2 ring-background shadow" />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold">Invitar a {employee.first_name}</DialogTitle>
              <DialogDescription className="text-[11px] mt-0.5">Envía las credenciales de acceso al portal</DialogDescription>
            </div>
            <Badge className={cn("text-[9px] px-2 py-0.5 font-semibold gap-1", statusConfig.color)}>
              <StatusIcon className={cn("h-3 w-3", isQueued && "animate-spin")} />
              {statusConfig.label}
            </Badge>
          </div>
          {/* Timeline info */}
          <div className="mt-2 space-y-0.5">
            {inviteSentAt && (
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                {inviteChannel && (
                  <span className="flex items-center gap-1">
                    {inviteChannel === "whatsapp" && <MessageCircle className="h-3 w-3 text-[#25D366]" />}
                    {inviteChannel === "sms" && <Smartphone className="h-3 w-3" />}
                    {inviteChannel === "email" && <Mail className="h-3 w-3" />}
                    {inviteChannel === "copy" && <Copy className="h-3 w-3" />}
                    Enviado vía {inviteChannel}
                  </span>
                )}
                <span>hace {formatDistanceToNow(new Date(inviteSentAt), { locale: es })}</span>
                {attempts > 0 && <span>· {attempts} intento{attempts > 1 ? "s" : ""}</span>}
              </div>
            )}
            {inviteRecipient && (
              <div className="text-[10px] text-muted-foreground">
                📧 {inviteRecipient}
              </div>
            )}
            {statusConfig.description && (
              <div className="text-[9px] text-muted-foreground/60 italic">
                {statusConfig.description}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Company context indicator */}
          {companyMismatch ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[10px] flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
              <span className="text-destructive font-medium">Este empleado no pertenece a la empresa seleccionada ({companyName})</span>
            </div>
          ) : (
            <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-1.5 text-[10px] flex items-center gap-2">
              <Shield className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <span className="text-muted-foreground">Empresa: <span className="font-semibold text-foreground">{companyName}</span></span>
            </div>
          )}

          {/* Inactive worker — block sends but keep visible token/link affordances */}
          {isInactive && !companyMismatch && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-[11px] flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-warning">Worker is archived</p>
                <p className="text-muted-foreground">
                  Reactivate this worker before sending an invitation. You can still copy an existing invite link below for reference.
                </p>
              </div>
            </div>
          )}

          {/* Error display */}
          {lastError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[10px] space-y-1">
              <div className="flex items-center gap-1.5 text-destructive font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Error de entrega
              </div>
              <p className="text-destructive/80 break-words">{lastError}</p>
              {lastAttemptAt && (
                <p className="text-muted-foreground">Último intento: hace {formatDistanceToNow(new Date(lastAttemptAt), { locale: es })}</p>
              )}
            </div>
          )}

          {/* SECURITY: Company mismatch block */}
          {companyMismatch && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Error de empresa</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Este empleado pertenece a otra empresa. Cambia al contexto correcto antes de invitar.
              </p>
            </div>
          )}

          {/* Accepted state */}
          {isAccepted && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="h-14 w-14 rounded-full bg-[hsl(var(--earning))]/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-[hsl(var(--earning))]" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Cuenta activada</h3>
              <p className="text-sm text-muted-foreground">{employee.first_name} ya tiene acceso al portal.</p>
            </div>
          )}

          {!isAccepted && !companyMismatch && (
            <>
              {/* Readiness checklist */}
              <div className="rounded-lg border border-border/40 p-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Verificación</p>
                {readyChecks.map(c => (
                  <div key={c.label} className="flex items-center gap-2 text-[11px]">
                    {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--earning))]" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                    <span className="text-muted-foreground w-16">{c.label}</span>
                    <span className={cn("font-medium flex-1", c.ok ? "text-foreground" : "text-warning")}>{c.detail}</span>
                    {c.label === "PIN" && !c.ok && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-6 text-[9px] px-2.5 gap-1 shrink-0"
                        onClick={generatePin}
                        disabled={generatingPin}
                      >
                        {generatingPin ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        Generar PIN
                      </Button>
                    )}
                  </div>
                ))}
                {!isReady && !hasPin && hasPhone && (
                  <p className="text-[10px] text-primary mt-2 flex items-center gap-1">
                    <KeyRound className="h-3 w-3" /> Genera un PIN para habilitar la invitación
                  </p>
                )}
                {!isReady && !hasPhone && (
                  <p className="text-[10px] text-warning mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Registra un teléfono antes de invitar
                  </p>
                )}
              </div>

              {/* Credentials */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Portal</span>
                  <a href={portalUrl} target="_blank" rel="noopener" className="text-primary font-medium text-[10px] hover:underline truncate max-w-[220px]">{portalUrl}</a>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Teléfono</span>
                  <span className="font-medium text-[10px]">{employee.phone_number || "—"}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">PIN</span>
                  <Badge variant="outline" className="font-mono text-[10px] tracking-widest">{pin}</Badge>
                </div>
              </div>

              {/* Invite link */}
              {creatingInvite ? (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5">
                  <Link2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Generando enlace de activación...
                  </span>
                </div>
              ) : inviteLink ? (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-2.5">
                  <Link2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate flex-1">{inviteLink}</span>
                  <Button variant="outline" size="sm" className={cn("h-7 text-[9px] shrink-0", linkCopied && "border-[hsl(var(--earning)/0.5)] text-[hsl(var(--earning))]")} onClick={copyInviteLink}>
                    {linkCopied ? <><Check className="h-3 w-3 mr-1" />Copiado</> : <><Copy className="h-3 w-3 mr-1" />Copiar</>}
                  </Button>
                </div>
              ) : null}

              {/* Resend button */}
              {canResend && (
                <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={resendInvite} disabled={creatingInvite}>
                  <RefreshCw className={cn("h-3.5 w-3.5", creatingInvite && "animate-spin")} />
                  Generar nueva invitación
                </Button>
              )}

              {/* Send channels */}
              <Tabs defaultValue="message" className="w-full">
                <TabsList className="w-full grid grid-cols-2 h-8 bg-muted/30 rounded-lg">
                  <TabsTrigger value="message" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1">
                    <MessageCircle className="h-3 w-3" /> Mensaje
                  </TabsTrigger>
                  <TabsTrigger value="email" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1">
                    <Mail className="h-3 w-3" /> Email
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="message" className="mt-2.5 space-y-2.5">
                  <div className="bg-background rounded-lg border border-border/30 p-2.5 max-h-36 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground whitespace-pre-line leading-relaxed">{message}</p>
                  </div>
                  {isReady ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button variant="outline" size="sm" className="flex-col h-auto py-2.5 gap-1 border-[#25D366]/30 hover:bg-[#25D366]/10 hover:border-[#25D366]/50 text-[9px]" onClick={() => openWhatsApp("app")}>
                        <MessageCircle className="h-4 w-4 text-[#25D366]" />WhatsApp
                      </Button>
                      <Button variant="outline" size="sm" className="flex-col h-auto py-2.5 gap-1 border-primary/30 hover:bg-primary/10 text-[9px]" asChild onClick={() => markSent("sms")}>
                        <a href={smsLink}><Smartphone className="h-4 w-4 text-primary" />SMS</a>
                      </Button>
                      <Button variant="outline" size="sm" className={cn("flex-col h-auto py-2.5 gap-1 text-[9px]", copied && "border-[hsl(var(--earning)/0.5)] bg-[hsl(var(--earning)/0.1)]")} onClick={copyMessage}>
                        {copied ? <Check className="h-4 w-4 text-[hsl(var(--earning))]" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                        {copied ? "Copiado" : "Copiar"}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-[10px] text-warning flex items-center justify-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {!hasPhone && !hasPin ? "Registra un teléfono y genera un PIN para enviar" : !hasPhone ? "Registra un teléfono para enviar por mensaje" : "Genera un PIN para habilitar el envío"}
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="email" className="mt-2.5 space-y-2.5">
                  {hasEmail ? (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px]">Email del empleado</Label>
                        <Input value={employee.email} disabled className="h-8 text-xs bg-muted/30" />
                      </div>
                      {hasEmailAttempt ? (
                        <div className="flex flex-col items-center gap-1.5 py-3">
                          <div className={cn(
                            "flex items-center gap-2 justify-center",
                            isQueued ? "text-primary" : isFailed ? "text-destructive" : "text-[hsl(var(--earning))]"
                          )}>
                            {isQueued ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : isFailed ? (
                              <MailX className="h-5 w-5" />
                            ) : (
                              <MailCheck className="h-5 w-5" />
                            )}
                            <span className="text-xs font-medium">
                              {isQueued ? "Email en cola de envío..." : isFailed ? "Error al enviar" : "Email procesado ✅"}
                            </span>
                          </div>
                          <p className="text-[9px] text-muted-foreground text-center max-w-[260px]">
                            {isQueued
                              ? "El email está siendo procesado. El estado se actualizará cuando el proveedor confirme."
                              : isFailed
                                ? "Puedes intentar de nuevo o usar otro canal."
                                : "El proveedor aceptó el email para entrega."
                            }
                          </p>
                          {isFailed && (
                            <Button variant="outline" size="sm" className="h-7 text-[10px] mt-1 gap-1" onClick={() => { setInviteStatus("created"); setLastError(null); }}>
                              <RefreshCw className="h-3 w-3" /> Reintentar
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button className="w-full h-8 text-xs" onClick={sendEmail} disabled={sending || !hasPin}>
                          {sending ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              Procesando...
                            </>
                          ) : (
                            <>
                              <Mail className="h-3.5 w-3.5 mr-1.5" />
                              Enviar invitación por email
                            </>
                          )}
                        </Button>
                      )}
                      {!hasPin && <p className="text-[9px] text-warning text-center">⚠️ Genera un PIN antes de enviar por email</p>}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                      <Mail className="h-6 w-6 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground font-medium">Este empleado no tiene email registrado</p>
                      <p className="text-[10px] text-muted-foreground/60">Agrega un email en el perfil del empleado para enviar por este canal.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
